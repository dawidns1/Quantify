import os
import time
import math
import pandas as pd
from datetime import datetime, date, timedelta
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

from urllib3.util import Retry

class TimeoutHTTPAdapter(requests.adapters.HTTPAdapter):
    def __init__(self, *args, **kwargs):
        self.timeout = kwargs.pop("timeout", 4.0)
        super().__init__(*args, **kwargs)

    def send(self, request, **kwargs):
        timeout = kwargs.get("timeout")
        if timeout is None:
            kwargs["timeout"] = self.timeout
        return super().send(request, **kwargs)

# Shared requests session with conditional SSL certificate verification and browser User-Agent
YF_SESSION = requests.Session()
adapter = TimeoutHTTPAdapter(timeout=4.0, max_retries=Retry(total=0, connect=0, read=0, redirect=0))
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

from concurrent.futures import ThreadPoolExecutor, TimeoutError as ExecTimeoutError

PROVIDER_EXECUTOR = ThreadPoolExecutor(max_workers=10)

def safe_network_call(func, timeout_sec=4.0, default=None):
    """Executes a network-bound task in a thread pool with a hard non-blocking timeout."""
    future = PROVIDER_EXECUTOR.submit(func)
    try:
        return future.result(timeout=timeout_sec)
    except ExecTimeoutError:
        print(f"[DataProvider] Network operation exceeded hard {timeout_sec}s timeout, returning fallback.")
        return default
    except Exception as e:
        print(f"[DataProvider] Exception in network call: {e}")
        return default

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
    def fetch_v8_chart_quote(self, symbol: str) -> dict:
        symbol = symbol.upper().strip()
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        for endpoint in ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]:
            url = f"{endpoint}/v8/finance/chart/{symbol}?range=2d&interval=1d"
            try:
                r = YF_SESSION.get(url, headers=headers, timeout=4.0)
                if r.status_code == 200:
                    data = r.json()
                    results = data.get("chart", {}).get("result", [])
                    if results:
                        meta = results[0].get("meta", {})
                        live_price = meta.get("regularMarketPrice") or 0.0
                        prev_close = meta.get("chartPreviousClose") or meta.get("previousClose") or live_price
                        company_name = meta.get("longName") or meta.get("shortName") or symbol
                        currency = meta.get("currency") or guess_native_currency(symbol)
                        timezone = meta.get("exchangeTimezoneName") or "UTC"
                        exchange = meta.get("exchangeName") or ""
                        return {
                            "symbol": symbol,
                            "live_price": float(live_price),
                            "previous_close": float(prev_close),
                            "company_name": company_name,
                            "native_currency": currency.upper().strip(),
                            "timezone": timezone,
                            "exchange": exchange
                        }
            except Exception as e:
                pass
        return None

    def download_bulk_live_prices(self, symbols: list, fx_pairs: list) -> dict:
        from concurrent.futures import ThreadPoolExecutor
        
        all_symbols = list(set([s.upper().strip() for s in symbols + fx_pairs if s.strip()]))
        if not all_symbols:
            return {"stocks": {}, "fx": {}}
            
        res = {"stocks": {}, "fx": {}}
        
        try:
            with ThreadPoolExecutor(max_workers=10) as executor:
                quotes = list(executor.map(self.fetch_v8_chart_quote, all_symbols))
                
            for q in quotes:
                if not q or q.get("live_price", 0.0) == 0.0:
                    continue
                sym = q["symbol"]
                if sym in fx_pairs:
                    res["fx"][sym] = q["live_price"]
                else:
                    res["stocks"][sym] = {
                        "live_price": q["live_price"],
                        "previous_close": q["previous_close"],
                        "company_name": q["company_name"],
                        "native_currency": q["native_currency"],
                        "timezone": q["timezone"],
                        "exchange": q["exchange"]
                    }
        except Exception as e:
            print(f"[DataProvider] Error in download_bulk_live_prices v8: {e}")
            
        # Fallback for any symbols that failed v8 fetch
        missing_stocks = [s for s in symbols if s not in res["stocks"]]
        missing_fx = [f for f in fx_pairs if f not in res["fx"]]
        if missing_stocks or missing_fx:
            print(f"[DataProvider] Fallback for missing: {missing_stocks} / {missing_fx}")
            try:
                fallback_res = self._download_bulk_live_prices_fallback(missing_stocks, missing_fx)
                for k, v in fallback_res["stocks"].items():
                    res["stocks"][k] = v
                for k, v in fallback_res["fx"].items():
                    res["fx"][k] = v
            except Exception as fb_err:
                print(f"[DataProvider] Fallback failed: {fb_err}")
                
        return res

    def _download_bulk_live_prices_fallback(self, symbols: list, fx_pairs: list) -> dict:
        all_missing = list(set([s.upper().strip() for s in symbols + fx_pairs if s.strip()]))
        if not all_missing:
            return {"stocks": {}, "fx": {}}

        res = {"stocks": {}, "fx": {}}

        def fetch_single_fallback(sym):
            live_price = 0.0
            previous_close = 0.0
            tz = "UTC"
            ex = ""
            try:
                # Use requests with 2.5s timeout instead of blocking fast_info
                url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range=1d&interval=1d"
                r = YF_SESSION.get(url, timeout=2.5)
                if r.status_code == 200:
                    d = r.json().get("chart", {}).get("result", [{}])[0].get("meta", {})
                    live_price = float(d.get("regularMarketPrice") or 0.0)
                    previous_close = float(d.get("chartPreviousClose") or d.get("previousClose") or live_price)
                    tz = d.get("exchangeTimezoneName") or "UTC"
                    ex = d.get("exchangeName") or ""
            except Exception:
                pass
            return sym, live_price, previous_close, tz, ex

        from concurrent.futures import ThreadPoolExecutor
        try:
            with ThreadPoolExecutor(max_workers=5) as executor:
                results = list(executor.map(fetch_single_fallback, all_missing))
            for sym, live_price, previous_close, tz, ex in results:
                if not live_price or live_price == 0.0:
                    continue
                if sym in fx_pairs:
                    res["fx"][sym] = live_price
                else:
                    guessed_currency = guess_native_currency(sym)
                    res["stocks"][sym] = {
                        "live_price": float(live_price),
                        "previous_close": float(previous_close),
                        "company_name": sym,
                        "native_currency": guessed_currency,
                        "timezone": tz,
                        "exchange": ex
                    }
        except Exception as e:
            print(f"Fallback YFinance bulk prefetch failed: {e}")

        # Set fallbacks for any remaining FX pairs
        for pair in fx_pairs:
            if pair not in res["fx"]:
                base_pair = pair.replace("=X", "")
                res["fx"][pair] = FALLBACK_RATES.get(base_pair, 1.0)

        return res

    def download_live_ticker(self, symbol: str) -> dict:
        v8_quote = self.fetch_v8_chart_quote(symbol)
        if v8_quote and v8_quote.get("live_price", 0.0) > 0.0:
            return v8_quote

        def _do_fallback():
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
                    fast = stock_ticker.fast_info
                except Exception as fast_err:
                    pass
                
                try:
                    live_price = fast.get("lastPrice") if fast else None
                except Exception:
                    live_price = None
                    
                info_dict = {}
                if live_price is None:
                    live_price = 0.0
                    
                company_name = symbol
                    
                try:
                    native_currency = fast.get("currency") if fast else None
                except Exception:
                    native_currency = None
                if not native_currency:
                    native_currency = guess_native_currency(symbol)
                    
                try:
                    quote_type = fast.get("quoteType") if fast else None
                except Exception:
                    quote_type = None
                    
                try:
                    previous_close = fast.get("previousClose") if fast else None
                except Exception:
                    previous_close = None
                if not previous_close:
                    previous_close = live_price
                    
                try:
                    timezone = fast.get("timezone") if fast else None
                except Exception:
                    timezone = "UTC"
                    
                try:
                    exchange = fast.get("exchange") if fast else None
                except Exception:
                    exchange = ""
            except Exception as e:
                live_price = 0.0
                company_name = symbol
                native_currency = guess_native_currency(symbol)
                quote_type = None
                previous_close = 0.0
                timezone = "Unknown"
                exchange = ""

            return {
                "live_price": float(live_price) if live_price else 0.0,
                "company_name": company_name,
                "native_currency": native_currency,
                "quote_type": quote_type,
                "previous_close": float(previous_close) if previous_close else 0.0,
                "timezone": timezone,
                "exchange": exchange
            }

        fallback_result = safe_network_call(_do_fallback, timeout_sec=2.0, default=None)
        if fallback_result:
            live_price = fallback_result["live_price"]
            company_name = fallback_result["company_name"]
            native_currency = fallback_result["native_currency"]
            quote_type = fallback_result["quote_type"]
            previous_close = fallback_result["previous_close"]
            timezone = fallback_result["timezone"]
            exchange = fallback_result["exchange"]
        else:
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
                base_pair = pair.replace("=X", "")
                rate = FALLBACK_RATES.get(base_pair, 1.0)
        except Exception as e:
            print(f"YFinance live FX download failed for {pair}: {e}")
        return float(rate)

    def _fetch_single_historical_stock(self, sym: str, start_dt: date, end_dt: date) -> tuple:
        sym = sym.upper().strip()
        prices = {}
        dividends = {}
        curr = guess_native_currency(sym)
        is_pence = curr in {"GBP", "GBX", "ZAC", "ILA"}
        scale = 0.01 if is_pence else 1.0

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }

        # 1. Try v8 direct endpoints (query1 -> query2)
        for endpoint in ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]:
            try:
                url = f"{endpoint}/v8/finance/chart/{sym}?range=5y&interval=1d&events=div"
                r = YF_SESSION.get(url, headers=headers, timeout=4.0)
                if r.status_code == 200:
                    data = r.json()
                    result = data.get("chart", {}).get("result", [])
                    if result:
                        timestamps = result[0].get("timestamp", [])
                        indicators = result[0].get("indicators", {}).get("quote", [{}])[0]
                        closes = indicators.get("close", [])
                        for ts, close_val in zip(timestamps, closes):
                            if close_val is not None and not math.isnan(close_val):
                                dt = datetime.fromtimestamp(ts).date()
                                if start_dt <= dt <= end_dt:
                                    prices[dt] = float(close_val) * scale

                        events = result[0].get("events", {})
                        divs = events.get("dividends", {})
                        for d_info in divs.values():
                            d_ts = d_info.get("date")
                            d_val = d_info.get("amount")
                            if d_ts and d_val:
                                d_dt = datetime.fromtimestamp(d_ts).date()
                                if start_dt <= d_dt <= end_dt:
                                    dividends[d_dt] = float(d_val) * scale

                        if prices:
                            return sym, prices, dividends
            except Exception:
                pass

        # 2. Secondary fallback via yfinance Ticker.history if direct v8 fails
        try:
            t = yf.Ticker(sym, session=YF_SESSION)
            hist = t.history(start=start_dt.strftime("%Y-%m-%d"), end=(end_dt + timedelta(days=1)).strftime("%Y-%m-%d"), timeout=4.0)
            if hist is not None and not hist.empty:
                for idx, row in hist.iterrows():
                    dt = idx.date() if hasattr(idx, 'date') else datetime.strptime(str(idx)[:10], "%Y-%m-%d").date()
                    if start_dt <= dt <= end_dt:
                        c_val = row.get("Close")
                        if pd.notna(c_val):
                            prices[dt] = float(c_val) * scale
                        d_val = row.get("Dividends")
                        if pd.notna(d_val) and float(d_val) > 0:
                            dividends[dt] = float(d_val) * scale
        except Exception:
            pass

        return sym, prices, dividends

    def download_historical_stock_bulk(self, symbols: list, start_dt: date, end_dt: date) -> tuple:
        prices_by_symbol = {sym: {} for sym in symbols}
        dividends_by_symbol = {sym: {} for sym in symbols}
        if not symbols:
            return prices_by_symbol, dividends_by_symbol

        from concurrent.futures import ThreadPoolExecutor
        workers = min(10, max(1, len(symbols)))
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = [executor.submit(self._fetch_single_historical_stock, sym, start_dt, end_dt) for sym in symbols]
            for fut in futures:
                try:
                    sym, p, d = fut.result()
                    prices_by_symbol[sym] = p
                    dividends_by_symbol[sym] = d
                except Exception as e:
                    print(f"Error fetching historical for symbol: {e}")

        return prices_by_symbol, dividends_by_symbol

    def download_historical_stock(self, symbol: str, start_dt: date, end_dt: date) -> tuple:
        p_dict, d_dict = self.download_historical_stock_bulk([symbol], start_dt, end_dt)
        return p_dict.get(symbol, {}), d_dict.get(symbol, {})

    def download_historical_fx(self, pair: str, start_dt: date, end_dt: date) -> dict:
        prices_dict = {}
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        for endpoint in ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]:
            try:
                url = f"{endpoint}/v8/finance/chart/{pair}?range=5y&interval=1d"
                r = YF_SESSION.get(url, headers=headers, timeout=4.0)
                if r.status_code == 200:
                    data = r.json()
                    result = data.get("chart", {}).get("result", [])
                    if result:
                        timestamps = result[0].get("timestamp", [])
                        indicators = result[0].get("indicators", {}).get("quote", [{}])[0]
                        closes = indicators.get("close", [])
                        for ts, close_val in zip(timestamps, closes):
                            if close_val is not None and not math.isnan(close_val):
                                dt = datetime.fromtimestamp(ts).date()
                                if start_dt <= dt <= end_dt:
                                    prices_dict[dt] = float(close_val)
                        if prices_dict:
                            return prices_dict
            except Exception:
                pass

        # Fallback via yfinance Ticker
        try:
            t = yf.Ticker(pair, session=YF_SESSION)
            hist = t.history(start=start_dt.strftime("%Y-%m-%d"), end=(end_dt + timedelta(days=1)).strftime("%Y-%m-%d"), timeout=4.0)
            if hist is not None and not hist.empty:
                for idx, row in hist.iterrows():
                    dt = idx.date() if hasattr(idx, 'date') else datetime.strptime(str(idx)[:10], "%Y-%m-%d").date()
                    if start_dt <= dt <= end_dt:
                        c_val = row.get("Close")
                        if pd.notna(c_val):
                            prices_dict[dt] = float(c_val)
        except Exception:
            pass

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
