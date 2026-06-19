import os
import certifi

# Apply SSL bypass for curl_cffi to prevent certificate errors on Windows local environment
import curl_cffi.requests
original_request = curl_cffi.requests.Session.request
def wrapped_request(self, method, url, **kwargs):
    kwargs['verify'] = False
    return original_request(self, method, url, **kwargs)
curl_cffi.requests.Session.request = wrapped_request

import yfinance as yf
import pandas as pd
import numpy as np
import json
import time
import requests
from bs4 import BeautifulSoup
import re
import urllib3

# Suppress standard requests warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Ensure data directories exist
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
DETAILS_DIR = os.path.join(DATA_DIR, 'details')
os.makedirs(DETAILS_DIR, exist_ok=True)

# Status tracker
STATUS_FILE = os.path.join(DATA_DIR, 'status.json')

def update_status(message, progress=0, total=0, is_running=True, error=None):
    status = {
        "is_running": is_running,
        "message": message,
        "progress": progress,
        "total": total,
        "error": error,
        "last_updated": time.time()
    }
    with open(STATUS_FILE, 'w') as f:
        json.dump(status, f)
    print(f"[STATUS] {message} ({progress}/{total})")

# ==========================================
# 1. Extensible Ticker Providers
# ==========================================

class TickerProvider:
    def get_tickers(self) -> list:
        raise NotImplementedError

class WikipediaNasdaq100Provider(TickerProvider):
    def get_tickers(self) -> list:
        url = "https://en.wikipedia.org/wiki/Nasdaq-100"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
        try:
            response = requests.get(url, headers=headers, verify=False)
            if response.status_code != 200:
                print(f"Failed to fetch Nasdaq 100: {response.status_code}")
                return []
            soup = BeautifulSoup(response.text, 'html.parser')
            table = soup.find('table', {'id': 'constituents'})
            if not table:
                table = soup.find('table', class_='wikitable')
            if not table:
                return []
            
            tickers = []
            for row in table.find_all('tr')[1:]:
                cols = row.find_all('td')
                if len(cols) >= 1:
                    ticker = cols[0].text.strip()
                    # Clean up ticker
                    ticker = re.sub(r'\[\d+\]', '', ticker)
                    ticker = ticker.replace('\u200b', '').upper()
                    # Format ticker for Yahoo Finance if needed (e.g. BRK.B -> BRK-B)
                    ticker = ticker.replace('.', '-')
                    if ticker:
                        tickers.append(ticker)
            return sorted(list(set(tickers)))
        except Exception as e:
            print(f"Error fetching Wikipedia Nasdaq 100 tickers: {e}")
            return []

class WikipediaSP500Provider(TickerProvider):
    def get_tickers(self) -> list:
        url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
        try:
            response = requests.get(url, headers=headers, verify=False)
            if response.status_code != 200:
                return []
            soup = BeautifulSoup(response.text, 'html.parser')
            table = soup.find('table', {'id': 'constituents'})
            if not table:
                return []
            tickers = []
            for row in table.find_all('tr')[1:]:
                cols = row.find_all('td')
                if len(cols) >= 1:
                    ticker = cols[0].text.strip()
                    ticker = ticker.replace('.', '-')
                    tickers.append(ticker)
            return sorted(list(set(tickers)))
        except Exception as e:
            print(f"Error fetching S&P 500: {e}")
            return []

class CustomListProvider(TickerProvider):
    def __init__(self, tickers: list):
        self.tickers = tickers
        
    def get_tickers(self) -> list:
        return [t.upper().strip().replace('.', '-') for t in self.tickers]

# ==========================================
# 2. Extensible Metrics Registry
# ==========================================

