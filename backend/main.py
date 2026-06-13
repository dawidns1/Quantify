import os
import json
import threading
import time
from typing import List
import yfinance as yf
from fastapi import FastAPI, BackgroundTasks, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from backend.data_fetcher import run_screener_collection, WikipediaNasdaq100Provider, StockDataCollector
from backend.portfolio_manager import PortfolioManager
import requests

# Load environment variables manually
for path in ['.env', '../.env', 'backend/.env', '../frontend/.env.local', 'frontend/.env.local']:
    if os.path.exists(path):
        with open(path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ.setdefault(k.strip(), v.strip())

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
    start_cache_warmer()

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
DETAILS_DIR = os.path.join(DATA_DIR, 'details')

# In-memory lock to prevent concurrent refreshes
refresh_lock = threading.Lock()

def bg_refresh_task():
    """Background task runner for the crawler."""
    global refresh_lock
    acquired = refresh_lock.acquire(blocking=False)
    if not acquired:
        return  # already running
    try:
        provider = WikipediaNasdaq100Provider()
        run_screener_collection(provider)
    except Exception as e:
        print(f"Error in background crawler task: {e}")
        # Update status file with error
        status_path = os.path.join(DATA_DIR, 'status.json')
        try:
            status = {
                "is_running": False,
                "message": "Failed to refresh data",
                "progress": 0,
                "total": 0,
                "error": str(e),
                "last_updated": time.time()
            }
            with open(status_path, 'w') as f:
                json.dump(status, f)
        except Exception:
            pass
    finally:
        refresh_lock.release()

@app.get("/api/stocks")
def get_stocks():
    # 1. Try to load from Supabase cloud
    cloud_data = fetch_screener_data_from_supabase()
    if cloud_data:
        try:
            # Cache locally
            file_path = os.path.join(DATA_DIR, 'screener_data.json')
            with open(file_path, 'w') as f:
                json.dump(cloud_data, f, indent=2)
        except Exception as cache_err:
            print(f"Failed to cache cloud data locally: {cache_err}")
        return cloud_data

    # 2. Fallback to local cache file if Supabase fails
    file_path = os.path.join(DATA_DIR, 'screener_data.json')
    if not os.path.exists(file_path):
        # Return empty data structure with last updated = 0
        return {
            "metadata": {
                "last_updated": 0,
                "total_stocks": 0,
                "indicators": []
            },
            "stocks": []
        }
    try:
        with open(file_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading screener data: {str(e)}")

@app.get("/api/stocks/{ticker}")
def get_stock_detail(ticker: str):
    # Normalize ticker (e.g. AAPL)
    clean_ticker = ticker.upper().strip()
    file_path = os.path.join(DETAILS_DIR, f"{clean_ticker}.json")
    
    # Check if we need to fetch/regenerate details (missing or >24 hours old)
    should_fetch = not os.path.exists(file_path)
    if not should_fetch:
        try:
            file_age = time.time() - os.path.getmtime(file_path)
            if file_age > 86400:  # 24 hours
                should_fetch = True
        except Exception:
            should_fetch = True
            
    if should_fetch:
        try:
            print(f"[{clean_ticker}] Detail cache missing or stale. Fetching on-demand...")
            collector = StockDataCollector()
            ticker_obj = yf.Ticker(clean_ticker)
            
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
                
            shares = overview.get("market_cap", 0) / overview.get("price", 1) if overview.get("price") else 1.0
            history_data = collector.fetch_historical_detail(ticker_obj, shares)
            
            if len(history_data) > 0 or not os.path.exists(file_path):
                payload = {
                    "symbol": clean_ticker,
                    "name": overview.get("name"),
                    "overview": overview,
                    "history": history_data
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
        ticker_obj = yf.Ticker(clean_ticker)
        price = ticker_obj.fast_info.get('lastPrice')
        if price is None:
            price = ticker_obj.info.get('currentPrice')
            
        timezone = ticker_obj.fast_info.get("timezone") or "UTC"
        exchange = ticker_obj.fast_info.get("exchange") or ""
        currency = ticker_obj.fast_info.get("currency") or ticker_obj.info.get("currency") or "USD"
        
        is_open = PortfolioManager.is_market_open(timezone, exchange)
            
        return {
            "symbol": clean_ticker,
            "price": price,
            "currency": currency.upper().strip(),
            "is_market_open": is_open,
            "timestamp": time.time()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching real-time price: {str(e)}")

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
    # Check if already running
    is_locked = refresh_lock.locked()
    if is_locked:
        return {"status": "error", "message": "A refresh task is already running."}
        
    # Check data freshness if not forced
    if not force:
        file_path = os.path.join(DATA_DIR, 'screener_data.json')
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r') as f:
                    data = json.load(f)
                    last_updated = data.get("metadata", {}).get("last_updated", 0)
                    age = time.time() - last_updated
                    if age < 3600:  # 1 hour
                        minutes_ago = int(age // 60)
                        return {
                            "status": "fresh",
                            "message": f"Data is already fresh (updated {minutes_ago}m ago).",
                            "last_updated": last_updated
                        }
            except Exception:
                pass
        
    # Trigger background execution
    background_tasks.add_task(bg_refresh_task)
    return {"status": "ok", "message": "Refresh task started in background."}

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
    authorization: str = Header(None),
    x_supabase_url: str = Header(None),
    x_supabase_anon_key: str = Header(None)
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")
        
    try:
        transactions = fetch_transactions_from_supabase(authorization, portfolio_id, x_supabase_url, x_supabase_anon_key)
        settings = fetch_portfolio_settings_from_supabase(authorization, portfolio_id, x_supabase_url, x_supabase_anon_key)
        return PortfolioManager.calculate_historical_performance(transactions, base_currency, account, link_cash, settings)
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

# Serve Frontend static assets if compiled in production
frontend_dist_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'frontend', 'dist')
if os.path.exists(frontend_dist_path):
    app.mount("/", StaticFiles(directory=frontend_dist_path, html=True), name="frontend")
    
    # Catch-all for React routing (HTML5 History API)
    @app.exception_handler(404)
    async def custom_404_handler(request, exc):
        return FileResponse(os.path.join(frontend_dist_path, "index.html"))
