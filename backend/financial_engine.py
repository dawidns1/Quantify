import math
from datetime import date, datetime, timedelta
import numpy as np
import yfinance as yf
import pandas as pd

# --- Money-Weighted Return (XIRR / IRR) ---

def xirr_f(r: float, cash_flows: list) -> float:
    """Calculates the NPV of cash flows at rate r."""
    t0 = cash_flows[0][0]
    val = 0.0
    for dt, amount in cash_flows:
        t = (dt - t0).days / 365.0
        # Prevent math overflow for extreme rates
        try:
            val += amount / ((1.0 + r) ** t)
        except OverflowError:
            if r > 0:
                val += 0.0
            else:
                val += amount * 1e10
    return val

def xirr_df(r: float, cash_flows: list) -> float:
    """Calculates the derivative of NPV at rate r."""
    t0 = cash_flows[0][0]
    val = 0.0
    for dt, amount in cash_flows:
        t = (dt - t0).days / 365.0
        try:
            val += -t * amount / ((1.0 + r) ** (t + 1.0))
        except OverflowError:
            pass
    return val

def calculate_xirr(cash_flows: list, guess: float = 0.1, max_iter: int = 100, tol: float = 1e-6) -> float:
    """
    Computes the annualized Internal Rate of Return (IRR) using a hybrid 
    Newton-Raphson and Bisection method.
    cash_flows should be a list of tuples: (date_obj, net_amount).
    Deposits/Purchases are negative; Sales/Dividends/Current Valuation are positive.
    """
    if not cash_flows:
        return 0.0
        
    # Sort chronologically
    cash_flows = sorted(cash_flows, key=lambda x: x[0])
    
    # Check if we have both negative and positive cash flows
    has_pos = any(cf[1] > 0 for cf in cash_flows)
    has_neg = any(cf[1] < 0 for cf in cash_flows)
    if not (has_pos and has_neg):
        return 0.0  # Cannot solve if all signs are identical
        
    r = guess
    # 1. Try Newton-Raphson first
    for _ in range(max_iter):
        f_val = xirr_f(r, cash_flows)
        df_val = xirr_df(r, cash_flows)
        
        if abs(df_val) < 1e-12:
            break
            
        r_new = r - f_val / df_val
        if abs(r_new - r) < tol:
            return r_new
        r = r_new
        
        # If rate goes out of bounds, break to bisection
        if r < -0.999 or r > 10.0:
            break
            
    # 2. Fallback to Bisection Search
    low = -0.99
    high = 5.0
    
    # Expand boundaries if needed
    for _ in range(5):
        f_low = xirr_f(low, cash_flows)
        f_high = xirr_f(high, cash_flows)
        if f_low * f_high < 0:
            break
        low -= 0.1
        high *= 2.0
        
    for _ in range(max_iter):
        r = (low + high) / 2.0
        f_val = xirr_f(r, cash_flows)
        
        if abs(f_val) < tol:
            return r
            
        f_low = xirr_f(low, cash_flows)
        if f_low * f_val < 0:
            high = r
        else:
            low = r
            
    return r

# --- Time-Weighted Return (TWR) ---

def calculate_twr(daily_nav: list, daily_cash_flows: dict) -> float:
    """
    Computes cumulative Time-Weighted Return based on a daily NAV history 
    and a dictionary of daily net cash flows: {date_str: net_cash_flow}.
    daily_nav is a list of dicts: [{"date": "2026-01-01", "nav": 1000.0, "cost": 950.0}, ...]
    """
    if len(daily_nav) < 2:
        return 0.0
        
    compounded_twr = 1.0
    
    for i in range(1, len(daily_nav)):
        prev_nav = daily_nav[i-1]["nav"]
        curr_nav = daily_nav[i]["nav"]
        date_str = daily_nav[i]["date"]
        
        cf = daily_cash_flows.get(date_str, 0.0)
        
        if prev_nav > 0:
            # Daily return: excluding cash flows deposited/withdrawn today
            # R_d = (NAV_today - CashFlow_today - NAV_yesterday) / NAV_yesterday
            daily_return = (curr_nav - cf - prev_nav) / prev_nav
            compounded_twr *= (1.0 + daily_return)
            
    return compounded_twr - 1.0

