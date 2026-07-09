import os
import sqlite3
import time
import threading
from datetime import datetime, date, timezone
import requests

db_write_lock = threading.Lock()

DB_DIR = os.path.dirname(os.path.abspath(__file__))

# If VERCEL environment is active, use ephemeral /tmp directory for cache database
if os.environ.get("VERCEL") == "1":
    DATA_DIR = "/tmp/data"
    os.makedirs(DATA_DIR, exist_ok=True)
    DB_PATH = "/tmp/cache.db"
else:
    DATA_DIR = os.path.join(os.path.dirname(DB_DIR), "backend", "data")
    os.makedirs(DATA_DIR, exist_ok=True)
    DB_PATH = os.path.join(DATA_DIR, "cache.db")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_ANON_KEY")

def get_supabase_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }

def get_supabase_kv(key: str) -> dict:
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None
    try:
        url = f"{SUPABASE_URL}/rest/v1/kv_cache?key=eq.{key}"
        r = requests.get(url, headers=get_supabase_headers(), timeout=5)
        if r.status_code == 200:
            rows = r.json()
            if rows:
                return rows[0]
    except Exception as e:
        print(f"[Supabase Cache] Read error for {key}: {e}")
    return None

def save_supabase_kv(key: str, value: dict):
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
    try:
        headers = get_supabase_headers()
        url_check = f"{SUPABASE_URL}/rest/v1/kv_cache?key=eq.{key}"
        r = requests.get(url_check, headers=headers, timeout=5)
        now_str = datetime.now(timezone.utc).isoformat()
        payload = {
            "key": key,
            "value": value,
            "updated_at": now_str
        }
        if r.status_code == 200 and r.json():
            requests.patch(url_check, headers=headers, json=payload, timeout=5)
        else:
            requests.post(f"{SUPABASE_URL}/rest/v1/kv_cache", headers=headers, json=payload, timeout=5)
    except Exception as e:
        print(f"[Supabase Cache] Write error for {key}: {e}")

