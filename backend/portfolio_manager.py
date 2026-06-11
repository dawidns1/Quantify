import os
import json
import time
import pandas as pd
from datetime import datetime, date, timedelta
from backend.data_provider import get_provider

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
    
    STOCK_CACHE_TTL = 60  # 1 minute
    FX_CACHE_TTL = 600     # 10 minutes
    HISTORICAL_CACHE_TTL = 3600  # 1 hour

    @staticmethod
    def is_market_open(timezone_str: str, exchange_str: str) -> bool:
        from zoneinfo import ZoneInfo
        from datetime import datetime
        try:
            tz = ZoneInfo(timezone_str)
            now_tz = datetime.now(tz)
        except Exception:
            now_tz = datetime.now()
            
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
        elif "CCY" in exchange_str or "forex" in exchange_str.lower() or timezone_str == "UTC":
            return True
        else:
            return 9.0 <= time_float < 17.5

    @classmethod
    def prefetch_live_prices(cls, symbols: list, fx_pairs: list):
        now = time.time()
        missing_symbols = []
        missing_fx = []
        
        for sym in symbols:
            sym = sym.upper().strip()
            cache_entry = cls._live_ticker_cache.get(sym)
            if not cache_entry or (now - cache_entry[0] > cls.STOCK_CACHE_TTL):
                missing_symbols.append(sym)
                
        for pair in fx_pairs:
            pair = pair.upper().strip()
            cache_entry = cls._live_fx_cache.get(pair)
            if not cache_entry or (now - cache_entry[0] > cls.FX_CACHE_TTL):
                missing_fx.append(pair)
                
        if not missing_symbols and not missing_fx:
            return
            
        print(f"[DEBUG] Prefetching live prices for stocks {missing_symbols} and FX {missing_fx}")
        
        try:
            res = provider.download_bulk_live_prices(missing_symbols, missing_fx)
            for sym in missing_symbols:
                stock_data = res["stocks"].get(sym, {"live_price": 0.0, "company_name": sym, "native_currency": "USD"})
                cls._live_ticker_cache[sym] = (now, stock_data)
                
            for pair in missing_fx:
                rate = res["fx"].get(pair, 1.0)
                cls._live_fx_cache[pair] = (now, rate)
        except Exception as e:
            print(f"Error prefetching live prices: {e}")

    @classmethod
    def prefetch_historical_stock_prices(cls, symbols: list, start_dt: date, end_dt: date):
        now = time.time()
        missing_symbols = []
        
        for sym in symbols:
            sym = sym.upper().strip()
            cache_entry = cls._historical_stock_cache.get(sym)
            if not cache_entry or cache_entry["start_date"] > start_dt or (now - cache_entry["last_updated"] > cls.HISTORICAL_CACHE_TTL):
                missing_symbols.append(sym)
                
        if not missing_symbols:
            return
            
        try:
            print(f"[DEBUG] Prefetching historical stock prices for {len(missing_symbols)} symbols: {missing_symbols}")
            prices_by_symbol, dividends_by_symbol = provider.download_historical_stock_bulk(missing_symbols, start_dt, end_dt)
            
            for sym in missing_symbols:
                prices_dict = prices_by_symbol.get(sym, {})
                dividends_dict = dividends_by_symbol.get(sym, {})
                
                cache_entry = cls._historical_stock_cache.get(sym)
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
                        
                    cls._historical_stock_cache[sym] = {
                        "start_date": actual_start,
                        "end_date": actual_end,
                        "last_updated": now,
                        "prices": prices_dict,
                        "dividends": dividends_dict
                    }
        except Exception as e:
            print(f"Error prefetching historical stock prices in bulk: {e}")

    @classmethod
    def get_cached_live_ticker(cls, symbol: str) -> dict:
        symbol = symbol.upper().strip()
        now = time.time()
        
        if symbol in cls._live_ticker_cache:
            ts, data = cls._live_ticker_cache[symbol]
            if now - ts < cls.STOCK_CACHE_TTL:
                return data
                
        try:
            res = provider.download_live_ticker(symbol)
            live_price = res.get("live_price", 0.0)
            company_name = res.get("company_name", symbol)
            native_currency = res.get("native_currency", "USD")
            quote_type = res.get("quote_type")
            previous_close = res.get("previous_close", live_price)
            timezone = res.get("timezone", "UTC")
            exchange = res.get("exchange", "")
        except Exception as e:
            print(f"Error fetching live data for {symbol}: {e}")
            live_price = 0.0
            company_name = symbol
            native_currency = "USD"
            quote_type = None
            previous_close = 0.0
            timezone = "UTC"
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
                
        data = {
            "live_price": float(live_price) if live_price else 0.0,
            "company_name": company_name,
            "native_currency": native_currency.upper().strip(),
            "asset_class": asset_class,
            "previous_close": float(previous_close) if previous_close else 0.0,
            "timezone": timezone,
            "exchange": exchange
        }
        
        cls._live_ticker_cache[symbol] = (now, data)
        return data

    @classmethod
    def get_cached_live_fx(cls, pair: str) -> float:
        pair = pair.upper().strip()
        now = time.time()
        
        if pair in cls._live_fx_cache:
            ts, rate = cls._live_fx_cache[pair]
            if now - ts < cls.FX_CACHE_TTL:
                return rate
                
        rate = None
        try:
            rate = provider.download_live_fx(pair)
        except Exception as e:
            print(f"Error fetching FX rate for {pair}: {e}")
            
        if rate is None or rate == 1.0:
            base_pair = pair.replace("=X", "")
            rate = FALLBACK_RATES.get(base_pair, 1.0)
            
        cls._live_fx_cache[pair] = (now, float(rate))
        return float(rate)

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
        
        if cache_entry and cache_entry["start_date"] <= start_dt:
            if end_dt in cache_entry["prices"] or (now - cache_entry["last_updated"] < cls.HISTORICAL_CACHE_TTL):
                sliced_prices = {d: val for d, val in cache_entry["prices"].items() if start_dt <= d <= end_dt}
                if sliced_prices:
                    return sliced_prices
                    
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
            if not native_currency or (native_currency == "USD" and symbol not in ["USD", "PLN", "EUR"]):
                first_tx = symbol_txs[symbol][0]
                native_currency = first_tx.get("currency", "USD")
                
            ticker_info[symbol] = {
                "live_price": info["live_price"],
                "company_name": info["company_name"],
                "native_currency": native_currency.upper().strip(),
                "asset_class": info.get("asset_class", "Equity")
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

        dividends_by_symbol_acc = {} # (symbol, acc) -> {"gross_base": 0.0, "net_base": 0.0, "net_native": 0.0}
        
        for symbol, txs in symbol_txs.items():
            # Trigger get_cached_historical_stock to force cache population
            cls.get_cached_historical_stock(symbol, earliest_date, date.today())
            dividends_data = cls._historical_stock_cache.get(symbol, {}).get("dividends", {})
            native_curr = ticker_info[symbol]["native_currency"]
            
            accounts = set(tx.get("account", "Default") or "Default" for tx in txs)
            
            for acc in accounts:
                div_gross_base = 0.0
                div_net_base = 0.0
                div_net_native = 0.0
                
                for ex_date, payout in sorted(dividends_data.items()):
                    # Calculate shares owned in this account on ex_date
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
                        
                        if native_curr == base_currency:
                            fx_rate_ex = 1.0
                        else:
                            fx_ex_dict = cls.get_cached_historical_fx(f"{native_curr}{base_currency}=X", ex_date, ex_date)
                            fx_rate_ex = fx_ex_dict.get(ex_date) if fx_ex_dict else None
                            if fx_rate_ex is None:
                                fx_rate_ex = fx_rates.get(native_curr, 1.0)
                                
                        div_gross_base += gross_payout_native * fx_rate_ex
                        div_net_base += net_payout_native * fx_rate_ex
                        div_net_native += net_payout_native
                        
                dividends_by_symbol_acc[(symbol, acc)] = {
                    "gross_base": div_gross_base,
                    "net_base": div_net_base,
                    "net_native": div_net_native
                }
                
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
        
        # Calculate stock holdings
        for symbol, txs in symbol_txs.items():
            shares_owned = 0.0
            cost_basis_base = 0.0
            
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
                    "asset_class": info.get("asset_class", "Equity")
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
                "holdings": []
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
            "holdings": holdings_list
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
                
        # 6. Gather all unique currencies needing FX to base_currency
        unique_currencies = {base_currency}
        for tx in sorted_txs:
            unique_currencies.add(tx["currency"].upper().strip())
            
        symbol_currencies = {}
        for tx in sorted_txs:
            sym = tx["symbol"].upper().strip()
            if not sym.startswith("CASH_"):
                symbol_currencies[sym] = tx["currency"].upper().strip()
                
        for curr in symbol_currencies.values():
            unique_currencies.add(curr)
            
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
                
        stock_shares = {}
        stock_cost_base = {}
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
            
        # Pre-cache dividends data
        dividends_data_by_sym = {}
        for sym in stock_symbols:
            dividends_data_by_sym[sym] = cls._historical_stock_cache.get(sym, {}).get("dividends", {})
        
        for d in dates_list:
            # 7a. Process Dividends on day d (ex-dividend dates)
            for sym in stock_symbols:
                divs = dividends_data_by_sym.get(sym, {})
                payout = divs.get(d)
                if payout is not None and payout > 0:
                    if sym in stock_shares:
                        for acc, shares_owned in stock_shares[sym].items():
                            if shares_owned > 0.0001:
                                tax_rate = get_tax_rate(acc)
                                gross_div = shares_owned * payout
                                net_div = gross_div * (1.0 - tax_rate)
                                
                                native_curr = symbol_currencies.get(sym, "USD")
                                fx_rate_d = fx_rates_hist.get(native_curr, {}).get(d, 1.0)
                                net_div_base = net_div * fx_rate_d
                                
                                dividends_running_base += net_div_base
                                
                                if link_cash:
                                    cash_balances_running.setdefault(acc, {}).setdefault(native_curr, 0.0)
                                    cash_balances_running[acc][native_curr] += net_div
                                    
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
                    elif tx_type == "SELL":
                        curr_shares = stock_shares[sym][tx_account]
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
            
        # 8. Downsample data if > 90 days to maintain snappy rendering
        total_days = len(dates_res)
        if total_days > 90:
            step = 7 # weekly downsampling
            downsampled_dates = []
            downsampled_nav = []
            downsampled_cost = []
            
            for i in range(0, total_days, step):
                downsampled_dates.append(dates_res[i])
                downsampled_nav.append(nav_res[i])
                downsampled_cost.append(cost_basis_res[i])
                
            if dates_res[-1] not in downsampled_dates:
                downsampled_dates.append(dates_res[-1])
                downsampled_nav.append(nav_res[-1])
                downsampled_cost.append(cost_basis_res[-1])
                
            return {
                "dates": downsampled_dates,
                "nav": downsampled_nav,
                "cost_basis": downsampled_cost
            }
            
        return {
            "dates": dates_res,
            "nav": nav_res,
            "cost_basis": cost_basis_res
        }
