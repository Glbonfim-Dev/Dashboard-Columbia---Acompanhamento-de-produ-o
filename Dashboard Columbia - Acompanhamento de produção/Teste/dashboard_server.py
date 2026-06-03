from __future__ import annotations

import argparse
import email.utils
import json
import mimetypes
import os
import threading
import time
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "Codigo"
DEFAULT_JSON_PATH = STATIC_DIR / "Dashboard.json"


class DashboardCache:
    """Keeps the last valid JSON in memory and reloads it when the file changes."""

    def __init__(self, json_path: Path, watch_interval: float = 2.0) -> None:
        self.json_path = json_path.resolve()
        self.watch_interval = watch_interval
        self._lock = threading.RLock()
        self._mtime_ns: int | None = None
        self._size: int | None = None
        self._payload: Any = None
        self._body = b""
        self._version = ""
        self._last_modified = ""
        self._loaded_at = ""
        self._last_error = ""
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self.refresh(force=True)
        self._thread = threading.Thread(target=self._watch_loop, name="dashboard-json-watch", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)

    def refresh(self, force: bool = False) -> None:
        with self._lock:
            try:
                stat = self.json_path.stat()
            except FileNotFoundError as exc:
                self._last_error = f"JSON file not found: {self.json_path}"
                if self._payload is None:
                    raise RuntimeError(self._last_error) from exc
                return

            changed = force or stat.st_mtime_ns != self._mtime_ns or stat.st_size != self._size
            if not changed:
                return

            payload = self._read_json_with_retries()
            self._validate_payload(payload)

            self._mtime_ns = stat.st_mtime_ns
            self._size = stat.st_size
            self._payload = payload
            self._body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            self._version = f"{stat.st_mtime_ns:x}-{stat.st_size:x}"
            modified = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
            self._last_modified = email.utils.format_datetime(modified, usegmt=True)
            self._loaded_at = datetime.now(timezone.utc).isoformat()
            self._last_error = ""

    def snapshot(self) -> dict[str, Any]:
        self.refresh(force=False)
        with self._lock:
            if self._payload is None:
                raise RuntimeError(self._last_error or "No dashboard data loaded")

            return {
                "body": self._body,
                "version": self._version,
                "last_modified": self._last_modified,
                "loaded_at": self._loaded_at,
                "last_error": self._last_error,
                "row_count": self._row_count(self._payload),
            }

    def status(self) -> dict[str, Any]:
        try:
            self.refresh(force=False)
        except Exception as exc:
            with self._lock:
                self._last_error = str(exc)

        with self._lock:
            return {
                "ok": self._payload is not None,
                "jsonPath": str(self.json_path),
                "version": self._version,
                "lastModified": self._last_modified,
                "loadedAt": self._loaded_at,
                "rows": self._row_count(self._payload),
                "lastError": self._last_error,
            }

    def _watch_loop(self) -> None:
        while not self._stop.wait(self.watch_interval):
            try:
                self.refresh(force=False)
            except Exception as exc:
                with self._lock:
                    self._last_error = str(exc)

    def _read_json_with_retries(self) -> Any:
        last_error: Exception | None = None
        for _ in range(5):
            try:
                return self._read_json_once()
            except Exception as exc:
                last_error = exc
                time.sleep(0.2)
        raise RuntimeError(f"Could not read a valid JSON file: {last_error}") from last_error

    def _read_json_once(self) -> Any:
        raw = self.json_path.read_bytes()
        for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
            try:
                text = raw.decode(encoding)
                return json.loads(text)
            except UnicodeDecodeError:
                continue
        return json.loads(raw.decode("utf-8", errors="replace"))

    @staticmethod
    def _validate_payload(payload: Any) -> None:
        if isinstance(payload, list):
            return
        if isinstance(payload, dict) and isinstance(payload.get("principal"), list):
            return
        raise ValueError("Unexpected JSON structure. Expected an array or an object with principal: []")

    @staticmethod
    def _row_count(payload: Any) -> int:
        if isinstance(payload, list):
            return len(payload)
        if isinstance(payload, dict) and isinstance(payload.get("principal"), list):
            return len(payload["principal"])
        return 0


class DashboardHTTPServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, server_address: tuple[str, int], handler_class: type[BaseHTTPRequestHandler], cache: DashboardCache) -> None:
        super().__init__(server_address, handler_class)
        self.cache = cache


