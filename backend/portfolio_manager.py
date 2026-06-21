import os
import json
import time
import threading
import pandas as pd
from datetime import datetime, date, timedelta
from backend.data_provider import get_provider
from backend.cache_db import (
    get_cached_live_price,
    save_cached_live_price,
    get_cached_historical_prices,
    save_cached_historical_prices,
    get_cached_upcoming_events,
    save_cached_upcoming_events,
    update_upcoming_events_timestamp,
    get_expired_cached_live_price
)

provider = get_provider()

# Ensure data directory exists
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
os.makedirs(DATA_DIR, exist_ok=True)
PORTFOLIO_FILE = os.path.join(DATA_DIR, 'portfolio.json')

FALLBACK_RATES = {
    "USDPLN": 4.0, "EURPLN": 4.3, 
    "PLNUSD": 0.25, "PLNEUR": 0.23,
    "USDEUR": 0.92, "EURUSD": 1.08
}

class PortfolioManager:
    # In-memory caches for live/historical prices (to avoid heavy yfinance hits)
    _live_ticker_cache = {}  # symbol -> (timestamp, data)
    _live_fx_cache = {}      # pair -> (timestamp, rate)
    _historical_stock_cache = {}  # symbol -> {start_date, end_date, last_updated, prices}
    _historical_fx_cache = {}     # pair -> {start_date, end_date, last_updated, prices}
    _ticker_metadata_cache = {}   # symbol -> {timezone, exchange, company_name, native_currency, asset_class}
    _upcoming_events_cache = {}   # symbol -> (timestamp, events)
    _dividend_rate_cache = {}     # symbol -> (timestamp, rate)
    
    _live_prefetch_lock = threading.Lock()
    _historical_prefetch_lock = threading.Lock()
    _symbol_fetch_locks = {}
    _fetch_locks_lock = threading.Lock()
    
    STOCK_CACHE_TTL = 60  # 1 minute
    FX_CACHE_TTL = 600     # 10 minutes
    HISTORICAL_CACHE_TTL = 3600  # 1 hour
    EVENTS_CACHE_TTL = 43200     # 12 hours

    @staticmethod
    def is_market_open(timezone_str: str, exchange_str: str) -> bool:
        from zoneinfo import ZoneInfo
        from datetime import datetime
        try:
            if not timezone_str or timezone_str == "Unknown":
                return False
            tz = ZoneInfo(timezone_str)
            now_tz = datetime.now(tz)
        except Exception:
            return False
            
        if now_tz.weekday() >= 5:
            return False
            
        hour = now_tz.hour
        minute = now_tz.minute
        time_float = hour + minute / 60.0
        
        if "WSE" in exchange_str or "WAR" in exchange_str or "Europe/Warsaw" in timezone_str:
            # GPW: 09:00 - 17:00
            return 9.0 <= time_float < 17.0
        elif "America/New_York" in timezone_str or exchange_str in ["NMS", "NYQ", "ASE"]:
            # US: 09:30 - 16:00
            return 9.5 <= time_float < 16.0
        elif "CCY" in exchange_str or "forex" in exchange_str.lower():
            return True
        else:
            return 9.0 <= time_float < 17.5

    @classmethod
    def prefetch_live_prices(cls, symbols: list, fx_pairs: list):
        with cls._live_prefetch_lock:
            now = time.time()
            missing_symbols = []
            missing_fx = []
            
            for sym in symbols:
                sym = sym.upper().strip()
                cache_entry = cls._live_ticker_cache.get(sym)
                if not cache_entry or (now - cache_entry[0] > cls.STOCK_CACHE_TTL):
                    # Try loading from L2 SQLite Cache
                    sqlite_data = get_cached_live_price(sym, cls.STOCK_CACHE_TTL)
                    if sqlite_data:
                        cls._live_ticker_cache[sym] = (sqlite_data["last_updated"], {
                            "live_price": sqlite_data["live_price"],
                            "previous_close": sqlite_data["previous_close"],
                            "company_name": sqlite_data["company_name"],
                            "native_currency": sqlite_data["native_currency"]
                        })
                        cls._ticker_metadata_cache[sym] = {
                            "company_name": sqlite_data["company_name"],
                            "native_currency": sqlite_data["native_currency"].upper().strip(),
                            "asset_class": "Equity",
                            "timezone": sqlite_data["timezone"],
                            "exchange": sqlite_data["exchange"]
                        }
                    else:
                        missing_symbols.append(sym)
                    
            for pair in fx_pairs:
                pair = pair.upper().strip()
                cache_entry = cls._live_fx_cache.get(pair)
                if not cache_entry or (now - cache_entry[0] > cls.FX_CACHE_TTL):
                    # Try loading from L2 SQLite Cache
                    sqlite_data = get_cached_live_price(pair, cls.FX_CACHE_TTL)
                    if sqlite_data:
                        cls._live_fx_cache[pair] = (sqlite_data["last_updated"], sqlite_data["live_price"])
                    else:
                        missing_fx.append(pair)
                    
            if not missing_symbols and not missing_fx:
                return
                
            print(f"[DEBUG] Prefetching live prices for stocks {missing_symbols} and FX {missing_fx}")
            
            try:
                res = provider.download_bulk_live_prices(missing_symbols, missing_fx)
                for sym in missing_symbols:
                    stock_data = res["stocks"].get(sym, {"live_price": 0.0, "company_name": sym, "native_currency": "USD"})
                    cls._live_ticker_cache[sym] = (now, stock_data)
                    # Save to SQLite L2 Cache
                    save_cached_live_price(sym, {
                        "live_price": stock_data.get("live_price", 0.0),
                        "previous_close": stock_data.get("previous_close", 0.0),
                        "company_name": stock_data.get("company_name", sym),
                        "native_currency": stock_data.get("native_currency", "USD"),
                        "timezone": stock_data.get("timezone", "UTC"),
                        "exchange": stock_data.get("exchange", "")
                    })
                    
                for pair in missing_fx:
                    rate = res["fx"].get(pair, 1.0)
                    cls._live_fx_cache[pair] = (now, rate)
                    # Save to SQLite L2 Cache
                    save_cached_live_price(pair, {
                        "live_price": rate,
                        "previous_close": rate,
                        "company_name": pair,
                        "native_currency": "USD"
                    })
            except Exception as e:
                print(f"Error prefetching live prices: {e}")

    @classmethod
    def prefetch_historical_stock_prices(cls, symbols: list, start_dt: date, end_dt: date):
        with cls._historical_prefetch_lock:
            now = time.time()
            missing_symbols = []
            
            for sym in symbols:
                sym = sym.upper().strip()
                cache_entry = cls._historical_stock_cache.get(sym)
                if cache_entry and cache_entry["start_date"] <= start_dt and (now - cache_entry["last_updated"] <= cls.HISTORICAL_CACHE_TTL):
                    continue
                    
                # Try loading from L2 SQLite Cache
                sqlite_prices, sqlite_divs = get_cached_historical_prices(sym, start_dt, end_dt)
                if sqlite_prices and min(sqlite_prices.keys()) <= start_dt:
                    cls._historical_stock_cache[sym] = {
                        "start_date": min(sqlite_prices.keys()),
                        "end_date": max(sqlite_prices.keys()),
                        "last_updated": now,
                        "prices": sqlite_prices,
                        "dividends": sqlite_divs
                    }
                    continue
                    
                missing_symbols.append(sym)
                
            if not missing_symbols:
                return
                
            try:
                print(f"[DEBUG] Fetching historical stock prices in BULK from Yahoo Finance for {missing_symbols} (start={start_dt})")
                bulk_prices, bulk_divs = provider.download_historical_stock_bulk(missing_symbols, start_dt, end_dt)
                
                for sym in missing_symbols:
                    prices_dict = bulk_prices.get(sym, {})
                    dividends_dict = bulk_divs.get(sym, {})
                    
                    if prices_dict:
                        actual_start = min(prices_dict.keys())
                        actual_end = max(prices_dict.keys())
                        
                        cache_entry = cls._historical_stock_cache.get(sym)
                        if cache_entry:
                            merged_prices = {**cache_entry["prices"], **prices_dict}
                            merged_dividends = {**cache_entry.get("dividends", {}), **dividends_dict}
                            actual_start = min(merged_prices.keys())
                            actual_end = max(merged_prices.keys())
                            prices_dict = merged_prices
                            dividends_dict = merged_dividends
                            
                        cls._historical_stock_cache[sym] = {
                            "start_date": actual_start,
                            "end_date": actual_end,
                            "last_updated": now,
                            "prices": prices_dict,
                            "dividends": dividends_dict
                        }
                        # Save to SQLite L2 Cache
                        save_cached_historical_prices(sym, prices_dict, dividends_dict)
            except Exception as e:
                print(f"Error bulk prefetching historical stock prices: {e}")

    @classmethod
    def get_cached_live_ticker(cls, symbol: str) -> dict:
        symbol = symbol.upper().strip()
        now = time.time()
        
        meta = cls._ticker_metadata_cache.get(symbol)
        
        if symbol in cls._live_ticker_cache:
            ts, price_data = cls._live_ticker_cache[symbol]
            if now - ts < cls.STOCK_CACHE_TTL:
                if meta:
                    return {
                        "live_price": price_data.get("live_price", 0.0),
                        "previous_close": price_data.get("previous_close", 0.0),
                        "company_name": meta.get("company_name", symbol),
                        "native_currency": meta.get("native_currency", "USD"),
                        "asset_class": meta.get("asset_class", "Equity"),
                        "timezone": meta.get("timezone", "Unknown"),
                        "exchange": meta.get("exchange", "")
                    }
        
        # Check L2 SQLite Cache
        sqlite_data = get_cached_live_price(symbol, cls.STOCK_CACHE_TTL)
        
        # If the cached company name is equal to the symbol itself, bypass the cache
        # to trigger a fresh download and save the correct resolved name to the DB.
        if sqlite_data and sqlite_data.get("company_name", "").upper().strip() == symbol.upper().strip():
            sqlite_data = None
            
        if sqlite_data:
            # Populate metadata cache
            meta_data = {
                "company_name": sqlite_data["company_name"],
                "native_currency": sqlite_data["native_currency"].upper().strip(),
                "asset_class": "Equity",  # default
                "timezone": sqlite_data["timezone"],
                "exchange": sqlite_data["exchange"]
            }
            cls._ticker_metadata_cache[symbol] = meta_data
            price_data = {
                "live_price": sqlite_data["live_price"],
                "previous_close": sqlite_data["previous_close"]
            }
            cls._live_ticker_cache[symbol] = (sqlite_data["last_updated"], price_data)
            return {**price_data, **meta_data}
                    
        try:
            res = provider.download_live_ticker(symbol)
            live_price = res.get("live_price", 0.0)
            company_name = res.get("company_name", symbol)
            native_currency = res.get("native_currency", "USD")
            quote_type = res.get("quote_type")
            previous_close = res.get("previous_close", live_price)
            timezone = res.get("timezone", "Unknown")
            exchange = res.get("exchange", "")
        except Exception as e:
            print(f"Error fetching live data for {symbol}: {e}")
            fallback_data = None
            try:
                fallback_data = get_expired_cached_live_price(symbol)
            except Exception as db_err:
                print(f"Failed to fetch expired cache fallback for {symbol}: {db_err}")

            if fallback_data:
                live_price = fallback_data.get("live_price", 0.0)
                company_name = fallback_data.get("company_name", symbol)
                native_currency = fallback_data.get("native_currency", "USD")
                quote_type = fallback_data.get("asset_class", "Equity")
                previous_close = fallback_data.get("previous_close", live_price)
                timezone = fallback_data.get("timezone", "UTC")
                exchange = fallback_data.get("exchange", "")
            else:
                live_price = 0.0
                company_name = symbol
                native_currency = "USD"
                quote_type = None
                previous_close = 0.0
                timezone = "Unknown"
                exchange = ""
            
        # Determine asset class friendly name
        if symbol.startswith("CASH_"):
            asset_class = "Cash"
        else:
            if quote_type == "ETF":
                asset_class = "ETF"
            elif quote_type == "EQUITY":
                asset_class = "Equity"
            elif quote_type == "MUTUALFUND":
                asset_class = "Mutual Fund"
            elif quote_type == "CURRENCY":
                asset_class = "Currency"
            else:
                asset_class = "Equity"
                
        # Cache metadata permanently
        meta_data = {
            "company_name": company_name,
            "native_currency": native_currency.upper().strip(),
            "asset_class": asset_class,
            "timezone": timezone,
            "exchange": exchange
        }
        cls._ticker_metadata_cache[symbol] = meta_data
        
        price_data = {
            "live_price": float(live_price) if live_price else 0.0,
            "previous_close": float(previous_close) if previous_close else 0.0
        }
        cls._live_ticker_cache[symbol] = (now, price_data)
        
        # Save to SQLite Cache
        save_cached_live_price(symbol, {**price_data, **meta_data})
        
        return {**price_data, **meta_data}

    @classmethod
    def get_cached_live_fx(cls, pair: str) -> float:
        pair = pair.upper().strip()
        now = time.time()
        
        if pair in cls._live_fx_cache:
            ts, rate = cls._live_fx_cache[pair]
            if now - ts < cls.FX_CACHE_TTL:
                return rate
                
        # Check L2 SQLite Cache
        sqlite_data = get_cached_live_price(pair, cls.FX_CACHE_TTL)
        if sqlite_data:
            cached_rate = sqlite_data["live_price"]
            base_pair = pair.replace("=X", "")
            src_curr = base_pair[:3]
            dst_curr = base_pair[3:]
            if cached_rate == 1.0 and src_curr != dst_curr:
                # Cache contains invalid 1.0 rate, let's bypass cache to recalculate/re-download
                pass
            else:
                cls._live_fx_cache[pair] = (sqlite_data["last_updated"], cached_rate)
                return cached_rate
                
        rate = None
        try:
            rate = provider.download_live_fx(pair)
        except Exception as e:
            print(f"Error fetching FX rate for {pair}: {e}")
            
        if rate is None or rate == 1.0:
            base_pair = pair.replace("=X", "")
            rate = FALLBACK_RATES.get(base_pair, 1.0)
            
        cls._live_fx_cache[pair] = (now, float(rate))
        
        # Save to SQLite Cache
        save_cached_live_price(pair, {
            "live_price": float(rate),
            "previous_close": float(rate),
            "company_name": pair,
            "native_currency": "USD"
        })
        
        return float(rate)

    @classmethod
    def get_upcoming_events(cls, active_holdings: list) -> list:
        """
        Fetch upcoming earnings and ex-dividend dates concurrently for currently active holdings.
        Uses backend caching to avoid rate limit bans.
        """
        import requests
        import urllib3
        import ssl
        from datetime import date, datetime
        from concurrent.futures import ThreadPoolExecutor
        import yfinance as yf

        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        ssl._create_default_https_context = ssl._create_unverified_context

        # Setup standard requests session with verify=False and custom user agent
        session = requests.Session()
        session.verify = False
        session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        })

        now = time.time()
        today = date.today()

        def to_date_obj(val):
            if isinstance(val, date):
                return val
            if isinstance(val, datetime):
                return val.date()
            if isinstance(val, str):
                try:
                    return datetime.strptime(val.split("T")[0], "%Y-%m-%d").date()
                except Exception:
                    pass
            return None

        def fetch_ticker_events(symbol, shares_owned):
            symbol = symbol.upper().strip()
            # 1. Check L1 cache first
            cached_entry = cls._upcoming_events_cache.get(symbol)
            if cached_entry and (now - cached_entry[0] < cls.EVENTS_CACHE_TTL):
                # Recalculate est_payout because shares_owned might have changed
                updated_events = []
                for ev in cached_entry[1]:
                    if ev.get("date") is None:
                        continue
                    new_ev = dict(ev)
                    if new_ev["type"] == "Dividend":
                        div_val = new_ev.get("last_dividend_value", 0.0)
                        new_ev["est_payout"] = round(shares_owned * div_val, 2) if div_val > 0 else None
                    updated_events.append(new_ev)
                return updated_events

            # 2. Check L2 SQLite Cache
            sqlite_events = get_cached_upcoming_events(symbol, cls.EVENTS_CACHE_TTL)
            if sqlite_events is not None:
                cls._upcoming_events_cache[symbol] = (now, sqlite_events)
                updated_events = []
                for ev in sqlite_events:
                    if ev.get("date") is None:
                        continue
                    new_ev = dict(ev)
                    if new_ev["type"] == "Dividend":
                        div_val = new_ev.get("last_dividend_value", 0.0)
                        new_ev["est_payout"] = round(shares_owned * div_val, 2) if div_val > 0 else None
                    updated_events.append(new_ev)
                return updated_events

            events = []
            fetch_success = False
            try:
                ticker = yf.Ticker(symbol, session=session)
                cal = ticker.calendar
                info = ticker.info
                
                # Check if we got something meaningful back from ticker.info
                # If info is None or empty, yfinance call didn't get proper data
                if not info or not isinstance(info, dict) or ('symbol' not in info and 'shortName' not in info and 'longName' not in info):
                    raise Exception("Invalid or empty ticker info returned (likely rate-limited or API issue)")

                # Ex-dividend value
                last_div = info.get('lastDividendValue') or (info.get('dividendRate', 0) / 4.0 if info.get('dividendRate') else 0.0)
                last_div = float(last_div) if last_div else 0.0

                if cal and isinstance(cal, dict):
                    # Check Ex-Dividend Date
                    ex_div_date = cal.get('Dividend Date') or cal.get('Ex-Dividend Date')
                    ex_date_obj = to_date_obj(ex_div_date)
                    if ex_date_obj and ex_date_obj >= today:
                        curr = info.get('currency') or info.get('financialCurrency') or 'USD'
                        est_payout = shares_owned * last_div
                        events.append({
                            "date": ex_date_obj.isoformat(),
                            "symbol": symbol,
                            "type": "Dividend",
                            "description": f"Ex-Dividend: {last_div:.2f}/share" if last_div > 0 else "Ex-Dividend Date",
                            "est_payout": round(est_payout, 2) if est_payout > 0 else None,
                            "last_dividend_value": last_div,
                            "currency": curr.upper().strip()
                        })
                    
                    # Check Earnings Dates
                    earnings_dates = cal.get('Earnings Date')
                    if earnings_dates and isinstance(earnings_dates, list):
                        for ed in earnings_dates:
                            ed_obj = to_date_obj(ed)
                            if ed_obj and ed_obj >= today:
                                avg_eps = cal.get('Earnings Average')
                                events.append({
                                    "date": ed_obj.isoformat(),
                                    "symbol": symbol,
                                    "type": "Earnings",
                                    "description": f"Earnings Release (Est. EPS: {avg_eps:.2f})" if avg_eps else "Earnings Release"
                                })
                else:
                    # Fallback to info timestamps if calendar fails
                    ex_ts = info.get('exDividendDate')
                    if ex_ts:
                        try:
                            # exDividendDate is usually a Unix timestamp (seconds)
                            ex_dt = date.fromtimestamp(ex_ts)
                            if ex_dt >= today:
                                curr = info.get('currency') or info.get('financialCurrency') or 'USD'
                                est_payout = shares_owned * last_div
                                events.append({
                                    "date": ex_dt.isoformat(),
                                    "symbol": symbol,
                                    "type": "Dividend",
                                    "description": f"Ex-Dividend: {last_div:.2f}/share" if last_div > 0 else "Ex-Dividend Date",
                                    "est_payout": round(est_payout, 2) if est_payout > 0 else None,
                                    "last_dividend_value": last_div,
                                    "currency": curr.upper().strip()
                                })
                        except Exception:
                            pass
                
                # If we get to this point, the fetch was successful!
                fetch_success = True
                
            except Exception as ex:
                print(f"[UpcomingEvents] Error fetching for {symbol}: {ex}")
                # Fetch failed! Try to fall back to expired cache (ignore TTL)
                expired_sqlite_events = get_cached_upcoming_events(symbol, cls.EVENTS_CACHE_TTL, ignore_ttl=True)
                if expired_sqlite_events is not None:
                    # Update database timestamp so we don't spam requests to yfinance
                    update_upcoming_events_timestamp(symbol)
                    cls._upcoming_events_cache[symbol] = (now, expired_sqlite_events)
                    
                    # Recalculate payouts for return value
                    updated_events = []
                    for ev in expired_sqlite_events:
                        if ev.get("date") is None:
                            continue
                        new_ev = dict(ev)
                        if new_ev["type"] == "Dividend":
                            div_val = new_ev.get("last_dividend_value", 0.0)
                            new_ev["est_payout"] = round(shares_owned * div_val, 2) if div_val > 0 else None
                        updated_events.append(new_ev)
                    return updated_events

            if fetch_success:
                # Cache the parsed results to L1 and L2
                cls._upcoming_events_cache[symbol] = (now, events)
                save_cached_upcoming_events(symbol, events)
                return [ev for ev in events if ev.get("date") is not None]
            else:
                # If we got here, fetch failed and we have no cached data at all. Return empty list but do not write to DB.
                return []

        # Compile concurrently
        compiled_events = []
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = {executor.submit(fetch_ticker_events, h["symbol"], h["shares"]): h["symbol"] for h in active_holdings}
            for fut in futures:
                res = fut.result()
                compiled_events.extend(res)

        # Add historical dividend projections for any active holdings that do not have an upcoming dividend event
        for h in active_holdings:
            symbol = h["symbol"].upper().strip()
            shares = h["shares"]
            
            # Check if this symbol already has a Dividend event in compiled_events
            has_div_event = any(ev["symbol"] == symbol and ev["type"] == "Dividend" for ev in compiled_events)
            
            if not has_div_event:
                # Project ex-dividend date from history
                dividends_data = cls._historical_stock_cache.get(symbol, {}).get("dividends", {})
                if dividends_data:
                    payouts_recent = [(dt, float(val)) for dt, val in dividends_data.items() if today - timedelta(days=365) <= dt <= today]
                    if not payouts_recent:
                        payouts_recent = [(dt, float(val)) for dt, val in dividends_data.items() if today - timedelta(days=730) <= dt <= today]
                    
                    for hist_ex_date, hist_payout in payouts_recent:
                        projected_yr = today.year
                        if hist_ex_date.month < today.month or (hist_ex_date.month == today.month and hist_ex_date.day < today.day):
                            projected_yr = today.year + 1
                        
                        try:
                            proj_date = date(projected_yr, hist_ex_date.month, hist_ex_date.day)
                        except ValueError:
                            proj_date = date(projected_yr, hist_ex_date.month, 28)
                            
                        # If it falls within the next 90 days
                        if today <= proj_date <= today + timedelta(days=90):
                            # Ensure we don't duplicate
                            exists = any(ev["symbol"] == symbol and ev["type"] == "Dividend" and ev["date"] == proj_date.isoformat() for ev in compiled_events)
                            if not exists:
                                # Get currency from cache info or default
                                cached_info = cls.get_cached_live_ticker(symbol)
                                curr = cached_info.get("native_currency") or "USD"
                                est_payout = shares * float(hist_payout)
                                compiled_events.append({
                                    "date": proj_date.isoformat(),
                                    "symbol": symbol,
                                    "type": "Dividend",
                                    "description": f"Projected Ex-Dividend: {hist_payout:.2f}/share (Est.)",
                                    "est_payout": round(est_payout, 2) if est_payout > 0 else None,
                                    "last_dividend_value": float(hist_payout),
                                    "currency": curr.upper().strip()
                                })

        # Filter duplicates and sort
        unique_events = []
        seen = set()
        for ev in compiled_events:
            ev_key = (ev["date"], ev["symbol"], ev["type"])
            if ev_key not in seen:
                seen.add(ev_key)
                unique_events.append(ev)

        unique_events.sort(key=lambda x: x["date"])
        return unique_events

    @classmethod
    def get_merged_dividends(cls, sorted_txs: list, symbol_txs: dict, ticker_info: dict, base_currency: str, fx_rates: dict, portfolio_settings: dict) -> list:
        # Resolve tax rates per account
        account_tax_rates = portfolio_settings.get("accountTaxRates", {}) if portfolio_settings else {}
        
        def get_tax_rate(acc):
            if not acc:
                acc = "Default"
            rate = account_tax_rates.get(acc)
            if rate is not None:
                return float(rate)
            for k, v in account_tax_rates.items():
                if k.lower() == acc.lower():
                    return float(v)
            if "ike" in acc.lower() or "ikze" in acc.lower():
                return 0.0
            return 0.19

        from datetime import datetime
        auto_list = []
        
        # 1. Compute automatic virtual dividends
        for symbol, txs in symbol_txs.items():
            dividends_data = cls._historical_stock_cache.get(symbol, {}).get("dividends", {})
            native_curr = ticker_info[symbol]["native_currency"]
            accounts = set(tx.get("account", "Default") or "Default" for tx in txs)
            
            for acc in accounts:
                for ex_date, payout in sorted(dividends_data.items()):
                    ex_date_str = ex_date.strftime("%Y-%m-%d")
                    
                    # Calculate shares owned on ex_date in this account
                    shares_on_ex_date = 0.0
                    for tx in txs:
                        tx_acc = tx.get("account", "Default") or "Default"
                        if tx_acc != acc:
                            continue
                        tx_date_str = tx.get("date", "")
                        if not tx_date_str:
                            continue
                        try:
                            tx_date = datetime.strptime(tx_date_str, "%Y-%m-%d").date()
                            if tx_date < ex_date:
                                if tx["type"] == "BUY":
                                    shares_on_ex_date += tx["shares"]
                                elif tx["type"] == "SELL":
                                    shares_on_ex_date -= tx["shares"]
                        except:
                            pass
                            
                    if shares_on_ex_date > 0.0001:
                        tax_rate = get_tax_rate(acc)
                        gross_payout_native = shares_on_ex_date * payout
                        net_payout_native = gross_payout_native * (1.0 - tax_rate)
                        
                        # Resolve FX rate on ex-dividend date
                        if native_curr == base_currency:
                            fx_rate_ex = 1.0
                        else:
                            fx_ex_dict = cls.get_cached_historical_fx(f"{native_curr}{base_currency}=X", ex_date, ex_date)
                            fx_rate_ex = fx_ex_dict.get(ex_date) if fx_ex_dict else None
                            if fx_rate_ex is None:
                                fx_rate_ex = fx_rates.get(native_curr, 1.0)
                                
                        gross_base = gross_payout_native * fx_rate_ex
                        net_base = net_payout_native * fx_rate_ex
                        net_native = net_payout_native
                        
                        auto_list.append({
                            "symbol": symbol,
                            "date": ex_date_str,
                            "account": acc,
                            "shares": round(shares_on_ex_date, 4),
                            "payout_per_share": float(payout),
                            "gross_base": round(gross_base, 2),
                            "net_base": round(net_base, 2),
                            "net_native": round(net_native, 2),
                            "is_override": False,
                            "is_manual": False
                        })

        # 1.1 Project future/upcoming dividends for the remainder of the current calendar year
        today = date.today()
        for symbol, txs in symbol_txs.items():
            dividends_data = cls._historical_stock_cache.get(symbol, {}).get("dividends", {})
            native_curr = ticker_info[symbol]["native_currency"]
            accounts = set(tx.get("account", "Default") or "Default" for tx in txs)
            
            for acc in accounts:
                # Calculate current shares owned in this account up to today
                current_shares = 0.0
                for tx in txs:
                    tx_acc = tx.get("account", "Default") or "Default"
                    if tx_acc != acc:
                        continue
                    # Parse transaction date
                    tx_date_str = tx.get("date", "")
                    if tx_date_str:
                        try:
                            tx_dt = datetime.strptime(tx_date_str, "%Y-%m-%d").date()
                            if tx_dt > today:
                                continue # Skip future transactions for current balance
                        except:
                            pass
                    if tx["type"] == "BUY":
                        current_shares += tx["shares"]
                    elif tx["type"] == "SELL":
                        current_shares -= tx["shares"]
                        
                if current_shares > 0.0001:
                    # Find payouts in the last 2 years to deduce regular payout months
                    payouts_recent = []
                    if dividends_data:
                        payouts_recent = [(dt, float(val)) for dt, val in dividends_data.items() if today - timedelta(days=365) <= dt <= today]
                        if not payouts_recent:
                            payouts_recent = [(dt, float(val)) for dt, val in dividends_data.items() if today - timedelta(days=730) <= dt <= today]
                    
                    for hist_ex_date, hist_payout in payouts_recent:
                        # Only project for future dates in the current calendar year
                        if hist_ex_date.month > today.month or (hist_ex_date.month == today.month and hist_ex_date.day >= today.day):
                            try:
                                proj_date = date(today.year, hist_ex_date.month, hist_ex_date.day)
                            except ValueError:
                                proj_date = date(today.year, hist_ex_date.month, 28)
                            
                            proj_date_str = proj_date.strftime("%Y-%m-%d")
                            
                            # Avoid double-counting: check if this symbol, acc, month already has a dividend in auto_list
                            already_exists = False
                            for ad in auto_list:
                                if ad["symbol"] == symbol and ad["account"] == acc:
                                    try:
                                        ad_dt = datetime.strptime(ad["date"], "%Y-%m-%d").date()
                                        if ad_dt.year == today.year and ad_dt.month == proj_date.month:
                                            already_exists = True
                                            break
                                    except:
                                        pass
                                        
                            if not already_exists:
                                tax_rate = get_tax_rate(acc)
                                gross_payout_native = current_shares * hist_payout
                                net_payout_native = gross_payout_native * (1.0 - tax_rate)
                                
                                if native_curr == base_currency:
                                    fx_rate_ex = 1.0
                                else:
                                    fx_rate_ex = fx_rates.get(native_curr, 1.0)
                                    
                                gross_base = gross_payout_native * fx_rate_ex
                                net_base = net_payout_native * fx_rate_ex
                                net_native = net_payout_native
                                
                                auto_list.append({
                                    "symbol": symbol,
                                    "date": proj_date_str,
                                    "account": acc,
                                    "shares": round(current_shares, 4),
                                    "payout_per_share": float(hist_payout),
                                    "gross_base": round(gross_base, 2),
                                    "net_base": round(net_base, 2),
                                    "net_native": round(net_native, 2),
                                    "is_override": False,
                                    "is_manual": False,
                                    "is_upcoming": True
                                })

        # 2. Load custom overrides & manual dividends from settings
        overrides = portfolio_settings.get("dividends", []) if portfolio_settings else []
        
        # Build maps for overrides
        override_map = {} # (symbol, date, account) -> override_item
        manual_divs = []
        
        for od in overrides:
            sym = od.get("symbol", "").upper().strip()
            dt_str = od.get("date", "")
            acc = od.get("account", "Default") or "Default"
            is_manual = od.get("is_manual", False)
            
            if is_manual:
                manual_divs.append(od)
            else:
                override_map[(sym, dt_str, acc)] = od
                
        # 3. Merge
        merged_list = []
        
        # Process automatic dividends
        for ad in auto_list:
            key = (ad["symbol"], ad["date"], ad["account"])
            if key in override_map:
                od = override_map[key]
                if od.get("is_deleted", False):
                    # Skip deleted ones
                    continue
                else:
                    # Apply override values
                    shares = od.get("shares", ad["shares"])
                    payout = od.get("payout_per_share", ad["payout_per_share"])
                    
                    # Recompute amounts
                    tax_rate = get_tax_rate(ad["account"])
                    
                    # Find FX rate for this date
                    try:
                        ex_date = datetime.strptime(ad["date"], "%Y-%m-%d").date()
                    except:
                        ex_date = date.today()
                        
                    native_curr = ticker_info[ad["symbol"]]["native_currency"] if ad["symbol"] in ticker_info else "USD"
                    
                    if native_curr == base_currency:
                        fx_rate_ex = 1.0
                    else:
                        fx_ex_dict = cls.get_cached_historical_fx(f"{native_curr}{base_currency}=X", ex_date, ex_date)
                        fx_rate_ex = fx_ex_dict.get(ex_date) if fx_ex_dict else None
                        if fx_rate_ex is None:
                            fx_rate_ex = fx_rates.get(native_curr, 1.0)
                            
                    gross_native = shares * payout
                    net_native = gross_native * (1.0 - tax_rate)
                    
                    gross_base = gross_native * fx_rate_ex
                    net_base = net_native * fx_rate_ex
                    
                    merged_list.append({
                        "id": od.get("id"),
                        "symbol": ad["symbol"],
                        "date": ad["date"],
                        "account": ad["account"],
                        "shares": round(shares, 4),
                        "payout_per_share": float(payout),
                        "gross_base": round(gross_base, 2),
                        "net_base": round(net_base, 2),
                        "net_native": round(net_native, 2),
                        "is_override": True,
                        "is_manual": False
                    })
            else:
                merged_list.append(ad)
                
        # Process manual dividends
        for md in manual_divs:
            if md.get("is_deleted", False):
                continue
                
            sym = md.get("symbol", "").upper().strip()
            dt_str = md.get("date", "")
            acc = md.get("account", "Default") or "Default"
            shares = md.get("shares", 0.0)
            payout = md.get("payout_per_share", 0.0)
            
            tax_rate = get_tax_rate(acc)
            try:
                dt = datetime.strptime(dt_str, "%Y-%m-%d").date()
            except:
                dt = date.today()
                
            native_curr = ticker_info[sym]["native_currency"] if sym in ticker_info else "USD"
            
            if native_curr == base_currency:
                fx_rate_ex = 1.0
            else:
                fx_ex_dict = cls.get_cached_historical_fx(f"{native_curr}{base_currency}=X", dt, dt)
                fx_rate_ex = fx_ex_dict.get(dt) if fx_ex_dict else None
                if fx_rate_ex is None:
                    fx_rate_ex = fx_rates.get(native_curr, 1.0)
                    
            gross_native = shares * payout
            net_native = gross_native * (1.0 - tax_rate)
            
            gross_base = gross_native * fx_rate_ex
            net_base = net_native * fx_rate_ex
            
            merged_list.append({
                "id": md.get("id"),
                "symbol": sym,
                "date": dt_str,
                "account": acc,
                "shares": round(shares, 4),
                "payout_per_share": float(payout),
                "gross_base": round(gross_base, 2),
                "net_base": round(net_base, 2),
                "net_native": round(net_native, 2),
                "is_override": False,
                "is_manual": True
            })
            
        # Sort final list by date descending
        merged_list.sort(key=lambda x: x["date"], reverse=True)
        return merged_list

    @classmethod
    def get_cached_historical_stock(cls, symbol: str, start_dt: date, end_dt: date) -> dict:
        symbol = symbol.upper().strip()
        now = time.time()
        
        cache_entry = cls._historical_stock_cache.get(symbol)
        
        if cache_entry and cache_entry["start_date"] <= start_dt:
            if end_dt in cache_entry["prices"] or (now - cache_entry["last_updated"] < cls.HISTORICAL_CACHE_TTL):
                sliced_prices = {d: val for d, val in cache_entry["prices"].items() if start_dt <= d <= end_dt}
                if sliced_prices:
                    return sliced_prices
                    
        fetch_start = start_dt
        if cache_entry and cache_entry["start_date"] < fetch_start:
            fetch_start = cache_entry["start_date"]
            
        prices_dict = {}
        dividends_dict = {}
        try:
            prices_dict, dividends_dict = provider.download_historical_stock(symbol, fetch_start, end_dt)
        except Exception as e:
            print(f"Error downloading historical stock prices for {symbol}: {e}")
            
        if not prices_dict and cache_entry:
            prices_dict = cache_entry["prices"]
            dividends_dict = cache_entry.get("dividends", {})
            fetch_start = cache_entry["start_date"]
            
        if prices_dict:
            actual_start = min(prices_dict.keys())
            actual_end = max(prices_dict.keys())
            
            if cache_entry:
                merged_prices = {**cache_entry["prices"], **prices_dict}
                merged_dividends = {**cache_entry.get("dividends", {}), **dividends_dict}
                actual_start = min(merged_prices.keys())
                actual_end = max(merged_prices.keys())
                prices_dict = merged_prices
                dividends_dict = merged_dividends
                
            cls._historical_stock_cache[symbol] = {
                "start_date": actual_start,
                "end_date": actual_end,
                "last_updated": now,
                "prices": prices_dict,
                "dividends": dividends_dict
            }
            
        return {d: val for d, val in prices_dict.items() if start_dt <= d <= end_dt}

    @classmethod
    def get_cached_historical_fx(cls, pair: str, start_dt: date, end_dt: date) -> dict:
        pair = pair.upper().strip()
        now = time.time()
        
        cache_entry = cls._historical_fx_cache.get(pair)
        
        # Check if we need to download/update cache
        need_download = True
        if cache_entry and cache_entry["start_date"] <= start_dt:
            if end_dt in cache_entry["prices"] or (now - cache_entry["last_updated"] < cls.HISTORICAL_CACHE_TTL):
                need_download = False
                
        if need_download:
            fetch_start = start_dt
            if cache_entry and cache_entry["start_date"] < fetch_start:
                fetch_start = cache_entry["start_date"]
                
            prices_dict = {}
            try:
                prices_dict = provider.download_historical_fx(pair, fetch_start, end_dt)
            except Exception as e:
                print(f"Error downloading historical FX for {pair}: {e}")
                
            if not prices_dict and cache_entry:
                prices_dict = cache_entry["prices"]
                fetch_start = cache_entry["start_date"]
                
            fallback = FALLBACK_RATES.get(pair.replace("=X", ""), 1.0)
            
            if prices_dict or cache_entry:
                actual_prices = prices_dict if prices_dict else cache_entry["prices"]
                actual_start = min(actual_prices.keys()) if actual_prices else fetch_start
                actual_end = max(actual_prices.keys()) if actual_prices else date.today()
                
                if cache_entry:
                    merged_prices = {**cache_entry["prices"], **actual_prices}
                    actual_start = min(merged_prices.keys())
                    actual_end = max(merged_prices.keys())
                    actual_prices = merged_prices
                    
                cls._historical_fx_cache[pair] = {
                    "start_date": actual_start,
                    "end_date": actual_end,
                    "last_updated": now,
                    "prices": actual_prices
                }
                
        res = {}
        delta = end_dt - start_dt
        cached_prices = cls._historical_fx_cache.get(pair, {}).get("prices", {})
        fallback = FALLBACK_RATES.get(pair.replace("=X", ""), 1.0)
        
        last_known_val = None
        for i in range(delta.days + 1):
            d = start_dt + timedelta(days=i)
            val = cached_prices.get(d)
            if val is not None:
                last_known_val = val
                res[d] = val
            else:
                if last_known_val is not None:
                    res[d] = last_known_val
                else:
                    bfill_val = None
                    future_dates = sorted([k for k in cached_prices.keys() if k > d])
                    if future_dates:
                        bfill_val = cached_prices[future_dates[0]]
                    res[d] = bfill_val if bfill_val is not None else fallback
                    
        return res

    @staticmethod
    def _load_data() -> dict:
        if not os.path.exists(PORTFOLIO_FILE):
            return {"transactions": []}
        try:
            with open(PORTFOLIO_FILE, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading portfolio data: {e}")
            return {"transactions": []}

    @staticmethod
    def _save_data(data: dict):
        try:
            with open(PORTFOLIO_FILE, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Error saving portfolio data: {e}")

    @classmethod
    def get_transactions(cls) -> list:
        data = cls._load_data()
        # Sort transactions by date descending for ledger view
        return sorted(data.get("transactions", []), key=lambda x: x.get("date", ""), reverse=True)

    @classmethod
    def add_transaction(cls, symbol: str, tx_type: str, date: str, shares: float, price: float, currency: str, fees: float, account: str = "Default") -> dict:
        # Validate inputs
        symbol = symbol.upper().strip()
        tx_type = tx_type.upper().strip()
        currency = currency.upper().strip()
        
        if tx_type not in ["BUY", "SELL"]:
            raise ValueError("Transaction type must be BUY or SELL")
        if shares <= 0:
            raise ValueError("Shares must be greater than zero")
        if price < 0:
            raise ValueError("Price cannot be negative")
        if fees < 0:
            raise ValueError("Fees cannot be negative")

        data = cls._load_data()
        
        tx = {
            "id": f"tx_{int(time.time() * 1000)}",
            "symbol": symbol,
            "type": tx_type,
            "date": date,
            "shares": shares,
            "price": price,
            "currency": currency,
            "fees": fees,
            "account": account.strip() or "Default"
        }
        
        data.setdefault("transactions", []).append(tx)
        cls._save_data(data)
        return tx

    @classmethod
    def delete_transaction(cls, tx_id: str) -> bool:
        data = cls._load_data()
        txs = data.get("transactions", [])
        new_txs = [tx for tx in txs if tx.get("id") != tx_id]
        
        if len(txs) == len(new_txs):
            return False  # not found
            
        data["transactions"] = new_txs
        cls._save_data(data)
        return True

    @classmethod
    def get_holdings(cls, base_currency: str = "PLN", account: str = "All", link_cash: bool = False) -> dict:
        return cls.calculate_holdings(cls.get_transactions(), base_currency, account, link_cash)

    @classmethod
    def calculate_holdings(cls, transactions: list, base_currency: str = "PLN", account: str = "All", link_cash: bool = False, portfolio_settings: dict = None) -> dict:
        base_currency = base_currency.upper().strip()
        
        if account and account.lower() != "all":
            transactions = [tx for tx in transactions if tx.get("account", "Default").lower() == account.lower()]
            
        accounts = set(tx.get("account", "Default") or "Default" for tx in transactions)
        if not accounts:
            accounts = {account if (account and account.lower() != "all") else "Default"}
            
        sorted_txs = sorted(transactions, key=lambda x: x.get("date", ""))
        
        # Group stock transactions by ticker (exclude CASH_ tickers from symbol_txs)
        symbol_txs = {}
        for tx in sorted_txs:
            sym = tx["symbol"].upper().strip()
            if not sym.startswith("CASH_"):
                symbol_txs.setdefault(sym, []).append(tx)
                
        # Prefetch live prices and FX rates in bulk
        symbols_to_prefetch = list(symbol_txs.keys())
        fx_pairs_to_prefetch = []
        unique_currencies_to_check = {base_currency}
        for tx in transactions:
            unique_currencies_to_check.add(tx["currency"].upper().strip())
        for curr in unique_currencies_to_check:
            if curr != base_currency:
                fx_pairs_to_prefetch.append(f"{curr}{base_currency}=X")
        
        cls.prefetch_live_prices(symbols_to_prefetch, fx_pairs_to_prefetch)
        
        # Gather live ticker info for stocks (cached)
        ticker_info = {}
        for symbol in symbol_txs.keys():
            info = cls.get_cached_live_ticker(symbol)
            native_currency = info["native_currency"]
            
            # If the user's transaction currency is different from the cached currency,
            # and it is not PLN (PLN is rarely the native currency of a foreign listing),
            # we query Yahoo Finance single ticker info to resolve the mismatch.
            first_tx = symbol_txs[symbol][0]
            tx_curr = first_tx.get("currency", "USD").upper().strip()
            if native_currency and tx_curr != native_currency and tx_curr not in ["PLN"]:
                try:
                    real_info = provider.download_live_ticker(symbol)
                    if real_info.get("native_currency"):
                        native_currency = real_info["native_currency"].upper().strip()
                        info["native_currency"] = native_currency
                        save_cached_live_price(symbol, {
                            "live_price": info.get("live_price", 0.0),
                            "previous_close": info.get("previous_close", 0.0),
                            "company_name": info.get("company_name", symbol),
                            "native_currency": native_currency,
                            "timezone": info.get("timezone", "UTC"),
                            "exchange": info.get("exchange", "")
                        })
                except Exception as ex:
                    print(f"Error resolving currency mismatch for {symbol}: {ex}")

            # Fall back to transaction currency only if the ticker download failed (live_price == 0.0),
            # if the cached currency is USD but the stock has a non-US suffix, or if no native currency is set.
            suffix = symbol.split(".")[-1] if "." in symbol else ""
            is_non_us_ticker = suffix in {
                "DE", "WA", "PA", "BR", "MI", "MC", "LS", "AT", "VI",
                "TO", "V", "AX", "HK", "SA", "MX", "KS", "KQ", "T", "NS", "BO",
                "SG", "ST", "CO", "EE", "HE", "OL", "IC"
            }
            if not native_currency or (info.get("live_price", 0.0) == 0.0 and symbol not in ["USD", "PLN", "EUR"]) or (native_currency == "USD" and is_non_us_ticker):
                native_currency = first_tx.get("currency", "USD")
                
            ticker_info[symbol] = {
                "live_price": info["live_price"],
                "company_name": info["company_name"],
                "native_currency": native_currency.upper().strip(),
                "asset_class": info.get("asset_class", "Equity"),
                "previous_close": info.get("previous_close", 0.0),
                "timezone": info.get("timezone", "UTC"),
                "exchange": info.get("exchange", "")
            }
            
        # Collect unique currencies for FX
        unique_currencies = {base_currency}
        for tx in transactions:
            unique_currencies.add(tx["currency"].upper().strip())
        for info in ticker_info.values():
            unique_currencies.add(info["native_currency"])
            
        # Fetch live exchange rates (cached)
        fx_rates = {base_currency: 1.0}
        for curr in unique_currencies:
            if curr == base_currency:
                continue
            pair = f"{curr}{base_currency}=X"
            fx_rates[curr] = cls.get_cached_live_fx(pair)
            
        # Calculate ex-dividend payouts and cache them
        earliest_date = date.today() - timedelta(days=365)
        for tx in sorted_txs:
            tx_date_str = tx.get("date", "")
            if tx_date_str:
                try:
                    tx_dt = datetime.strptime(tx_date_str, "%Y-%m-%d").date()
                    if tx_dt < earliest_date:
                        earliest_date = tx_dt
                except:
                    pass
                    
        if symbols_to_prefetch:
            cls.prefetch_historical_stock_prices(symbols_to_prefetch, earliest_date, date.today())
            
        # Get portfolio settings tax rates
        account_tax_rates = portfolio_settings.get("accountTaxRates", {}) if portfolio_settings else {}
        
        def get_tax_rate(acc):
            if not acc:
                acc = "Default"
            rate = account_tax_rates.get(acc)
            if rate is not None:
                return float(rate)
            # Try case-insensitive
            for k, v in account_tax_rates.items():
                if k.lower() == acc.lower():
                    return float(v)
            if "ike" in acc.lower() or "ikze" in acc.lower():
                return 0.0
            return 0.19

        # Force fetch cache for symbols first
        for symbol in symbol_txs.keys():
            cls.get_cached_historical_stock(symbol, earliest_date, date.today())
            
        merged_divs = cls.get_merged_dividends(sorted_txs, symbol_txs, ticker_info, base_currency, fx_rates, portfolio_settings)
        
        dividends_by_symbol_acc = {}
        for d in merged_divs:
            sym = d["symbol"]
            acc = d["account"]
            dividends_by_symbol_acc.setdefault((sym, acc), {"gross_base": 0.0, "net_base": 0.0, "net_native": 0.0})
            dividends_by_symbol_acc[(sym, acc)]["gross_base"] += d["gross_base"]
            dividends_by_symbol_acc[(sym, acc)]["net_base"] += d["net_base"]
            dividends_by_symbol_acc[(sym, acc)]["net_native"] += d["net_native"]
                
        # Calculate cash balances per account and currency
        cash_balances = {}
        for tx in sorted_txs:
            tx_account = tx.get("account", "Default") or "Default"
            tx_curr = tx.get("currency", "USD").upper().strip()
            symbol = tx.get("symbol", "").upper().strip()
            tx_type = tx.get("type", "BUY")
            shares = tx.get("shares", 0.0)
            price = tx.get("price", 0.0)
            fees = tx.get("fees", 0.0)
            
            cash_balances.setdefault(tx_account, {}).setdefault(tx_curr, 0.0)
            
            if symbol.startswith("CASH_"):
                cash_currency = symbol.split("_")[1] if "_" in symbol else tx_curr
                cash_balances.setdefault(tx_account, {}).setdefault(cash_currency, 0.0)
                amount = shares * price
                if tx_type == "BUY":
                    cash_balances[tx_account][cash_currency] += amount
                elif tx_type == "SELL":
                    cash_balances[tx_account][cash_currency] -= amount
            else:
                if link_cash:
                    amount = shares * price
                    if tx_type == "BUY":
                        cash_balances[tx_account][tx_curr] -= (amount + fees)
                    elif tx_type == "SELL":
                        cash_balances[tx_account][tx_curr] += (amount - fees)
                        
        # Add net dividends to cash balances
        if link_cash:
            for (symbol, acc), div_data in dividends_by_symbol_acc.items():
                if div_data["net_native"] > 0.0:
                    native_curr = ticker_info[symbol]["native_currency"]
                    cash_balances.setdefault(acc, {}).setdefault(native_curr, 0.0)
                    cash_balances[acc][native_curr] += div_data["net_native"]
                    
        # Apply zero floor rule per account and currency
        for acc in cash_balances:
            for curr in cash_balances[acc]:
                if cash_balances[acc][curr] < 0.0:
                    cash_balances[acc][curr] = 0.0
                    
        # Sum cash balances across accounts
        final_cash = {}
        for acc in cash_balances:
            for curr in cash_balances[acc]:
                final_cash[curr] = final_cash.get(curr, 0.0) + cash_balances[acc][curr]
                
        for curr in final_cash.keys():
            unique_currencies.add(curr)
            
        # Re-fetch exchange rates to ensure all cash currencies are covered
        for curr in unique_currencies:
            if curr not in fx_rates:
                pair = f"{curr}{base_currency}=X"
                fx_rates[curr] = cls.get_cached_live_fx(pair)
                
        holdings_list = []
        total_cost_base = 0.0
        total_value_base = 0.0
        total_dividends_base = 0.0
        total_dividends_net_base = 0.0
        
        # Get portfolio settings cost basis method
        cost_basis_method = "average_cost"
        if portfolio_settings and isinstance(portfolio_settings, dict):
            cost_basis_method = portfolio_settings.get("cost_basis_method") or portfolio_settings.get("costBasisMethod") or "average_cost"

        # Calculate stock holdings
        for symbol, txs in symbol_txs.items():
            shares_owned = 0.0
            cost_basis_base = 0.0
            
            if cost_basis_method == "fifo":
                buy_lots = []
                for tx in txs:
                    tx_shares = tx["shares"]
                    tx_price = tx["price"]
                    tx_fees = tx["fees"]
                    tx_curr = tx["currency"].upper().strip()
                    fx_tx_to_base = fx_rates.get(tx_curr, 1.0)
                    
                    tx_cost_base = (tx_shares * tx_price + tx_fees) * fx_tx_to_base
                    
                    if tx["type"] == "BUY":
                        buy_lots.append({"shares": tx_shares, "cost_base": tx_cost_base})
                    elif tx["type"] == "SELL":
                        sell_shares = tx_shares
                        while sell_shares > 1e-9 and buy_lots:
                            lot = buy_lots[0]
                            if lot["shares"] <= sell_shares + 1e-9:
                                sell_shares -= lot["shares"]
                                buy_lots.pop(0)
                            else:
                                ratio = (lot["shares"] - sell_shares) / lot["shares"]
                                lot["shares"] -= sell_shares
                                lot["cost_base"] *= ratio
                                sell_shares = 0.0
                shares_owned = sum(lot["shares"] for lot in buy_lots)
                cost_basis_base = sum(lot["cost_base"] for lot in buy_lots)
                if shares_owned < 1e-9:
                    shares_owned = 0.0
                    cost_basis_base = 0.0
            else:
                for tx in txs:
                    tx_shares = tx["shares"]
                    tx_price = tx["price"]
                    tx_fees = tx["fees"]
                    tx_curr = tx["currency"].upper().strip()
                    fx_tx_to_base = fx_rates.get(tx_curr, 1.0)
                    
                    tx_cost_base = (tx_shares * tx_price + tx_fees) * fx_tx_to_base
                    
                    if tx["type"] == "BUY":
                        cost_basis_base += tx_cost_base
                        shares_owned += tx_shares
                    elif tx["type"] == "SELL":
                        if shares_owned > 0:
                            cost_basis_base = cost_basis_base * max(0.0, (shares_owned - tx_shares)) / shares_owned
                        shares_owned = max(0.0, shares_owned - tx_shares)
                        if shares_owned == 0.0:
                            cost_basis_base = 0.0
                        
            if shares_owned > 0.0:
                info = ticker_info[symbol]
                live_price_native = info["live_price"]
                native_curr = info["native_currency"]
                fx_native_to_base = fx_rates.get(native_curr, 1.0)
                
                avg_cost_native = (cost_basis_base / shares_owned) / fx_native_to_base if fx_native_to_base > 0 else 0.0
                
                if live_price_native == 0.0:
                    live_price_native = avg_cost_native
                    
                current_value_base = shares_owned * live_price_native * fx_native_to_base
                
                # Day change calculations
                prev_close_native = info.get("previous_close", live_price_native)
                if prev_close_native == 0.0 or prev_close_native is None:
                    prev_close_native = live_price_native
                
                day_change_native = live_price_native - prev_close_native
                day_change_percent = (day_change_native / prev_close_native * 100) if prev_close_native > 0.0 else 0.0
                day_change_value_base = shares_owned * day_change_native * fx_native_to_base
                
                is_live = cls.is_market_open(info.get("timezone", "UTC"), info.get("exchange", ""))
                
                # Retrieve accumulated dividends for this stock
                div_gross = sum(dividends_by_symbol_acc.get((symbol, acc), {}).get("gross_base", 0.0) for acc in accounts)
                div_net = sum(dividends_by_symbol_acc.get((symbol, acc), {}).get("net_base", 0.0) for acc in accounts)
                total_dividends_base += div_gross
                total_dividends_net_base += div_net
                
                # Gain base includes Net Dividends received
                gain_base = (current_value_base - cost_basis_base) + div_net
                gain_percent = (gain_base / cost_basis_base * 100) if cost_basis_base > 0 else 0.0
                
                # Get last 15 daily historical prices for sparkline
                sparkline_prices = []
                try:
                    hist_prices = cls.get_cached_historical_stock(symbol, date.today() - timedelta(days=45), date.today())
                    if hist_prices:
                        sorted_dates = sorted(hist_prices.keys())
                        sparkline_prices = [round(float(hist_prices[d]), 2) for d in sorted_dates[-15:]]
                except Exception as ex:
                    print(f"Error fetching sparkline for {symbol}: {ex}")
                
                holdings_list.append({
                    "symbol": symbol,
                    "name": info["company_name"],
                    "shares": round(shares_owned, 4),
                    "avg_cost_local": round(avg_cost_native, 2),
                    "current_price_local": round(live_price_native, 2),
                    "currency": native_curr,
                    "fx_rate": fx_native_to_base,
                    "cost_basis_base": round(cost_basis_base, 2),
                    "current_value_base": round(current_value_base, 2),
                    "gain_base": round(gain_base, 2),
                    "gain_percent": round(gain_percent, 2),
                    "dividends_base": round(div_gross, 2),
                    "dividends_net_base": round(div_net, 2),
                    "day_change_percent": round(day_change_percent, 2),
                    "day_change_value_base": round(day_change_value_base, 2),
                    "is_live": is_live,
                    "asset_class": info.get("asset_class", "Equity"),
                    "sparkline_prices": sparkline_prices
                })
                
                total_cost_base += cost_basis_base
                total_value_base += current_value_base
                
        # Append Cash holdings
        currency_names = {
            "USD": "US Dollar (Cash)",
            "EUR": "Euro (Cash)",
            "PLN": "Polish Zloty (Cash)",
            "GBP": "British Pound (Cash)",
            "CHF": "Swiss Franc (Cash)"
        }
        for curr, balance in sorted(final_cash.items()):
            if balance > 0.001:
                fx_rate = fx_rates.get(curr, 1.0)
                val_base = balance * fx_rate
                name = currency_names.get(curr, f"{curr} (Cash)")
                
                holdings_list.append({
                    "symbol": f"CASH_{curr}",
                    "name": name,
                    "shares": round(balance, 2),
                    "avg_cost_local": 1.0,
                    "current_price_local": 1.0,
                    "currency": curr,
                    "fx_rate": fx_rate,
                    "cost_basis_base": round(val_base, 2),
                    "current_value_base": round(val_base, 2),
                    "gain_base": 0.0,
                    "gain_percent": 0.0,
                    "dividends_base": 0.0,
                    "dividends_net_base": 0.0,
                    "day_change_percent": 0.0,
                    "day_change_value_base": 0.0,
                    "is_live": False,
                    "asset_class": "Cash"
                })
                
                total_cost_base += val_base
                total_value_base += val_base
                
        if not holdings_list:
            return {
                "summary": {
                    "total_cost_base": 0.0,
                    "total_value_base": 0.0,
                    "total_gain_base": 0.0,
                    "total_gain_percent": 0.0,
                    "total_dividends_base": 0.0,
                    "total_dividends_net_base": 0.0,
                    "total_day_change_base": 0.0,
                    "total_day_change_percent": 0.0,
                    "base_currency": base_currency
                },
                "holdings": [],
                "dividends_list": merged_divs
            }
            
        total_gain_base = (total_value_base - total_cost_base)
        total_gain_percent = (total_gain_base / total_cost_base * 100) if total_cost_base > 0 else 0.0
        
        # Calculate daily change totals
        total_day_change_base = sum(h.get("day_change_value_base", 0.0) for h in holdings_list)
        prev_day_value = total_value_base - total_day_change_base
        total_day_change_percent = (total_day_change_base / prev_day_value * 100) if prev_day_value > 0.0 else 0.0
        
        return {
            "summary": {
                "total_cost_base": round(total_cost_base, 2),
                "total_value_base": round(total_value_base, 2),
                "total_gain_base": round(total_gain_base, 2),
                "total_gain_percent": round(total_gain_percent, 2),
                "total_dividends_base": round(total_dividends_base, 2),
                "total_dividends_net_base": round(total_dividends_net_base, 2),
                "total_day_change_base": round(total_day_change_base, 2),
                "total_day_change_percent": round(total_day_change_percent, 2),
                "base_currency": base_currency
            },
            "holdings": holdings_list,
            "dividends_list": merged_divs
        }

    @classmethod
    def calculate_historical_performance(cls, transactions: list, base_currency: str = "PLN", account: str = "All", link_cash: bool = False, portfolio_settings: dict = None) -> dict:
        base_currency = base_currency.upper().strip()
        
        # 1. Filter transactions by account if not "All"
        if account and account.lower() != "all":
            transactions = [tx for tx in transactions if tx.get("account", "Default").lower() == account.lower()]
            
        if not transactions:
            return {"dates": [], "nav": [], "cost_basis": []}
            
        # 2. Sort transactions chronologically
        sorted_txs = sorted(transactions, key=lambda x: x.get("date", ""))
        first_date_str = sorted_txs[0]["date"]
        
        # Parse start and end dates
        try:
            start_dt = datetime.strptime(first_date_str, "%Y-%m-%d").date()
        except Exception:
            start_dt = date.today() - timedelta(days=30)
            
        end_dt = date.today()
        
        # If start date is in the future or today, set it to at least 7 days ago to show a chart
        if start_dt >= end_dt:
            start_dt = end_dt - timedelta(days=7)
            
        # 3. Create daily date range index
        delta = end_dt - start_dt
        dates_list = [start_dt + timedelta(days=i) for i in range(delta.days + 1)]
        
        # 4. Gather unique stock symbols (exclude CASH_ symbols)
        stock_symbols = list({tx["symbol"].upper().strip() for tx in sorted_txs if not tx["symbol"].upper().strip().startswith("CASH_")})
        
        # Prefetch historical prices in bulk to speed up loading
        cls.prefetch_historical_stock_prices(stock_symbols, start_dt, end_dt)

        # 5. Fetch daily close prices for all stocks (cached)
        stock_prices = {}
        for sym in stock_symbols:
            stock_prices[sym] = {}
            prices_dict = cls.get_cached_historical_stock(sym, start_dt, end_dt)
            # Fill dates_list with cached daily close, applying ffill & bfill if gaps exist
            last_val = None
            for d in dates_list:
                val = prices_dict.get(d)
                if val is not None:
                    last_val = val
                    stock_prices[sym][d] = val
                else:
                    if last_val is not None:
                        stock_prices[sym][d] = last_val
                    else:
                        bfill_val = None
                        future_dates = sorted([k for k in prices_dict.keys() if k > d])
                        if future_dates:
                            bfill_val = prices_dict[future_dates[0]]
                        stock_prices[sym][d] = bfill_val if bfill_val is not None else 0.0
                
        # Construct symbol_txs and ticker_info_tmp
        symbol_txs = {}
        for tx in sorted_txs:
            sym = tx["symbol"].upper().strip()
            if not sym.startswith("CASH_"):
                symbol_txs.setdefault(sym, []).append(tx)
                
        ticker_info_tmp = {}
        for symbol in symbol_txs.keys():
            info = cls.get_cached_live_ticker(symbol)
            native_currency = info.get("native_currency") or ""
            # Fall back to transaction currency only if the ticker download failed (live_price == 0.0),
            # if the cached currency is USD but the stock has a non-US suffix, or if no native currency is set.
            suffix = symbol.split(".")[-1] if "." in symbol else ""
            is_non_us_ticker = suffix in {
                "DE", "WA", "PA", "BR", "MI", "MC", "LS", "AT", "VI",
                "TO", "V", "AX", "HK", "SA", "MX", "KS", "KQ", "T", "NS", "BO",
                "SG", "ST", "CO", "EE", "HE", "OL", "IC"
            }
            if not native_currency or (info.get("live_price", 0.0) == 0.0 and symbol not in ["USD", "PLN", "EUR"]) or (native_currency == "USD" and is_non_us_ticker):
                first_tx = symbol_txs[symbol][0]
                native_currency = first_tx.get("currency", "USD")
            ticker_info_tmp[symbol] = {
                "native_currency": native_currency.upper().strip()
            }

        # 6. Gather all unique currencies needing FX to base_currency
        unique_currencies = {base_currency}
        for tx in sorted_txs:
            unique_currencies.add(tx["currency"].upper().strip())
            
        symbol_currencies = {}
        for sym, info in ticker_info_tmp.items():
            native_curr = info["native_currency"]
            symbol_currencies[sym] = native_curr
            unique_currencies.add(native_curr)
            
        # Fetch historical exchange rates (cached)
        fx_rates_hist = {}
        for curr in unique_currencies:
            fx_rates_hist[curr] = {}
            if curr == base_currency:
                for d in dates_list:
                    fx_rates_hist[curr][d] = 1.0
                continue
                
            pair = f"{curr}{base_currency}=X"
            fx_rates_hist[curr] = cls.get_cached_historical_fx(pair, start_dt, end_dt)
            

        # 7. Compute NAV and Cost Basis for each calendar day
        dates_res = []
        nav_res = []
        cost_basis_res = []
        
        txs_by_date = {}
        for tx in sorted_txs:
            tx_date_str = tx["date"]
            try:
                tx_date = datetime.strptime(tx_date_str, "%Y-%m-%d").date()
                txs_by_date.setdefault(tx_date, []).append(tx)
            except Exception:
                pass
                
        cost_basis_method = "average_cost"
        if portfolio_settings and isinstance(portfolio_settings, dict):
            cost_basis_method = portfolio_settings.get("cost_basis_method") or portfolio_settings.get("costBasisMethod") or "average_cost"

        stock_shares = {}
        stock_cost_base = {}
        stock_buy_lots = {}
        cash_balances_running = {}
        
        realized_gains_running_base = 0.0
        dividends_running_base = 0.0
        
        # Get portfolio settings tax rates
        account_tax_rates = portfolio_settings.get("accountTaxRates", {}) if portfolio_settings else {}
        
        def get_tax_rate(acc):
            if not acc:
                acc = "Default"
            rate = account_tax_rates.get(acc)
            if rate is not None:
                return float(rate)
            for k, v in account_tax_rates.items():
                if k.lower() == acc.lower():
                    return float(v)
            if "ike" in acc.lower() or "ikze" in acc.lower():
                return 0.0
            return 0.19
            
        # symbol_txs and ticker_info_tmp are already defined above
            
        fx_rates_tmp = {base_currency: 1.0}
        for curr in unique_currencies:
            if curr != base_currency:
                pair = f"{curr}{base_currency}=X"
                fx_rates_tmp[curr] = cls.get_cached_live_fx(pair)
                
        merged_divs = cls.get_merged_dividends(sorted_txs, symbol_txs, ticker_info_tmp, base_currency, fx_rates_tmp, portfolio_settings)
        
        divs_by_date = {}
        for d_item in merged_divs:
            try:
                dt_obj = datetime.strptime(d_item["date"], "%Y-%m-%d").date()
                divs_by_date.setdefault(dt_obj, []).append(d_item)
            except:
                pass
        
        for d in dates_list:
            # 7a. Process Dividends on day d
            day_divs = divs_by_date.get(d, [])
            for div in day_divs:
                sym = div["symbol"]
                acc = div["account"]
                net_div_base = div["net_base"]
                
                dividends_running_base += net_div_base
                
                if link_cash:
                    native_curr = symbol_currencies.get(sym, "USD")
                    fx_rate_d = fx_rates_hist.get(native_curr, {}).get(d, 1.0)
                    net_div_native = net_div_base / fx_rate_d if fx_rate_d > 0 else net_div_base
                    
                    cash_balances_running.setdefault(acc, {}).setdefault(native_curr, 0.0)
                    cash_balances_running[acc][native_curr] += net_div_native
                                    
            # 7b. Process transactions on day d
            day_txs = txs_by_date.get(d, [])
            for tx in day_txs:
                tx_account = tx.get("account", "Default") or "Default"
                tx_curr = tx.get("currency", "USD").upper().strip()
                sym = tx["symbol"].upper().strip()
                tx_type = tx["type"]
                shares = tx["shares"]
                price = tx["price"]
                fees = tx["fees"]
                
                fx_tx_to_base = fx_rates_hist.get(tx_curr, {}).get(d, 1.0)
                tx_cost_base = (shares * price + fees) * fx_tx_to_base
                
                cash_balances_running.setdefault(tx_account, {}).setdefault(tx_curr, 0.0)
                
                if sym.startswith("CASH_"):
                    cash_currency = sym.split("_")[1] if "_" in sym else tx_curr
                    cash_balances_running.setdefault(tx_account, {}).setdefault(cash_currency, 0.0)
                    amount = shares * price
                    if tx_type == "BUY":
                        cash_balances_running[tx_account][cash_currency] += amount
                    elif tx_type == "SELL":
                        cash_balances_running[tx_account][cash_currency] -= amount
                else:
                    stock_shares.setdefault(sym, {}).setdefault(tx_account, 0.0)
                    stock_cost_base.setdefault(sym, {}).setdefault(tx_account, 0.0)
                    
                    if tx_type == "BUY":
                        stock_cost_base[sym][tx_account] += tx_cost_base
                        stock_shares[sym][tx_account] += shares
                        if cost_basis_method == "fifo":
                            stock_buy_lots.setdefault(sym, {}).setdefault(tx_account, []).append({
                                "shares": shares,
                                "cost_base": tx_cost_base
                            })
                    elif tx_type == "SELL":
                        curr_shares = stock_shares[sym][tx_account]
                        if cost_basis_method == "fifo":
                            lots = stock_buy_lots.setdefault(sym, {}).setdefault(tx_account, [])
                            sell_shares = shares
                            cost_of_sold_shares = 0.0
                            while sell_shares > 1e-9 and lots:
                                lot = lots[0]
                                if lot["shares"] <= sell_shares + 1e-9:
                                    cost_of_sold_shares += lot["cost_base"]
                                    sell_shares -= lot["shares"]
                                    lots.pop(0)
                                else:
                                    ratio = sell_shares / lot["shares"]
                                    cost_of_sold_shares += lot["cost_base"] * ratio
                                    lot["cost_base"] *= (1.0 - ratio)
                                    lot["shares"] -= sell_shares
                                    sell_shares = 0.0
                            
                            sale_value_base = (shares * price - fees) * fx_tx_to_base
                            realized_gain = sale_value_base - cost_of_sold_shares
                            realized_gains_running_base += realized_gain
                            
                            stock_shares[sym][tx_account] = sum(lot["shares"] for lot in lots)
                            stock_cost_base[sym][tx_account] = sum(lot["cost_base"] for lot in lots)
                            if stock_shares[sym][tx_account] < 1e-9:
                                stock_shares[sym][tx_account] = 0.0
                                stock_cost_base[sym][tx_account] = 0.0
                        else:
                            if curr_shares > 0:
                                shares_to_sell = min(curr_shares, shares)
                                cost_of_sold_shares = (stock_cost_base[sym][tx_account] / curr_shares) * shares_to_sell
                                sale_value_base = (shares * price - fees) * fx_tx_to_base
                                realized_gain = sale_value_base - cost_of_sold_shares
                                realized_gains_running_base += realized_gain
                                
                                stock_cost_base[sym][tx_account] = stock_cost_base[sym][tx_account] * max(0.0, (curr_shares - shares)) / curr_shares
                            stock_shares[sym][tx_account] = max(0.0, curr_shares - shares)
                            if stock_shares[sym][tx_account] == 0.0:
                                stock_cost_base[sym][tx_account] = 0.0
                            
                    if link_cash:
                        amount = shares * price
                        if tx_type == "BUY":
                            cash_balances_running[tx_account][tx_curr] -= (amount + fees)
                        elif tx_type == "SELL":
                            cash_balances_running[tx_account][tx_curr] += (amount - fees)
                            
            day_nav = 0.0
            day_cost = 0.0
            
            # Valuate stocks on day d
            for sym in stock_shares.keys():
                for acc, shares_owned in stock_shares[sym].items():
                    if shares_owned > 0.0:
                        p_native = stock_prices.get(sym, {}).get(d, 0.0)
                        native_curr = symbol_currencies.get(sym, "USD")
                        fx_native_to_base = fx_rates_hist.get(native_curr, {}).get(d, 1.0)
                        
                        avg_cost_native = (stock_cost_base[sym][acc] / shares_owned) / fx_native_to_base if fx_native_to_base > 0 else 0.0
                        if p_native == 0.0:
                            p_native = avg_cost_native
                            
                        val_base = shares_owned * p_native * fx_native_to_base
                        day_nav += val_base
                        day_cost += stock_cost_base[sym][acc]
                        
            # Valuate cash on day d
            day_cash_value_base = 0.0
            for acc in cash_balances_running.keys():
                for curr, balance in cash_balances_running[acc].items():
                    effective_bal = balance
                    if effective_bal < 0.0:
                        effective_bal = 0.0
                        
                    if effective_bal > 0.001:
                        fx_rate = fx_rates_hist.get(curr, {}).get(d, 1.0)
                        val_base = effective_bal * fx_rate
                        day_cash_value_base += val_base
                        
            if link_cash:
                day_nav += day_cash_value_base
                day_cost += day_cash_value_base - realized_gains_running_base - dividends_running_base
            else:
                day_nav += dividends_running_base
                # day_cost is just sum of active stock cost bases
                
            dates_res.append(d.strftime("%Y-%m-%d"))
            nav_res.append(round(day_nav, 2))
            cost_basis_res.append(round(max(0.0, day_cost), 2))
            
        return {
            "dates": dates_res,
            "nav": nav_res,
            "cost_basis": cost_basis_res
        }

    @classmethod
    def calculate_portfolio_analytics(cls, transactions: list, base_currency: str = "PLN", account: str = "All", link_cash: bool = False, portfolio_settings: dict = None) -> dict:
        from backend.financial_engine import (
            calculate_xirr,
            calculate_twr,
            calculate_risk_metrics,
            calculate_beta,
            calculate_correlation_matrix
        )
        base_currency = base_currency.upper().strip()
        portfolio_settings = portfolio_settings or {}
        
        # 1. Get daily performance curve
        hist_perf = cls.calculate_historical_performance(transactions, base_currency, account, link_cash, portfolio_settings)
        if not hist_perf.get("dates"):
            return {
                "mwr": 0.0,
                "twr": 0.0,
                "volatility_annual": 0.0,
                "sharpe_ratio": 0.0,
                "sortino_ratio": 0.0,
                "beta": 1.0,
                "correlation_matrix": {}
            }
            
        # 2. Filter transactions for cash flows
        if account and account.lower() != "all":
            txs_cf = [tx for tx in transactions if tx.get("account", "Default").lower() == account.lower()]
        else:
            txs_cf = transactions
            
        # 3. Calculate cash flows in base currency for XIRR
        cf_by_date = {}
        symbol_txs = {}
        for tx in txs_cf:
            try:
                sym = tx["symbol"].upper().strip()
                if not sym.startswith("CASH_"):
                    symbol_txs.setdefault(sym, []).append(tx)
                    
                is_cash = sym.startswith("CASH_")
                # If link_cash is True, stock BUY/SELL are internal reallocations, not external cash flows
                if link_cash and not is_cash:
                    continue
                # If link_cash is False, CASH_* are ignored
                if not link_cash and is_cash:
                    continue
                    
                tx_dt = datetime.strptime(tx["date"], "%Y-%m-%d").date()
                tx_curr = tx["currency"].upper().strip()
                
                # Fetch historical exchange rate on transaction date
                if tx_curr == base_currency:
                    rate = 1.0
                else:
                    pair = f"{tx_curr}{base_currency}=X"
                    rates = cls.get_cached_historical_fx(pair, tx_dt, tx_dt)
                    rate = rates.get(tx_dt, FALLBACK_RATES.get(f"{tx_curr}{base_currency}", 1.0))
                    
                cost_native = float(tx["shares"]) * float(tx["price"])
                fees_native = float(tx.get("fees") or 0.0)
                
                if tx["type"] == "BUY":
                    val = -(cost_native + fees_native) * rate
                else:
                    val = (cost_native - fees_native) * rate
                    
                cf_by_date[tx_dt] = cf_by_date.get(tx_dt, 0.0) + val
            except Exception:
                pass
                
        # 4. Integrate dividends as positive cash flows
        # Note: Dividends are kept inside the portfolio (added to NAV/cash), so they are not external cash flows.
        # We do not add them to cf_by_date or daily_cfs.
        
        # Build daily cash flows for TWR (negating signs: BUY becomes positive/deposit, SELL becomes negative/withdrawal)
        daily_cfs = {}
        for dt, val in cf_by_date.items():
            dt_str = dt.strftime("%Y-%m-%d")
            daily_cfs[dt_str] = -val
            
        # 5. Add current NAV as final positive cash flow on today for XIRR
        today = date.today()
        last_nav = hist_perf["nav"][-1]
        cf_by_date[today] = cf_by_date.get(today, 0.0) + last_nav
        
        # Build Cash flows list for XIRR
        cash_flows_list = [(dt, val) for dt, val in cf_by_date.items()]
            
        # 6. Run Calculations
        mwr = calculate_xirr(cash_flows_list)
        
        daily_nav_list = [{"date": d, "nav": n, "cost": c} for d, n, c in zip(hist_perf["dates"], hist_perf["nav"], hist_perf["cost_basis"])]
        twr = calculate_twr(daily_nav_list, daily_cfs)
        
        rf_rate = float(portfolio_settings.get("risk_free_rate", 2.0)) / 100.0
        risk = calculate_risk_metrics(daily_nav_list, daily_cfs, rf_rate)
        
        benchmark = portfolio_settings.get("beta_benchmark", "SPY")
        beta = calculate_beta(daily_nav_list, daily_cfs, benchmark)
        
        # Get active Symbols for correlation matrix
        active_symbols = [sym for sym in symbol_txs.keys()]
        correlation = calculate_correlation_matrix(active_symbols)
        
        return {
            "mwr": round(mwr, 4),
            "twr": round(twr, 4),
            "volatility_annual": risk.get("volatility_annual", 0.0),
            "sharpe_ratio": risk.get("sharpe_ratio", 0.0),
            "sortino_ratio": risk.get("sortino_ratio", 0.0),
            "beta": beta,
            "correlation_matrix": correlation
        }

    @classmethod
    def calculate_dividend_forecast(cls, transactions: list, base_currency: str = "PLN", account: str = "All", link_cash: bool = False, portfolio_settings: dict = None) -> dict:
        """
        Computes a 12-month forward net dividend forecast matching the calendar payouts.
        """
        # 1. Calculate holdings to find active positions and cost basis
        holdings_res = cls.calculate_holdings(transactions, base_currency, account, link_cash, portfolio_settings)
        holdings = holdings_res.get("holdings", [])
        summary = holdings_res.get("summary", {})
        
        total_market_value = summary.get("total_value_base", 0.0) or summary.get("total_value", 0.0)
        total_cost_basis = summary.get("total_cost_base", 0.0) or summary.get("total_cost", 0.0)
        
        # Build list of next 12 months (e.g. from current month/year to 11 months ahead)
        import time
        from datetime import date, datetime, timedelta
        
        today = date.today()
        current_year = today.year
        current_month = today.month # 1-12
        
        months_list = []
        month_keys = [] # list of (year, month) tuples
        for i in range(12):
            m = current_month + i
            y = current_year
            if m > 12:
                m -= 12
                y += 1
            month_date = date(y, m, 1)
            months_list.append(month_date.strftime("%Y-%m")) # e.g. "2026-06"
            month_keys.append((y, m))
            
        if not holdings:
            return {
                "forward_annual_income": 0.0,
                "forward_yield": 0.0,
                "yield_on_cost": 0.0,
                "months": months_list,
                "monthly_amounts": [0.0] * 12,
                "ticker_contributions": {}
            }
            
        # Resolve tax rates per account
        account_tax_rates = portfolio_settings.get("accountTaxRates", {}) if portfolio_settings else {}
        def get_tax_rate(acc):
            if not acc:
                acc = "Default"
            rate = account_tax_rates.get(acc)
            if rate is not None:
                return float(rate)
            for k, v in account_tax_rates.items():
                if k.lower() == acc.lower():
                    return float(v)
            if "ike" in acc.lower() or "ikze" in acc.lower():
                return 0.0
            return 0.19
            
        # Setup local transactions list filtered by account if needed
        local_txs = transactions
        if account and account.lower() != "all":
            local_txs = [tx for tx in transactions if tx.get("account", "Default").lower() == account.lower()]
            
        # Calculate current shares per symbol per account
        symbol_account_shares = {}
        for tx in local_txs:
            sym = tx["symbol"].upper().strip()
            if sym.startswith("CASH_"):
                continue
            acc = tx.get("account", "Default") or "Default"
            tx_type = tx.get("type", "BUY")
            tx_shares = float(tx.get("shares", 0.0))
            
            symbol_account_shares.setdefault(sym, {}).setdefault(acc, 0.0)
            if tx_type == "BUY":
                symbol_account_shares[sym][acc] += tx_shares
            elif tx_type == "SELL":
                symbol_account_shares[sym][acc] = max(0.0, symbol_account_shares[sym][acc] - tx_shares)

        # Initialize results structures
        ticker_contributions = {}
        monthly_totals = [0.0] * 12
        
        active_holdings = [h for h in holdings if float(h.get("shares", 0.0)) > 0]
        
        for h in active_holdings:
            symbol = h["symbol"].upper().strip()
            if symbol.startswith("CASH"):
                continue
            shares = float(h["shares"])
            curr = h.get("currency", "USD").upper().strip()
            fx_rate = float(h.get("fx_rate", 1.0))
            
            # 1. Retrieve the historical dividends from the cache
            dividends_data = cls._historical_stock_cache.get(symbol, {}).get("dividends", {})
            
            if not dividends_data:
                # Try to load from SQLite persistent cache to prevent slow individual HTTP fetches under concurrent load
                try:
                    two_years_ago = today - timedelta(days=730)
                    _, sqlite_divs = get_cached_historical_prices(symbol, two_years_ago, today)
                    if sqlite_divs:
                        dividends_data = sqlite_divs
                        # Warm up the in-memory cache so subsequent price calculations can reuse it
                        if symbol not in cls._historical_stock_cache:
                            cls._historical_stock_cache[symbol] = {
                                "start_date": two_years_ago,
                                "end_date": today,
                                "last_updated": time.time(),
                                "prices": {},
                                "dividends": sqlite_divs
                            }
                        else:
                            cls._historical_stock_cache[symbol]["dividends"] = sqlite_divs
                except Exception as cache_err:
                    print(f"Error loading historical dividends from SQLite for {symbol}: {cache_err}")
            
            # Find payouts in the last 2 years to deduce payout months & values
            payouts_recent = []
            if dividends_data:
                payouts_recent = [(dt, float(val)) for dt, val in dividends_data.items() if today - timedelta(days=365) <= dt <= today]
                if not payouts_recent:
                    payouts_recent = [(dt, float(val)) for dt, val in dividends_data.items() if today - timedelta(days=730) <= dt <= today]
            
            ticker_amounts = [0.0] * 12
            
            if payouts_recent:
                # We have recent payouts! Map them to the next 12 months
                for ex_date, native_payout in payouts_recent:
                    # Calculate net payout by summing payouts per account with their respective tax rates
                    net_payout_base = 0.0
                    acc_shares_map = symbol_account_shares.get(symbol, {})
                    for acc, acc_shares in acc_shares_map.items():
                        if acc_shares <= 0.0001:
                            continue
                        acc_tax_rate = get_tax_rate(acc)
                        gross_payout_base = acc_shares * native_payout * fx_rate
                        net_payout_base += gross_payout_base * (1.0 - acc_tax_rate)
                    
                    # Find which month of next 12 months matches this ex_date's month
                    for i, (y, m) in enumerate(month_keys):
                        if m == ex_date.month:
                            ticker_amounts[i] += net_payout_base
                            monthly_totals[i] += net_payout_base
            else:
                # Fallback to yfinance dividendRate distributed quarterly
                # Fetch cached or live rate
                cached = cls._dividend_rate_cache.get(symbol)
                div_rate = cached[1] if cached else 0.0
                if div_rate <= 0.0:
                    # Try fetch
                    import requests
                    import yfinance as yf
                    try:
                        session = requests.Session()
                        session.verify = False
                        session.headers.update({"User-Agent": "Mozilla/5.0"})
                        ticker = yf.Ticker(symbol, session=session)
                        info = ticker.info
                        rate = info.get("dividendRate") or info.get("trailingAnnualDividendRate")
                        div_rate = float(rate) if rate else 0.0
                        cls._dividend_rate_cache[symbol] = (time.time(), div_rate)
                    except:
                        pass
                
                if div_rate > 0.0:
                    # Calculate expected annual net using account-specific shares & tax rates
                    expected_annual_net = 0.0
                    acc_shares_map = symbol_account_shares.get(symbol, {})
                    for acc, acc_shares in acc_shares_map.items():
                        if acc_shares <= 0.0001:
                            continue
                        acc_tax_rate = get_tax_rate(acc)
                        expected_annual_net += acc_shares * div_rate * fx_rate * (1.0 - acc_tax_rate)

                    # Distribute quarterly starting next month
                    start_m = (current_month % 12) + 1
                    payout_months = {start_m, ((start_m + 3 - 1) % 12) + 1, ((start_m + 6 - 1) % 12) + 1, ((start_m + 9 - 1) % 12) + 1}
                    payment_val = expected_annual_net / 4.0
                    for i, (y, m) in enumerate(month_keys):
                        if m in payout_months:
                            ticker_amounts[i] += payment_val
                            monthly_totals[i] += payment_val
                            
            # Round ticker contributions
            ticker_contributions[symbol] = [round(amt, 2) for amt in ticker_amounts]
            
        # Calculate forward yields
        forward_annual_income = sum(monthly_totals)
        forward_yield = (forward_annual_income / total_market_value) if total_market_value > 0 else 0.0
        yield_on_cost = (forward_annual_income / total_cost_basis) if total_cost_basis > 0 else 0.0
        
        # Round final results
        monthly_amounts_rounded = [round(amt, 2) for amt in monthly_totals]
        
        return {
            "forward_annual_income": round(forward_annual_income, 2),
            "forward_yield": round(forward_yield, 4),
            "yield_on_cost": round(yield_on_cost, 4),
            "months": months_list,
            "monthly_amounts": monthly_amounts_rounded,
            "ticker_contributions": ticker_contributions
        }
