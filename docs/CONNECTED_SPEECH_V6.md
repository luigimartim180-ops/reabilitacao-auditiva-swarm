# Fala corrida v6 — o áudio que não para

A v5 subiu o teto das **frases** (N1 → N4). O participante foi melhor nelas e
continuou não entendendo **entrevista, telejornal e programa de esportes**. A
queixa dele descreve exatamente isso: "o áudio é corrido e não para".

Este documento explica por que frase longa não resolve esse problema, o que foi
construído no lugar, e o que a evidência permite e não permite afirmar.

## Por que frase por frase não resolve

Uma frase longa treina **decifrar uma frase**: ele ouve, tem alguns segundos,
responde. No YouTube há três diferenças que nenhum item de frase reproduz:

1. **O áudio não espera.** Na rua, na TV e no YouTube não existe botão de
   repetir; se ele perde o fio no meio, o resto do texto não volta. (No treino
   do app o botão existe e é livre — ver abaixo; o que não pode existir é na
   medição.)
2. **O conteúdo se acumula.** Para responder "o que o técnico disse sobre o
   atacante", ele precisa segurar quem é o atacante, o que aconteceu e o que foi
   dito — três informações ao mesmo tempo.
3. **A velocidade é a da fala natural**, com poucas pistas de sintaxe e sem
   pausa entre ideias.

A literatura é consistente nos três pontos: idosos perdem mais reconhecimento
que jovens conforme a velocidade da fala aumenta, e a perda cresce quando há
menos pistas linguísticas (`fast_speech_aging_2001`); lembrar fala no ruído
custa memória e atenção, não só audição (`connected_speech_memory_1995`); e a
memória de trabalho aparece como preditor consistente, ainda que secundário, do
desempenho em fala-em-ruído (`working_memory_sin_2008`).

## O que foi construído

### 1. Banco de texto corrido (34 textos, 136 perguntas)

Original, escrito no gênero — nada copiado de programa nenhum:

| Nível | Texto | Palavras | Duração aprox. | Para treino | Uso |
|---|---|---|---|---|---|
| D1 | nota curta (3 frases) | 37–45 | ~20 s | 8 | semanas 1–2 |
| D2 | notícia (5 frases) | 67–83 | ~30 s | 8 (+2 reservados) | semanas 3–4 |
| D3 | reportagem (6–7 frases) | 108–118 | ~45 s | 8 | semanas 5–6 |
| D4 | entrevista longa (7–8 frases) | 125–146 | ~60 s | 8 | semanas 7–8 |

Os dois textos reservados para a avaliação (`d03`, `d04`) nunca entram no
treino. Sobram **32 textos de treino: 8 por faixa**.

Gêneros: **telejornal**, **entrevista**, **jornal** e **esporte**. Cada texto tem
4 perguntas de tipos diferentes: ideia principal, detalhe, ordem e inferência.
Nenhuma pergunta é "qual palavra você ouviu".

**Regra do sorteio** (antes eram 2 textos por faixa e o app repetia logo):

1. nunca repete o texto imediatamente anterior;
2. primeiro um texto **inédito**, na faixa da semana e depois nas faixas vizinhas;
3. quando todos já foram ouvidos, usa o **mais antigo** (não o aleatório).

Na prática, nas semanas 1–2 há 8 textos de D1 + 8 de D2 antes de qualquer
repetição. O cartão mostra "Nesta faixa: 8 textos, N ainda não ouvidos".

### 2. O áudio toca uma vez — e no treino pode ser repetido

No treino e na avaliação, o texto é lido do começo ao fim e **as perguntas só
aparecem depois**.

- **Na avaliação não existe botão de repetir.** Ali é medição: repetir mudaria a
  nota e estragaria a comparação com a semana 4 e a semana 8.
- **No treino existe, sempre visível e sem limite** ("Ouvir o texto de novo").
  Treino é prática: travar sem poder ouvir de novo não ensina nada, só irrita.
  Cada repetição é **contada** (`replays`), aparece no relatório, trava as
  respostas enquanto o áudio roda e **soma tempo** no teto de 10 min do dia.
  Quando há repetição, o resumo diz que o acerto não é comparável a uma escuta
  única.

A regra que fica: o número de repetições é registro honesto, não penalidade. Se
ele repetiu 3 vezes, o resultado vale como treino daquele dia — não entra em
comparação de evolução.

