import os
import socketserver
import http.server
import threading
import subprocess
import signal
import sys

def start_server():
    """Starts a dummy HTTP server to satisfy Render's health check."""
    port = int(os.environ.get('PORT', 10000))
    
    class SilentHandler(http.server.SimpleHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"OK")
        def log_message(self, format, *args):
            pass # Keep logs clean

    httpd = socketserver.TCPServer(('0.0.0.0', port), SilentHandler)
    httpd.serve_forever()

# 1. Start the health check server in a background thread
# This MUST run in a thread so it doesn't block the Celery startup
server_thread = threading.Thread(target=start_server, daemon=True)
server_thread.start()

print(f"✅ Health check server started on port {os.environ.get('PORT')}")

# 2. Start Celery as a subprocess
# We use Popen so this Python script (PID 1) stays alive, keeping the server thread alive.
cmd = [
    "celery", "-A", "payout_engine", "worker", "-l", "info", "-c", "1",
    "--max-tasks-per-child", "50" # Helps prevent memory leaks on free tier
]

print("🚀 Starting Celery worker...")
proc = subprocess.Popen(cmd)

try:
    proc.wait()
except KeyboardInterrupt:
    proc.terminate()
    sys.exit(0)
