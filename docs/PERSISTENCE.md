# Persistência v6.2 — voltar onde estava, mesmo com o servidor caindo

Duas queixas, uma causa cada:

1. "está me obrigando a fazer a avaliação antes do treino" → a avaliação inicial
   era um portão no `startTraining`.
2. "o treino não voltou na posição que estávamos" → o progresso existia, mas o
   navegador não o entregava de volta.

## Por que o progresso "sumia"

O app salva no `localStorage`, e `localStorage` pertence à **origem** da página
(`protocolo + host + porta`). O preview do sandbox muda de host quando o sandbox
reinicia. Origem nova = armazenamento novo e vazio. Nada foi apagado: o app
simplesmente passou a olhar para uma gaveta diferente.

Sintoma exato: o app abria na semana 1, com `baselineDone = false`, e pedia a
avaliação de novo — que é justamente o que o usuário descreveu.

## O que mudou

### 1. A avaliação inicial deixou de ser obrigatória

- O treino abre e roda sem linha de base.
- No lugar do bloqueio há dois avisos (home e aba de treino): *"Sem avaliação
  inicial. O treino está liberado; só não há linha de base para comparar mudança
  depois"*, com um botão para fazê-la quando quiser.
- O relatório continua dizendo, sem rodeio, que sem HHIE-S de linha de base
  qualquer comparação funcional fica inválida.
- O que **continua** bloqueando: evento adverso (`state.paused`) e o teto de
  10 min de escuta por dia. Segurança não é burocracia.

### 2. Três camadas de persistência

| Camada | Onde fica | Sobrevive a |
|---|---|---|
| Principal | `localStorage["audioswarm.v4.state"]` | fechar aba, trocar de app, desligar |
| Espelho | `localStorage["audioswarm.v4.state.mirror"]` | chave principal corrompida ou estourada |
| Servidor | `data/app-state.json` (via `tools/serve.py`) | queda do servidor, troca de porta/host, limpeza do navegador |

- **Espelho**: gravado a cada `save()`. Se a chave principal sumir ou não for
  JSON válido, o app carrega o espelho, regrava a principal e avisa: *"Progresso
  recuperado da cópia local"*.
- **Servidor**: o app detecta `/api/state` sozinho.
  - ao abrir: `GET /api/state`;
  - a cada save: `POST` com atraso de 0,9 s (agrupado, para não escrever a cada tecla);
  - ao esconder/fechar a aba: `navigator.sendBeacon` (não perde o último evento).
- Regra de adoção, para não sobrescrever trabalho recente:
  - navegador **sem atividade** e servidor **com atividade** → adota o servidor;
  - os dois com atividade → adota o que tiver `savedAt` mais recente (margem de 2 s);
  - navegador com atividade mais nova → mantém o navegador e reenvia para o servidor.

`hasActivity()` considera: **semana acima da 1**, avaliação feita, sessões,
HHIE-S, testes de fala, gap, vida real, fala corrida, texto corrido, diário, TV,
música e eventos. `createdAt` **não** conta (todo boot cria um estado novo com
`createdAt`).

A semana acima da 1 entrou depois de um teste ponta a ponta: quem só tinha
avançado de semana, sem sessão registrada, era lido como "sem atividade" e o
progresso do servidor não era adotado — a pessoa voltava para a semana 1.

### 3. O rascunho da sessão também viaja

O `POST` inclui o rascunho da sessão interrompida (`audioswarm.v4.state.draft`).
Se a origem mudar no meio de uma sessão, ao abrir no endereço novo o app oferece
"Retomar sessão interrompida" no ponto onde parou — não só a semana e o histórico.

### 4. Código de retomada (para quando não há servidor)

Em **Ajustes → Código de retomada**: gera um texto `AW1.…` (base64 do estado
inteiro). Serve para trocar de celular ou levar o progresso para outra URL, onde
não existe `/api/state` (Netlify, GitHub Pages). Colar e restaurar substitui o
estado local — por isso pede confirmação.

### 5. "Apagar tudo" apaga tudo mesmo

`resetAll` remove chave principal, espelho, rascunho, diário e regrava o estado
vazio no servidor. Antes, o espelho faria o estado antigo ressuscitar.

## Como isso é testado

Três níveis, do mais barato ao mais caro:

| Teste | Comando | O que prova |
|---|---|---|
| Unitário/estático | `make test` | espelho, código de retomada, regra de adoção, `hasActivity`, `/api/state` real em `tests/test_serve.py` |
| Navegador simulado | `make smoke` | os fluxos da tela (jsdom), com `fetch` dublado |
| **Ponta a ponta** | `make serve` + `make e2e-sync` | `app/` real falando com `tools/serve.py` real: grava, simula queda + origem nova com `localStorage` vazio, confere que o progresso volta |

`tools/probe_e2e_sync.js` é o único que exercita disco de verdade — por isso é
o que pega falhas de regra de adoção. Ele zera `data/app-state.json` ao começar.

## O que o app mostra sobre isso

- **Ajustes → Backup e dados**: linha de status —
  *"Cópia no servidor ativa: se o servidor cair ou a URL mudar, o app recupera o progresso daqui."*
  ou *"Sem cópia no servidor (hospedagem estática)…"*.
- Ao adotar o servidor: toast *"Progresso recuperado do servidor: semana N · X sessão(ões)"*.

## Privacidade

O arquivo `data/app-state.json` é local, do seu computador, e está no
`.gitignore` — não é versionado, não vai para o GitHub e não sai da máquina. Em
hospedagem estática esse arquivo nem existe.

## Limites honestos

- Se você abrir o app em **outro navegador** ou **outro aparelho** sem levar o
  código de retomada, o progresso continua na máquina original. Isso é
  consequência de não haver conta/servidor na nuvem — e é uma escolha de
  privacidade, não um bug.
- A cópia do servidor só existe quando o app é servido por `tools/serve.py`. O
  `python -m http.server` simples não tem a API (use `make serve-static` só para
  olhar a interface).
- Duas abas abertas ao mesmo tempo: a que salvar por último vence. O app não tem
  bloqueio de edição concorrente.

## Como verificar

```bash
make serve                    # http://localhost:12000 (com /api/state)
curl -s localhost:12000/api/health
curl -s -X POST -H 'Content-Type: application/json' \
     -d '{"state":{"week":3}}' localhost:12000/api/state
# derrube o servidor (Ctrl+C), suba de novo e leia:
curl -s localhost:12000/api/state
```

Testes automáticos: `tests/test_serve.py` sobe o servidor de verdade, grava,
descarta o objeto e lê o arquivo de novo (prova a sobrevivência à queda), além de
checar escrita atômica, 204 quando vazio, 400 em corpo inválido e 413 acima do
limite. `tools/smoke_app.js` verifica, no navegador simulado: treinar sem
avaliação, recuperação pelo espelho, adoção do estado do servidor (com POST de
volta) e ida-e-volta do código de retomada.
