# Reabilitação Auditiva — SWARM v3

[![CI](https://github.com/luigimartim180-ops/reabilitacao-auditiva-swarm/actions/workflows/ci.yml/badge.svg)](https://github.com/luigimartim180-ops/reabilitacao-auditiva-swarm/actions/workflows/ci.yml)
![testes](https://img.shields.io/badge/testes-32%20passando-brightgreen)
![python](https://img.shields.io/badge/python-3.10%2B-blue)
![licença](https://img.shields.io/badge/licen%C3%A7a-MIT-lightgrey)
[![app](https://img.shields.io/badge/app-online-4c8dff)](https://luigimartim180-ops.github.io/reabilitacao-auditiva-swarm/)

Sistema de reabilitação auditiva domiciliar para um idoso de 90 anos com presbiacusia,
reconstruído a partir das conversas originais (Qwen + Kimi) para um padrão auditável.

O que muda em relação ao material original:

- **Motor determinístico.** A decisão clínica vive em `swarm/engine.py`, função pura do
  perfil. O LLM não decide nada; no máximo narra o JSON.
- **Evidência rastreável.** Cada recomendação aponta para uma chave de `swarm/evidence.py`
  com citação, URL e grau (A–D). O motor falha se alguma referência não resolver.
- **Cinco agentes com contrato.** Gatilho, entrada, saída, critério de parada e lacunas de
  evidência declaradas (`swarm/contracts.py`, `docs/SWARM_V3.md`).
- **App funcional em pt-BR.** Treino de fala em ruído e resolução temporal com áudio real
  (Web Audio + voz pt-BR), e geração do protocolo offline no próprio aparelho.
- **Testes.** 32 casos: motor, entrada inválida, contratos, resolução de citações e
  paridade Python↔JS.

## Comece por aqui

| Quero… | Vá para |
|---|---|
| Usar o treino com o idoso | [app online](https://luigimartim180-ops.github.io/reabilitacao-auditiva-swarm/) ou `make serve` |
| Ver o protocolo em texto | `make demo` |
| Inspecionar todos os arquivos | `make browse` → `app/browse.html` |
| Entender a arquitetura | [`docs/ANALYSIS.md`](docs/ANALYSIS.md) |
| Ver a base científica | [`docs/EVIDENCE.md`](docs/EVIDENCE.md) |
| Ler o plano de 8 semanas | [`docs/PROTOCOL_8_WEEKS.md`](docs/PROTOCOL_8_WEEKS.md) |
| Conhecer os limites clínicos | [`docs/SAFETY.md`](docs/SAFETY.md) |

## Estrutura

```
swarm/            motor determinístico (Python)
  evidence.py     registro de evidências (claim, efeito, citação, URL, grau)
  schema.py       perfil validado (campos obrigatórios e opcionais)
  contracts.py    contratos de primeira classe dos 5 agentes
  engine.py       os 5 agentes + plano de 8 semanas + perguntas de calibragem
  cli.py          entrada de linha de comando (texto ou --json)
app/
  index.html      estação de treino e triagem (pt-BR, áudio real)
  protocol.js     espelho do motor para rodar offline no navegador
tools/
  build_browser.py  gera o navegador de arquivos estático (browse.html)
tests/            32 testes (pytest) incluindo paridade Python↔JS
docs/             análise, arquitetura, evidências, protocolo, segurança
```

## Como rodar

### App de treino

```bash
make serve        # http://localhost:12000
```

Abra, calibre o volume, faça os dois testes e gere o protocolo. Para pré-visualizar sem
completar os testes: `http://localhost:12000/?demo=1` (resultados) ou `?demo=2`
(resultados + formulário de protocolo).

### Protocolo em Python

```bash
make demo                                          # texto legível
python -m swarm.cli examples/profile.json --json   # JSON completo
```

Sem argumento, `python -m swarm.cli` imprime as perguntas de calibragem.

### Navegador de arquivos

```bash
make browse       # gera app/browse.html, servido em http://localhost:12000/browse.html
```

### Testes e verificação

```bash
make test         # pytest (32 testes)
make check        # node --check em protocol.js e no script do index.html
make ci           # test + check (o mesmo que a CI roda)
```

## Fluxo do motor

```
perfil validado -> A1 sinal -> A2 dosagem -> A3 transferência -> A4 família -> A5 segurança
                                |
                                v
        protocolo JSON + referências resolvidas + plano de 8 semanas
```

A ordem não é estética: A1 (sinal) entrega ganho no dia 1; A2–A4 consolidam em 2–8 semanas.
`build_protocol` termina chamando `_assert_refs_resolve`, então nenhuma recomendação pode
citar uma chave de evidência inexistente.

## Limites, sem marketing

- Perda coclear não se reverte (`presbycusis_irreversible`).
- O teste do app é orientativo, não clínico.
- tDCS e protocolos experimentais não entram no plano domiciliar.
- Red flags escalam para avaliação médica antes de qualquer treino.

Ver [`docs/SAFETY.md`](docs/SAFETY.md).

## Licença

MIT — ver [`LICENSE`](LICENSE).
