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
  A5 segurança), o plano de 8 semanas, o plano de medição, o plano de treino e o bloco
  de limites.
- `swarm/measurement.py` — matemática pura da medição: HHIE-S, escada 2-down/1-up,
  estimador de limiar, passo e estimador de gap, clamp. Não contém decisão clínica.
- `app/index.html` — shell do app pt-BR (7 abas, acessibilidade, aviso de voz/iframe).
- `app/app.js` — avaliação (HHIE-S + fala em ruído + gap), treino de 8 semanas,
  treino de gap, diário, relatório e exportação/importação. Não recalcula limiar:
  usa `SwarmEngine.measure`.
- `app/protocol.js` — espelho do motor **e da medição** para rodar offline. **Deve**
  ficar idêntico ao Python; `tests/test_parity.py` falha se divergir.
- `app/app.js` `ITEMS` — banco de frases (89 itens) com `tier`, `kind`, `domain`; as
  formas A/B/C são medidas repetidas e **não devem ser editadas**. O plano de níveis do
  treino vem do motor (`content.training_ladder`), nunca de lista solta no app.
- `app/app.js` `DISCOURSE` — 10 textos corridos (telejornal, entrevista, jornal, esporte)
  em D1–D4, 4 perguntas cada. `d03` e `d04` são **reservados para a avaliação** e não
  podem entrar no treino (`DISCOURSE_RESERVED`). O áudio toca uma vez; a repetição no
  treino é opcional e contada.
- `tests/` — pytest. `docs/` — análise, arquitetura, evidências, protocolo, segurança,
  medição, material de frases (`SENTENCES_V5.md`), fala corrida
  (`CONNECTED_SPEECH_V6.md`) e auditoria do v4.

## Ordem dos agentes importa

A1 (sinal) vem primeiro porque entrega ganho no dia 1 (streaming de TV, microfone
remoto). A2–A4 consolidam em 2–8 semanas. Não reordene sem justificativa de evidência.

## Comandos

```bash
make test     # pytest (106 testes)
make check    # node --check em protocol.js e app.js + contratos do HTML
make ci       # test + check (o mesmo que a CI roda)
make smoke    # opcional: fluxo completo do app no jsdom (npm install jsdom), 136 checks
make serve    # app em http://localhost:12000
make demo     # protocolo a partir de examples/profile.json
```

## Convenções

- Comentários só quando o código não é óbvio; sem narrar histórico.
- Texto de UI em pt-BR. Código e chaves de evidência em inglês.
- Nunca prometa reversão de perda auditiva; o teto está em `presbycusis_irreversible`.
- Não coloque tDCS nem protocolo experimental no plano domiciliar.
- Ao adicionar evidência, prefira meta-análise/RCT (grau A/B) e registre a URL real.
- Se alterar `engine.py` **ou** `measurement.py`, atualize `protocol.js` e rode
  `make test` (paridade). A ordem que funciona: Python primeiro, espelho depois.
- Não volte a colocar JavaScript inline no `index.html`: `make check` e a CI validam
  `app/app.js` e `app/protocol.js`.
- O app não pode prometer prova de melhora, cura, prevenção de demência, dose diária
  ótima, QuickSIN caseiro ou transferência do gap para fala. `tests/test_app_static.py`
  verifica isso.
- `tools/smoke_app.js` é opcional e depende de jsdom; não faz parte da CI.

## Acesso às conversas originais

- Qwen: `GET https://chat.qwen.ai/api/v2/chats/share/<id>` devolve JSON do histórico.
- Kimi: página renderizada no cliente; usar navegador.
