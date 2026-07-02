import os
import time
import math
import pandas as pd
from datetime import date, timedelta
import yfinance as yf
import urllib3
import ssl
import requests

# Load environment variables manually if not already loaded (e.g. when run as a standalone script)
for path in ['.env', '../.env', 'backend/.env', '../frontend/.env.local', 'frontend/.env.local']:
    if os.path.exists(path):
        with open(path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ.setdefault(k.strip(), v.strip())

IS_PRODUCTION = os.environ.get("PRODUCTION") == "true" or os.environ.get("VERCEL") == "1" or os.environ.get("ENV") == "production"

if not IS_PRODUCTION:
    # Globally disable SSL certificate warnings and verification to prevent network errors in local environment
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    try:
        ssl._create_default_https_context = ssl._create_unverified_context
    except AttributeError:
        pass

class TimeoutHTTPAdapter(requests.adapters.HTTPAdapter):
    def __init__(self, *args, **kwargs):
        self.timeout = kwargs.pop("timeout", 5.0)
        super().__init__(*args, **kwargs)

    def send(self, request, **kwargs):
        timeout = kwargs.get("timeout")
        if timeout is None:
            kwargs["timeout"] = self.timeout
        return super().send(request, **kwargs)

# Shared requests session with conditional SSL certificate verification and browser User-Agent
YF_SESSION = requests.Session()
adapter = TimeoutHTTPAdapter(timeout=5.0)
YF_SESSION.mount("https://", adapter)
YF_SESSION.mount("http://", adapter)

if IS_PRODUCTION:
    YF_SESSION.verify = True
else:
    YF_SESSION.verify = False

YF_SESSION.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36'
})

FALLBACK_RATES = {
    "USDPLN": 4.0, "EURPLN": 4.3, 
    "PLNUSD": 0.25, "PLNEUR": 0.23,
    "USDEUR": 0.92, "EURUSD": 1.08
}

# Hardcoded currency overrides for specific listings to guarantee correctness even during network/API failures
CURRENCY_OVERRIDES = {
    "DTLA.L": "USD",
    "IUST.L": "USD",
    "IUUS.L": "USD"
}