class StockDataCollector:
    def __init__(self):
        # We define metadata for indicators.
        # This catalog lets the frontend know what indicators are available.
        self.indicator_configs = [
            {"id": "symbol", "name": "Ticker", "category": "General & Price", "type": "string", "description": "Unique alphabet symbol representing a publicly traded stock on the exchange."},
            {"id": "name", "name": "Company Name", "category": "General & Price", "type": "string", "description": "Official registered name of the corporation."},
            {"id": "price", "name": "Price", "category": "General & Price", "type": "currency", "description": "Latest traded share price in USD (updated on refresh)."},
            {"id": "market_cap", "name": "Market Cap", "category": "General & Price", "type": "currency", "description": "Total dollar value of a company's outstanding shares. Calculated as Price multiplied by Shares Outstanding."},
            {"id": "sector", "name": "Sector", "category": "General & Price", "type": "string", "description": "Sector classification of the company (e.g. Technology)."},
            {"id": "industry", "name": "Industry", "category": "General & Price", "type": "string", "description": "Industry classification of the company (e.g. Semiconductors)."},
            
            # Valuation
            {"id": "trailing_ps", "name": "Trailing P/S", "category": "Valuation", "type": "ratio", "description": "Trailing Price-to-Sales ratio. Calculated as Market Cap divided by Trailing 12-Month (TTM) Revenue."},
            {"id": "forward_ps_1y", "name": "Forward P/S (1y)", "category": "Valuation", "type": "ratio", "description": "Estimated Forward Price-to-Sales ratio based on analyst consensus revenue forecasts for the current fiscal year (0y)."},
            {"id": "forward_ps_2y", "name": "Forward P/S (2y)", "category": "Valuation", "type": "ratio", "description": "Estimated Forward Price-to-Sales ratio based on analyst consensus revenue forecasts for the next fiscal year (+1y)."},
            {"id": "trailing_pe", "name": "Trailing P/E", "category": "Valuation", "type": "ratio", "description": "Trailing Price-to-Earnings ratio. Calculated as Share Price divided by trailing Earnings Per Share (EPS)."},
            {"id": "forward_pe", "name": "Forward P/E", "category": "Valuation", "type": "ratio", "description": "Forward Price-to-Earnings ratio. Calculated as Share Price divided by estimated EPS for the current fiscal year."},
            {"id": "ev_revenue", "name": "EV/Revenue", "category": "Valuation", "type": "ratio", "description": "Enterprise Value to Revenue ratio. Compares a company's total enterprise value (including debt and cash) to its revenue."},
            {"id": "ev_ebitda", "name": "EV/EBITDA", "category": "Valuation", "type": "ratio", "description": "Enterprise Value to EBITDA ratio. Measures valuation relative to EBITDA earnings."},
            {"id": "price_to_book", "name": "Price-to-Book (P/B)", "category": "Valuation", "type": "ratio", "description": "Compares share price relative to book value per share."},
            {"id": "price_to_fcf", "name": "Price-to-FCF (P/FCF)", "category": "Valuation", "type": "ratio", "description": "Compares share price relative to Free Cash Flow per share."},
            {"id": "dividend_yield", "name": "Dividend Yield", "category": "Valuation", "type": "percentage", "description": "Annual dividend payment divided by current share price."},
            {"id": "enterprise_value", "name": "Enterprise Value", "category": "Valuation", "type": "currency", "description": "Total takeover value of the firm. Market Cap + Debt - Cash."},
            
            # Growth & Adjusted
            {"id": "rev_growth_1y", "name": "Est Revenue Growth (1y)", "category": "Growth & Adjusted", "type": "percentage", "description": "Estimated revenue growth rate for the current fiscal year compared to last year's actual revenue."},
            {"id": "rev_growth_2y", "name": "Est Revenue Growth (2y)", "category": "Growth & Adjusted", "type": "percentage", "description": "Estimated revenue growth rate for the next fiscal year compared to the current year's forecast."},
            {"id": "trailing_rev_growth", "name": "Trailing Revenue Growth (YoY)", "category": "Growth & Adjusted", "type": "percentage", "description": "Quarterly revenue growth compared to the same quarter of the previous year."},
            {"id": "trailing_eps_growth", "name": "Trailing EPS Growth (YoY)", "category": "Growth & Adjusted", "type": "percentage", "description": "Quarterly earnings per share growth compared to the same quarter of the previous year."},
            {"id": "psg_1y", "name": "Forward PSSG (1y)", "category": "Growth & Adjusted", "type": "ratio", "description": "Forward Price-to-Sales-to-Sales-Growth (PSSG) ratio for the current fiscal year. Calculated as: [Forward P/S (1y)] / [Consensus Est Revenue Growth (1y) * 100]. A value under 1.0 indicates that the stock's valuation multiple is lower than its growth rate, suggesting potential undervaluation relative to growth."},
            {"id": "psg_2y", "name": "Forward PSSG (2y)", "category": "Growth & Adjusted", "type": "ratio", "description": "Forward Price-to-Sales-to-Sales-Growth (PSSG) ratio for the next fiscal year. Calculated as: [Forward P/S (2y)] / [Consensus Est Revenue Growth (2y) * 100]. A value under 1.0 indicates that the stock's valuation multiple is lower than its growth rate, suggesting potential undervaluation relative to growth."},
            {"id": "peg_ratio", "name": "PEG Ratio", "category": "Growth & Adjusted", "type": "ratio", "description": "Price-to-Earnings-to-Growth ratio. Standard valuation metric adjusting P/E by long-term earnings growth rate."},
            
            # Profitability & Health
            {"id": "operating_margin", "name": "Operating Margin", "category": "Profitability & Health", "type": "percentage", "description": "Operating Income divided by Revenue. Measures operational efficiency."},
            {"id": "profit_margin", "name": "Profit Margin", "category": "Profitability & Health", "type": "percentage", "description": "Net Income divided by Revenue. Measures overall bottom-line profitability."},
            {"id": "gross_margin", "name": "Gross Margin", "category": "Profitability & Health", "type": "percentage", "description": "Gross Profit divided by Revenue. Measures cost efficiency of goods sold."},
            {"id": "roe", "name": "Return on Equity (ROE)", "category": "Profitability & Health", "type": "percentage", "description": "Net income divided by shareholders' equity. Measures profit generated per dollar of equity."},
            {"id": "roa", "name": "Return on Assets (ROA)", "category": "Profitability & Health", "type": "percentage", "description": "Net income divided by total assets. Measures capital efficiency."},
            {"id": "fcf_margin", "name": "Free Cash Flow Margin", "category": "Profitability & Health", "type": "percentage", "description": "Free cash flow divided by total revenue. Measures cash generation efficiency."},
            {"id": "current_ratio", "name": "Current Ratio", "category": "Profitability & Health", "type": "ratio", "description": "Current Assets divided by Current Liabilities. Measures short-term liquidity."},
            {"id": "quick_ratio", "name": "Quick Ratio", "category": "Profitability & Health", "type": "ratio", "description": "Liquidity metric excluding inventory. Quick Assets / Current Liabilities."},
            {"id": "debt_to_equity", "name": "Debt-to-Equity", "category": "Profitability & Health", "type": "ratio", "description": "Total liabilities divided by shareholders' equity. High ratio implies high leverage."},
            {"id": "free_cash_flow", "name": "Free Cash Flow (TTM)", "category": "Profitability & Health", "type": "currency", "description": "Free Cash Flow generated over the trailing 12 months in USD."},
            
            # Technicals
            {"id": "fifty_day_sma", "name": "50-Day SMA", "category": "Technicals", "type": "currency", "description": "Simple Moving Average of share price over the past 50 trading days."},
            {"id": "two_hundred_day_sma", "name": "200-Day SMA", "category": "Technicals", "type": "currency", "description": "Simple Moving Average of share price over the past 200 trading days."},
            {"id": "dist_52w_high", "name": "Dist. from 52w High", "category": "Technicals", "type": "percentage", "description": "Current share price relative to its 52-week high price. Shows multiple distance from peak."},
            {"id": "beta", "name": "Beta (5Y Monthly)", "category": "Technicals", "type": "ratio", "description": "Measures asset volatility relative to the broader market index."},
            {"id": "price_change_1y", "name": "52-Week Price Change", "category": "Technicals", "type": "percentage", "description": "Percentage price change over the past 52 weeks."},
        ]

    def fetch_stock_overview(self, ticker_obj: yf.Ticker) -> dict:
        """
        Calculates all the overview indicator values for a single ticker.
        Safe wrapper with Try-Catch blocks to handle missing data.
        """
        symbol = ticker_obj.ticker
        info = ticker_obj.info
        
        # Base fields
        name = info.get('longName') or info.get('shortName') or symbol
        price = info.get('currentPrice') or info.get('regularMarketPrice')
        market_cap = info.get('marketCap')
        shares = info.get('sharesOutstanding')
        sector = info.get('sector')
        industry = info.get('industry')
        trailing_ps = info.get('priceToSalesTrailing12Months')
        
        # New metrics fields from info
        trailing_pe = info.get('trailingPE')
        forward_pe = info.get('forwardPE')
        ev_revenue = info.get('enterpriseToRevenue')
        ev_ebitda = info.get('enterpriseToEbitda')
        trailing_rev_growth = info.get('revenueGrowth')
        trailing_eps_growth = info.get('earningsGrowth')
        peg_ratio = info.get('pegRatio')
        operating_margin = info.get('operatingMargins')
        profit_margin = info.get('profitMargins')
        roe = info.get('returnOnEquity')
        
        debt_to_equity_raw = info.get('debtToEquity')
        debt_to_equity = (debt_to_equity_raw / 100.0) if (debt_to_equity_raw is not None) else None
        
        fifty_day_sma = info.get('fiftyDayAverage')
        two_hundred_day_sma = info.get('twoHundredDayAverage')
        fifty_two_week_high = info.get('fiftyTwoWeekHigh')
        
        dist_52w_high = None
        if price is not None and fifty_two_week_high is not None and fifty_two_week_high > 0:
            dist_52w_high = (price - fifty_two_week_high) / fifty_two_week_high

        # 12 New Market-Standard Indicators
        price_to_book = info.get('priceToBook')
        dividend_yield = info.get('dividendYield')
        enterprise_value = info.get('enterpriseValue')
        free_cash_flow = info.get('freeCashflow')
        
        price_to_fcf = None
        if free_cash_flow is not None and market_cap is not None and free_cash_flow > 0:
            price_to_fcf = market_cap / free_cash_flow
            
        fcf_margin = None
        total_revenue_ttm = info.get('totalRevenue')
        if free_cash_flow is not None and total_revenue_ttm is not None and total_revenue_ttm > 0:
            fcf_margin = free_cash_flow / total_revenue_ttm
            
        gross_margin = info.get('grossMargins')
        roa = info.get('returnOnAssets')
        current_ratio = info.get('currentRatio')
        quick_ratio = info.get('quickRatio')
        beta = info.get('beta')
        price_change_1y = info.get('52WeekChange')
            
        # If shares outstanding is missing, estimate it
        if not shares and market_cap and price:
            shares = market_cap / price
        elif not market_cap and price and shares:
            market_cap = price * shares
            
        # Initialize default metrics dict
        metrics = {
            "symbol": symbol,
            "name": name,
            "price": price,
            "market_cap": market_cap,
            "sector": sector,
            "industry": industry,
            "trailing_ps": trailing_ps,
            "forward_ps_1y": None,
            "forward_ps_2y": None,
            "rev_growth_1y": None,
            "rev_growth_2y": None,
            "psg_1y": None,
            "psg_2y": None,
            # base fields
            "trailing_pe": trailing_pe,
            "forward_pe": forward_pe,
            "ev_revenue": ev_revenue,
            "ev_ebitda": ev_ebitda,
            "trailing_rev_growth": trailing_rev_growth,
            "trailing_eps_growth": trailing_eps_growth,
            "peg_ratio": peg_ratio,
            "operating_margin": operating_margin,
            "profit_margin": profit_margin,
            "roe": roe,
            "debt_to_equity": debt_to_equity,
            "fifty_day_sma": fifty_day_sma,
            "two_hundred_day_sma": two_hundred_day_sma,
            "dist_52w_high": dist_52w_high,
            # 12 new fields
            "price_to_book": price_to_book,
            "price_to_fcf": price_to_fcf,
            "dividend_yield": dividend_yield,
            "enterprise_value": enterprise_value,
            "free_cash_flow": free_cash_flow,
            "fcf_margin": fcf_margin,
            "gross_margin": gross_margin,
            "roa": roa,
            "current_ratio": current_ratio,
            "quick_ratio": quick_ratio,
            "beta": beta,
            "price_change_1y": price_change_1y,
        }
        
        # Fetch Revenue Estimates
        try:
            rev_est = ticker_obj.revenue_estimate
            if rev_est is not None and not rev_est.empty:
                # 1y Forward (Current Year = '0y')
                if '0y' in rev_est.index:
                    rev_0y = rev_est.loc['0y', 'avg']
                    growth_0y = rev_est.loc['0y', 'growth']
                    
                    if pd.notna(rev_0y) and rev_0y > 0 and market_cap:
                        metrics["forward_ps_1y"] = market_cap / rev_0y
                    if pd.notna(growth_0y):
                        metrics["rev_growth_1y"] = growth_0y
                        
                    # Calculate PSG (1y): Forward P/S (1y) / (Growth (1y) * 100)
                    if metrics["forward_ps_1y"] is not None and growth_0y is not None and growth_0y > 0:
                        metrics["psg_1y"] = metrics["forward_ps_1y"] / (growth_0y * 100)
                        
                # 2y Forward (Next Year = '+1y')
                if '+1y' in rev_est.index:
                    rev_1y = rev_est.loc['+1y', 'avg']
                    growth_1y = rev_est.loc['+1y', 'growth']
                    
                    if pd.notna(rev_1y) and rev_1y > 0 and market_cap:
                        metrics["forward_ps_2y"] = market_cap / rev_1y
                    if pd.notna(growth_1y):
                        metrics["rev_growth_2y"] = growth_1y
                        
                    # Calculate PSG (2y): Forward P/S (2y) / (Growth (2y) * 100)
                    if metrics["forward_ps_2y"] is not None and growth_1y is not None and growth_1y > 0:
                        metrics["psg_2y"] = metrics["forward_ps_2y"] / (growth_1y * 100)
        except Exception as e:
            print(f"[{symbol}] Error fetching revenue estimates: {e}")
            
        return metrics

    def fetch_historical_detail(self, ticker_obj: yf.Ticker, shares: float) -> list:
        """
        Fetches historical price data and computes daily historical trailing P/S, Forward P/S, PSSG, P/E, and technical averages.
        Returns a list of dicts.
        """
        symbol = ticker_obj.ticker
        try:
            # 1. Historical Prices (3 years)
            hist = ticker_obj.history(period="3y")
            if hist.empty:
                return []
            hist.index = hist.index.tz_localize(None)
            
            
            # 2. Historical Annual Financials
            has_financials = True
            financials = None
            try:
                financials = ticker_obj.financials
            except Exception:
                has_financials = False

            if financials is None or financials.empty or 'Total Revenue' not in financials.index:
                has_financials = False
                
            if has_financials:
                try:
                    rev_series = financials.loc['Total Revenue']
                    df_fin = pd.DataFrame(rev_series).rename(columns={'Total Revenue': 'Revenue'})
                    df_fin.index = pd.to_datetime(df_fin.index)
                    df_fin = df_fin.sort_index()
                    
                    # Extract net income safely
                    net_inc_keys = ['Net Income', 'Net Income Common Stockholders', 'Net Income From Continuing Ops', 'Net Income from Continuing Operations']
                    net_inc_series = None
                    for k in net_inc_keys:
                        if k in financials.index:
                            net_inc_series = financials.loc[k]
                            break
                    
                    if net_inc_series is not None:
                        df_net_inc = pd.DataFrame(net_inc_series).rename(columns={net_inc_series.name: 'Net_Income'})
                        df_net_inc.index = pd.to_datetime(df_net_inc.index)
                        df_net_inc = df_net_inc.sort_index()
                        # Merge into df_fin
                        df_fin = pd.merge(df_fin, df_net_inc, left_index=True, right_index=True, how='left')
                    else:
                        df_fin['Net_Income'] = np.nan
                        
                    df_fin = df_fin.dropna(subset=['Revenue'])
                    if len(df_fin) < 2:
                        has_financials = False
                except Exception:
                    has_financials = False
            
            # Create daily layout
            df_daily = pd.DataFrame(index=hist.index)
            df_daily['Price'] = hist['Close']
            df_daily['SMA_50'] = df_daily['Price'].rolling(window=50).mean()
            df_daily['SMA_200'] = df_daily['Price'].rolling(window=200).mean()
            
            if has_financials:
                # YoY Annual Revenue Growth
                df_fin['Revenue_YoY_Growth'] = df_fin['Revenue'].pct_change()
                
                # Calculate Forward Revenue and Forward YoY Growth
                df_fin['Forward_Revenue'] = df_fin['Revenue'].shift(-1)
                df_fin['Forward_Revenue_YoY_Growth'] = df_fin['Revenue_YoY_Growth'].shift(-1)
                
                # Retrieve analyst estimates
                rev_0y = None
                growth_0y = None
                try:
                    rev_est = ticker_obj.revenue_estimate
                    if rev_est is not None and not rev_est.empty and '0y' in rev_est.index:
                        rev_0y = rev_est.loc['0y', 'avg']
                        growth_0y = rev_est.loc['0y', 'growth']
                except Exception:
                    pass
                    
                if rev_0y is not None and pd.notna(rev_0y):
                    df_fin.iloc[-1, df_fin.columns.get_loc('Forward_Revenue')] = rev_0y
                if growth_0y is not None and pd.notna(growth_0y):
                    df_fin.iloc[-1, df_fin.columns.get_loc('Forward_Revenue_YoY_Growth')] = growth_0y
                
                # Match quarterly reporting delay (90 days lag)
                df_fin_reported = df_fin.copy()
                df_fin_reported.index = df_fin_reported.index + pd.Timedelta(days=90)
                
                # Standardize indexes
                df_daily.index = pd.to_datetime(df_daily.index).tz_localize(None).astype('datetime64[ns]')
                df_fin_reported.index = pd.to_datetime(df_fin_reported.index).tz_localize(None).astype('datetime64[ns]')
                
                # Merge daily prices with reported financials
                df_merged = pd.merge_asof(df_daily, df_fin_reported, left_index=True, right_index=True, direction='backward')
                
                if not shares or shares <= 0:
                    shares = 1.0
                    
                df_merged['Revenue_Per_Share'] = df_merged['Revenue'] / shares
                df_merged['Trailing_PS'] = df_merged['Price'] / df_merged['Revenue_Per_Share']
                df_merged['Forward_Revenue_Per_Share'] = df_merged['Forward_Revenue'] / shares
                df_merged['Forward_PS'] = df_merged['Price'] / df_merged['Forward_Revenue_Per_Share']
                df_merged['Forward_PSG'] = df_merged['Forward_PS'] / (df_merged['Forward_Revenue_YoY_Growth'] * 100)
                df_merged['Trailing_PSG'] = df_merged['Trailing_PS'] / (df_merged['Revenue_YoY_Growth'] * 100)
                
                df_merged['Net_Income_Per_Share'] = df_merged['Net_Income'] / shares
                df_merged['Trailing_PE'] = df_merged['Price'] / df_merged['Net_Income_Per_Share']
                df_merged = df_merged.replace([np.inf, -np.inf], np.nan)
            else:
                df_merged = df_daily.copy()
                df_merged['Trailing_PS'] = np.nan
                df_merged['Forward_PS'] = np.nan
                df_merged['Trailing_PSG'] = np.nan
                df_merged['Forward_PSG'] = np.nan
                df_merged['Trailing_PE'] = np.nan
                
            df_merged = df_merged.dropna(subset=['Price'])
            
            # Format output
            historical_points = []
            for date, row in df_merged.iterrows():
                historical_points.append({
                    "date": date.strftime('%Y-%m-%d'),
                    "price": float(round(row['Price'], 2)) if pd.notna(row['Price']) else None,
                    "ps": float(round(row['Trailing_PS'], 2)) if pd.notna(row['Trailing_PS']) else None,
                    "forward_ps": float(round(row['Forward_PS'], 2)) if pd.notna(row['Forward_PS']) else None,
                    "psg": float(round(row['Trailing_PSG'], 3)) if (pd.notna(row['Trailing_PSG']) and row['Trailing_PSG'] > 0) else None,
                    "forward_psg": float(round(row['Forward_PSG'], 3)) if (pd.notna(row['Forward_PSG']) and row['Forward_PSG'] > 0) else None,
                    "pe": float(round(row['Trailing_PE'], 2)) if (pd.notna(row['Trailing_PE']) and row['Trailing_PE'] > 0) else None,
                    "sma_50": float(round(row['SMA_50'], 2)) if pd.notna(row['SMA_50']) else None,
                    "sma_200": float(round(row['SMA_200'], 2)) if pd.notna(row['SMA_200']) else None,
                })
            return historical_points
        except Exception as e:
            print(f"[{symbol}] Error computing historical details: {e}")
            return []

    def fetch_annual_financials(self, ticker_obj: yf.Ticker) -> list:
        """
        Fetches annual income statement data (Revenue, Net Income, EBITDA, Gross Profit) for the past 3-4 years.
        Returns a list of dicts ordered chronologically.
        """
        symbol = ticker_obj.ticker
        try:
            financials = ticker_obj.financials
            if financials is None or financials.empty:
                return []
            
            idx_names = financials.index
            rev_key = next((k for k in ['Total Revenue', 'Revenue'] if k in idx_names), None)
            net_inc_key = next((k for k in ['Net Income', 'Net Income Common Stockholders', 'Net Income From Continuing Ops', 'Net Income from Continuing Operations'] if k in idx_names), None)
            ebitda_key = next((k for k in ['EBITDA', 'Normalized EBITDA'] if k in idx_names), None)
            gross_profit_key = next((k for k in ['Gross Profit', 'GrossProfit'] if k in idx_names), None)
            
            points = []
            for col in financials.columns:
                date_str = str(col).split(" ")[0] # extract YYYY-MM-DD
                
                rev_val = financials.loc[rev_key, col] if (rev_key and pd.notna(financials.loc[rev_key, col])) else None
                net_inc_val = financials.loc[net_inc_key, col] if (net_inc_key and pd.notna(financials.loc[net_inc_key, col])) else None
                ebitda_val = financials.loc[ebitda_key, col] if (ebitda_key and pd.notna(financials.loc[ebitda_key, col])) else None
                gross_profit_val = financials.loc[gross_profit_key, col] if (gross_profit_key and pd.notna(financials.loc[gross_profit_key, col])) else None
                
                points.append({
                    "year": date_str,
                    "revenue": float(rev_val) if rev_val is not None else None,
                    "net_income": float(net_inc_val) if net_inc_val is not None else None,
                    "ebitda": float(ebitda_val) if ebitda_val is not None else None,
                    "gross_profit": float(gross_profit_val) if gross_profit_val is not None else None
                })
            
            # Sort chronologically (oldest first)
            points.sort(key=lambda x: x["year"])
            return points
        except Exception as e:
            print(f"[{symbol}] Error fetching annual financials: {e}")
            return []

