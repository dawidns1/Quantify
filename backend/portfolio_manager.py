import os
import json
import time
import yfinance as yf

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
    def get_holdings(cls, base_currency: str = "PLN", account: str = "All") -> dict:
        return cls.calculate_holdings(cls.get_transactions(), base_currency, account)

    @classmethod
    def calculate_holdings(cls, transactions: list, base_currency: str = "PLN", account: str = "All") -> dict:
        base_currency = base_currency.upper().strip()
        
        if account and account.lower() != "all":
            transactions = [tx for tx in transactions if tx.get("account", "Default").lower() == account.lower()]
        
        if not transactions:
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

        # 1. Group transactions by ticker symbol (chronological)
        symbol_txs = {}
        for tx in sorted(transactions, key=lambda x: x.get("date", "")):
            sym = tx["symbol"]
            symbol_txs.setdefault(sym, []).append(tx)
            
        # 2. Gather live ticker info (price, name, native currency)
        ticker_info = {}
        for symbol in symbol_txs.keys():
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
                
            # Fallback for native currency if yfinance fails
            if not native_currency:
                first_tx = symbol_txs[symbol][0]
                native_currency = first_tx.get("currency", "USD")
                
            ticker_info[symbol] = {
                "live_price": live_price,
                "company_name": company_name,
                "native_currency": native_currency.upper().strip()
            }
            
        # 3. Collect all unique currencies that need rates to base_currency
        unique_currencies = {base_currency}
        for tx in transactions:
            unique_currencies.add(tx["currency"].upper().strip())
        for info in ticker_info.values():
            unique_currencies.add(info["native_currency"])
            
        # 4. Fetch live exchange rates to base_currency
        fx_rates = {base_currency: 1.0}
        for curr in unique_currencies:
            if curr == base_currency:
                continue
            pair = f"{curr}{base_currency}=X"
            rate = None
            try:
                rate_ticker = yf.Ticker(pair)
                rate = rate_ticker.fast_info.get("lastPrice")
                if rate is None:
                    rate = rate_ticker.info.get("currentPrice")
            except Exception as e:
                print(f"Error fetching FX rate for {pair}: {e}")
                
            if rate is None:
                rate = FALLBACK_RATES.get(f"{curr}{base_currency}", 1.0)
                
            fx_rates[curr] = rate
            
        # 5. Calculate cost basis and current values in base_currency
        holdings_list = []
        total_cost_base = 0.0
        total_value_base = 0.0
        
        for symbol, txs in symbol_txs.items():
            shares_owned = 0.0
            cost_basis_base = 0.0
            
            for tx in txs:
                tx_shares = tx["shares"]
                tx_price = tx["price"]
                tx_fees = tx["fees"]
                tx_curr = tx["currency"].upper().strip()
                fx_tx_to_base = fx_rates.get(tx_curr, 1.0)
                
                # Transaction cost in base currency (fees added to cost basis)
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
                
                # Calculate average cost in native currency
                avg_cost_native = (cost_basis_base / shares_owned) / fx_native_to_base if fx_native_to_base > 0 else 0.0
                
                # Fallback live price if yfinance query failed
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
