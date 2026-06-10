import os
import json
import time
import yfinance as yf
import pandas as pd
from datetime import datetime, date, timedelta

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
    
    STOCK_CACHE_TTL = 300  # 5 minutes
    FX_CACHE_TTL = 600     # 10 minutes
    HISTORICAL_CACHE_TTL = 3600  # 1 hour

    @classmethod
    def get_cached_live_ticker(cls, symbol: str) -> dict:
        symbol = symbol.upper().strip()
        now = time.time()
        
        if symbol in cls._live_ticker_cache:
            ts, data = cls._live_ticker_cache[symbol]
            if now - ts < cls.STOCK_CACHE_TTL:
                return data
                
        live_price = 0.0
        company_name = symbol
        native_currency = None
        try:
            stock_ticker = yf.Ticker(symbol)
            live_price = stock_ticker.fast_info.get("lastPrice")
            if live_price is None:
                live_price = stock_ticker.info.get("currentPrice") or 0.0
            company_name = stock_ticker.info.get("longName") or stock_ticker.info.get("shortName") or symbol
            native_currency = stock_ticker.fast_info.get("currency") or stock_ticker.info.get("currency")
        except Exception as e:
            print(f"Error fetching live data for {symbol}: {e}")
            
        if not native_currency:
            native_currency = "USD"
            
        data = {
            "live_price": float(live_price) if live_price else 0.0,
            "company_name": company_name,
            "native_currency": native_currency.upper().strip()
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
            rate_ticker = yf.Ticker(pair)
            rate = rate_ticker.fast_info.get("lastPrice")
            if rate is None:
                rate = rate_ticker.info.get("currentPrice")
        except Exception as e:
            print(f"Error fetching FX rate for {pair}: {e}")
            
        if rate is None:
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
            
        start_str = fetch_start.strftime("%Y-%m-%d")
        end_str = (date.today() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        prices_dict = {}
        try:
            df = yf.download(symbol, start=start_str, end=end_str, progress=False)
            prices_series = df['Close'] if 'Close' in df.columns else pd.Series(dtype=float)
            if not prices_series.empty:
                prices_series.index = pd.to_datetime(prices_series.index).date
                for d, val in prices_series.items():
                    if pd.notna(val):
                        prices_dict[d] = float(val)
        except Exception as e:
            print(f"Error downloading historical stock prices for {symbol}: {e}")
            
        if not prices_dict and cache_entry:
            prices_dict = cache_entry["prices"]
            fetch_start = cache_entry["start_date"]
            
        if prices_dict:
            actual_start = min(prices_dict.keys())
            actual_end = max(prices_dict.keys())
            
            if cache_entry:
                merged_prices = {**cache_entry["prices"], **prices_dict}
                actual_start = min(merged_prices.keys())
                actual_end = max(merged_prices.keys())
                prices_dict = merged_prices
                
            cls._historical_stock_cache[symbol] = {
                "start_date": actual_start,
                "end_date": actual_end,
                "last_updated": now,
                "prices": prices_dict
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
            
        start_str = fetch_start.strftime("%Y-%m-%d")
        end_str = (date.today() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        prices_dict = {}
        try:
            df_fx = yf.download(pair, start=start_str, end=end_str, progress=False)
            prices_series = df_fx['Close'] if 'Close' in df_fx.columns else pd.Series(dtype=float)
            if not prices_series.empty:
                prices_series.index = pd.to_datetime(prices_series.index).date
                for d, val in prices_series.items():
                    if pd.notna(val):
                        prices_dict[d] = float(val)
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
    def calculate_holdings(cls, transactions: list, base_currency: str = "PLN", account: str = "All", link_cash: bool = False) -> dict:
        base_currency = base_currency.upper().strip()
        
        if account and account.lower() != "all":
            transactions = [tx for tx in transactions if tx.get("account", "Default").lower() == account.lower()]
        
        # Calculate cash balances per account and currency
        cash_balances = {}
        sorted_txs = sorted(transactions, key=lambda x: x.get("date", ""))
        
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
                
        # Group stock transactions by ticker (exclude CASH_ tickers from symbol_txs)
        symbol_txs = {}
        for tx in sorted_txs:
            sym = tx["symbol"].upper().strip()
            if not sym.startswith("CASH_"):
                symbol_txs.setdefault(sym, []).append(tx)
                
        if not symbol_txs and not any(bal > 0.001 for bal in final_cash.values()):
            return {
                "summary": {
                    "total_cost_base": 0.0,
                    "total_value_base": 0.0,
                    "total_gain_base": 0.0,
                    "total_gain_percent": 0.0,
                    "base_currency": base_currency
                },
                "holdings": []
            }
            
        # Gather live ticker info for stocks (cached)
        ticker_info = {}
        for symbol in symbol_txs.keys():
            info = cls.get_cached_live_ticker(symbol)
            
            # If native_currency wasn't resolved, use first transaction currency as fallback
            native_currency = info["native_currency"]
            if not native_currency or (native_currency == "USD" and symbol not in ["USD", "PLN", "EUR"]):
                first_tx = symbol_txs[symbol][0]
                native_currency = first_tx.get("currency", "USD")
                
            ticker_info[symbol] = {
                "live_price": info["live_price"],
                "company_name": info["company_name"],
                "native_currency": native_currency.upper().strip()
            }
            
        # Collect unique currencies for FX
        unique_currencies = {base_currency}
        for tx in transactions:
            unique_currencies.add(tx["currency"].upper().strip())
        for info in ticker_info.values():
            unique_currencies.add(info["native_currency"])
        for curr in final_cash.keys():
            unique_currencies.add(curr)
            
        # Fetch live exchange rates (cached)
        fx_rates = {base_currency: 1.0}
        for curr in unique_currencies:
            if curr == base_currency:
                continue
            pair = f"{curr}{base_currency}=X"
            fx_rates[curr] = cls.get_cached_live_fx(pair)
            
        holdings_list = []
        total_cost_base = 0.0
        total_value_base = 0.0
        
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
                gain_base = current_value_base - cost_basis_base
                gain_percent = (gain_base / cost_basis_base * 100) if cost_basis_base > 0 else 0.0
                
                holdings_list.append({
                    "symbol": symbol,
                    "name": info["company_name"],
                    "shares": shares_owned,
                    "avg_cost_local": round(avg_cost_native, 2),
                    "current_price_local": round(live_price_native, 2),
                    "currency": native_curr,
                    "fx_rate": fx_native_to_base,
                    "cost_basis_base": round(cost_basis_base, 2),
                    "current_value_base": round(current_value_base, 2),
                    "gain_base": round(gain_base, 2),
                    "gain_percent": round(gain_percent, 2)
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
                    "gain_percent": 0.0
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
                    "base_currency": base_currency
                },
                "holdings": []
            }
            
        total_gain_base = total_value_base - total_cost_base
        total_gain_percent = (total_gain_base / total_cost_base * 100) if total_cost_base > 0 else 0.0
        
        return {
            "summary": {
                "total_cost_base": round(total_cost_base, 2),
                "total_value_base": round(total_value_base, 2),
                "total_gain_base": round(total_gain_base, 2),
                "total_gain_percent": round(total_gain_percent, 2),
                "base_currency": base_currency
            },
            "holdings": holdings_list
        }

    @classmethod
    def calculate_historical_performance(cls, transactions: list, base_currency: str = "PLN", account: str = "All", link_cash: bool = False) -> dict:
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
        
        for d in dates_list:
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
            for acc in cash_balances_running.keys():
                for curr, balance in cash_balances_running[acc].items():
                    effective_bal = balance
                    if effective_bal < 0.0:
                        effective_bal = 0.0
                        
                    if effective_bal > 0.001:
                        fx_rate = fx_rates_hist.get(curr, {}).get(d, 1.0)
                        val_base = effective_bal * fx_rate
                        day_nav += val_base
                        day_cost += val_base
                        
            dates_res.append(d.strftime("%Y-%m-%d"))
            nav_res.append(round(day_nav, 2))
            cost_basis_res.append(round(day_cost, 2))
            
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
