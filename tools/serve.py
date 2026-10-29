#!/usr/bin/env python3
"""Servidor local do app de treino auditivo, com estado guardado no servidor.

Por que este servidor existe: o app guarda tudo no `localStorage`, e o
`localStorage` pertence à **origem** da página. Quando o sandbox/preview reinicia,
a URL muda, a origem muda e o navegador entrega um armazenamento vazio — o
progresso "desaparece" mesmo tendo sido salvo. Este servidor resolve isso
guardando uma cópia do estado em disco, no próprio workspace:

    GET  /api/state   -> devolve o estado salvo (204 se não houver)
    POST /api/state   -> grava o estado (escrita atômica)
    GET  /api/health  -> versão, arquivo e data da última gravação

O arquivo fica em `data/app-state.json`, fora do Git (dado pessoal). O app
detecta a API sozinho; quando é servido por um host estático (Netlify, GitHub
Pages), ele simplesmente continua funcionando só com o `localStorage`.

Uso:
    python3 tools/serve.py --port 12000
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_DIR = ROOT / "app"
DATA_DIR = ROOT / "data"
STATE_FILE = DATA_DIR / "app-state.json"
MAX_BODY = 8 * 1024 * 1024  # 8 MB: o pacote completo cabe com folga


def _display_path(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def read_state() -> dict | None:
    try:
        with STATE_FILE.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        return None
    except (OSError, ValueError):
        return None


def write_state(payload: dict) -> None:
    """Escrita atômica: nunca deixa um arquivo pela metade se o servidor cair."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(DATA_DIR), prefix=".state-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, STATE_FILE)
    finally:
        if os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except OSError:
                pass


class Handler(SimpleHTTPRequestHandler):
    server_version = "Audioswarm/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    # ----------------------------- utilidades -----------------------------
    def _json(self, status: int, body: dict) -> None:
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def _no_content(self) -> None:
        self.send_response(204)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def end_headers(self) -> None:
        # HTML/JS mudam com frequência (?v=): não deixar o navegador servir cópia velha.
        path = getattr(self, "path", "") or ""
        if path.endswith(".js") or path.endswith(".html") or path.endswith(".css") or path == "/":
            self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:  # menos ruído no preview
        if "/api/" in (self.path or ""):
            super().log_message(fmt, *args)

    # ------------------------------- rotas --------------------------------
    def do_GET(self) -> None:  # noqa: N802 (API do http.server)
        route = self.path.split("?")[0]
        if route == "/api/health":
            data = read_state()
            self._json(200, {
                "ok": True,
                "storage": "file",
                "file": _display_path(STATE_FILE),
                "hasState": data is not None,
                "updatedAt": (data or {}).get("savedAt"),
                "serverTime": _now(),
            })
            return
        if route == "/api/state":
            data = read_state()
            if data is None:
                self._no_content()
            else:
                self._json(200, data)
            return
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        route = self.path.split("?")[0]
        if route != "/api/state":
            self._json(404, {"ok": False, "error": "rota desconhecida"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            self._json(400, {"ok": False, "error": "corpo vazio"})
            return
        if length > MAX_BODY:
            # drena o que der para não deixar o cliente com pipe quebrado e fecha
            try:
                remaining = min(length, MAX_BODY)
                while remaining > 0:
                    chunk = self.rfile.read(min(65536, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
            except OSError:
                pass
            self.close_connection = True
            self._json(413, {"ok": False, "error": "estado grande demais"})
            return
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            self._json(400, {"ok": False, "error": "JSON inválido"})
            return
        if not isinstance(payload, dict) or not isinstance(payload.get("state"), dict):
            self._json(400, {"ok": False, "error": "formato esperado: {state, savedAt}"})
            return
        payload["savedAt"] = payload.get("savedAt") or _now()
        payload["receivedAt"] = _now()
        write_state(payload)
        self._json(200, {"ok": True, "savedAt": payload["savedAt"]})

    def do_DELETE(self) -> None:  # noqa: N802
        """Apaga a cópia do servidor (usado por testes e por `--reset`).

        Existe separado do POST de propósito: um POST com estado vazio NÃO
        apaga nada, para que uma aba aberta sem progresso não destrua a cópia
        boa só por abrir.
        """
        route = self.path.split("?")[0]
        if route != "/api/state":
            self._json(404, {"ok": False, "error": "rota desconhecida"})
            return
        try:
            if STATE_FILE.exists():
                STATE_FILE.unlink()
        except OSError as exc:
            self._json(500, {"ok": False, "error": str(exc)})
            return
        self._json(200, {"ok": True, "cleared": True})

    # CORS só para POST/GET simples na mesma origem não é necessário; mantemos
    # OPTIONS para não quebrar preflight de nenhum cliente futuro.
    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Allow", "GET, POST, DELETE, OPTIONS")
        self.send_header("Content-Length", "0")
        self.end_headers()


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve o app e guarda o estado no servidor.")
    parser.add_argument("--port", type=int, default=12000)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--reset", action="store_true", help="apaga o estado guardado no servidor")
    args = parser.parse_args()

    if not APP_DIR.is_dir():
        print("app/ não encontrado; rode a partir do repositório.", file=sys.stderr)
        return 2
    if not (APP_DIR / "index.html").exists():
        print("app/index.html não encontrado.", file=sys.stderr)
        return 2

    if args.reset and STATE_FILE.exists():
        STATE_FILE.unlink()
        print("estado do servidor apagado:", STATE_FILE)

    existing = read_state()
    print(f"servindo {APP_DIR} em http://{args.host}:{args.port}/")
    print(f"estado no servidor: {STATE_FILE}"
          + (f" (último save {existing.get('savedAt')})" if existing else " (vazio ainda)"))

    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    httpd.daemon_threads = True
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nencerrado")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
