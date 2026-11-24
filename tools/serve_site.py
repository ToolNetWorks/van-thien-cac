#!/usr/bin/env python3
"""HTTP/1.1 server for Vân Thiên Các: static files (with byte-range 206) + JSON API under /api/."""
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import argparse
import os
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from server import api, db  # noqa: E402

RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")
# Backend code, database, tooling and dotfiles are never served as static files.
PRIVATE_PREFIXES = ("/storage", "/server", "/tools", "/deploy")


def is_private_path(raw_path: str) -> bool:
    path = unquote(urlsplit(raw_path).path).replace("\\", "/")
    path = "/" + "/".join(seg for seg in path.split("/") if seg not in ("", "."))
    if any(seg.startswith(".") for seg in path.split("/") if seg):
        return True
    lowered = path.lower()
    if lowered.endswith((".db", ".db-wal", ".db-shm", ".sqlite", ".py")):
        return True
    return any(lowered == p or lowered.startswith(p + "/") for p in PRIVATE_PREFIXES)


class RangeRequestHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".js": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".html": "text/html; charset=utf-8",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _is_api(self) -> bool:
        path = urlsplit(self.path).path
        return path == "/api" or path.startswith("/api/")

    def do_GET(self):
        if self._is_api():
            api.handle(self, "GET")
            return
        super().do_GET()

    def do_HEAD(self):
        if self._is_api():
            self.send_error(HTTPStatus.METHOD_NOT_ALLOWED)
            return
        super().do_HEAD()

    def do_POST(self):
        if self._is_api():
            api.handle(self, "POST")
            return
        self.send_error(HTTPStatus.METHOD_NOT_ALLOWED)

    def list_directory(self, path):
        self.send_error(HTTPStatus.NOT_FOUND, "File not found")
        return None

    def send_head(self):
        self._range = None
        if is_private_path(self.path):
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return None
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            parts = self.path.split("?", 1)[0]
            if not parts.endswith("/"):
                return super().send_head()
            for index in ("index.html", "index.htm"):
                candidate = os.path.join(path, index)
                if os.path.isfile(candidate):
                    path = candidate
                    break
            else:
                return super().send_head()
        if not os.path.isfile(path):
            return super().send_head()

        ctype = self.guess_type(path)
        try:
            f = open(path, "rb")
        except OSError:
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return None

        fs = os.fstat(f.fileno())
        size = fs.st_size
        range_header = self.headers.get("Range")
        is_html = path.endswith(".html")

        if range_header:
            match = RANGE_RE.match(range_header.strip())
            if not match:
                f.close()
                self.send_error(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                return None
            start_s, end_s = match.groups()
            if start_s == "" and end_s == "":
                f.close()
                self.send_error(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                return None
            if start_s == "":
                length = int(end_s)
                start = max(0, size - length)
                end = size - 1
            else:
                start = int(start_s)
                end = int(end_s) if end_s else size - 1
            if start >= size or end < start:
                f.close()
                self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return None
            end = min(end, size - 1)
            chunk_len = end - start + 1
            f.seek(start)
            self._range = (start, end, chunk_len)
            self.send_response(HTTPStatus.PARTIAL_CONTENT)
            self.send_header("Content-Type", ctype)
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.send_header("Content-Length", str(chunk_len))
            self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
            self.send_header("Cache-Control", "public, max-age=86400")
            self.end_headers()
            return f

        self._range = None
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(size))
        self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
        if is_html:
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        else:
            self.send_header("Cache-Control", "public, max-age=86400")
        self.end_headers()
        return f

    def copyfile(self, source, outputfile):
        r = getattr(self, "_range", None)
        if not r:
            super().copyfile(source, outputfile)
            return
        remaining = r[2]
        bufsize = 65536
        while remaining > 0:
            chunk = source.read(min(bufsize, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bind", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8081)
    args = parser.parse_args()
    db.init_db()
    server = ThreadingHTTPServer((args.bind, args.port), RangeRequestHandler)
    server.daemon_threads = True
    print(f"Serving {ROOT} on http://{args.bind}:{args.port} (HTTP/1.1 + Range 206, API /api/, DB {db.DB_PATH})")
    server.serve_forever()


if __name__ == "__main__":
    main()