# --- Risk-Adjusted Metrics (Sharpe, Sortino, Volatility) ---

def calculate_risk_metrics(daily_nav: list, daily_cash_flows: dict, annual_rf: float = 0.02) -> dict:
    """
    Calculates daily standard deviation (volatility), downside volatility, 
    Sharpe Ratio, and Sortino Ratio.
    """
    if len(daily_nav) < 3:
        return {
            "volatility_annual": 0.0,
            "sharpe_ratio": 0.0,
            "sortino_ratio": 0.0
        }
        
    daily_returns = []
    daily_rf = annual_rf / 252.0
    
    for i in range(1, len(daily_nav)):
        prev_nav = daily_nav[i-1]["nav"]
        curr_nav = daily_nav[i]["nav"]
        date_str = daily_nav[i]["date"]
        cf = daily_cash_flows.get(date_str, 0.0)
        
        if prev_nav > 0:
            # Daily return
            r = (curr_nav - cf - prev_nav) / prev_nav
            # Clean outliers/extreme values
            if -0.9 <= r <= 2.0:
                daily_returns.append(r)
                
    if not daily_returns:
        return {
            "volatility_annual": 0.0,
            "sharpe_ratio": 0.0,
            "sortino_ratio": 0.0
        }
        
    mean_return = np.mean(daily_returns)
    std_dev = np.std(daily_returns)
    
    # Downside deviation (returns below risk-free rate or below 0)
    downside_returns = [r for r in daily_returns if r < daily_rf]
    downside_std = np.std(downside_returns) if downside_returns else 1e-6
    if downside_std < 1e-6:
        downside_std = 1e-6
        
    volatility_annual = std_dev * math.sqrt(252)
    
    if std_dev > 1e-6:
        sharpe_ratio = ((mean_return - daily_rf) / std_dev) * math.sqrt(252)
    else:
        sharpe_ratio = 0.0
        
    sortino_ratio = ((mean_return - daily_rf) / downside_std) * math.sqrt(252)
    
    return {
        "volatility_annual": round(volatility_annual, 4),
        "sharpe_ratio": round(sharpe_ratio, 2),
        "sortino_ratio": round(sortino_ratio, 2)
    }

# --- Beta & Benchmark Analysis ---

