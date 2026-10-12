# AGENTS.md

Memória do repositório para agentes de IA. Leia antes de mexer.

## O que é este repositório

Sistema de reabilitação auditiva (idoso de 90 anos) reconstruído a partir de duas
conversas originais (Qwen e Kimi). O foco não é "ter 5 agentes bonitos", é ter decisão
clínica auditável e um app que funcione de verdade.

## Regra de ouro (não violar)

**O LLM não decide nada clínico.** Toda recomendação nasce em `swarm/engine.py`, que é
função pura do perfil validado. Se você for adicionar texto clínico gerado por modelo,
pare: adicione uma entrada em `swarm/evidence.py` e um gatilho determinístico no motor.

## Arquitetura

- `swarm/evidence.py` — registro de evidências. Toda chave precisa de `claim`, `effect`,
  `citation`, `url` e `grade` (A–D). Nenhuma recomendação pode citar chave inexistente.
- `swarm/schema.py` — perfil validado. `PROFILE_FIELDS` são obrigatórios; faltar campo
  levanta `ProfileError`. Nunca transforme campo obrigatório em default silencioso.
- `swarm/engine.py` — os 5 agentes (A1 sinal, A2 dosagem, A3 transferência, A4 família,
  A5 segurança) e o plano de 8 semanas.
- `app/index.html` — app pt-BR, áudio real (Web Audio + voz pt-BR), testes adaptativos.
- `app/protocol.js` — espelho do motor para rodar offline. **Deve** ficar idêntico ao
  Python; `tests/test_parity.py` falha se divergir.
- `tests/` — pytest. `docs/` — análise, arquitetura, evidências, protocolo, segurança.

## Ordem dos agentes importa

A1 (sinal) vem primeiro porque entrega ganho no dia 1 (streaming de TV, microfone
remoto). A2–A4 consolidam em 2–8 semanas. Não reordene sem justificativa de evidência.

## Comandos

```bash
make test     # pytest (32 testes)
make check    # node --check no protocol.js e no script inline do index.html
make ci       # test + check (o mesmo que a CI roda)
make serve    # app em http://localhost:12000
make demo     # protocolo a partir de examples/profile.json
```

## Convenções

- Comentários só quando o código não é óbvio; sem narrar histórico.
- Texto de UI em pt-BR. Código e chaves de evidência em inglês.
- Nunca prometa reversão de perda auditiva; o teto está em `presbycusis_irreversible`.
- Não coloque tDCS nem protocolo experimental no plano domiciliar.
- Ao adicionar evidência, prefira meta-análise/RCT (grau A/B) e registre a URL real.
- Se alterar `engine.py`, atualize `protocol.js` e rode `make test` (paridade).

## Acesso às conversas originais

- Qwen: `GET https://chat.qwen.ai/api/v2/chats/share/<id>` devolve JSON do histórico.
- Kimi: página renderizada no cliente; usar navegador.
