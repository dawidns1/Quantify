import os
import json
import threading
import time
import csv
import io
import re
from datetime import datetime
from typing import List
import yfinance as yf
from fastapi import FastAPI, BackgroundTasks, HTTPException, Header, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import requests

import urllib3
import ssl

# Load environment variables manually first so they are available for SSL configuration
for path in ['.env', '../.env', 'backend/.env', '../frontend/.env.local', 'frontend/.env.local']:
    if os.path.exists(path):
        with open(path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ.setdefault(k.strip(), v.strip())

# Enforce SSL verification in production environments (like Vercel)
IS_PRODUCTION = os.environ.get("PRODUCTION") == "true" or os.environ.get("VERCEL") == "1" or os.environ.get("ENV") == "production"

if not IS_PRODUCTION:
    # Globally disable SSL verification warnings and certificate checks to prevent local machine errors
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    try:
        ssl._create_default_https_context = ssl._create_unverified_context
    except AttributeError:
        pass

# Globally patch requests.Session.request to default timeout to 5.0 seconds
# and conditionally disable SSL verification (only in development/local).
_original_session_request = requests.Session.request
def _patched_session_request(self, method, url, *args, **kwargs):
    if 'timeout' not in kwargs:
        kwargs['timeout'] = 5.0
    if not IS_PRODUCTION:
        self.verify = False
        if 'verify' in kwargs:
            kwargs['verify'] = False
    return _original_session_request(self, method, url, *args, **kwargs)
requests.Session.request = _patched_session_request

from backend.data_fetcher import run_screener_collection, WikipediaNasdaq100Provider, StockDataCollector
from backend.portfolio_manager import PortfolioManager
from backend.ai_client import generate_insights

def fetch_screener_data_from_supabase():
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_ANON_KEY")
    
    if not supabase_url or not supabase_key:
        return None
        
    try:
        url = f"{supabase_url}/rest/v1/screener_data?id=eq.1&select=data"
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}"
        }
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            rows = response.json()
            if rows and len(rows) > 0:
                return rows[0].get("data")
        print(f"[SUPABASE] Fetch returned status {response.status_code}")
    except Exception as e:
        print(f"[SUPABASE] Error fetching from Supabase: {e}")
    return None


class TransactionCreate(BaseModel):
    symbol: str
    type: str
    date: str
    shares: float
    price: float
    currency: str
    fees: float = 0.0
    account: str = "Default"

class TransactionItem(BaseModel):
    id: str
    symbol: str
    type: str
    date: str
    shares: float
    price: float
    currency: str
    fees: float = 0.0
    account: str = "Default"

class HoldingsRequest(BaseModel):
    base_currency: str = "PLN"
    account: str = "All"
    transactions: List[TransactionItem]
    link_cash: bool = False

app = FastAPI(title="Stock Screener API")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For local usage, allow all. Can restrict to ["http://localhost:5173"] in production.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def start_cache_warmer():
    def warmer_loop():
        print("[CACHE WARMER] Starting background cache warmer thread...")
        time.sleep(10)  # Wait for uvicorn to settle
        while True:
            try:
                from backend.cache_db import get_connection
                conn = get_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT symbol FROM live_prices WHERE symbol NOT LIKE 'CASH_%' AND symbol NOT LIKE '%=X'")
                rows = cursor.fetchall()
                symbols = [r["symbol"] for r in rows]
                conn.close()
                
                if symbols:
                    print(f"[CACHE WARMER] Warming cache for {len(symbols)} symbols: {symbols}")
                    fx_pairs = ["USDPLN=X", "EURPLN=X", "PLNUSD=X", "PLNEUR=X", "USDEUR=X", "EURUSD=X"]
                    
                    # Force a refresh in portfolio manager prefetch (by passing symbols)
                    PortfolioManager.prefetch_live_prices(symbols, fx_pairs)
                    
                    # Historical prefetch
                    from datetime import date, timedelta
                    start_dt = date.today() - timedelta(days=365)
                    end_dt = date.today()
                    PortfolioManager.prefetch_historical_stock_prices(symbols, start_dt, end_dt)
                    print("[CACHE WARMER] Cache warming cycle completed successfully.")
                else:
                    print("[CACHE WARMER] No cached symbols found in SQLite. Cache warming skipped.")
            except Exception as e:
                print(f"[CACHE WARMER] Error in cache warming cycle: {e}")
            
            # Sleep for 1 hour
            time.sleep(3600)
            
    thread = threading.Thread(target=warmer_loop, daemon=True)
    thread.start()

@app.on_event("startup")
def startup_event():
    # Purge any corrupted GBP cache rows for DTLA.L
    try:
        from backend.cache_db import get_connection
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM live_prices WHERE symbol = 'DTLA.L' AND native_currency = 'GBP'")
        count = cursor.fetchone()[0]
        if count > 0:
            print("[STARTUP] Purging corrupted GBP cache rows for DTLA.L...")
            cursor.execute("DELETE FROM live_prices WHERE symbol = 'DTLA.L'")
            cursor.execute("DELETE FROM daily_prices WHERE symbol = 'DTLA.L'")
            conn.commit()
        conn.close()
    except Exception as e:
        print(f"[STARTUP] Error purging DTLA.L cache: {e}")
        
    start_cache_warmer()

# If VERCEL environment is active, direct local writes to /tmp cache folder
if os.environ.get("VERCEL") == "1":
    DATA_DIR = "/tmp/data"
else:
    DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
    
DETAILS_DIR = os.path.join(DATA_DIR, 'details')
os.makedirs(DETAILS_DIR, exist_ok=True)


# In-memory lock to prevent concurrent refreshes
refresh_lock = threading.Lock()

def bg_refresh_task():
    """Background task runner for the crawler (Disabled)."""
    print("[REFRESH] Index constituent scraping is decommissioned.")
    return

@app.get("/api/stocks")
def get_stocks():
    # Return empty data structure as screener functionality has been decommissioned
    return {
        "metadata": {
            "last_updated": time.time(),
            "total_stocks": 0,
            "indicators": []
        },
        "stocks": []
    }

