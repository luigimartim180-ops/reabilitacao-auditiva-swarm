# Medição: o que o app mede, como e o que não pode afirmar

Este documento descreve a matemática que o app usa. A implementação de referência é
`swarm/measurement.py`; o espelho para o navegador é `SwarmEngine.measure` em
`app/protocol.js`. `tests/test_parity.py` compara os dois em casos fixos e falha se
divergirem.

## 1. Hierarquia de desfechos

| Nível | Medida | Papel | O que é | O que não é |
|---|---|---|---|---|
| Funcional | HHIE-S (0–40) | **primário** | handicap auditivo percebido, autorrelato | audiograma, sensibilidade auditiva |
| Tarefa | fala em ruído (dB relativo) | secundário | desempenho na tarefa treinada | QuickSIN, SNR loss clínico, dB HL |
| Ecológico | compreensão de vida real (% de acerto) | exploratório | 4 frases longas fixas, audição + memória + atenção | limiar auditivo, prova de transferência |
| Transferência | formas A/B/C não treinadas | exploratório | pista de generalização | prova de melhora na vida real |
| Temporal | gap (ms) | específico da tarefa | resolução temporal treinada | preditor de fala no ruído |

A ordem não é decorativa. Um teste caseiro de fala em ruído pode melhorar por prática,
fadiga, memória das frases ou mudança de volume do aparelho. O HHIE-S responde à
pergunta que importa ("o handicap percebido mudou?"), mas é autorrelato e pode mudar por
outros motivos. Nenhum dos dois é diagnóstico.

## 2. HHIE-S

- 10 itens; respostas **Sim = 4**, **Às vezes = 2**, **Não = 0**; total 0–40.
- Administração (instruções originais de Ventry & Weinstein, 1983): **não pular** um item
  porque a situação é evitada, e responder **como se ouve sem o aparelho auditivo**. O app
  declara as duas regras na tela. A versão assistida do HHIE é usada em estudos de
  benefício de aparelho, mas os pontos de corte publicados vêm da versão não assistida;
  por isso o app mantém a versão validada como desfecho primário e registra a função
  assistida no diário, na escada de TV e no relato do parceiro.
- Faixas usuais: **0–8** sem handicap percebido; **10–24** leve a moderado;
  **26–40** significativo. Como os escores são pares, 9 e 25 não ocorrem.
- **≥ 10** é o limiar usual de encaminhamento para avaliação audiológica.
- A adaptação brasileira é de Wieselberg (1997). Estudos brasileiros usam faixas um
  pouco diferentes (0–8 / 10–23 / 24–40), então o app reporta o **escore bruto** e
  trata a faixa como descritiva.
- O app usa uma tradução de trabalho dos 10 itens; não substitui a versão aplicada por
  profissional. O texto do item não foi validado item a item nesta implementação.
- Não há MCID universalmente aceito para o HHIE-S. O app usa **4 pontos** apenas como
  gatilho prático de revisão, e diz isso no relatório.

## 3. Fala em ruído (tarefa treinada)

### Procedimento

- 2 ensaios de prática com feedback, não pontuados.
- 12 ensaios medidos, sem feedback de acerto.
- 4 alternativas por ensaio (1 correta + 3 distratores), vocabulário fechado.
- Ruído rosa fixo no gerador; voz sintética pt-BR; volume do aparelho fixo.
- Condição fixa desta versão: ruído rosa no **nível 2** do gerador (ganho relativo, não
  dB SPL) e voz a **0,95×**. Qualquer mudança de nível ou velocidade quebra a comparação
  com as medidas anteriores.
- O nível de SNR é **relativo ao gerador deste app**, não dB SPL nem dB HL.

### Escada

- **2-down / 1-up**: dois acertos consecutivos tornam o próximo ensaio 2 dB mais
  difícil; um erro torna o próximo 2 dB mais fácil.
- Passo de 4 dB (o passo da escada de medição; o treino usa 2 dB).
- Início em **+8 dB**, faixa de **−12 a +16 dB**.
- Com 4 alternativas, o acaso é 25%. A regra 2-down/1-up converge para cerca de
  **70,9% de acerto**, acima do acaso. Uma regra 1-down/1-up convergiria para 50%, que
  é perto demais do acaso para um teste de 4 alternativas.
- Limiar = **média das últimas 4 reversões**.
- Faixa reportada = **metade da distância entre a maior e a menor reversão**. É um
  indicador de dispersão, **não** um intervalo de confiança de 95%.
- Se não houver reversão, o limiar cai para a média dos níveis testados e é marcado
  `censored = true`.

### Por que não é QuickSIN

O QuickSIN usa 6 frases de 5 palavras-chave em formato aberto e calcula
`SNR loss = 25,5 − acertos`; uma lista tem precisão de cerca de **±2,7 dB (95%)**. O
teste do app é fechado, com 4 alternativas, 12 ensaios e voz sintética. A escala não é
a mesma, a tarefa é mais fácil e a incerteza é maior. O app **não** aplica as faixas
normativas do QuickSIN ao resultado caseiro.

