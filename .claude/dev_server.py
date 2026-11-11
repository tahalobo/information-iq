"""Local dev server with caching disabled (so edits show up on reload).

Also accepts PUT uploads into assets/img/og/ only, so scripts/og-maker.html
can save the share-preview images it draws in the browser.
"""
import http.server
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OG_DIR = os.path.join(ROOT, "assets", "img", "og")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_PUT(self):
        m = re.fullmatch(r"/assets/img/og/([A-Za-z0-9_\-]+)\.jpg", self.path)
        if not m or self.client_address[0] != "127.0.0.1":
            self.send_error(403)
            return
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0 or length > 3_000_000:
            self.send_error(413)
            return
        os.makedirs(OG_DIR, exist_ok=True)
        with open(os.path.join(OG_DIR, m.group(1) + ".jpg"), "wb") as f:
            f.write(self.rfile.read(length))
        self.send_response(201)
        self.end_headers()


http.server.ThreadingHTTPServer.allow_reuse_address = True
with http.server.ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("PORT", 5500))), Handler) as httpd:
    httpd.serve_forever()
