import os
import time
import pandas as pd
from datetime import date, timedelta
import yfinance as yf
import urllib3
import ssl
import requests

# Globally disable SSL certificate warnings and verification to prevent network errors in local environment
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
try:
    ssl._create_default_https_context = ssl._create_unverified_context
except AttributeError:
    pass

# Shared requests session to bypass SSL certificate verification and specify browser User-Agent
YF_SESSION = requests.Session()
YF_SESSION.verify = False
YF_SESSION.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36'
})

class BaseDataProvider:
    def download_bulk_live_prices(self, symbols: list, fx_pairs: list) -> dict:
        """
        Fetch current live prices for stocks/currencies in bulk.
        Returns:
            dict containing:
                "stocks": {symbol: {"live_price": float, "company_name": str, "native_currency": str}}
                "fx": {pair: float}
        """
        raise NotImplementedError

    def download_live_ticker(self, symbol: str) -> dict:
        """
        Fetch details for a single ticker.
        Returns:
            {"live_price": float, "company_name": str, "native_currency": str, "quote_type": str}
        """
        raise NotImplementedError

    def download_live_fx(self, pair: str) -> float:
        """
        Fetch live conversion rate for a currency pair (e.g. USDPLN=X).
        """
        raise NotImplementedError

    def download_historical_stock_bulk(self, symbols: list, start_dt: date, end_dt: date) -> tuple:
        """
        Fetch historical daily prices and dividends in bulk.
        Returns:
            (prices_by_symbol, dividends_by_symbol)
            where each is dict[symbol, dict[date, float]]
        """
        raise NotImplementedError

    def download_historical_stock(self, symbol: str, start_dt: date, end_dt: date) -> tuple:
        """
        Fetch historical daily prices and dividends for a single stock.
        Returns:
            (prices_dict, dividends_dict)
            where each is dict[date, float]
        """
        raise NotImplementedError

    def download_historical_fx(self, pair: str, start_dt: date, end_dt: date) -> dict:
        """
        Fetch historical currency conversion rates.
        Returns:
            dict[date, float]
        """
        raise NotImplementedError


