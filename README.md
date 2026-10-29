# Reabilitação Auditiva — SWARM v4

[![CI](https://github.com/luigimartim180-ops/reabilitacao-auditiva-swarm/actions/workflows/ci.yml/badge.svg)](https://github.com/luigimartim180-ops/reabilitacao-auditiva-swarm/actions/workflows/ci.yml)
![testes](https://img.shields.io/badge/testes-88%20passando-brightgreen)
![python](https://img.shields.io/badge/python-3.10%2B-blue)
![licença](https://img.shields.io/badge/licen%C3%A7a-MIT-lightgrey)
[![app](https://img.shields.io/badge/app-online-4c8dff)](https://luigimartim180-ops.github.io/reabilitacao-auditiva-swarm/)

Sistema de reabilitação auditiva domiciliar para um idoso de 90 anos com presbiacusia,
construído para um padrão auditável: decisão determinística, evidência rastreável e
medição que declara o que **não** consegue provar.

## O que o v6 entrega

- **Um desfecho primário funcional.** O HHIE-S (10 itens, 0–40) é a medida principal.
  Ele mede handicap percebido, não sensibilidade auditiva, e é o número mais próximo da
  vida real que o app consegue produzir.
- **Cinco medidas separadas, sem misturar as coisas.**
  - *Tarefa treinada*: fala em ruído com 4 alternativas e escada adaptativa 2-down/1-up
    (alvo ≈ 71% de acerto, acima do acaso de 25%). O resultado é um **SNR relativo**, não
    QuickSIN, não audiograma.
  - *Transferência*: formas de frase que nunca aparecem no treino. É **exploratória**:
    a evidência mostra transferência limitada para estímulos não treinados.
  - *Vida real*: 4 frases longas do dia a dia, fixas, com pontuação em **% de acerto**.
    É **exploratório** e opcional: frase longa mede audição, memória e atenção juntas.
  - *Fala corrida*: um texto contínuo (telejornal, entrevista, esporte) que toca **uma
    vez** e não repete, com 4 perguntas depois. É o mais perto da TV e do YouTube que o
    app consegue chegar; também **exploratório**.
  - *Temporal*: detecção de gap. O treino melhora a tarefa treinada; transferência para
    fala no ruído **não foi estabelecida**.
- **Frases simples mantidas, teto mais alto.** As frases curtas originais continuam; o
  treino agora sobe em degraus N1 (curta e previsível) → N2 (média do dia a dia) →
  N3 (longa com dois fatos, ordem ou inferência) → N4 (relato de 2–3 frases com pergunta
  de sentido). As formas de teste A/B/C não foram reescritas, para a linha de base
  continuar comparável. Detalhes em [docs/SENTENCES_V5.md](docs/SENTENCES_V5.md).
- **Treino do áudio que não para.** Além das frases, o treino tem **texto corrido** em
  quatro níveis (D1 nota curta ~20 s → D4 entrevista ~60 s), com o áudio tocando uma vez
  e as perguntas vindo depois. No treino, "Ouvir o texto de novo" fica sempre visível e
  **sem limite** — cada repetição é contada, trava as respostas enquanto toca e soma no
  teto de 10 min. Na avaliação não existe repetição. Detalhes em [docs/CONNECTED_SPEECH_V6.md](docs/CONNECTED_SPEECH_V6.md).
- **Treino de 8 semanas no próprio navegador.** Sessões curtas, 2–3 dias por semana. Mais de
  uma sessão no mesmo dia é permitida — o app não trava: o que limita é o teto de 10 min de
  escuta por dia, e a adesão semanal conta **dias** com treino (duas sessões na terça = 1 dia). 1 sessão curta por dia de treino,
  2–3 dias por semana, teto de 10 min/dia. O app lê o plano determinístico, conduz a
  sessão adaptativa, faz o treino de gap da semana 5 e termina sempre em um acerto.
- **Relatório e pacote de dados.** Relatório em seis seções com nível de confiança,
  limitações e sinais de parada. Exporta `audioswarm.v1.1` em JSON (medidas, sessões,
  aderência, modificações, segurança e o plano determinístico).
- **Segurança explícita.** Evento adverso pausa o treino; a retomada exige confirmação.
  Aviso de streaming: não usar TV/telefone nos ouvidos em escadas ou na rua.
- **Testes de verdade.** 130 testes (motor, medição, contratos, paridade Python↔JS,
  contratos estáticos do app). O app também tem um smoke test opcional com jsdom que
  percorre avaliação, treino, relatório, exportação/importação e modo demonstração.

## Comece por aqui

| Quero… | Vá para |
|---|---|
| Usar o treino com o idoso | [app online](https://luigimartim180-ops.github.io/reabilitacao-auditiva-swarm/) ou `make serve` |
| Ver o protocolo em texto | `make demo` |
| Entender a arquitetura | [`docs/SWARM_V3.md`](docs/SWARM_V3.md) |
| Ver a base científica | [`docs/EVIDENCE.md`](docs/EVIDENCE.md) |
| Ler o plano de 8 semanas | [`docs/PROTOCOL_8_WEEKS.md`](docs/PROTOCOL_8_WEEKS.md) |
| Conhecer os limites clínicos | [`docs/SAFETY.md`](docs/SAFETY.md) |
| Entender a medição | [`docs/MEASUREMENT.md`](docs/MEASUREMENT.md) |
| Ler a auditoria e o que mudou | [`docs/AUDIT_V4.md`](docs/AUDIT_V4.md) |

## Estrutura

```
swarm/            motor determinístico (Python)
  evidence.py     registro de evidências (claim, efeito, citação, URL, grau)
  schema.py       perfil validado (campos obrigatórios e opcionais)
  contracts.py    contratos de primeira classe dos 5 agentes
  measurement.py  matemática da medição (HHIE-S, escadas, estimadores)
  engine.py       os 5 agentes + plano de 8 semanas + medição + treino + limites
  cli.py          linha de comando (texto ou --json)
app/
  index.html      shell do app (pt-BR, acessível, 7 abas)
  app.js          avaliação, treino, diário, relatório e exportação
  protocol.js     espelho do motor e da medição (roda offline)
tools/
  build_browser.py  gera o navegador de arquivos estático (browse.html)
  smoke_app.js      smoke test opcional do app com jsdom
tests/            130 testes (pytest) incluindo paridade Python↔JS
docs/             análise, arquitetura, evidências, protocolo, segurança, medição
```

## Como rodar

### App de treino

```bash
make serve        # http://localhost:12000
```

Abra em janela completa (ou publique em HTTPS). O preview em iframe bloqueia a síntese
de fala; os ruídos continuam funcionando. Sem voz, a avaliação e o treino ficam
bloqueados — o app não simula a voz.

Para pré-visualizar sem completar a avaliação:

- `?demo=1`: estado de demonstração (semana 4, dados fictícios).
- `?demo=2`: demonstração já na aba Relatório.
- `?demo=3`: demonstração já na aba Plano.

Os dados de demonstração não são salvos.

### Protocolo em Python

```bash
make demo                                          # texto legível
python -m swarm.cli examples/profile.json --json   # JSON completo
```

Sem argumento, `python -m swarm.cli` imprime as perguntas de calibragem.

### Diário da semana

O diário (aba **Vida real**) salva sozinho enquanto você preenche: pode fechar o app,
desligar o computador ou ir treinar que, ao voltar, ele continua de onde parou. Cada semana
tem o seu registro e nada é apagado ao mudar de semana — o histórico fica em
*"Semanas de diário já salvas"* e no relatório. O botão **Salvar agora** continua existindo
para quando você quiser confirmar na hora.

### Se o diário parecer vazio

O diário é gravado **a cada letra**, sem clique. Se ele aparecer vazio:

1. Confira o seletor **“Semana deste diário”** dentro do cartão do diário. O app mostra a
   semana atual por padrão; um diário escrito na semana anterior continua salvo, só precisa
   ser selecionado. A tabela **“Semanas de diário já salvas”** lista tudo o que existe.
2. Se a última frase digitada sumiu depois de desligar no meio da escrita, reabra o app: a
   cópia de segurança da digitação é recuperada e o status diz **“recuperada após fechar o
   app”**.
3. As mesmas três causas do item anterior valem aqui: modo demonstração (`?demo=`),
   armazenamento bloqueado e **URL de preview diferente** (cada endereço é outro site para
   o navegador).

### Se uma sessão não aparecer no histórico

1. Olhe o selo no topo: **salvo HH:MM** significa que a sessão foi gravada. Se estiver
   **memória temporária** ou **demo: não salva**, nada fica guardado.
2. Se aparecer o banner **“MODO DEMONSTRAÇÃO”**, a URL tem `?demo=`. Use o botão
   *Sair da demonstração* — dados de demonstração nunca são salvos.
3. Se aparecer **“este navegador está bloqueando o armazenamento”** (preview em iframe ou
   navegação privada), abra em janela completa ou publique em https e exporte o backup
   antes de fechar.
4. A sessão é gravada **no momento em que termina**, mesmo sem responder o cansaço. Se o
   app for fechado no meio, ao reabrir aparece *Retomar de onde parou*.
5. A contagem **“Sessões salvas”** na tela inicial e o diagnóstico em Ajustes mostram
   quantos registros existem.

6. **Use sempre a mesma URL.** O navegador guarda os dados por endereço. Um preview novo
   (endereço diferente) é, para o navegador, outro site: o histórico antigo não aparece.
   Publique em https (Netlify/GitHub Pages) ou mantenha o mesmo link, e exporte o pacote
   para levar os dados de um endereço a outro (Relatório → Exportar).

Sessões interrompidas antes desta correção e nunca gravadas não podem ser recuperadas: o
app não inventa histórico. A aderência é medida a partir de registros reais.

### Compreensão de vida real

Bloco novo e **opcional** dentro da avaliação (entre a fala em ruído e o gap):

- 4 frases longas, mesmo ruído relativo (+8 dB), sem escada adaptativa;
- pontuação só em **% de acerto** — não é limiar e não entra no cálculo do SNR;
- conjunto 1 na linha de base e na semana 8, conjunto 2 na semana 4 e na retenção;
- dá para pular; o relatório registra o pulo e não inventa número.

Por que é exploratório: acertar frase longa exige audição **e** memória **e** atenção.
Com 4 itens, um item vale 25 pontos percentuais.

### O progresso não se perde (v6.2)

- A **avaliação inicial não é obrigatória**: o treino roda sem ela, com aviso de que
  sem linha de base não há como comparar mudança.
- O estado vive em **três camadas**: `localStorage` (principal), uma **cópia espelho**
  na mesma origem e, quando servido por `make serve`, uma **cópia no servidor** em
  `data/app-state.json`.
- Se a URL mudar (preview reiniciou) ou o servidor cair, ao abrir o app ele **adota o
  progresso do servidor** e avisa: *"Progresso recuperado do servidor"*. A sessão
  interrompida também volta, pelo rascunho.
- Em hospedagem estática (sem API), use **Ajustes → Código de retomada**: um texto
  `AW1.…` com todo o progresso, para colar em outro aparelho/endereço.

Detalhes: [docs/PERSISTENCE.md](docs/PERSISTENCE.md).

### Fala corrida (texto contínuo)

O ponto que mais atrapalha na vida real: entrevista, telejornal e programa de
esportes chegam **corridos, sem pausa e sem botão de repetir**.

- **34 textos originais** (nada copiado de programa), 136 perguntas, gêneros
  telejornal, entrevista, jornal e esporte — 8 por faixa para treino, mais 2
  reservados para a avaliação;
- o sorteio **nunca repete o texto anterior** e usa todos os da faixa antes de
  reciclar; quando a faixa acaba, pega um da faixa vizinha;
- o áudio toca uma vez; as perguntas aparecem depois;
- no treino, **"Ouvir o texto de novo" sem limite** (contado no histórico e no
  tempo do dia); na avaliação **não há** botão de repetir;
- D1 (~20 s) → D4 (~60 s), uma faixa a cada duas semanas, com botão de subir ou
  descer um degrau;
- dois textos ficam reservados para medir e nunca entram no treino;
- resultado só em **% de acerto**, com o aviso de que 4 perguntas = 25 p.p. por
  pergunta.

Para o áudio real, o protocolo continua sendo o trecho de 1–2 min do programa
dele, assistido uma vez, com três perguntas escritas pela família e anotação no
diário — isso o app não mede.

### Testes e verificação

```bash
make test         # pytest (130 testes)
make check        # node --check em protocol.js e app.js + contratos do HTML
make ci           # test + check (o mesmo que a CI roda)
make serve        # app em http://localhost:12000 COM progresso salvo no servidor
make smoke        # opcional: fluxo completo no jsdom (requer npm install jsdom)
make e2e-sync     # opcional: app + servidor reais; prova que o progresso volta após queda/URL nova
```

## O que conta como resultado

O app separa quatro níveis e só o primeiro é funcional:

| Nível | Medida | Papel | O que não é |
|---|---|---|---|
| Funcional | HHIE-S (0–40) | **primário** | não é audiograma |
| Tarefa | fala em ruído (dB relativo) | secundário | não é QuickSIN nem dB HL |
| Transferência | formas não treinadas | exploratório | não é prova de vida real |
| Temporal | gap (ms) | específico da tarefa | não prediz fala no ruído |

Uma mudança menor que a faixa de medição não é interpretável. O relatório diz isso em
cada medida e inclui o nível de confiança.

## Dose, sem invenção

O único estudo randomizado de dose no plano (`humes_dosage_2014`) comparou **2×/semana
com 3×/semana** por 5–15 semanas e **não encontrou diferença**. O braço diário **não foi
testado**. O app usa 1 sessão curta por dia de treino, 2–3 dias por semana, e um teto de
10 min/dia que é **guarda de tolerabilidade**, não dose ótima. A sessão de 6 min é mais
curta que o protocolo de laboratório; equivalência é desconhecida.

## Limites, sem marketing

- Perda coclear não se reverte (`presbycusis_irreversible`).
- O teste do app é caseiro, não calibrado e não é exame clínico.
- A voz é sintética; as formas de teste não são equacionadas.
- O gap é tarefa treinada; transferência para fala não foi estabelecida.
- ACHIEVE 2023: o desfecho cognitivo primário foi nulo; não há promessa de prevenção de
  demência.
- tDCS e protocolos experimentais não entram no plano domiciliar.
- Red flags escalam para avaliação médica antes de qualquer treino.

Ver [`docs/SAFETY.md`](docs/SAFETY.md).

## Licença

MIT — ver [`LICENSE`](LICENSE).