def get_connection():
    # check_same_thread=False allows us to pass connections across threads, 
    # but since we open/close transactions in a short-lived manner it's safe.
    # We add a 30-second timeout to prevent 'database is locked' errors under concurrent load.
    conn = sqlite3.connect(DB_PATH, timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # Enable synchronous=NORMAL for write-efficiency on this connection
    try:
        conn.execute("PRAGMA synchronous=NORMAL;")
    except Exception as e:
        print(f"[DB] Error setting synchronous pragma: {e}")
    return conn

def init_db():
    conn = get_connection()
    try:
        # Check current journal mode
        cursor = conn.cursor()
        cursor.execute("PRAGMA journal_mode;")
        row = cursor.fetchone()
        current_mode = row[0] if row else ""
        if current_mode.lower() != "wal":
            # Enable WAL mode persistently on the database file
            # PRAGMA journal_mode cannot run inside transaction, run on raw connection
            conn.execute("PRAGMA journal_mode=WAL;")
    except Exception as e:
        print(f"[DB] Error setting WAL mode: {e}")
        
    try:
        with conn:
            conn.execute("BEGIN IMMEDIATE")
            cursor = conn.cursor()
            
            # 1. Table for live prices
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS live_prices (
                symbol TEXT PRIMARY KEY,
                live_price REAL,
                previous_close REAL,
                company_name TEXT,
                native_currency TEXT,
                timezone TEXT,
                exchange TEXT,
                last_updated REAL
            )
            """)
            
            # 2. Table for daily prices
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS daily_prices (
                symbol TEXT,
                date TEXT,
                close REAL,
                dividend REAL,
                PRIMARY KEY (symbol, date)
            )
            """)
            
            # 3. Table for upcoming corporate events
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS upcoming_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT,
                event_type TEXT,
                event_date TEXT,
                description TEXT,
                last_div_val REAL,
                currency TEXT,
                last_updated REAL
            )
            """)
            
            # Create indexes for performance
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_daily_prices ON daily_prices (symbol, date)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_upcoming_events ON upcoming_events (symbol)")
    except Exception as e:
        print(f"[DB] Error initializing database tables: {e}")
    finally:
        conn.close()

# Initialize DB on import
init_db()

# --- API FOR LIVE PRICES ---

def get_cached_live_price(symbol: str, max_age_seconds: float = 900.0) -> dict:
    """Gets cached live price if not older than max_age_seconds."""
    if SUPABASE_URL and SUPABASE_KEY:
        row = get_supabase_kv(f"LIVE_PRICE:{symbol.upper()}")
        if row:
            try:
                updated_at = datetime.fromisoformat(row["updated_at"].replace("Z", "+00:00"))
                if (datetime.now(timezone.utc) - updated_at).total_seconds() < max_age_seconds:
                    return row["value"]
            except Exception:
                pass
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM live_prices WHERE symbol = ? AND (last_updated IS NOT NULL AND (? - last_updated) < ?)",
        (symbol.upper(), time.time(), max_age_seconds)
    )
    row = cursor.fetchone()
    conn.close()
    if row:
        return dict(row)
    return None

def get_expired_cached_live_price(symbol: str) -> dict:
    """Gets cached live price regardless of age as a fallback."""
    if SUPABASE_URL and SUPABASE_KEY:
        row = get_supabase_kv(f"LIVE_PRICE:{symbol.upper()}")
        if row:
            return row["value"]
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM live_prices WHERE symbol = ?",
        (symbol.upper(),)
    )
    row = cursor.fetchone()
    conn.close()
    if row:
        return dict(row)
    return None

def save_cached_live_price(symbol: str, data: dict):
    if SUPABASE_URL and SUPABASE_KEY:
        save_supabase_kv(f"LIVE_PRICE:{symbol.upper()}", data)
    with db_write_lock:
        conn = get_connection()
        try:
            with conn:
                conn.execute("BEGIN IMMEDIATE")
                cursor = conn.cursor()
                cursor.execute("""
                INSERT INTO live_prices (symbol, live_price, previous_close, company_name, native_currency, timezone, exchange, last_updated)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(symbol) DO UPDATE SET
                    live_price = CASE WHEN excluded.live_price > 0.0 AND (excluded.symbol NOT LIKE '%=X' OR excluded.live_price != 1.0) THEN excluded.live_price ELSE live_price END,
                    previous_close = CASE WHEN excluded.previous_close > 0.0 AND (excluded.symbol NOT LIKE '%=X' OR excluded.previous_close != 1.0) THEN excluded.previous_close ELSE previous_close END,
                    company_name = excluded.company_name,
                    native_currency = COALESCE(excluded.native_currency, native_currency),
                    timezone = excluded.timezone,
                    exchange = excluded.exchange,
                    last_updated = CASE WHEN excluded.live_price > 0.0 AND (excluded.symbol NOT LIKE '%=X' OR excluded.live_price != 1.0) THEN excluded.last_updated ELSE last_updated END
                """, (
                    symbol.upper(),
                    data.get("live_price", 0.0),
                    data.get("previous_close", 0.0),
                    data.get("company_name", symbol),
                    data.get("native_currency", "USD"),
                    data.get("timezone", "UTC"),
                    data.get("exchange", ""),
                    time.time()
                ))
        except Exception as e:
            print(f"[DB] Error saving live price for {symbol}: {e}")
            raise
        finally:
            conn.close()

# --- API FOR HISTORICAL DAILY PRICES ---

def get_cached_historical_prices(symbol: str, start_date: date, end_date: date) -> tuple:
    """Returns (prices_dict, dividends_dict) from daily_prices table."""
    if SUPABASE_URL and SUPABASE_KEY:
        row = get_supabase_kv(f"HIST_PRICES:{symbol.upper()}")
        if row:
            try:
                prices_dict = {}
                dividends_dict = {}
                val = row["value"]
                for k, v in val.get("prices", {}).items():
                    dt = date(int(k[:4]), int(k[5:7]), int(k[8:10]))
                    prices_dict[dt] = float(v)
                for k, v in val.get("dividends", {}).items():
                    dt = date(int(k[:4]), int(k[5:7]), int(k[8:10]))
                    dividends_dict[dt] = float(v)
                
                filtered_prices = {d: p for d, p in prices_dict.items() if start_date <= d <= end_date}
                filtered_dividends = {d: div for d, div in dividends_dict.items() if start_date <= d <= end_date}
                return filtered_prices, filtered_dividends
            except Exception as e:
                print(f"[Supabase Cache] Historical parse error: {e}")
                
    conn = get_connection()
    cursor = conn.cursor()
    
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")
    
    cursor.execute(
        "SELECT date, close, dividend FROM daily_prices WHERE symbol = ? AND date BETWEEN ? AND ? ORDER BY date ASC",
        (symbol.upper(), start_str, end_str)
    )
    rows = cursor.fetchall()
    conn.close()
    
    prices_dict = {}
    dividends_dict = {}
    
    for row in rows:
        try:
            dt = datetime.strptime(row["date"], "%Y-%m-%d").date()
            prices_dict[dt] = float(row["close"])
            if row["dividend"] and float(row["dividend"]) > 0:
                dividends_dict[dt] = float(row["dividend"])
        except Exception:
            pass
            
    return prices_dict, dividends_dict

def save_cached_historical_prices(symbol: str, prices: dict, dividends: dict):
    """Saves historical daily prices and dividends to daily_prices table."""
    if not prices:
        return
        
    if SUPABASE_URL and SUPABASE_KEY:
        existing_prices = {}
        existing_divs = {}
        row = get_supabase_kv(f"HIST_PRICES:{symbol.upper()}")
        if row:
            try:
                existing_prices = row["value"].get("prices", {})
                existing_divs = row["value"].get("dividends", {})
            except Exception:
                pass
        
        for dt, val in prices.items():
            dt_str = dt.strftime("%Y-%m-%d") if isinstance(dt, (date, datetime)) else str(dt)
            existing_prices[dt_str] = val
        for dt, val in dividends.items():
            dt_str = dt.strftime("%Y-%m-%d") if isinstance(dt, (date, datetime)) else str(dt)
            existing_divs[dt_str] = val
            
        save_supabase_kv(f"HIST_PRICES:{symbol.upper()}", {
            "prices": existing_prices,
            "dividends": existing_divs
        })
        
    with db_write_lock:
        conn = get_connection()
        try:
            with conn:
                conn.execute("BEGIN IMMEDIATE")
                cursor = conn.cursor()
                
                symbol_upper = symbol.upper()
                all_dates = set(prices.keys()).union(dividends.keys())
                
                rows_to_insert = []
                for dt in all_dates:
                    dt_str = dt.strftime("%Y-%m-%d") if isinstance(dt, (date, datetime)) else str(dt)
                    close = prices.get(dt, 0.0)
                    div = dividends.get(dt, 0.0)
                    rows_to_insert.append((symbol_upper, dt_str, close, div))
                    
                # Bulk insert
                cursor.executemany("""
                INSERT INTO daily_prices (symbol, date, close, dividend)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(symbol, date) DO UPDATE SET
                    close = excluded.close,
                    dividend = excluded.dividend
                """, rows_to_insert)
        except Exception as e:
            print(f"[DB] Error saving historical prices for {symbol}: {e}")
            raise
        finally:
            conn.close()

# --- API FOR UPCOMING CORPORATE EVENTS ---

def get_cached_upcoming_events(symbol: str, max_age_seconds: float = 43200.0, ignore_ttl: bool = False) -> list:
    """Gets cached upcoming events if they are not older than max_age_seconds (unless ignore_ttl is True)."""
    if SUPABASE_URL and SUPABASE_KEY:
        row = get_supabase_kv(f"UPCOMING_EVENTS:{symbol.upper()}")
        if row:
            try:
                updated_at = datetime.fromisoformat(row["updated_at"].replace("Z", "+00:00"))
                age = (datetime.now(timezone.utc) - updated_at).total_seconds()
                if ignore_ttl or age < max_age_seconds:
                    val = row["value"]
                    return val.get("events") or []
            except Exception:
                pass
                
    conn = get_connection()
    cursor = conn.cursor()
    
    # Check if there is any cached record at all
    cursor.execute(
        "SELECT last_updated FROM upcoming_events WHERE symbol = ? LIMIT 1",
        (symbol.upper(),)
    )
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        return None
        
    if not ignore_ttl and (time.time() - row["last_updated"] > max_age_seconds):
        conn.close()
        return None
        
    # Fetch events
    cursor.execute(
        "SELECT symbol, event_type, event_date, description, last_div_val, currency FROM upcoming_events WHERE symbol = ?",
        (symbol.upper(),)
    )
    rows = cursor.fetchall()
    conn.close()
    
    events = []
    for r in rows:
        events.append({
            "symbol": r["symbol"],
            "type": r["event_type"],
            "date": r["event_date"],
            "description": r["description"],
            "last_dividend_value": r["last_div_val"],
            "currency": r["currency"]
        })
    return events

def update_upcoming_events_timestamp(symbol: str):
    """Updates the last_updated timestamp for all cached events of a symbol to the current time."""
    if SUPABASE_URL and SUPABASE_KEY:
        row = get_supabase_kv(f"UPCOMING_EVENTS:{symbol.upper()}")
        if row:
            try:
                save_supabase_kv(f"UPCOMING_EVENTS:{symbol.upper()}", row["value"])
            except Exception:
                pass
                
    with db_write_lock:
        conn = get_connection()
        try:
            with conn:
                conn.execute("BEGIN IMMEDIATE")
                cursor = conn.cursor()
                cursor.execute(
                    "UPDATE upcoming_events SET last_updated = ? WHERE symbol = ?",
                    (time.time(), symbol.upper())
                )
        except Exception as e:
            print(f"[DB] Error updating upcoming events timestamp for {symbol}: {e}")
        finally:
            conn.close()

def save_cached_upcoming_events(symbol: str, events: list):
    if SUPABASE_URL and SUPABASE_KEY:
        save_supabase_kv(f"UPCOMING_EVENTS:{symbol.upper()}", {
            "events": events or []
        })
        
    with db_write_lock:
        conn = get_connection()
        try:
            with conn:
                conn.execute("BEGIN IMMEDIATE")
                cursor = conn.cursor()
                
                symbol_upper = symbol.upper()
                now_ts = time.time()
                
                # 1. Clear old events for this symbol
                cursor.execute("DELETE FROM upcoming_events WHERE symbol = ?", (symbol_upper,))
                
                # 2. Insert new events
                if events:
                    rows = []
                    for ev in events:
                        rows.append((
                            symbol_upper,
                            ev.get("type", "Dividend"),
                            ev.get("date"),
                            ev.get("description", ""),
                            ev.get("last_dividend_value", 0.0),
                            ev.get("currency", "USD"),
                            now_ts
                        ))
                    cursor.executemany("""
                    INSERT INTO upcoming_events (symbol, event_type, event_date, description, last_div_val, currency, last_updated)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, rows)
                else:
                    # Save a dummy row with event_date = None just to mark that we have a cache check (no events found)
                    cursor.execute("""
                    INSERT INTO upcoming_events (symbol, event_type, event_date, description, last_div_val, currency, last_updated)
                    VALUES (?, 'None', NULL, 'No Events', 0.0, 'USD', ?)
                    """, (symbol_upper, now_ts))
        except Exception as e:
            print(f"[DB] Error saving upcoming events for {symbol}: {e}")
            raise
        finally:
            conn.close()