class DashboardRequestHandler(BaseHTTPRequestHandler):
    server: DashboardHTTPServer
    server_version = "DashboardBackend/1.0"

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self._send_common_headers(no_store=True)
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")
        self.end_headers()

    def do_HEAD(self) -> None:
        self._route(send_body=False)

    def do_GET(self) -> None:
        self._route(send_body=True)

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[{self.log_date_time_string()}] {self.address_string()} {fmt % args}")

    def _route(self, send_body: bool) -> None:
        path = urlparse(self.path).path
        if path == "/api/dashboard":
            self._send_dashboard(send_body=send_body)
            return
        if path == "/api/status":
            self._send_status(send_body=send_body)
            return
        self._send_static(path, send_body=send_body)

    def _send_dashboard(self, send_body: bool) -> None:
        try:
            snapshot = self.server.cache.snapshot()
        except Exception as exc:
            self._send_json(
                HTTPStatus.SERVICE_UNAVAILABLE,
                {"ok": False, "error": str(exc)},
                send_body=send_body,
                no_store=True,
            )
            return

        body = snapshot["body"]
        self.send_response(HTTPStatus.OK)
        self._send_common_headers(no_store=True)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body) if send_body else 0))
        self.send_header("ETag", f'"{snapshot["version"]}"')
        self.send_header("Last-Modified", snapshot["last_modified"])
        self.send_header("X-Data-Version", snapshot["version"])
        self.send_header("X-Data-Loaded-At", snapshot["loaded_at"])
        self.send_header("X-Data-Rows", str(snapshot["row_count"]))
        if snapshot["last_error"]:
            self.send_header("X-Data-Warning", "serving-last-valid-json")
        self.end_headers()
        if send_body:
            self.wfile.write(body)

    def _send_status(self, send_body: bool) -> None:
        self._send_json(HTTPStatus.OK, self.server.cache.status(), send_body=send_body, no_store=True)

    def _send_json(self, status: HTTPStatus, payload: dict[str, Any], send_body: bool, no_store: bool) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self._send_common_headers(no_store=no_store)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body) if send_body else 0))
        self.end_headers()
        if send_body:
            self.wfile.write(body)

    def _send_static(self, path: str, send_body: bool) -> None:
        target = self._resolve_static_path(path)
        if target is None:
            self.send_error(HTTPStatus.FORBIDDEN, "Invalid path")
            return
        if target.name.lower() in {"dashboard.json", "dashboard.json.bak"}:
            self.send_error(HTTPStatus.FORBIDDEN, "Use /api/dashboard instead of reading the JSON directly")
            return
        if not target.exists() or not target.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return

        content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        body = b"" if not send_body else target.read_bytes()
        self.send_response(HTTPStatus.OK)
        self._send_common_headers(no_store=target.suffix.lower() in {".html", ".js", ".css"})
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if send_body:
            self.wfile.write(body)

    def _resolve_static_path(self, path: str) -> Path | None:
        clean_path = unquote(path).replace("\\", "/").strip("/")
        if not clean_path:
            clean_path = "index.html"
        if clean_path.lower().startswith("codigo/"):
            clean_path = clean_path[7:]

        target = (STATIC_DIR / clean_path).resolve()
        try:
            target.relative_to(STATIC_DIR.resolve())
        except ValueError:
            return None
        return target

    def _send_common_headers(self, no_store: bool) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        if no_store:
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        else:
            self.send_header("Cache-Control", "public, max-age=3600")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Dashboard backend API and static server")
    parser.add_argument("--host", default=os.environ.get("DASHBOARD_HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("DASHBOARD_PORT", "8787")))
    parser.add_argument("--json", default=os.environ.get("DASHBOARD_JSON", str(DEFAULT_JSON_PATH)))
    parser.add_argument("--watch-interval", type=float, default=2.0)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cache = DashboardCache(Path(args.json), watch_interval=args.watch_interval)
    cache.start()

    httpd = DashboardHTTPServer((args.host, args.port), DashboardRequestHandler, cache)
    print(f"Dashboard backend running on http://{args.host}:{args.port}/")
    print(f"API endpoint: http://{args.host}:{args.port}/api/dashboard")
    print(f"JSON source: {Path(args.json).resolve()}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping dashboard backend...")
    finally:
        cache.stop()
        httpd.server_close()


if __name__ == "__main__":
    main()