## 4. Gap (tarefa temporal)

### Procedimento

- 2 ensaios de prática com feedback.
- **12 ensaios com pausa** (pontuados) + **4 ensaios sem pausa** (catch, ~30%),
  embaralhados. Os catch não movem a escada; servem para estimar falsos positivos.
- Estímulo: rajada de ruído de **duração fixa**, com ou sem um silêncio interno.
  A duração total não muda entre os ensaios, para remover a pista de duração.
- Tarefa 2AFC: "com pausa" vs "sem pausa".

### Escada

- 2-down / 1-up, começando em **40 ms**.
- Passo: **10 ms** acima de 20 ms; **5 ms** entre 10 e 20 ms; **2 ms** abaixo de 10 ms.
- Limiar = **média geométrica das últimas 4 reversões**.
- `low_ms` / `high_ms` = menor e maior reversão; não é intervalo de confiança.
- Taxa de falso positivo = respostas "com pausa" nos ensaios sem pausa.

### O que o gap prova

A sessão de treino da semana 5 usa 4 ensaios: 3 com pausa e 1 sem pausa (controle). Só os
ensaios com pausa movem a escada; o controle serve para estimar resposta precipitada e não
entra no cálculo. O treino melhora a **tarefa treinada**, com retenção descrita em um mês
(Kishon-Rabin et al., 2013). O estudo **não** estabeleceu transferência para fala no
ruído. O app chama o gap de tarefa específica e não o usa como preditor de sucesso na
vida real.

## 4b. Compreensão de vida real (exploratória)

- 4 frases longas do dia a dia, lidas uma vez cada, no mesmo ruído relativo de
  **+8 dB** — sem escada adaptativa.
- Uma pergunta por frase (sentido, ordem ou "o que ele precisa fazer"), 4
  alternativas embaralhadas.
- Pontuação: **% de acerto** (0–100). Não existe limiar, não existe faixa de
  reversões, e o bloco **não entra** na escada de fala em ruído.
- Conjuntos alternados: conjunto 1 na linha de base e na semana 8; conjunto 2 na
  semana 4 e na retenção. Conjuntos não equacionados — o relatório avisa.
- Bloco opcional: pode ser pulado, e o pulo fica registrado (sem percentual).
- Por que é exploratório: frase longa mistura audição, memória de trabalho e
  atenção (`syntactic_complexity_aging`); material realista ganha validade
  ecológica e perde precisão (`ecological_validity_tradeoff_2025`). Com 4 itens,
  um item vale 25 pontos percentuais.

## 5. Formas e agenda

- Formas A, B e C: frases diferentes, nunca usadas no treino.
- Linha de base: forma A. Semana 4: forma B. Semana 8: forma C. Retenção: forma A.
- As formas **não são formalmente equacionadas**; uma diferença entre elas pode ser
  diferença de dificuldade, não de audição.
- Agenda: linha de base, semana 4, semana 8 e retenção cerca de 30 dias após a avaliação
  final (semana 12 do plano).
- O bloco de vida real entra nos quatro momentos, como parte opcional da bateria.

## 6. O que os números não podem dizer

- Não provam mudança fisiológica, plasticidade cortical ou prevenção de demência.
- Não substituem audiometria, imitanciometria, logoaudiometria ou verificação com
  microfone sonda (real-ear).
- Não comparam pessoas diferentes: o dB é relativo ao gerador e ao volume do aparelho.
- Não separam completamente aprendizagem de tarefa, memória das frases, fadiga e
  flutuação de atenção.
- O % de vida real não é limiar: acerto alto pode ser teto, e um erro pode ser só
  um item difícil.
- Não autorizam ajuste de aparelho, prescrição ou suspensão de medicamento.

## 7. Como reproduzir

```bash
make test        # inclui tests/test_measurement.py e tests/test_parity.py
make check       # sintaxe do espelho JS
python -m pytest tests/test_measurement.py -q
```

Casos cobertos: pontuação e faixas do HHIE-S, validação de respostas, escada
2-down/1-up, limites, censura, passos de gap, média geométrica e paridade com o
JavaScript em 5 casos de fala, 7 de gap, 3 de SNR e 4 de HHIE-S.

## 8. Referências

- Ventry IM, Weinstein BE. Identification of elderly people with hearing problems.
  ASHA. 1983;25(7):37–42.
- Wieselberg MB. A auto-percepção do handicap auditivo em idosos. PUC-SP; 1997.
- Killion MC, et al. Development of a QuickSIN. J Acoust Soc Am. 2004;116(4):2395–2405.
- Humes LE, et al. Dosage and duration of auditory training. J Acoust Soc Am.
  2014;136(3):EL224–EL230.
- Kishon-Rabin L, et al. Improved gap detection thresholds following auditory training.
  Am J Audiol. 2013;22(2):343–346.
- Bieber RE, Gordon-Salant S. Improving older adults' understanding of challenging
  speech. Hear Res. 2020;402:108054.