def guess_native_currency(symbol: str) -> str:
    symbol = symbol.upper().strip()
    if symbol in CURRENCY_OVERRIDES:
        return CURRENCY_OVERRIDES[symbol]
        
    suffix = symbol.split(".")[-1] if "." in symbol else ""
    if suffix in {"DE", "PA", "AS", "BR", "MI", "MC", "LS", "AT", "VI", "EE", "HE", "OL", "IC"}:
        return "EUR"
    if suffix == "WA":
        return "PLN"
    if suffix == "L":
        return "GBP"
    if suffix == "JO":
        return "ZAR"
    if suffix == "TA":
        return "ILS"
    if suffix == "SW":
        return "CHF"
    if suffix in {"TO", "V"}:
        return "CAD"
    if suffix == "AX":
        return "AUD"
    if suffix == "HK":
        return "HKD"
    if suffix == "SA":
        return "BRL"
    if suffix == "MX":
        return "MXN"
    if suffix in {"KS", "KQ"}:
        return "KRW"
    if suffix == "T":
        return "JPY"
    if suffix in {"NS", "BO"}:
        return "INR"
    if suffix == "SG":
        return "SGD"
    if suffix == "ST":
        return "SEK"
    if suffix == "CO":
        return "DKK"
    return "USD"

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
                
                guessed_currency = guess_native_currency(sym)
                res["stocks"][sym] = {
                    "live_price": live_price,
                    "previous_close": previous_close,
                    "company_name": sym,
                    "native_currency": guessed_currency
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
                
                if not rate or rate == 1.0 or math.isnan(rate):
                    base_pair = pair.replace("=X", "")
                    rate = FALLBACK_RATES.get(base_pair, 1.0)
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
            
            fast = None
            try:
                # Use fast_info first to avoid calling .info which can throw KeyError
                fast = stock_ticker.fast_info
            except Exception as fast_err:
                print(f"Warning: Could not fetch stock_ticker.fast_info for {symbol} ({fast_err}). Using info.")
            
            try:
                live_price = fast.get("lastPrice") if fast else None
            except Exception:
                live_price = None
                
            info_dict = {}
            try:
                # Wrap .info access in try-except to handle KeyError: 'exchangeTimezoneName'
                info_dict = stock_ticker.info or {}
            except Exception as info_err:
                print(f"Warning: Could not fetch stock_ticker.info for {symbol} ({info_err}).")
                
            if live_price is None:
                live_price = info_dict.get("currentPrice") or info_dict.get("regularMarketPrice") or 0.0
                
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
                native_currency = fast.get("currency") if fast else None
            except Exception:
                native_currency = None
            if not native_currency:
                native_currency = info_dict.get("currency") or guess_native_currency(symbol)
                
            try:
                quote_type = fast.get("quoteType") if fast else None
            except Exception:
                quote_type = None
            if not quote_type:
                quote_type = info_dict.get("quoteType")
                
            try:
                previous_close = fast.get("previousClose") if fast else None
            except Exception:
                previous_close = None
            if not previous_close:
                previous_close = info_dict.get("regularMarketPreviousClose") or info_dict.get("previousClose") or live_price
                
            try:
                timezone = fast.get("timezone") if fast else None
            except Exception:
                timezone = None
            if not timezone:
                timezone = info_dict.get("exchangeTimezoneName") or "UTC"
                
            try:
                exchange = fast.get("exchange") if fast else None
            except Exception:
                exchange = None
            if not exchange:
                exchange = info_dict.get("exchange") or ""
        except Exception as e:
            print(f"YFinance live ticker download failed for {symbol}: {e}")
            live_price = 0.0
            company_name = symbol
            native_currency = guess_native_currency(symbol)
            quote_type = None
            previous_close = 0.0
            timezone = "Unknown"
            exchange = ""
            
        resolved_currency = native_currency.upper().strip() if native_currency else guess_native_currency(symbol)
        if resolved_currency in ["GBP", "GBX", "ZAC", "ILA"]:
            if resolved_currency in ["GBP", "GBX"]:
                resolved_currency = "GBP"
            elif resolved_currency == "ZAC":
                resolved_currency = "ZAR"
            elif resolved_currency == "ILA":
                resolved_currency = "ILS"
                
            if live_price:
                live_price = float(live_price) / 100.0
            if previous_close:
                previous_close = float(previous_close) / 100.0

        return {
            "live_price": float(live_price) if live_price else 0.0,
            "company_name": company_name,
            "native_currency": resolved_currency,
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
        import concurrent.futures
        
        prices_by_symbol = {}
        dividends_by_symbol = {}
        for sym in symbols:
            prices_by_symbol[sym] = {}
            dividends_by_symbol[sym] = {}

        def fetch_single(sym):
            try:
                p, d = self.download_historical_stock(sym, start_dt, end_dt)
                return sym, p, d
            except Exception as sym_err:
                print(f"Error in parallel historical download for {sym}: {sym_err}")
                return sym, {}, {}

        # Fetch in parallel using a thread pool with max 8 concurrent workers
        max_workers = min(len(symbols), 8) if symbols else 1
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(fetch_single, sym): sym for sym in symbols}
            for future in concurrent.futures.as_completed(futures):
                sym, p, d = future.result()
                prices_by_symbol[sym] = p
                dividends_by_symbol[sym] = d

        return prices_by_symbol, dividends_by_symbol

    def download_historical_stock(self, symbol: str, start_dt: date, end_dt: date) -> tuple:
        prices_dict = {}
        dividends_dict = {}
        start_str = start_dt.strftime("%Y-%m-%d")
        end_str = (end_dt + timedelta(days=1)).strftime("%Y-%m-%d")
        try:
            df = yf.download(symbol, start=start_str, end=end_str, progress=False, actions=True, session=YF_SESSION)
            is_pence = False
            symbol_upper = symbol.upper().strip()
            if symbol_upper.endswith(".L") or symbol_upper.endswith(".JO") or symbol_upper.endswith(".TA"):
                try:
                    ticker = yf.Ticker(symbol, session=YF_SESSION)
                    curr = ticker.fast_info.get("currency")
                    if not curr:
                        curr = (ticker.info or {}).get("currency")
                    if curr:
                        is_pence = curr.upper().strip() in {"GBP", "GBX", "ZAC", "ILA"}
                    else:
                        is_pence = True
                except Exception:
                    is_pence = True
            if not df.empty:
                if 'Close' in df.columns:
                    closes = df['Close']
                    if isinstance(closes, pd.DataFrame):
                        closes = closes.squeeze()
                    closes = closes.dropna()
                    for idx, val in closes.items():
                        dt = idx.to_pydatetime().date()
                        prices_dict[dt] = float(val) / 100.0 if is_pence else float(val)
                if 'Dividends' in df.columns:
                    divs = df['Dividends']
                    if isinstance(divs, pd.DataFrame):
                        divs = divs.squeeze()
                    divs = divs.dropna()
                    for idx, val in divs.items():
                        if float(val) > 0:
                            dt = idx.to_pydatetime().date()
                            dividends_dict[dt] = float(val) / 100.0 if is_pence else float(val)
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
                closes = df_fx['Close']
                if isinstance(closes, pd.DataFrame):
                    closes = closes.squeeze()
                closes = closes.dropna()
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
