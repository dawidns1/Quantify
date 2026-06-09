import os
import sys
import webbrowser
import time
import subprocess

def start_server():
    print("==================================================================")
    print("           QUANTUM SCREENER - NASDAQ 100 STOCK SCREENER           ")
    print("==================================================================")
    print("\nStarting local API & Frontend server...")
    
    # Get paths
    workspace_dir = os.path.dirname(os.path.abspath(__file__))
    python_exe = os.path.join(workspace_dir, ".venv", "Scripts", "python.exe")
    
    if not os.path.exists(python_exe):
        print(f"Error: Virtual environment python not found at {python_exe}")
        print("Please ensure the project is initialized properly.")
        sys.exit(1)
        
    # Launch uvicorn server
    # Command: .venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
    cmd = [python_exe, "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000"]
    
    print("Running server at: http://localhost:8000")
    print("Press Ctrl+C in this terminal to stop the server.\n")
    
    # Wait a brief moment then open the web browser
    def open_browser():
        time.sleep(1.5)
        print("Opening web browser...")
        webbrowser.open("http://localhost:8000")
        
    import threading
    threading.Thread(target=open_browser, daemon=True).start()
    
    try:
        # Run uvicorn in a subprocess, piping output directly to console
        subprocess.run(cmd, cwd=workspace_dir)
    except KeyboardInterrupt:
        print("\nStopping QuantumScreener server. Goodbye!")

if __name__ == "__main__":
    start_server()