class YFinanceProvider(BaseDataProvider):
    def download_bulk_live_prices(self, symbols: list, fx_pairs: list) -> dict:
        all_missing = symbols + fx_pairs
        if not all_missing:
            return {"stocks": {}, "fx": {}}

        symbols_str = " ".join(all_missing)
        res = {"stocks": {}, "fx": {}}
        try:
            df = yf.download(symbols_str, period="5d", progress=False, group_by='ticker', session=YF_SESSION)
            
            for sym in symbols:
                live_price = 0.0
                previous_close = 0.0
                try:
                    if len(all_missing) == 1:
                        ticker_df = df
                        if isinstance(ticker_df.columns, pd.MultiIndex):
                            ticker_df.columns = ticker_df.columns.get_level_values(0)
                        prices_series = ticker_df['Close'] if 'Close' in ticker_df.columns else pd.Series(dtype=float)
                    else:
                        if sym in df.columns.levels[0]:
                            ticker_df = df[sym]
                            prices_series = ticker_df['Close'] if 'Close' in ticker_df.columns else pd.Series(dtype=float)
                        else:
                            prices_series = pd.Series(dtype=float)
                            
                    non_nan_series = prices_series.dropna()
                    if not non_nan_series.empty:
                        live_price = float(non_nan_series.iloc[-1])
                        if len(non_nan_series) >= 2:
                            previous_close = float(non_nan_series.iloc[-2])
                        else:
                            previous_close = live_price
                except Exception as sym_err:
                    print(f"Error parsing live bulk data for {sym}: {sym_err}")
                
                res["stocks"][sym] = {
                    "live_price": live_price,
                    "previous_close": previous_close,
                    "company_name": sym,
                    "native_currency": "USD"  # Will resolve default base values
                }
                
            for pair in fx_pairs:
                rate = 1.0
                try:
                    if len(all_missing) == 1:
                        ticker_df = df
                        if isinstance(ticker_df.columns, pd.MultiIndex):
                            ticker_df.columns = ticker_df.columns.get_level_values(0)
                        prices_series = ticker_df['Close'] if 'Close' in ticker_df.columns else pd.Series(dtype=float)
                    else:
                        if pair in df.columns.levels[0]:
                            ticker_df = df[pair]
                            prices_series = ticker_df['Close'] if 'Close' in ticker_df.columns else pd.Series(dtype=float)
                        else:
                            prices_series = pd.Series(dtype=float)
                            
                    non_nan_series = prices_series.dropna()
                    if not non_nan_series.empty:
                        rate = float(non_nan_series.iloc[-1])
                except Exception as pair_err:
                    print(f"Error parsing live FX bulk data for {pair}: {pair_err}")
                res["fx"][pair] = rate
                
        except Exception as e:
            print(f"YFinance bulk prefetch failed: {e}")
            
        return res

    def download_live_ticker(self, symbol: str) -> dict:
        live_price = 0.0
        company_name = symbol
        native_currency = "USD"
        quote_type = None
        previous_close = 0.0
        timezone = "UTC"
        exchange = ""
        try:
            stock_ticker = yf.Ticker(symbol, session=YF_SESSION)
            
            # Use fast_info first to avoid calling .info which can throw KeyError
            fast = stock_ticker.fast_info
            
            try:
                live_price = fast.get("lastPrice")
            except Exception:
                live_price = None
                
            info_dict = {}
            try:
                # Wrap .info access in try-except to handle KeyError: 'exchangeTimezoneName'
                info_dict = stock_ticker.info or {}
            except Exception as info_err:
                print(f"Warning: Could not fetch stock_ticker.info for {symbol} ({info_err}). Using fast_info.")
                
            if live_price is None:
                live_price = info_dict.get("currentPrice") or 0.0
                
            company_name = info_dict.get("longName") or info_dict.get("shortName")
            
            if not company_name or company_name.upper().strip() == symbol.upper().strip():
                try:
                    import requests
                    search_url = "https://query2.finance.yahoo.com/v1/finance/search"
                    headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36'
                    }
                    search_params = {'q': symbol, 'quotesCount': 1, 'newsCount': 0}
                    res = requests.get(search_url, headers=headers, params=search_params, timeout=5, verify=False)
                    if res.status_code == 200:
                        s_data = res.json()
                        quotes = s_data.get("quotes", [])
                        if quotes:
                            q = quotes[0]
                            company_name = q.get("longname") or q.get("shortname") or company_name
                except Exception as search_err:
                    print(f"Failed search fallback name fetch for {symbol}: {search_err}")
                    
            if not company_name:
                company_name = symbol
                
            try:
                native_currency = fast.get("currency")
            except Exception:
                native_currency = None
            if not native_currency:
                native_currency = info_dict.get("currency") or "USD"
                
            try:
                quote_type = fast.get("quoteType")
            except Exception:
                quote_type = None
            if not quote_type:
                quote_type = info_dict.get("quoteType")
                
            try:
                previous_close = fast.get("previousClose")
            except Exception:
                previous_close = None
            if not previous_close:
                previous_close = info_dict.get("regularMarketPreviousClose") or live_price
                
            try:
                timezone = fast.get("timezone")
            except Exception:
                timezone = None
            if not timezone:
                timezone = info_dict.get("exchangeTimezoneName") or "UTC"
                
            try:
                exchange = fast.get("exchange")
            except Exception:
                exchange = None
            if not exchange:
                exchange = info_dict.get("exchange") or ""
        except Exception as e:
            print(f"YFinance live ticker download failed for {symbol}: {e}")
            
        return {
            "live_price": float(live_price) if live_price else 0.0,
            "company_name": company_name,
            "native_currency": native_currency.upper().strip() if native_currency else "USD",
            "quote_type": quote_type,
            "previous_close": float(previous_close) if previous_close else 0.0,
            "timezone": timezone,
            "exchange": exchange
        }

    def download_live_fx(self, pair: str) -> float:
        rate = 1.0
        try:
            rate_ticker = yf.Ticker(pair, session=YF_SESSION)
            try:
                rate = rate_ticker.fast_info.get("lastPrice")
            except Exception:
                rate = None
            if rate is None:
                try:
                    info_dict = rate_ticker.info or {}
                    rate = info_dict.get("previousClose") or 1.0
                except Exception:
                    rate = 1.0
        except Exception as e:
            print(f"YFinance live FX download failed for {pair}: {e}")
        return float(rate)

    def download_historical_stock_bulk(self, symbols: list, start_dt: date, end_dt: date) -> tuple:
        prices_by_symbol = {}
        dividends_by_symbol = {}
        for sym in symbols:
            prices_by_symbol[sym] = {}
            dividends_by_symbol[sym] = {}

        start_str = start_dt.strftime("%Y-%m-%d")
        # Go slightly past today to capture the most recent trading days
        end_str = (date.today() + timedelta(days=1)).strftime("%Y-%m-%d")

        try:
            symbols_str = " ".join(symbols)
            df = yf.download(symbols_str, start=start_str, end=end_str, progress=False, group_by='ticker', actions=True, session=YF_SESSION)
            
            for sym in symbols:
                try:
                    if len(symbols) == 1:
                        ticker_df = df
                        if isinstance(ticker_df.columns, pd.MultiIndex):
                            ticker_df.columns = ticker_df.columns.get_level_values(0)
                        prices_series = ticker_df['Close'] if 'Close' in ticker_df.columns else pd.Series(dtype=float)
                        div_series = ticker_df['Dividends'] if 'Dividends' in ticker_df.columns else pd.Series(dtype=float)
                    else:
                        if sym in df.columns.levels[0]:
                            ticker_df = df[sym]
                            prices_series = ticker_df['Close'] if 'Close' in ticker_df.columns else pd.Series(dtype=float)
                            div_series = ticker_df['Dividends'] if 'Dividends' in ticker_df.columns else pd.Series(dtype=float)
                        else:
                            prices_series = pd.Series(dtype=float)
                            div_series = pd.Series(dtype=float)
                            
                    # Clean and insert daily prices
                    prices_series = prices_series.dropna()
                    for idx, val in prices_series.items():
                        dt = idx.to_pydatetime().date()
                        prices_by_symbol[sym][dt] = float(val)

                    # Clean and insert dividends
                    div_series = div_series.dropna()
                    for idx, val in div_series.items():
                        if float(val) > 0:
                            dt = idx.to_pydatetime().date()
                            dividends_by_symbol[sym][dt] = float(val)
                except Exception as sym_err:
                    print(f"Error parsing historical bulk data for {sym}: {sym_err}")
        except Exception as e:
            print(f"YFinance bulk historical download failed: {e}")

        return prices_by_symbol, dividends_by_symbol

    def download_historical_stock(self, symbol: str, start_dt: date, end_dt: date) -> tuple:
        prices_dict = {}
        dividends_dict = {}
        start_str = start_dt.strftime("%Y-%m-%d")
        end_str = (end_dt + timedelta(days=1)).strftime("%Y-%m-%d")
        try:
            df = yf.download(symbol, start=start_str, end=end_str, progress=False, actions=True, session=YF_SESSION)
            if not df.empty:
                if 'Close' in df.columns:
                    closes = df['Close'].dropna()
                    for idx, val in closes.items():
                        dt = idx.to_pydatetime().date()
                        prices_dict[dt] = float(val)
                if 'Dividends' in df.columns:
                    divs = df['Dividends'].dropna()
                    for idx, val in divs.items():
                        if float(val) > 0:
                            dt = idx.to_pydatetime().date()
                            dividends_dict[dt] = float(val)
        except Exception as e:
            print(f"YFinance single historical stock download failed for {symbol}: {e}")
        return prices_dict, dividends_dict

    def download_historical_fx(self, pair: str, start_dt: date, end_dt: date) -> dict:
        prices_dict = {}
        start_str = start_dt.strftime("%Y-%m-%d")
        end_str = (end_dt + timedelta(days=1)).strftime("%Y-%m-%d")
        try:
            df_fx = yf.download(pair, start=start_str, end=end_str, progress=False, session=YF_SESSION)
            if not df_fx.empty and 'Close' in df_fx.columns:
                closes = df_fx['Close'].dropna()
                for idx, val in closes.items():
                    dt = idx.to_pydatetime().date()
                    prices_dict[dt] = float(val)
        except Exception as e:
            print(f"YFinance historical FX download failed for {pair}: {e}")
        return prices_dict


def get_provider() -> BaseDataProvider:
    provider_name = os.environ.get("DATA_PROVIDER", "yfinance").lower().strip()
    if provider_name == "yfinance":
        return YFinanceProvider()
    # Placeholder for commercial providers
    # elif provider_name == "tiingo":
    #     return TiingoProvider()
    else:
        print(f"[WARN] Unknown data provider '{provider_name}'. Defaulting to YFinanceProvider.")
        return YFinanceProvider()
