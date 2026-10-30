.PHONY: test smoke serve serve-persist demo check clean browse ci serve-static e2e-sync

test:
	python3 -m pytest tests/ -q

smoke:
	node tools/smoke_app.js

ci: test check

check:
	node --check app/protocol.js
	node --check app/app.js
	python3 -m py_compile tools/serve.py
	python3 -c "import re,sys; h=open('app/index.html').read(); ids=re.findall(r'id=\"([^\"]+)\"', h); dup=sorted({i for i in ids if ids.count(i)>1}); assert not dup, 'duplicate ids: %s' % dup; assert 'protocol.js' in h and 'app.js' in h, 'scripts missing'"
	python3 -c "import sys; sys.path.insert(0,'.'); from swarm.evidence import EVIDENCE; assert len(EVIDENCE) >= 40; print('evidence entries:', len(EVIDENCE))"

browse:
	python3 tools/build_browser.py app/browse.html

serve: browse
	python3 tools/serve.py --port 12000

# Igual ao `serve`, mas guarda o estado FORA do checkout do Git (PERSIST_DIR).
# Serve para prévia/sandbox, onde o diretório do projeto é recriado a cada
# reinício: o dado fica numa pasta que não é apagada junto com o repositório.
PERSIST_DIR ?= /home/user/aw-data
serve-persist: browse
	@mkdir -p $(PERSIST_DIR)
	AUDIOSWARM_DATA_DIR=$(PERSIST_DIR) python3 tools/serve.py --port 12000 --host 0.0.0.0

serve-static: browse
	cd app && python3 -m http.server 12000

# Prova ponta a ponta contra o servidor real (precisa de `make serve` rodando
# e de jsdom: NODE_PATH=/tmp/awtest/node_modules make e2e-sync).
e2e-sync:
	@node -e "require.resolve('jsdom')" 2>/dev/null || { echo "jsdom ausente: NODE_PATH=... npm i jsdom"; exit 1; }
	node tools/probe_e2e_sync.js

demo:
	python3 -m swarm.cli examples/profile.json

clean:
	rm -rf .pytest_cache **/__pycache__ app/browse.html