# ==========================================
# 3. Supabase Upload Helper
# ==========================================

def upload_to_supabase(payload):
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
    
    if not supabase_url or not supabase_key:
        print("[SUPABASE] Credentials missing. Skipping cloud upload.")
        return False
        
    try:
        url = f"{supabase_url}/rest/v1/screener_data"
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
        }
        
        row = {
            "id": 1,
            "data": payload,
            "updated_at": "now()"
        }
        
        print("[SUPABASE] Uploading screener data to Supabase...")
        response = requests.post(url, json=row, headers=headers, timeout=30)
        if response.status_code in [200, 201]:
            print("[SUPABASE] Successfully uploaded screener data to Supabase!")
            return True
        else:
            print(f"[SUPABASE] Failed to upload screener data: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"[SUPABASE] Error uploading to Supabase: {e}")
        return False

# ==========================================
# 4. Running Data Gathering Pipeline
# ==========================================

def run_screener_collection(ticker_provider: TickerProvider, max_tickers=None):
    """
    Main orchestrator that gathers tickers, fetches data, calculates metrics,
    and caches overview + detail files.
    """
    update_status("Retrieving ticker list...", progress=0, total=0, is_running=True)
    tickers = ticker_provider.get_tickers()
    
    if max_tickers:
        tickers = tickers[:max_tickers]
        
    total_tickers = len(tickers)
    if total_tickers == 0:
        update_status("Done", progress=0, total=0, is_running=False, error="No tickers fetched")
        return
        
    update_status(f"Found {total_tickers} tickers. Starting data collection.", progress=0, total=total_tickers, is_running=True)
    
    # Try to load existing cached data to support fallbacks if fetch fails
    existing_stocks = {}
    screener_data_path = os.path.join(DATA_DIR, 'screener_data.json')
    if os.path.exists(screener_data_path):
        try:
            with open(screener_data_path, 'r') as f:
                old_data = json.load(f)
                existing_stocks = {s['symbol']: s for s in old_data.get('stocks', [])}
            print(f"Loaded cache for {len(existing_stocks)} stocks to support fallback resolution.")
        except Exception as cache_err:
            print(f"Could not load existing cache: {cache_err}")

    collector = StockDataCollector()
    screener_results = []
    
    for idx, symbol in enumerate(tickers):
        progress_idx = idx + 1
        update_status(f"Fetching data for {symbol}...", progress=progress_idx, total=total_tickers, is_running=True)
        
        try:
            ticker_obj = yf.Ticker(symbol)
            # Fetch overview indicators
            metrics = collector.fetch_stock_overview(ticker_obj)
            
            # Fallback if fetch was empty/delisted (e.g. price is missing) and we have cache
            if (metrics.get("price") is None) and (symbol in existing_stocks):
                print(f"[{symbol}] Empty price returned. Reusing cached data.")
                metrics = existing_stocks[symbol]
                screener_results.append(metrics)
                continue
                
            screener_results.append(metrics)
                
        except Exception as e:
            print(f"Error processing {symbol}: {e}")
            if symbol in existing_stocks:
                print(f"[{symbol}] Exception during fetch. Reusing cached data.")
                screener_results.append(existing_stocks[symbol])
            else:
                # Append empty values
                screener_results.append({
                    "symbol": symbol,
                    "name": symbol,
                    "price": None,
                    "market_cap": None,
                    "trailing_ps": None,
                    "forward_ps_1y": None,
                    "forward_ps_2y": None,
                    "rev_growth_1y": None,
                    "rev_growth_2y": None,
                    "psg_1y": None,
                    "psg_2y": None,
                    "error": str(e)
                })
            
        # Save the master file incrementally on every stock to allow real-time UI updates
        try:
            screener_data_path = os.path.join(DATA_DIR, 'screener_data.json')
            master_payload = {
                "metadata": {
                    "last_updated": time.time(),
                    "total_stocks": len(screener_results),
                    "indicators": collector.indicator_configs
                },
                "stocks": screener_results
            }
            with open(screener_data_path, 'w') as f:
                json.dump(master_payload, f, indent=2)
        except Exception as write_err:
            print(f"Error writing incremental screener data: {write_err}")

        # Respectful delay between ticker requests to bypass rate-limiting
        time.sleep(0.1)
        
    # Write the final master screener overview file and upload to Supabase
    try:
        screener_data_path = os.path.join(DATA_DIR, 'screener_data.json')
        master_payload = {
            "metadata": {
                "last_updated": time.time(),
                "total_stocks": len(screener_results),
                "indicators": collector.indicator_configs
            },
            "stocks": screener_results
        }
        with open(screener_data_path, 'w') as f:
            json.dump(master_payload, f, indent=2)
        
        # Upload data to Supabase
        upload_to_supabase(master_payload)
    except Exception as final_err:
        print(f"Error writing final screener data: {final_err}")
        
    update_status("Data collection complete!", progress=total_tickers, total=total_tickers, is_running=False)

if __name__ == "__main__":
    # Load environment variables manually
    for path in ['.env', '../.env', 'backend/.env', '../frontend/.env.local', 'frontend/.env.local']:
        if os.path.exists(path):
            print(f"Loading environment variables from {path}...")
            with open(path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, v = line.split('=', 1)
                        os.environ.setdefault(k.strip(), v.strip())
                        
    # If running in production (GitHub Actions or with environment flag), crawl Nasdaq-100
    if os.environ.get("GITHUB_ACTIONS") == "true" or os.environ.get("PRODUCTION") == "true":
        print("Running full Nasdaq-100 data collection...")
        provider = WikipediaNasdaq100Provider()
    else:
        print("Running data fetcher in test mode (3 tickers)...")
        provider = CustomListProvider(["AAPL", "MSFT", "TSLA"])
        
    run_screener_collection(provider)
