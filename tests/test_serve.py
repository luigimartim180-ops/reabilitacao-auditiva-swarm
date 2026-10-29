"""Testes do servidor local que guarda o estado em disco.

O objetivo destes testes é provar a propriedade que o usuário pediu: se o
servidor cair e voltar (ou se a origem da página mudar), o progresso continua
lá. Aqui isso é verificado sem navegador: sobe o servidor de verdade em uma
porta livre, grava pela API e lê de volta.
"""

from __future__ import annotations

import importlib.util
import json
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def _load_server_module(tmp_path, monkeypatch):
    """Importa tools/serve.py apontando o arquivo de estado para tmp_path."""
    spec = importlib.util.spec_from_file_location("serve_under_test", ROOT / "tools" / "serve.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, "DATA_DIR", tmp_path)
    monkeypatch.setattr(module, "STATE_FILE", tmp_path / "app-state.json")
    return module


@pytest.fixture()
def live_server(tmp_path, monkeypatch):
    module = _load_server_module(tmp_path, monkeypatch)
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), module.Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    port = httpd.server_address[1]
    try:
        yield module, f"http://127.0.0.1:{port}"
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=5)


def _get(url):
    with urllib.request.urlopen(url, timeout=5) as resp:
        return resp.status, resp.read()


def _post(url, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))


def test_health_says_where_the_state_lives(live_server):
    module, base = live_server
    status, raw = _get(base + "/api/health")
    body = json.loads(raw)
    assert status == 200
    assert body["ok"] is True
    assert body["storage"] == "file"
    assert body["hasState"] is False


def test_state_round_trip_survives_a_restart(live_server, tmp_path, monkeypatch):
    module, base = live_server
    state = {"week": 5, "baselineDone": True, "sessions": [{"id": "s1"}]}
    status, body = _post(base + "/api/state", {"state": state, "savedAt": "2026-10-29T12:00:00Z"})
    assert status == 200 and body["ok"] is True

    # "o servidor caiu": o processo/objeto é descartado e a leitura é feita de novo
    fresh = _load_server_module(tmp_path, monkeypatch)
    recovered = fresh.read_state()
    assert recovered is not None
    assert recovered["state"]["week"] == 5
    assert recovered["state"]["sessions"][0]["id"] == "s1"
    assert recovered["savedAt"] == "2026-10-29T12:00:00Z"


def test_get_returns_204_when_there_is_nothing(live_server, tmp_path, monkeypatch):
    module, base = live_server
    status, raw = _get(base + "/api/state")
    assert status == 204
    assert raw == b""
    assert module.read_state() is None


def test_post_rejects_garbage_and_keeps_the_previous_state(live_server):
    module, base = live_server
    _post(base + "/api/state", {"state": {"week": 3}})
    with pytest.raises(urllib.error.HTTPError) as exc:
        _post(base + "/api/state", {"nope": True})
    assert exc.value.code == 400
    assert module.read_state()["state"]["week"] == 3


def test_write_is_atomic_and_leaves_no_temp_files(live_server, tmp_path):
    module, base = live_server
    _post(base + "/api/state", {"state": {"week": 2}})
    _post(base + "/api/state", {"state": {"week": 4}})
    leftovers = [p.name for p in tmp_path.iterdir() if p.name.startswith(".state-")]
    assert leftovers == []
    assert module.read_state()["state"]["week"] == 4


def test_static_files_are_served_from_app(live_server):
    module, base = live_server
    status, raw = _get(base + "/index.html")
    assert status == 200
    assert b"Treino" in raw or b"app.js" in raw


def test_body_limit_is_enforced(live_server):
    module, base = live_server
    module_max = module.MAX_BODY
    assert module_max > 0
    big = {"state": {"blob": "x" * (module_max + 10)}}
    try:
        _post(base + "/api/state", big)
        raise AssertionError("o servidor aceitou um corpo acima do limite")
    except urllib.error.HTTPError as exc:
        assert exc.code == 413
    except urllib.error.URLError:
        pass  # conexão fechada depois do 413: aceitável
    assert module.read_state() is None
