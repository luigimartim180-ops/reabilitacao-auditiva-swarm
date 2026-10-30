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
    monkeypatch.setattr(module, "BACKUP_FILE", tmp_path / "app-state.bak.json")
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


def test_empty_post_does_not_erase_a_good_copy(live_server):
    """Abrir o app numa origem nova não pode apagar o progresso do servidor.

    O app só envia depois de saber o que há no servidor (guarda no Sync), mas o
    servidor também não deve tratar "estado vazio" como "apagar".
    """
    module, base = live_server
    _post(base + "/api/state", {"state": {"week": 5, "sessions": [{"id": "a"}]}})
    assert module.read_state()["state"]["week"] == 5
    # um POST com estado vazio é um save legítimo de um app vazio: guarda vazio,
    # mas o caminho de apagar é explícito (DELETE)
    _post(base + "/api/state", {"state": {}})
    stored = module.read_state()
    assert stored is not None and stored["state"] == {}


def test_delete_removes_the_stored_state(live_server):
    module, base = live_server
    _post(base + "/api/state", {"state": {"week": 7}})
    req = urllib.request.Request(base + "/api/state", method="DELETE")
    with urllib.request.urlopen(req, timeout=5) as resp:
        assert resp.status == 200
        assert json.loads(resp.read().decode("utf-8"))["cleared"] is True
    assert module.STATE_FILE.exists() is False
    assert module.read_state() is None
    # depois de apagar, GET volta a 204
    req = urllib.request.Request(base + "/api/state", method="GET")
    with urllib.request.urlopen(req, timeout=5) as resp:
        assert resp.status == 204
        assert resp.read() == b""


def test_delete_only_accepts_the_state_route(live_server):
    module, base = live_server
    req = urllib.request.Request(base + "/api/other", method="DELETE")
    with pytest.raises(urllib.error.HTTPError) as exc:
        urllib.request.urlopen(req, timeout=5)
    assert exc.value.code == 404


def test_the_previous_save_is_kept_and_used_if_the_main_file_breaks(live_server):
    """Um save ruim (ou um arquivo truncado) não pode apagar o histórico.

    O servidor guarda a versão anterior antes de sobrescrever e volta nela se o
    arquivo principal sumir ou deixar de ser JSON válido.
    """
    module, base = live_server
    _post(base + "/api/state", {"state": {"week": 3, "sessions": [{"id": "a"}]}})
    _post(base + "/api/state", {"state": {"week": 4, "sessions": [{"id": "a"}, {"id": "b"}]}})
    assert module.BACKUP_FILE.exists()
    # o backup é a versão imediatamente anterior
    backup = json.loads(module.BACKUP_FILE.read_text(encoding="utf-8"))
    assert backup["state"]["week"] == 3

    # corrompe o principal: a leitura precisa cair no backup e restaurar
    module.STATE_FILE.write_text("{ isto não é json", encoding="utf-8")
    status, raw = _get(base + "/api/state")
    assert status == 200
    assert json.loads(raw.decode("utf-8"))["state"]["week"] == 3
    # e o principal voltou a ser JSON válido
    assert json.loads(module.STATE_FILE.read_text(encoding="utf-8"))["state"]["week"] == 3


def test_delete_removes_the_backup_too(live_server):
    module, base = live_server
    _post(base + "/api/state", {"state": {"week": 5}})
    _post(base + "/api/state", {"state": {"week": 6}})
    assert module.BACKUP_FILE.exists()
    req = urllib.request.Request(base + "/api/state", method="DELETE")
    with urllib.request.urlopen(req, timeout=5) as resp:
        assert resp.status == 200
    assert module.STATE_FILE.exists() is False
    assert module.BACKUP_FILE.exists() is False
    assert module.read_state() is None


def test_the_data_directory_can_live_outside_the_repository():
    """Na prévia o diretório do projeto é descartável: o dado precisa poder ficar fora."""
    import os
    import subprocess
    import sys

    code = (
        "import importlib.util, os;"
        "spec=importlib.util.spec_from_file_location('s','tools/serve.py');"
        "m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);"
        "print(m.DATA_DIR);print(m.STATE_FILE)"
    )
    env = dict(os.environ, AUDIOSWARM_DATA_DIR="/tmp/aw-data-test")
    out = subprocess.run(
        [sys.executable, "-c", code], cwd=str(ROOT), capture_output=True, text=True, env=env
    )
    assert out.returncode == 0, out.stderr
    lines = out.stdout.strip().splitlines()
    assert lines[0] == "/tmp/aw-data-test"
    assert lines[1] == "/tmp/aw-data-test/app-state.json"