def calculate_beta(daily_nav: list, daily_cash_flows: dict, benchmark_symbol: str = "SPY") -> float:
    """
    Calculates portfolio Beta against a benchmark index symbol.
    Fetches daily returns for benchmark using yfinance.
    """
    if len(daily_nav) < 5:
        return 1.0
        
    # Get portfolio daily returns
    portfolio_dates = []
    portfolio_returns = []
    for i in range(1, len(daily_nav)):
        prev_nav = daily_nav[i-1]["nav"]
        curr_nav = daily_nav[i]["nav"]
        date_str = daily_nav[i]["date"]
        cf = daily_cash_flows.get(date_str, 0.0)
        
        if prev_nav > 0:
            r = (curr_nav - cf - prev_nav) / prev_nav
            if -0.9 <= r <= 2.0:
                portfolio_dates.append(date_str)
                portfolio_returns.append(r)
                
    if len(portfolio_returns) < 5:
        return 1.0
        
    # Fetch benchmark data
    try:
        from backend.cache_db import get_cached_historical_prices, save_cached_historical_prices
        
        # Load from SQLite cache first
        start_date = datetime.strptime(portfolio_dates[0], "%Y-%m-%d").date()
        end_date = datetime.strptime(portfolio_dates[-1], "%Y-%m-%d").date()
        
        prices_dict, _ = get_cached_historical_prices(benchmark_symbol, start_date, end_date)
        
        # If cache is missing or incomplete, download from yfinance and save to cache
        expected_days = (end_date - start_date).days
        if len(prices_dict) < max(5, expected_days * 0.4):
            from backend.data_provider import get_provider
            provider = get_provider()
            prices_dict, divs_dict = provider.download_historical_stock(benchmark_symbol, start_date, end_date)
            if prices_dict:
                save_cached_historical_prices(benchmark_symbol, prices_dict, divs_dict)
                
        if not prices_dict:
            return 1.0
            
        # Build benchmark daily returns mapped to the same dates
        dates_sorted = sorted(prices_dict.keys())
        benchmark_closes = pd.Series(
            data=[prices_dict[d] for d in dates_sorted],
            index=pd.to_datetime(dates_sorted)
        )
        
        benchmark_returns = []
        aligned_portfolio_returns = []
        
        # Compute benchmark daily returns
        bench_ret_map = {}
        for i in range(1, len(benchmark_closes)):
            prev_val = float(benchmark_closes.iloc[i-1])
            curr_val = float(benchmark_closes.iloc[i])
            dt_str = benchmark_closes.index[i].strftime("%Y-%m-%d")
            if prev_val > 0:
                bench_ret_map[dt_str] = (curr_val - prev_val) / prev_val
                
        for dt_str, r_port in zip(portfolio_dates, portfolio_returns):
            if dt_str in bench_ret_map:
                benchmark_returns.append(bench_ret_map[dt_str])
                aligned_portfolio_returns.append(r_port)
                
        if len(benchmark_returns) < 5:
            return 1.0
            
        # Calculate covariance / variance
        covariance = np.cov(aligned_portfolio_returns, benchmark_returns)[0][1]
        variance = np.var(benchmark_returns)
        
        if variance > 1e-8:
            beta = covariance / variance
            return round(beta, 2)
    except Exception as e:
        print(f"[FinancialEngine] Error calculating Beta against {benchmark_symbol}: {e}")
        
    return 1.0

# --- Correlation Matrix ---

def calculate_correlation_matrix(symbols: list, days: int = 365) -> dict:
    """
    Computes Pearson correlation matrix for the active symbols using SQLite cache.
    """
    if len(symbols) < 2:
        return {}
        
    end_date = date.today()
    start_date = end_date - timedelta(days=days)
    
    try:
        from backend.cache_db import get_cached_historical_prices
        
        # Build a pandas DataFrame of daily closing prices from SQLite cache
        series_dict = {}
        for sym in symbols:
            prices, _ = get_cached_historical_prices(sym, start_date, end_date)
            if prices:
                # Map to string dates for alignment
                series_dict[sym] = pd.Series(
                    data=[v for v in prices.values()],
                    index=[d.strftime("%Y-%m-%d") for d in prices.keys()]
                )
                
        if not series_dict:
            return {}
            
        closes_df = pd.DataFrame(series_dict)
        
        # Calculate daily returns
        returns_df = closes_df.pct_change().dropna(how='all')
        
        # Pearson correlation
        corr_df = returns_df.corr(method='pearson')
        
        # Fill NaN values with 0.0 and diagonal with 1.0
        corr_df = corr_df.fillna(0.0)
        
        matrix = {}
        for s1 in symbols:
            matrix[s1] = {}
            for s2 in symbols:
                if s1 == s2:
                    matrix[s1][s2] = 1.0
                elif s1 in corr_df.columns and s2 in corr_df.index:
                    matrix[s1][s2] = round(float(corr_df.loc[s2, s1]), 3)
                else:
                    matrix[s1][s2] = 0.0
                    
        return matrix
    except Exception as e:
        print(f"[FinancialEngine] Error calculating correlation matrix: {e}")
        
    # Default fallback
    matrix = {}
    for s1 in symbols:
        matrix[s1] = {}
        for s2 in symbols:
            matrix[s1][s2] = 1.0 if s1 == s2 else 0.0
    return matrix