### 3. Dois textos ficam reservados para medir

`d03` e `d04` nunca entram no treino. Sem isso, a medida passaria a testar o
texto que ele já praticou — o erro clássico de treinar no teste.

### 4. Ele pode subir de nível sozinho

O nível automático segue a semana (uma faixa a cada duas semanas), mas o cartão
tem **◀ mais fácil / mais difícil ▶**. O app sugere subir quando ele acerta
3 de 4 em duas sessões seguidas, e não força nada. Quem decide o ritmo é a
tolerância dele, não o calendário.

### 5. Medida na avaliação (exploratória)

Um texto D2 (~30 s), 4 perguntas, mesma condição de ruído (+10 dB relativo),
sem repetição. Conjunto 1 (`d03`) na linha de base e na semana 8; conjunto 2
(`d04`) na semana 4 e na retenção. Resultado: **% de acerto**, com o aviso de
que uma pergunta vale 25 pontos percentuais.

## O que a evidência sustenta

- Treinar com **fala contínua natural seguida de pergunta de compreensão**,
  variando a carga de memória, melhora fala-em-ruído em idosos — e o ganho foi
  maior justamente em quem tinha mais perda e menos memória de trabalho
  (`continuous_speech_training_2025`). O desenho adotado aqui (texto inteiro →
  pergunta) é o mesmo princípio.
- A dificuldade com fala acelerada cresce com a idade e com a redução de pistas
  (`fast_speech_aging_2001`) — por isso a escada começa devagar e sobe a
  duração, não a velocidade.
- Memória e atenção fazem parte da tarefa (`connected_speech_memory_1995`,
  `working_memory_sin_2008`) — por isso o bloco é **exploratório** e nunca é
  apresentado como limiar auditivo.

## O que este bloco NÃO prova

- que ele vai entender a TV: a voz é sintética, mais lenta e mais limpa que a
  fala de um repórter. O app diz isso na tela e no relatório;
- que houve ganho de audição: o escore mistura audição, memória e atenção;
- que 4 perguntas medem compreensão "de verdade": medem uma amostra, com
  resolução de 25 pontos percentuais;
- que os dois textos de medida têm a mesma dificuldade: não foram equalizados.

Para o teste com áudio real, o caminho é outro e está no protocolo: escolher um
trecho de 1–2 minutos do programa dele, assistir **uma vez**, e responder três
perguntas escritas pela família (quem, o que, o que vai acontecer). Isso é
registrado no diário, não no teste do app.

## Como usar na rotina

- **Semanas 1–2:** um texto D1 por dia de treino; repetir à vontade se travar —
  o app conta e mostra quantas vezes.
- **Semanas 3–4:** D2, tentando ouvir uma vez só; se repetir, tudo bem, o
  registro mostra.
- **Regra de leitura:** corrida com repetição é treino; corrida sem repetição é
  o que se compara semana a semana.
- **Semanas 5–6:** D3. Se o cansaço passar de 4/5, ficar em D2.
- **Semanas 7–8:** D4, que é a duração de um trecho de entrevista.
- **Sempre:** o texto corrido entra na dose do dia (10 min de teto), contando
  cada repetição. O app contabiliza ~1,2 s por palavra falada.

## Referências

- Frei V, Giroud N. *Immersive auditory-cognitive training improves
  speech-in-noise perception in older adults with varying hearing and working
  memory.* npj Sci Learn. 2025;10(1). → `continuous_speech_training_2025`
- Pichora-Fuller MK, Schneider BA, Daneman M. *How young and old adults listen to
  and remember speech in noise.* J Acoust Soc Am. 1995;97(1):593–608. →
  `connected_speech_memory_1995`
- Gordon-Salant S, Fitzgibbons PJ. *Sources of age-related recognition difficulty
  for time-compressed speech.* J Speech Lang Hear Res. 2001;44(4):709–719. →
  `fast_speech_aging_2001`
- Akeroyd MA. *Are individual differences in speech reception related to
  individual differences in cognitive ability?* Int J Audiol.
  2008;47(Suppl 2):S53–S71. → `working_memory_sin_2008`
- Material de frases (v5) → [SENTENCES_V5.md](SENTENCES_V5.md)
