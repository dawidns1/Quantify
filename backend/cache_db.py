import os
import sqlite3
import time
import threading
from datetime import datetime, date

db_write_lock = threading.Lock()

DB_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(DB_DIR), "backend", "data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "cache.db")

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

def save_cached_live_price(symbol: str, data: dict):
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
                    live_price = excluded.live_price,
                    previous_close = excluded.previous_close,
                    company_name = excluded.company_name,
                    native_currency = excluded.native_currency,
                    timezone = excluded.timezone,
                    exchange = excluded.exchange,
                    last_updated = excluded.last_updated
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
