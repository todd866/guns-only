#!/usr/bin/env python3
"""Serve the web build AND capture playthrough telemetry.

Static files are served from ROOT (the published wwwroot). POST /telemetry writes each session's
rows to OUTDIR/<session>.jsonl — same origin as the page, so no CORS. When the user flies in their
own browser, their inputs + sim state land on disk here for analysis.

    python3 telemetry_server.py <wwwroot-dir> <telemetry-out-dir> [port]
"""
import http.server, socketserver, json, os, sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
OUTDIR = sys.argv[2] if len(sys.argv) > 2 else "./telemetry"
PORT = int(sys.argv[3]) if len(sys.argv) > 3 else 8877
os.makedirs(OUTDIR, exist_ok=True)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        # No caching during development, so a republished build is always the one that loads
        # (a stale cached app.js silently ran the OLD build for an embarrassingly long time).
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        super().end_headers()

    def do_POST(self):
        if self.path != "/telemetry":
            self.send_response(404); self.end_headers(); return
        try:
            n = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(n))
            session = str(data.get("session", "unknown")).replace("/", "_").replace("..", "_")
            with open(os.path.join(OUTDIR, session + ".jsonl"), "a") as f:
                for row in data.get("rows", []):
                    f.write(json.dumps(row) + "\n")
        except Exception:
            pass  # never fail the client; a dropped sample is better than a broken flight
        self.send_response(204); self.end_headers()

    def log_message(self, *a):
        pass  # quiet


class Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


with Server(("", PORT), Handler) as httpd:
    sys.stderr.write(f"serving {ROOT} on :{PORT}, telemetry -> {OUTDIR}\n")
    httpd.serve_forever()
