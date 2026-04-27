#!/bin/bash
set -e

# 1. Start a lightweight HTTP server on $PORT to pass Render health checks
#    (Uses ~2MB RAM, serves nothing, just keeps the container "healthy")
python3 -c "
import http.server, os, threading, socketserver
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args): pass
port = int(os.environ.get('PORT', 10000))
socketserver.TCPServer.allow_reuse_address = True
server = socketserver.TCPServer(('0.0.0.0', port), QuietHandler)
threading.Thread(target=server.serve_forever, daemon=True).start()
" &

# 2. Start Celery (this is your actual async worker)
#    --max-tasks-per-child prevents memory leaks on free tier
exec celery -A payout_engine worker -l info -c 1 --max-tasks-per-child 50