@app.get("/api/stocks/{ticker}")
def get_stock_detail(ticker: str):
    # Normalize ticker (e.g. AAPL)
    clean_ticker = ticker.upper().strip()
    file_path = os.path.join(DETAILS_DIR, f"{clean_ticker}.json")
    
    # Check if we need to fetch/regenerate details (missing, >24 hours old, or missing financials key)
    should_fetch = not os.path.exists(file_path)
    if not should_fetch:
        try:
            with open(file_path, 'r') as f:
                cached_data = json.load(f)
                if "financials" not in cached_data:
                    should_fetch = True
            
            if not should_fetch:
                file_age = time.time() - os.path.getmtime(file_path)
                if file_age > 86400:  # 24 hours
                    should_fetch = True
        except Exception:
            should_fetch = True
            
    if should_fetch:
        try:
            print(f"[{clean_ticker}] Detail cache missing or stale. Fetching on-demand...")
            collector = StockDataCollector()
            
            # Subclass to cache preloaded fields in a thread-safe local instance
            from backend.data_provider import YF_SESSION
            # Subclass to cache preloaded fields in a thread-safe local instance
            class SnappyTicker(yf.Ticker):
                def __init__(self, symbol, info_val, hist_val, fin_val, est_val, session=None):
                    super().__init__(symbol, session=session)
                    self._preloaded_info = info_val
                    self._preloaded_hist = hist_val
                    self._preloaded_fin = fin_val
                    self._preloaded_est = est_val
                
                @property
                def info(self):
                    return self._preloaded_info if self._preloaded_info is not None else super().info
                
                def history(self, *args, **kwargs):
                    if kwargs.get('period') == '3y' or (len(args) > 0 and args[0] == '3y'):
                        return self._preloaded_hist if self._preloaded_hist is not None else super().history(*args, **kwargs)
                    return super().history(*args, **kwargs)
                
                @property
                def financials(self):
                    return self._preloaded_fin if self._preloaded_fin is not None else super().financials
                
                @property
                def revenue_estimate(self):
                    return self._preloaded_est if self._preloaded_est is not None else super().revenue_estimate

            raw_ticker = yf.Ticker(clean_ticker, session=YF_SESSION)
            
            # Parallel preloading of yfinance data
            import concurrent.futures
            
            def load_info():
                try:
                    return raw_ticker.info
                except Exception as e:
                    print(f"[{clean_ticker}] Error preloading info: {e}")
                    return {}

            def load_history():
                try:
                    return raw_ticker.history(period="3y")
                except Exception as e:
                    print(f"[{clean_ticker}] Error preloading history: {e}")
                    return None

            def load_financials():
                try:
                    return raw_ticker.financials
                except Exception as e:
                    print(f"[{clean_ticker}] Error preloading financials: {e}")
                    return None

            def load_estimates():
                try:
                    return raw_ticker.revenue_estimate
                except Exception as e:
                    return None

            print(f"[{clean_ticker}] Preloading yfinance data concurrently...")
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
                future_info = executor.submit(load_info)
                future_hist = executor.submit(load_history)
                future_fin = executor.submit(load_financials)
                future_est = executor.submit(load_estimates)
                
                preloaded_info = future_info.result()
                preloaded_hist = future_hist.result()
                preloaded_fin = future_fin.result()
                preloaded_est = future_est.result()
            print(f"[{clean_ticker}] Preloading complete.")
            
            ticker_obj = SnappyTicker(clean_ticker, preloaded_info, preloaded_hist, preloaded_fin, preloaded_est, session=YF_SESSION)
            
            # Retrieve cached overview metrics from screener_data.json if available
            overview = None
            screener_data_path = os.path.join(DATA_DIR, 'screener_data.json')
            if os.path.exists(screener_data_path):
                try:
                    with open(screener_data_path, 'r') as sf:
                        sd = json.load(sf)
                        for s in sd.get('stocks', []):
                            if s.get('symbol') == clean_ticker:
                                overview = s
                                break
                except Exception as cache_err:
                    print(f"[{clean_ticker}] Error reading overview cache: {cache_err}")
            
            # Fetch overview if not found in cache
            if not overview:
                overview = collector.fetch_stock_overview(ticker_obj)
                
            market_cap_safe = overview.get("market_cap") or 0.0
            price_safe = overview.get("price") or 1.0
            shares = market_cap_safe / price_safe if price_safe else 1.0
            history_data = collector.fetch_historical_detail(ticker_obj, shares)
            financials_data = collector.fetch_annual_financials(ticker_obj)
            
            if len(history_data) > 0 or not os.path.exists(file_path):
                payload = {
                    "symbol": clean_ticker,
                    "name": overview.get("name"),
                    "overview": overview,
                    "history": history_data,
                    "financials": financials_data
                }
                with open(file_path, 'w') as f:
                    json.dump(payload, f, indent=2)
                print(f"[{clean_ticker}] Details cached successfully on-demand.")
            else:
                print(f"[{clean_ticker}] Empty history returned. Reusing stale cached file.")
        except Exception as e:
            print(f"[{clean_ticker}] Error during on-demand detail generation: {e}")
            if not os.path.exists(file_path):
                raise HTTPException(status_code=500, detail=f"Error generating stock details: {str(e)}")
            else:
                print(f"[{clean_ticker}] Falling back to stale detail cache.")
                
    try:
        with open(file_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading stock details: {str(e)}")

@app.get("/api/stocks/{ticker}/price")
def get_stock_price(ticker: str):
    clean_ticker = ticker.upper().strip()
    try:
        from backend.data_provider import YF_SESSION
        ticker_obj = yf.Ticker(clean_ticker, session=YF_SESSION)
        fast = None
        try:
            fast = ticker_obj.fast_info
        except Exception:
            pass
            
        price = fast.get('lastPrice') if fast else None
        if price is None:
            try:
                price = ticker_obj.info.get('currentPrice') or ticker_obj.info.get('regularMarketPrice')
            except Exception:
                price = None
                
        timezone = (fast.get("timezone") if fast else None) or "UTC"
        exchange = (fast.get("exchange") if fast else None) or ""
        
        info_curr = None
        try:
            info_curr = ticker_obj.info.get("currency")
        except Exception:
            pass
        currency = (fast.get("currency") if fast else None) or info_curr or "USD"
        
        is_open = PortfolioManager.is_market_open(timezone, exchange, clean_ticker)
            
        return {
            "symbol": clean_ticker,
            "price": price,
            "currency": currency.upper().strip(),
            "is_market_open": is_open,
            "timestamp": time.time()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching real-time price: {str(e)}")

@app.get("/api/watchlist/prices")
def get_watchlist_prices(symbols: str):
    if not symbols:
        return []
    clean_symbols = [s.upper().strip() for s in symbols.split(",") if s.strip()]
    results = []
    
    # 1. Prefetch using PortfolioManager (queries L1/L2 cache, fetches expired/missing in bulk)
    try:
        PortfolioManager.prefetch_live_prices(clean_symbols[:15], [])
    except Exception as prefetch_err:
        print(f"Error prefetching watchlist prices: {prefetch_err}")
        
    for sym in clean_symbols[:15]:
        try:
            info = PortfolioManager.get_cached_live_ticker(sym)
            price = info.get("live_price")
            prev_close = info.get("previous_close")
            currency = info.get("native_currency", "USD")
            timezone = info.get("timezone", "UTC")
            exchange = info.get("exchange", "")
            
            is_open = PortfolioManager.is_market_open(timezone, exchange, sym)
            
            change_pct = 0.0
            if price is not None and prev_close:
                change_pct = ((price - prev_close) / prev_close) * 100.0
                
            results.append({
                "symbol": sym,
                "price": price,
                "currency": currency.upper().strip() if currency else "USD",
                "change_percent": change_pct,
                "is_market_open": is_open
            })
        except Exception as e:
            print(f"Error fetching watchlist price for {sym}: {e}")
            results.append({
                "symbol": sym,
                "price": None,
                "currency": "USD",
                "change_percent": 0.0,
                "is_market_open": False,
                "error": str(e)
            })
    return results

@app.get("/api/status")
def get_status():
    file_path = os.path.join(DATA_DIR, 'status.json')
    if not os.path.exists(file_path):
        return {
            "is_running": False,
            "message": "Ready to screen stocks",
            "progress": 0,
            "total": 0,
            "error": None
        }
    try:
        with open(file_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        return {
            "is_running": False,
            "message": "Error reading status",
            "progress": 0,
            "total": 0,
            "error": str(e)
        }

@app.post("/api/refresh")
def trigger_refresh(background_tasks: BackgroundTasks, force: bool = False):
    return {"status": "ok", "message": "Scraper is decommissioned. Fetching stock indicators is disabled."}

# ==========================================
# Portfolio APIs
# ==========================================

@app.get("/api/portfolio/transactions")
def get_portfolio_transactions():
    try:
        return PortfolioManager.get_transactions()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching transactions: {str(e)}")

@app.post("/api/portfolio/transactions")
def add_portfolio_transaction(tx: TransactionCreate):
    try:
        new_tx = PortfolioManager.add_transaction(
            symbol=tx.symbol,
            tx_type=tx.type,
            date=tx.date,
            shares=tx.shares,
            price=tx.price,
            currency=tx.currency,
            fees=tx.fees,
            account=tx.account
        )
        return {"status": "ok", "transaction": new_tx}
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error adding transaction: {str(e)}")

@app.delete("/api/portfolio/transactions/{tx_id}")
def delete_portfolio_transaction(tx_id: str):
    try:
        success = PortfolioManager.delete_transaction(tx_id)
        if not success:
            raise HTTPException(status_code=404, detail="Transaction not found")
        return {"status": "ok", "message": "Transaction deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting transaction: {str(e)}")

@app.get("/api/portfolio/holdings")
def get_portfolio_holdings(base_currency: str = "PLN", account: str = "All"):
    try:
        return PortfolioManager.get_holdings(base_currency, account)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching holdings: {str(e)}")

@app.post("/api/portfolio/holdings")
def calculate_portfolio_holdings(req: HoldingsRequest):
    try:
        tx_dicts = []
        for tx in req.transactions:
            tx_dicts.append({
                "id": tx.id,
                "symbol": tx.symbol,
                "type": tx.type,
                "date": tx.date,
                "shares": tx.shares,
                "price": tx.price,
                "currency": tx.currency,
                "fees": tx.fees,
                "account": tx.account
            })
        return PortfolioManager.calculate_holdings(tx_dicts, req.base_currency, req.account, req.link_cash)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating holdings: {str(e)}")

@app.post("/api/portfolio/historical")
def calculate_historical_portfolio_nav(req: HoldingsRequest):
    try:
        tx_dicts = []
        for tx in req.transactions:
            tx_dicts.append({
                "id": tx.id,
                "symbol": tx.symbol,
                "type": tx.type,
                "date": tx.date,
                "shares": tx.shares,
                "price": tx.price,
                "currency": tx.currency,
                "fees": tx.fees,
                "account": tx.account
            })
        return PortfolioManager.calculate_historical_performance(tx_dicts, req.base_currency, req.account, req.link_cash)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating historical performance: {str(e)}")

def fetch_transactions_from_supabase(jwt_token: str, portfolio_id: str, supabase_url: str = None, supabase_key: str = None) -> list:
    url_val = supabase_url or os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key_val = supabase_key or os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")
    
    print(f"[DEBUG] fetch_transactions_from_supabase url={url_val} portfolio={portfolio_id}")
    print(f"[DEBUG] Authorization: {jwt_token[:30]}..." if jwt_token else "[DEBUG] Authorization: None")
    
    if not url_val or not key_val:
        print("[DEBUG] Supabase env variables missing!")
        raise HTTPException(status_code=500, detail="Supabase environment variables not configured on backend.")
        
    url = f"{url_val}/rest/v1/transactions"
    if portfolio_id != 'all':
        url += f"?portfolio_id=eq.{portfolio_id}"
        
    headers = {
        "apikey": key_val,
        "Authorization": jwt_token
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        print(f"[DEBUG] Supabase response code: {response.status_code}")
        if response.status_code != 200:
            print(f"[DEBUG] Supabase error response: {response.text}")
            raise HTTPException(
                status_code=response.status_code, 
                detail=f"Failed to fetch transactions from Supabase: {response.text}"
            )
        data = response.json()
        print(f"[DEBUG] Fetched {len(data)} transactions from Supabase")
        if data:
            print(f"[DEBUG] First transaction structure: {data[0]}")
            print(f"[DEBUG] Types: symbol={type(data[0].get('symbol'))}, shares={type(data[0].get('shares'))}, price={type(data[0].get('price'))}")
        return data
    except requests.exceptions.RequestException as req_err:
        print(f"[DEBUG] Network error contacting Supabase: {req_err}")
        raise HTTPException(status_code=500, detail=f"Network error contacting Supabase: {str(req_err)}")

def fetch_portfolio_settings_from_supabase(jwt_token: str, portfolio_id: str, supabase_url: str = None, supabase_key: str = None) -> dict:
    url_val = supabase_url or os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key_val = supabase_key or os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")
    if not url_val or not key_val or portfolio_id == 'all':
        return {}
        
    url = f"{url_val}/rest/v1/portfolios?id=eq.{portfolio_id}&select=settings"
    headers = {
        "apikey": key_val,
        "Authorization": jwt_token
    }
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data and len(data) > 0:
                return data[0].get("settings") or {}
        elif response.status_code == 400:
            print(f"[DEBUG] settings column missing or other bad request. Falling back. Code: {response.status_code}")
    except Exception as e:
        print(f"[DEBUG] Error fetching portfolio settings from Supabase: {e}")
    return {}

@app.get("/api/portfolio/{portfolio_id}/holdings")
def get_portfolio_holdings_jwt(
    portfolio_id: str,
    base_currency: str = "PLN",
    account: str = "All",
    link_cash: bool = False,
    authorization: str = Header(None),
    x_supabase_url: str = Header(None),
    x_supabase_anon_key: str = Header(None)
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")
        
    try:
        transactions = fetch_transactions_from_supabase(authorization, portfolio_id, x_supabase_url, x_supabase_anon_key)
        settings = fetch_portfolio_settings_from_supabase(authorization, portfolio_id, x_supabase_url, x_supabase_anon_key)
        res = PortfolioManager.calculate_holdings(transactions, base_currency, account, link_cash, settings)
        print(f"[DEBUG] Holdings response summary: {res.get('summary')}")
        print(f"[DEBUG] Holdings count: {len(res.get('holdings', []))}")
        if res.get('holdings'):
            print(f"[DEBUG] First holding position: {res.get('holdings')[0]}")
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating holdings: {str(e)}")

@app.get("/api/portfolio/{portfolio_id}/historical")
def get_historical_portfolio_nav_jwt(
    portfolio_id: str,
    base_currency: str = "PLN",
    account: str = "All",
    link_cash: bool = False,
    benchmarks: str = "",
    authorization: str = Header(None),
    x_supabase_url: str = Header(None),
    x_supabase_anon_key: str = Header(None)
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")
        
    try:
        transactions = fetch_transactions_from_supabase(authorization, portfolio_id, x_supabase_url, x_supabase_anon_key)
        settings = fetch_portfolio_settings_from_supabase(authorization, portfolio_id, x_supabase_url, x_supabase_anon_key)
        benchmarks_list = [b.upper().strip() for b in benchmarks.split(",") if b.strip()] if benchmarks else None
        return PortfolioManager.calculate_historical_performance(transactions, base_currency, account, link_cash, settings, benchmarks_list)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating historical performance: {str(e)}")

@app.get("/api/portfolio/{portfolio_id}/analytics")
def get_portfolio_analytics_jwt(
    portfolio_id: str,
    base_currency: str = "PLN",
    account: str = "All",
    link_cash: bool = False,
    authorization: str = Header(None),
    x_supabase_url: str = Header(None),
    x_supabase_anon_key: str = Header(None)
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")
        
    try:
        transactions = fetch_transactions_from_supabase(authorization, portfolio_id, x_supabase_url, x_supabase_anon_key)
        settings = fetch_portfolio_settings_from_supabase(authorization, portfolio_id, x_supabase_url, x_supabase_anon_key)
        return PortfolioManager.calculate_portfolio_analytics(transactions, base_currency, account, link_cash, settings)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating portfolio analytics: {str(e)}")

@app.get("/api/portfolio/{portfolio_id}/dividend-forecast")
def get_portfolio_dividend_forecast_jwt(
    portfolio_id: str,
    base_currency: str = "PLN",
    account: str = "All",
    link_cash: bool = False,
    authorization: str = Header(None),
    x_supabase_url: str = Header(None),
    x_supabase_anon_key: str = Header(None)
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")
        
    try:
        transactions = fetch_transactions_from_supabase(authorization, portfolio_id, x_supabase_url, x_supabase_anon_key)
        settings = fetch_portfolio_settings_from_supabase(authorization, portfolio_id, x_supabase_url, x_supabase_anon_key)
        return PortfolioManager.calculate_dividend_forecast(transactions, base_currency, account, link_cash, settings)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating dividend forecast: {str(e)}")

@app.get("/api/portfolio/{portfolio_id}/upcoming-events")
def get_upcoming_events_jwt(
    portfolio_id: str,
    base_currency: str = "PLN",
    account: str = "All",
    link_cash: bool = False,
    authorization: str = Header(None),
    x_supabase_url: str = Header(None),
    x_supabase_anon_key: str = Header(None)
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")
        
    try:
        # 1. Fetch transactions and settings
        transactions = fetch_transactions_from_supabase(authorization, portfolio_id, x_supabase_url, x_supabase_anon_key)
        settings = fetch_portfolio_settings_from_supabase(authorization, portfolio_id, x_supabase_url, x_supabase_anon_key)
        
        # 2. Calculate holdings to get active share counts
        res = PortfolioManager.calculate_holdings(transactions, base_currency, account, link_cash, settings)
        holdings = res.get("holdings", [])
        
        # 3. Filter active stock holdings (exclude cash or empty positions)
        active_holdings = []
        for h in holdings:
            symbol = h.get("symbol")
            shares = h.get("shares", 0.0)
            if symbol and symbol.upper() != "CASH" and shares > 0.0:
                active_holdings.append({
                    "symbol": symbol,
                    "shares": shares
                })
                
        # 4. Get sorted upcoming events
        events = PortfolioManager.get_upcoming_events(active_holdings)
        return events
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating upcoming events: {str(e)}")

@app.get("/api/portfolio/search")
def search_portfolio_assets(q: str):
    if not q or len(q.strip()) < 2:
        return []
    clean_q = q.strip()
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    url = f"https://query2.finance.yahoo.com/v1/finance/search?q={clean_q}&quotesCount=8&newsCount=0"
    try:
        import requests
        response = requests.get(url, headers=headers, verify=False)
        if response.status_code != 200:
            return []
        data = response.json()
        quotes = data.get("quotes", [])
        
        results = []
        for quote in quotes:
            # Keep equities, ETFs, mutual funds
            q_type = quote.get("quoteType", "")
            if q_type not in ["EQUITY", "ETF", "MUTUALFUND"]:
                continue
                
            results.append({
                "symbol": quote.get("symbol", ""),
                "name": quote.get("longname") or quote.get("shortname") or quote.get("symbol", ""),
                "exchange": quote.get("exchange", ""),
                "exchDisp": quote.get("exchDisp", "")
            })
        return results
    except Exception as e:
        print(f"Error querying search suggestions: {e}")
        return []

class FeedbackCreate(BaseModel):
    category: str
    message: str
    email: str = None
    metadata: dict = None

@app.post("/api/feedback")
def submit_feedback(fb: FeedbackCreate, authorization: str = Header(None)):
    print(f"[FEEDBACK] Received feedback. Category: {fb.category}, Email: {fb.email}")
    print(f"[FEEDBACK] Message: {fb.message}")
    if fb.metadata:
        print(f"[FEEDBACK] Metadata: {fb.metadata}")
    
    # Save locally to JSON file
    try:
        feedback_dir = os.path.join(DATA_DIR, 'feedback')
        os.makedirs(feedback_dir, exist_ok=True)
        filename = f"feedback_{int(time.time())}_{str(time.time()).split('.')[-1]}.json"
        filepath = os.path.join(feedback_dir, filename)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump({
                "timestamp": time.time(),
                "category": fb.category,
                "email": fb.email,
                "message": fb.message,
                "metadata": fb.metadata
            }, f, indent=2)
        print(f"[FEEDBACK] Saved locally to {filepath}")
    except Exception as e:
        print(f"[FEEDBACK] Error saving locally: {e}")
        
    # Save to Supabase if configured
    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")
    
    if supabase_url and supabase_key:
        try:
            url = f"{supabase_url}/rest/v1/feedback"
            headers = {
                "apikey": supabase_key,
                "Authorization": authorization if authorization else f"Bearer {supabase_key}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal"
            }
            supabase_payload = {
                "category": fb.category,
                "message": fb.message,
                "user_email": fb.email
            }
            if fb.metadata:
                supabase_payload["metadata"] = fb.metadata
            res = requests.post(url, headers=headers, json=supabase_payload, timeout=10)
            print(f"[FEEDBACK] Supabase insertion response code: {res.status_code}")
        except Exception as e:
            print(f"[FEEDBACK] Error sending to Supabase: {e}")
            
    return {"status": "ok", "message": "Feedback submitted successfully"}

def parse_transactions_csv(csv_content: str):
    f = io.StringIO(csv_content.strip())
    reader = csv.reader(f)
    try:
        headers = next(reader)
    except StopIteration:
        raise ValueError("The uploaded CSV file is empty.")
    
    headers_clean = [h.strip().lower() for h in headers]
    
    broker = "generic"
    if any("volume" in h for h in headers_clean) and any("open price" in h for h in headers_clean) and any("symbol" in h for h in headers_clean):
        broker = "xtb"
    elif any("price per share" in h for h in headers_clean) and any("ticker" in h for h in headers_clean):
        broker = "revolut"
    elif any("ib commission" in h for h in headers_clean) or (any("quantity" in h for h in headers_clean) and any("asset class" in h for h in headers_clean)):
        broker = "ibkr"
    elif any("isin" in h for h in headers_clean) and any("no. of shares" in h for h in headers_clean):
        broker = "trading212"
    elif any("aantal" in h for h in headers_clean) and any("koers" in h for h in headers_clean):
        broker = "degiro"
    elif any("kierunek" in h for h in headers_clean) and any("papier" in h for h in headers_clean):
        broker = "emakler"
    
    print(f"[CSV IMPORT] Detected broker: {broker} from headers: {headers_clean}")
    
    parsed_transactions = []
    f.seek(0)
    first_char = f.read(1)
    if first_char != '\ufeff':
        f.seek(0)
        
    dict_reader = csv.DictReader(f)
    
    for row_idx, row in enumerate(dict_reader):
        try:
            symbol = ""
            tx_type = "BUY"
            tx_date = ""
            shares = 0.0
            price = 0.0
            fees = 0.0
            currency = "USD"
            
            if broker == "xtb":
                raw_time = row.get("Time") or row.get("time") or ""
                raw_type = row.get("Type") or row.get("type") or ""
                raw_symbol = row.get("Symbol") or row.get("symbol") or ""
                raw_vol = row.get("Volume") or row.get("volume") or "0"
                raw_price = row.get("Open price") or row.get("open price") or "0"
                raw_comm = row.get("Commission") or row.get("commission") or "0"
                
                symbol = raw_symbol.strip().upper()
                if symbol.endswith(".US"):
                    symbol = symbol[:-3]
                elif symbol.endswith(".PL"):
                    symbol = symbol[:-3] + ".WA"
                
                tx_type = "SELL" if "sell" in raw_type.lower() else "BUY"
                shares = float(raw_vol)
                price = float(raw_price)
                fees = float(raw_comm)
                if raw_time:
                    tx_date = raw_time.split()[0]
                    
            elif broker == "revolut":
                raw_date = row.get("Date") or row.get("date") or ""
                raw_ticker = row.get("Ticker") or row.get("ticker") or row.get("Symbol") or row.get("symbol") or ""
                raw_type = row.get("Type") or row.get("type") or ""
                raw_qty = row.get("Quantity") or row.get("quantity") or "0"
                raw_price = row.get("Price per share") or row.get("price per share") or row.get("Price") or row.get("price") or "0"
                raw_fees = row.get("Fees") or row.get("fees") or row.get("Commission") or row.get("commission") or "0"
                raw_curr = row.get("Currency") or row.get("currency") or "USD"
                
                symbol = raw_ticker.strip().upper()
                tx_type = "SELL" if "sell" in raw_type.lower() else "BUY"
                shares = float(raw_qty)
                price = float(raw_price)
                fees = float(raw_fees)
                currency = raw_curr.strip().upper()
                
                if raw_date:
                    raw_date_clean = raw_date.split()[0]
                    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d.%m.%Y"):
                        try:
                            dt = datetime.strptime(raw_date_clean, fmt)
                            tx_date = dt.strftime("%Y-%m-%d")
                            break
                        except ValueError:
                            continue
                    if not tx_date:
                        tx_date = raw_date_clean
                        
            elif broker == "ibkr":
                raw_symbol = row.get("Symbol") or row.get("symbol") or ""
                raw_datetime = row.get("Date/Time") or row.get("date/time") or row.get("time") or ""
                raw_qty = row.get("Quantity") or row.get("quantity") or "0"
                raw_price = row.get("Trade Price") or row.get("trade price") or row.get("price") or "0"
                raw_comm = row.get("IB Commission") or row.get("ib commission") or row.get("commission") or "0"
                raw_curr = row.get("Currency") or row.get("currency") or "USD"
                
                symbol = raw_symbol.strip().upper()
                qty_val = float(raw_qty)
                tx_type = "SELL" if qty_val < 0 else "BUY"
                shares = abs(qty_val)
                price = float(raw_price)
                fees = abs(float(raw_comm))
                currency = raw_curr.strip().upper()
                
                if raw_datetime:
                    tx_date = raw_datetime.replace(",", "").split()[0]
                    
            elif broker == "trading212":
                raw_ticker = row.get("Ticker") or row.get("ticker") or ""
                raw_action = row.get("Action") or row.get("action") or ""
                raw_time = row.get("Time") or row.get("time") or ""
                raw_qty = row.get("No. of shares") or row.get("no. of shares") or "0"
                raw_price = row.get("Price / share") or row.get("price / share") or "0"
                raw_fee = row.get("Transaction fee") or row.get("transaction fee") or row.get("Fee") or row.get("fee") or "0"
                raw_curr = row.get("Currency (Price / share)") or row.get("currency (price / share)") or "USD"
                
                if not any(x in raw_action.lower() for x in ("buy", "kupno", "sell", "sprzedaż")):
                    continue
                    
                symbol = raw_ticker.strip().upper()
                tx_type = "SELL" if "sell" in raw_action.lower() or "sprzedaż" in raw_action.lower() else "BUY"
                shares = float(raw_qty)
                price = float(raw_price)
                fees = float(raw_fee)
                currency = raw_curr.strip().upper()
                
                if raw_time:
                    tx_date = raw_time.split()[0]
                    
            elif broker == "degiro":
                raw_product = row.get("Product") or row.get("product") or ""
                raw_symbol = row.get("Symbol") or row.get("symbol") or ""
                raw_date = row.get("Datum") or row.get("datum") or row.get("Date") or row.get("date") or ""
                raw_qty = row.get("Aantal") or row.get("aantal") or row.get("Quantity") or row.get("quantity") or "0"
                raw_price = row.get("Koers") or row.get("koers") or row.get("Price") or row.get("price") or "0"
                raw_fee = row.get("Kosten") or row.get("kosten") or row.get("Transaction fee") or "0"
                raw_curr = row.get("Valuta") or row.get("valuta") or row.get("Currency") or "EUR"
                
                symbol = raw_symbol.strip().upper() if raw_symbol else raw_product.strip().upper()
                qty_val = float(raw_qty)
                tx_type = "SELL" if qty_val < 0 else "BUY"
                shares = abs(qty_val)
                price = float(raw_price)
                fees = abs(float(raw_fee))
                currency = raw_curr.strip().upper()
                
                if raw_date:
                    raw_date_clean = raw_date.split()[0]
                    for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y"):
                        try:
                            dt = datetime.strptime(raw_date_clean, fmt)
                            tx_date = dt.strftime("%Y-%m-%d")
                            break
                        except ValueError:
                            continue
                            
            elif broker == "emakler":
                raw_papier = row.get("Papier") or row.get("papier") or ""
                raw_kierunek = row.get("Kierunek") or row.get("kierunek") or ""
                raw_date = row.get("Data transakcji") or row.get("data transakcji") or row.get("Data") or row.get("data") or ""
                raw_qty = row.get("Ilość") or row.get("ilość") or row.get("ilosc") or "0"
                raw_price = row.get("Cena") or row.get("cena") or "0"
                raw_fee = row.get("Prowizja") or row.get("prowizja") or "0"
                raw_curr = row.get("Waluta") or row.get("waluta") or "PLN"
                
                symbol = raw_papier.strip().upper().split(":")[0]
                tx_type = "SELL" if "sprzedaż" in raw_kierunek.lower() or "sell" in raw_kierunek.lower() or raw_kierunek.lower().startswith("s") else "BUY"
                shares = float(raw_qty)
                price = float(raw_price)
                fees = float(raw_fee)
                currency = raw_curr.strip().upper()
                
                if raw_date:
                    raw_date_clean = raw_date.split()[0]
                    for fmt in ("%d.%m.%Y", "%Y-%m-%d", "%d/%m/%Y"):
                        try:
                            dt = datetime.strptime(raw_date_clean, fmt)
                            tx_date = dt.strftime("%Y-%m-%d")
                            break
                        except ValueError:
                            continue
                    
            else: # generic fallback
                date_key = next((k for k in row.keys() if k and any(x in k.lower() for x in ("date", "time", "data", "timestamp", "trans. date", "transaction date"))), None)
                ticker_key = next((k for k in row.keys() if k and any(x in k.lower() for x in ("ticker", "symbol", "instrument", "akcja", "walor", "isin", "name", "security", "asset"))), None)
                type_key = next((k for k in row.keys() if k and any(x in k.lower() for x in ("type", "action", "transakcja", "operacja", "direction", "kierunek"))), None)
                shares_key = next((k for k in row.keys() if k and any(x in k.lower() for x in ("shares", "quantity", "vol", "ilość", "ilosc", "qty", "volume", "no. of shares", "amount", "aantal"))), None)
                price_key = next((k for k in row.keys() if k and any(x in k.lower() for x in ("price", "rate", "kurs", "cena", "koers", "trade price", "price / share"))), None)
                fees_key = next((k for k in row.keys() if k and any(x in k.lower() for x in ("fee", "comm", "prov", "prowizja", "commission", "transaction fee", "kosten"))), None)
                curr_key = next((k for k in row.keys() if k and any(x in k.lower() for x in ("curr", "waluta", "currency", "valuta"))), None)
                
                
                symbol = row.get(ticker_key, "").strip().upper() if ticker_key else ""
                raw_type = row.get(type_key, "") if type_key else ""
                tx_type = "SELL" if any(x in raw_type.lower() for x in ("sell", "sprzedaj", "s")) else "BUY"
                shares = float(row.get(shares_key, "0")) if shares_key else 0.0
                price = float(row.get(price_key, "0")) if price_key else 0.0
                fees = abs(float(row.get(fees_key, "0"))) if fees_key else 0.0
                currency = row.get(curr_key, "USD").strip().upper() if curr_key else "USD"
                
                raw_date = row.get(date_key, "") if date_key else ""
                if raw_date:
                    raw_date_clean = raw_date.split()[0].replace(",", "")
                    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d.%m.%Y", "%Y/%m/%d"):
                        try:
                            dt = datetime.strptime(raw_date_clean, fmt)
                            tx_date = dt.strftime("%Y-%m-%d")
                            break
                        except ValueError:
                            continue
                    if not tx_date:
                        tx_date = raw_date_clean
            
            if not symbol or shares <= 0 or price <= 0:
                continue
                
            if not tx_date or not re.match(r"^\d{4}-\d{2}-\d{2}$", tx_date):
                tx_date = datetime.today().strftime("%Y-%m-%d")
                
            parsed_transactions.append({
                "symbol": symbol,
                "type": tx_type,
                "date": tx_date,
                "shares": shares,
                "price": price,
                "fees": fees,
                "currency": currency,
                "account": "Imported Account"
            })
            
        except Exception as row_err:
            print(f"[CSV IMPORT] Error parsing row {row_idx}: {row_err}")
            continue
            
    return parsed_transactions, broker

@app.post("/api/portfolio/{portfolio_id}/import-csv")
async def import_portfolio_csv(portfolio_id: str, file: UploadFile = File(...)):
    try:
        content = await file.read()
        try:
            csv_content = content.decode("utf-8")
        except Exception:
            # Fallback to latin-1 / windows-1250 if UTF-8 fails (e.g. Polish Excel CSV)
            csv_content = content.decode("latin-1")
    except Exception as read_err:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(read_err)}")
            
    try:
        transactions, broker = parse_transactions_csv(csv_content)
        return {
            "status": "ok",
            "broker": broker,
            "count": len(transactions),
            "transactions": transactions
        }
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error parsing CSV file: {str(e)}")

AI_CACHE_TTL = 12 * 3600  # 12 hours
ai_insights_cache = {}    # Key: (portfolio_id, base_currency, account, link_cash, lang) -> (timestamp, response)

@app.get("/api/portfolio/{portfolio_id}/ai-insights")
def get_portfolio_ai_insights_jwt(
    portfolio_id: str,
    base_currency: str = "PLN",
    account: str = "All",
    link_cash: bool = False,
    lang: str = "en",
    force_refresh: bool = False,
    authorization: str = Header(None),
    x_supabase_url: str = Header(None),
    x_supabase_anon_key: str = Header(None)
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")
        
    cache_key = (portfolio_id, base_currency, account, link_cash, lang)
    now = time.time()
    
    if not force_refresh and cache_key in ai_insights_cache:
        cached_time, cached_res = ai_insights_cache[cache_key]
        if now - cached_time < AI_CACHE_TTL:
            print(f"[AI INSIGHTS] Returning cached insights for portfolio {portfolio_id}")
            return {"status": "ok", "insights": cached_res, "cached": True}
            
    try:
        # 1. Fetch transactions and settings
        transactions = fetch_transactions_from_supabase(authorization, portfolio_id, x_supabase_url, x_supabase_anon_key)
        settings = fetch_portfolio_settings_from_supabase(authorization, portfolio_id, x_supabase_url, x_supabase_anon_key)
        
        # 2. Run holdings calculations
        holdings_res = PortfolioManager.calculate_holdings(transactions, base_currency, account, link_cash, settings)
        holdings = holdings_res.get("holdings", [])
        summary = holdings_res.get("summary", {})
        
        # 3. Filter active stock holdings
        active_holdings = []
        weights_by_symbol = {}
        total_value = summary.get("total_value", 0.0)
        
        for h in holdings:
            symbol = h.get("symbol")
            shares = h.get("shares", 0.0)
            val = h.get("current_value_base", 0.0)
            if symbol and symbol.upper() != "CASH" and shares > 0.0:
                active_holdings.append({
                    "symbol": symbol,
                    "shares": shares
                })
                if total_value > 0:
                    weights_by_symbol[symbol] = round(val / total_value, 4)
                    
        # 4. Currency allocations
        allocation_by_currency = {}
        for h in holdings:
            curr = h.get("currency", "USD").upper()
            val = h.get("current_value_base", 0.0)
            if total_value > 0:
                allocation_by_currency[curr] = allocation_by_currency.get(curr, 0.0) + (val / total_value)
        # Round values
        for c in allocation_by_currency:
            allocation_by_currency[c] = round(allocation_by_currency[c], 4)
            
        # 5. Run analytics calculations
        analytics_res = PortfolioManager.calculate_portfolio_analytics(transactions, base_currency, account, link_cash, settings)
        
        # Calculate average correlation
        matrix = analytics_res.get("correlation_matrix", {}).get("matrix", {})
        corr_vals = []
        for s1, peers in matrix.items():
            for s2, v in peers.items():
                if s1 != s2 and v is not None:
                    corr_vals.append(v)
        avg_corr = sum(corr_vals) / len(corr_vals) if corr_vals else 0.0
        
        # 6. Fetch ex-dividend events
        raw_events = PortfolioManager.get_upcoming_events(active_holdings)
        ex_div_events = []
        for ev in raw_events:
            if ev.get("type") == "dividend":
                ex_div_events.append({
                    "symbol": ev.get("symbol"),
                    "ex_date": ev.get("date"),
                    "amount": ev.get("value")
                })
                
        # 7. Compile state payload
        portfolio_state = {
            "base_currency": base_currency,
            "total_holdings_count": len(active_holdings),
            "weights_by_symbol": weights_by_symbol,
            "allocation_by_currency": allocation_by_currency,
            "portfolio_beta": round(analytics_res.get("beta", 1.0), 3),
            "sharpe_ratio": round(analytics_res.get("sharpe_ratio", 0.0), 3),
            "average_holding_correlation": round(avg_corr, 3),
            "upcoming_ex_dividend_events": ex_div_events[:5]  # send top 5 events
        }
        
        # 8. Generate insights using Gemini
        insights_text = generate_insights(portfolio_state, lang)
        
        # 9. Save to cache
        ai_insights_cache[cache_key] = (now, insights_text)
        
        return {"status": "ok", "insights": insights_text, "cached": False}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating AI insights: {str(e)}")

@app.get("/api/portfolio/{portfolio_id}/calendar.ics")
def get_portfolio_dividend_calendar_ics(
    portfolio_id: str,
    token: str = None,
    authorization: str = Header(None),
    x_supabase_url: str = Header(None),
    x_supabase_anon_key: str = Header(None)
):
    jwt_token = authorization or token
    if not jwt_token:
        raise HTTPException(status_code=401, detail="Authentication token missing")
        
    if jwt_token and not jwt_token.startswith("Bearer "):
        jwt_token = f"Bearer {jwt_token}"
        
    try:
        transactions = fetch_transactions_from_supabase(jwt_token, portfolio_id, x_supabase_url, x_supabase_anon_key)
        settings = fetch_portfolio_settings_from_supabase(jwt_token, portfolio_id, x_supabase_url, x_supabase_anon_key)
        
        # Calculate holdings (with USD baseline to safely compile everything)
        res = PortfolioManager.calculate_holdings(transactions, "USD", "All", False, settings)
        holdings = res.get("holdings", [])
        
        active_holdings = []
        for h in holdings:
            symbol = h.get("symbol")
            shares = h.get("shares", 0.0)
            if symbol and symbol.upper() != "CASH" and shares > 0.0:
                active_holdings.append({
                    "symbol": symbol,
                    "shares": shares
                })
                
        events = PortfolioManager.get_upcoming_events(active_holdings)
        
        ics_lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//QuantiFi//Dividend Feed//EN",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH"
        ]
        
        for idx, ev in enumerate(events):
            if ev.get("type") == "dividend":
                symbol = ev.get("symbol")
                event_date = ev.get("date")
                amount = ev.get("value", 0.0)
                
                # Retrieve active shares owned for this event
                shares_owned = 0.0
                for h in active_holdings:
                    if h["symbol"] == symbol:
                        shares_owned = h["shares"]
                        break
                        
                total_pay = amount * shares_owned
                curr = ev.get("currency", "USD")
                
                if not event_date:
                    continue
                    
                date_clean = event_date.replace("-", "")
                
                uid = f"div-{symbol}-{date_clean}-{idx}@quantifi"
                summary = f"Dividend Ex-Date: {symbol} ({curr} {amount:.2f}/sh)"
                desc = f"Ex-dividend date for {symbol}.\\nExpected payout: {curr} {total_pay:.2f} based on {shares_owned:.2f} shares owned."
                
                ics_lines.extend([
                    "BEGIN:VEVENT",
                    f"UID:{uid}",
                    f"DTSTART;VALUE=DATE:{date_clean}",
                    f"DTEND;VALUE=DATE:{date_clean}",
                    f"SUMMARY:{summary}",
                    f"DESCRIPTION:{desc}",
                    "END:VEVENT"
                ])
                
        ics_lines.append("END:VCALENDAR")
        ics_content = "\r\n".join(ics_lines)
        
        from fastapi.responses import Response
        return Response(content=ics_content, media_type="text/calendar", headers={
            "Content-Disposition": f"attachment; filename=portfolio_{portfolio_id}_dividends.ics"
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating iCal feed: {str(e)}")

@app.get("/api/portfolio/{portfolio_id}/export-csv")
def export_portfolio_csv(
    portfolio_id: str,
    token: str = None,
    authorization: str = Header(None),
    x_supabase_url: str = Header(None),
    x_supabase_anon_key: str = Header(None)
):
    jwt_token = authorization or token
    if not jwt_token:
        raise HTTPException(status_code=401, detail="Authentication token missing")
        
    if jwt_token and not jwt_token.startswith("Bearer "):
        jwt_token = f"Bearer {jwt_token}"
        
    try:
        transactions = fetch_transactions_from_supabase(jwt_token, portfolio_id, x_supabase_url, x_supabase_anon_key)
        
        import io, csv
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write headers
        writer.writerow(["Date", "Ticker", "Type", "Shares", "Price", "Commission", "Currency", "Account"])
        
        # Write rows
        for tx in sorted(transactions, key=lambda x: x.get("date", "")):
            writer.writerow([
                tx.get("date", ""),
                tx.get("symbol", "").upper(),
                tx.get("type", "BUY").upper(),
                tx.get("shares", 0.0),
                tx.get("price", 0.0),
                tx.get("fees", 0.0),
                tx.get("currency", "USD").upper(),
                tx.get("account", "Default")
            ])
            
        csv_content = output.getvalue()
        from fastapi.responses import Response
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=portfolio_{portfolio_id}_transactions.csv"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error exporting CSV: {str(e)}")

# Serve Frontend static assets if compiled in production
frontend_dist_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'frontend', 'dist')
if os.path.exists(frontend_dist_path):
    app.mount("/", StaticFiles(directory=frontend_dist_path, html=True), name="frontend")
    
    # Catch-all for React routing (HTML5 History API)
    @app.exception_handler(404)
    async def custom_404_handler(request, exc):
        return FileResponse(os.path.join(frontend_dist_path, "index.html"))
