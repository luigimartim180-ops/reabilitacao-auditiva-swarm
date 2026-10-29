# Auditoria v4 — achados, correções e limites

Esta é uma auditoria de **engenharia e literatura**, feita no repositório e nas fontes
citadas. Não é validação clínica, não é revisão por pares e não substitui um
fonoaudiólogo ou otorrinolaringologista. O objetivo foi responder a uma pergunta
concreta: *o app mede o que diz medir, e o texto promete mais do que a evidência
permite?*

## Veredito em uma página

O v3 tinha uma arquitetura boa (motor determinístico, evidência rastreável, contratos),
mas o **app** ainda produzia números que não sustentavam a interpretação exibida:

- o teste de gap usava **um tom vs dois tons**, o que permite resolver a tarefa pela
  duração do estímulo, não pela detecção do silêncio;
- o teste de fala dava **feedback de acerto durante a medição** e estimava o limiar com
  **um ensaio por nível** e interpolação de 50%, sem faixa de incerteza;
- não havia **HHIE-S** nem desfecho funcional; o resultado era só tarefa;
- o texto usava **faixas de QuickSIN** num teste que não era QuickSIN;
- a dose dizia **3 micro-sessões por dia**, enquanto o único estudo randomizado de dose
  comparou 2×/semana com 3×/semana e não testou o braço diário;
- não havia teto de 10 min, pausa por evento adverso, exportação versionada nem testes
  da matemática de medição.

O v4 corrige esses pontos no motor, na medição e no app. O que **não** foi feito: estudo
de validação com pacientes, equalização das formas de frase, gravação com voz humana,
calibração acústica ou revisão clínica dos itens em português. Isso está listado em
"O que ainda falta", sem maquiagem.

## P0 — achados que podiam gerar conclusão errada

| # | Achado no v3 | Evidência do problema | Correção no v4 |
|---|---|---|---|
| 1 | Gap test era "um som" vs "dois sons" | Dois tons permitem usar a duração total como pista; não é detecção de gap. A literatura de gap usa rajada de duração fixa com/sem silêncio. | 2AFC com rajada de duração fixa; 2 prática + 12 medidas + 4 catch (30%); passos 10/5/2 ms; limiar pela média geométrica das últimas 4 reversões; falso positivo reportado. |
| 2 | Teste de fala dava feedback e usava 1 ensaio por nível | Feedback durante a medição muda o desempenho; 1 ensaio por nível não estima limiar com incerteza. | 2 prática sem pontuar; 12 ensaios medidos sem feedback; escada 2-down/1-up (alvo ≈71%, acima do acaso de 25%); passo 4 dB; limiar = média das últimas 4 reversões; faixa = metade da dispersão; `censored` quando não há reversão. |
| 3 | Não havia HHIE-S nem desfecho funcional | Um teste de tarefa não responde se o handicap percebido mudou. | HHIE-S 0–40 como **desfecho primário**; 10 itens; bandas 0–8 / 10–24 / 26–40; ≥10 = encaminhamento; relatório com escore bruto e confiança moderada. |
| 4 | Resultados não chegavam ao protocolo; não havia linha de base obrigatória | Sem linha de base não há como interpretar mudança. | O app bloqueia treino antes da avaliação inicial; agenda linha de base / semana 4 / semana 8 / retenção 30 dias; o pacote exportado carrega as medidas. |
| 5 | "Prova de melhora" e faixas de QuickSIN | O teste é fechado, com voz sintética e 12 ensaios; não é QuickSIN e não tem as faixas normativas dele. | Título "Indicadores de desempenho"; teste chamado de SNR relativo; faixas de QuickSIN removidas da UI; `limits` declara `calibrated_db=false`, `clinical_inference=false`. |

## P1 — dose, segurança e voz

| # | Achado | Correção |
|---|---|---|
| 6 | Dose "3×6 min por dia" e "20 min/dia" na semana 8 | 1 sessão curta por dia de treino, **2–3 dias/semana**; teto de **10 min/dia** como guarda de tolerabilidade; texto diz que o braço diário não foi testado e que a sessão de 6 min é mais curta que o protocolo de laboratório. |
| 7 | Sem pausa por evento adverso no app | Botão "Registrar evento adverso e pausar"; treino bloqueado até "Liberar retomada"; sinais de parada e precauções no app e no relatório. |
| 8 | Voz bloqueada em iframe falhava em silêncio | Watchdog de 2,5 s + timeout duro de 12 s; banner com "Abrir em janela completa"; `cancel()` antes de falar (iOS) e keep-alive de 3 s; sem voz, avaliação e treino param — o app não simula a voz. |
| 9 | Gap era tratado como preditor de transferência | Gap é tarefa treinada; o app diz "transferência para fala não foi estabelecida"; treino de gap só na semana 5, 4 ensaios, com a mesma ressalva. |
| 10 | ACHIEVE podia virar promessa cognitiva | O texto usa o resultado primário nulo (diferença 0,002 SD, p=0,96) e o sinal de subgrupo como exploratório; nenhuma promessa de prevenção de demência. |
| 11 | "BDNF triplica plasticidade" e afins | Fora do motor e do app. O teto é explícito: perda coclear é permanente; o alvo é processamento central, atenção, estratégia e qualidade do sinal. |

## P2 — engenharia, evidência e manutenção

| # | Achado | Correção |
|---|---|---|
| 12 | `auditory_training_sin_meta` com grau A citando uma revisão de comércio | Registro revisado; a chave foi mantida, mas o grau e o texto foram ajustados; a revisão de Bieber & Gordon-Salant (2020) é a fonte principal para "transferência limitada". |
| 13 | Sem exportação/versionamento dos dados | Pacote `audioswarm.v1.1` com schema, limites, contexto, medidas, sessões, aderência, `mods`, `gapStats`, segurança e plano determinístico; exportação em arquivo + cópia; importação por arquivo. |
| 14 | Sem testes da matemática de medição | `tests/test_measurement.py` (12 testes) + paridade JS↔Python (5 casos de fala, 7 de gap, 3 de SNR, 4 de HHIE-S). |
| 15 | CI extraía script inline que não existia mais | `make check` e CI agora validam `app/protocol.js` e `app/app.js`; o HTML é checado para IDs duplicados e scripts. |
| 16 | Sem teste de UI sem navegador | `tools/smoke_app.js` (opcional, jsdom) percorre avaliação, treino, treino de gap, relatório, exportação/importação, avanço de semana, avaliação da semana 4 e modo demonstração. Resultado local: **111/111**. O harness também confere rótulos em pt-BR, a direção das mudanças, a regra do treino de gap, a recuperação do diário após desligar, a separação do diário por semana e o bloco de vida real (inclusive o caminho de pular). |

## O que foi implementado

- `swarm/measurement.py`: HHIE-S, escada 2-down/1-up, estimador de limiar, passo e
  estimador de gap, `clamp`, constantes `SPEECH_TEST` e `GAP_TEST`.
- `swarm/engine.py`: `measurement`, `training`, `limits`, quatro checkpoints
  (1/4/8/12), treino de gap na semana 5, texto de dose corrigido, sinais de parada e
  precauções.
- `swarm/evidence.py`: 36 entradas, incluindo HHIE-S, adaptação brasileira, QuickSIN,
  Humes (dose e especificidade), Kishon-Rabin, Bieber & Gordon-Salant, ACHIEVE,
  streaming e segurança.
- `app/protocol.js`: espelho do motor **e** da medição; paridade verificada.
- `app/app.js`: avaliação em três partes, treino de 8 semanas, treino de gap, diário,
  escada de TV, parceiro, música, relatório em seis seções, exportação/importação,
  diagnóstico, acessibilidade e voz com watchdog.
- `app/index.html`: shell pt-BR com 7 abas, botões grandes, alto contraste e letra
  ampliável.
- `tests/`: 99 testes, incluindo `test_app_static.py` (IDs, abas, claims proibidos,
  campos do pacote, 10 itens do HHIE-S).

## Rodada de correções (26/10)

Enquanto o app era exercitado (jsdom + inspeção estática), nove defeitos apareceram **na
própria v4**. Nenhum mudava o motor; todos mudavam o que o usuário vê ou o que o app
registra:

| Defeito | Efeito para o usuário | Correção |
|---|---|---|
| Lookups de `#btnRepeatSpeech` sobreviveram à remoção do botão | o teste estático de IDs falhava (1 falha em 70) | referências removidas; `test_every_looked_up_id_exists` volta a passar |
| Feedback do treino de gap anunciava a pausa **seguinte** | o número exibido não era o que ele tinha acabado de ouvir | o valor jogado é capturado antes da escada; o feedback usa esse valor |
| Nome do ruído cru ("rosa", "casa") no cartão de treino e na tabela | mistura de idioma justamente na tela de uso diário | `noiseLabel()` aplicado nas duas tabelas |
| Tabela de mudanças mostrava só o número com sinal | −4 pts (melhor) e +4 pts (pior) pareciam a mesma coisa | coluna com "melhor / pior / estável" e a legenda "menor é melhor" |
| Selects do perfil com valores de enum (`none`, `smart_tv`, `with_family`) | formulário em inglês para um usuário de 90 anos | mapa `OPTION_PT` |
| "Núcleo 1/8" fixo no código | divergiria se a estrutura mudasse | passa a usar `t.core.length` |
| Cartão de agente imprimia `stop_criteria` como lista crua | texto truncado e sem separador | junção com " · " |
| Rodapé dizia "31 entradas" de evidência | desatualizado; são 32 | corrigido |
| HHIE-S aplicado sem as instruções originais | pedia "responda Não se a situação não se aplica", o que contradiz a regra de não pular itens; não dizia para responder sem o aparelho | instruções originais na tela (sem aparelho, não pular); rótulo "sem aparelho" no resultado e no relatório; cada registro guarda `administration: "unaided"` |

Os contratos que impedem a volta: `tests/test_app_static.py` (IDs, claims, direção das
mudanças, regra do gap, rótulos) e `tools/smoke_app.js` (93 verificações).


## Perda de sessão relatada em uso real (26/10)

O relato foi "o sistema não está salvando meu treino" depois de uma sessão no segundo dia.
A investigação encontrou **cinco** caminhos independentes de perda, todos no app e nenhum
no motor:

| # | Causa | O que acontecia | Correção |
|---|---|---|---|
| 1 | A sessão só era gravada dentro de `saveTraining()`, chamada **apenas** pelos botões de cansaço ("0–5" ou "Pular") | ele terminava a sessão, fechava o app e o treino não existia no histórico | `finishTrainingAndSave()` grava a sessão **no instante em que ela termina**; o cansaço é opcional e depois só atualiza o mesmo registro (idempotente por `savedId`) |
| 2 | Nada era gravado durante a sessão | se o iPhone recarregasse a página (troca de app, memória) no meio do treino, tudo era perdido | rascunho automático em `audioswarm.v4.state.draft` a cada resposta; ao reabrir, "Retomar de onde parou" restaura item, SNR, resultados e tempo decorrido (validade de 12 h) |
| 3 | O botão "Começar sessão de treino" da tela inicial não trocava de aba | a sessão começava renderizada num painel escondido; parecia que nada tinha acontecido | `startTraining()` chama `setTab("treino")` |
| 4 | `sessionsToday()` comparava a data local com `s.date.slice(0,10)` (UTC) | sessão às 21h em São Paulo era gravada com a data de amanhã; na manhã seguinte o app dizia "você já fez uma sessão hoje" | `localDayKey()` converte o ISO para o dia do calendário local |
| 5 | Modo `?demo=` e armazenamento bloqueado (iframe, navegação privada) descartavam tudo **em silêncio** | dados fictícios ou memória temporária sem aviso suficiente | banner vermelho fixo, botão "Sair da demonstração", banner de armazenamento bloqueado com "Exportar backup agora", selo de salvamento no cabeçalho e contador "Sessões salvas" na tela inicial |

O que **não** dá para recuperar: sessões feitas antes desta correção que nunca chegaram a
ser gravadas. O app não inventa histórico para preencher a lacuna — aderência é medida a
partir de registros reais.

O que mudou na confiança do dado: a sessão agora é persistida antes da pergunta de
cansaço, e o registro diz `savedAutomatically: true`. Se o cansaço não for respondido, o
campo fica `null` — ausência de resposta, não "sem cansaço".

## Diário da semana perdido ao desligar o computador (29/10)

Segundo relato de uso real: o diário era preenchido, o computador (ou o treino) era
fechado e, ao voltar, o diário estava zerado. Três causas, todas no app:

| # | Causa | O que acontecia | Correção |
|---|---|---|---|
| 1 | O diário só era gravado no clique de **"Salvar diário da semana"** | quem preenchia e fechava sem clicar perdia tudo | **salvamento automático** 500 ms depois de cada digitação/seleção; o botão passou a ser "Salvar agora" |
| 2 | `renderVida()` reescrevia os campos com o último valor salvo a cada re-render (troca de aba, voltar do treino, `renderAll`) | o texto digitado desaparecia da tela e do registro | re-render não toca no campo em edição (`document.activeElement`) nem na semana com gravação pendente; o campo só é repreenchido a partir do que está salvo |
| 3 | O diário é por semana, mas não havia indicação nem histórico | ao mudar de semana a tela ficava em branco e parecia perda de dados | título com o número da semana, tabela **"Semanas de diário já salvas"** e o diário de todas as semanas no relatório |

Proteções adicionais:

- a semana é capturada **no início da edição**; um salvamento pendente nunca cai na semana
  seguinte depois de trocar o seletor;
- `flushDiary()` roda ao trocar de aba, ao iniciar o treino, em `pagehide`,
  `beforeunload` e `visibilitychange` — desligar no meio da digitação não perde a frase;
- uma semana sem conteúdo real (tudo no padrão) **não** cria registro vazio; o
  preenchimento parcial é salvo assim que houver qualquer dado;
- cada registro guarda `date` (primeira gravação), `updatedAt` e `autoSaved`, então o
  relatório distingue diário automático de salvamento manual.

O que o diário continua sendo: relato da família, não medida calibrada. Ele não entra como
desfecho primário — o primário é o HHIE-S — e o relatório continua dizendo isso.

## Diário que "zerava" ao desligar (29/10)

Relato: o diário da semana era preenchido, o computador era desligado (ou uma sessão de
treino era feita) e, ao voltar, o diário aparecia vazio.

O diário **era** salvo, mas por três caminhos frágeis:

| # | Causa | O que acontecia | Correção |
|---|---|---|---|
| 1 | A gravação no estado principal dependia de um `setTimeout` de 500 ms | desligar dentro dessa janela perdia a última frase digitada | **cópia quente gravada a cada tecla**, em chave própria (`audioswarm.v4.state.diary`); o estado principal continua com debounce de 400 ms |
| 2 | Não havia recuperação da cópia quente no carregamento | a cópia existiria, mas ninguém a lia | `mergeHotDiary()` na inicialização: se a cópia for **mais nova** que o diário salvo, ela é mesclada e marcada `recovered` |
| 3 | O formulário sempre mostrava o diário da **semana atual** | diário da semana 3 preenchido, semana avançada para 4 (o avanço acontece sozinho após a avaliação da semana 4) → a tela mostrava a semana 4 vazia, parecendo perda | seletor **“Semana deste diário”**, histórico por semana e aviso "seu diário da semana N continua salvo" |
| 4 | O relatório só listava outras semanas quando havia **mais de uma** | com diário apenas da semana anterior, o relatório dizia "sem diário nesta semana" e omitia o que existia | passa a listar qualquer diário anterior, com a semana explícita |

O diário nunca foi apagado do armazenamento em nenhum desses casos — ele ficava salvo numa
semana que a tela não mostrava, ou perdia a última frase. Isso muda a leitura do dado: não
houve perda de histórico, houve perda de **visibilidade**.

## O que os resultados significam (e não significam)

| Medida | Interpretação permitida | Interpretação proibida |
|---|---|---|
| HHIE-S | mudança no handicap percebido; faixa descritiva | diagnóstico, audiograma, "cura" |
| Fala em ruído | mudança na tarefa treinada, na mesma pessoa e mesmo volume | QuickSIN, SNR loss clínico, comparação entre pessoas |
| Transferência | pista exploratória em frases não treinadas | prova de melhora na vida real |
| Gap | mudança na tarefa temporal treinada | preditor de fala no ruído, transferência garantida |

Uma mudança menor que a faixa reportada não é interpretável. Uma mudança maior que a
faixa ainda não é prova clínica: pode ser prática, memória das frases, fadiga ou
flutuação de atenção. O relatório mostra o nível de confiança de cada medida.

## O que ainda falta

1. **Validação do teste caseiro.** Não há estudo de confiabilidade teste-reteste,
   validade concorrente contra QuickSIN/audiometria ou equalização das formas A/B/C.
   Sem isso, o teste é uma medida de acompanhamento, não um instrumento validado.
2. **Voz humana e calibração.** A voz sintética é mais uniforme que a fala humana e o
   ruído não é calibrado em dB SPL. Uma versão futura deveria usar gravações e uma
   referência acústica.
3. **Revisão clínica dos itens em pt-BR.** A tradução de trabalho do HHIE-S precisa ser
   conferida por profissional antes de uso clínico.
4. **Teste no iPhone e nos aparelhos reais.** O app foi verificado com jsdom e no preview
   local, não em navegador real no iPhone. O preview em iframe bloqueia a síntese de fala;
   para uso real, publique em HTTPS (por exemplo, Netlify Drop) ou abra em janela completa.
   Falta testar no iPhone do pai, com os Rexton BiCore B M 20, incluindo streaming, bateria
   e latência.
5. **Aparelhos de ~12 anos.** O maior ganho pode estar em revisão/verificação dos
   aparelhos ou em substituição, não no treino. O app não resolve isso e diz para levar
   a audiometria e o pacote ao profissional.
6. **Adesão de longo prazo.** Não há dados além das sessões registradas; não há grupo
   de controle.
7. **Revisão externa do contrato `audioswarm.v1.1`.** O pacote foi desenhado para o
   revisor; o contrato ainda precisa ser aceito e versionado por ele.
8. **Cognição.** ACHIEVE não mostrou efeito no desfecho primário; qualquer afirmação
   cognitiva seria prematura.

## Adendo v5 — frases simples mantidas, teto mais alto

O participante relatou que "os testes com uma frase só são muito simples". A leitura
correta não era trocar as frases, e sim que o material de treino tinha **teto** (~19
palavras, pergunta respondível por uma palavra solta) e que a forma C já era mais longa
que a A.

O que mudou (detalhes em [SENTENCES_V5.md](SENTENCES_V5.md)):

1. banco de 60 → **89 itens**, com `tier` (N1 ≤ 10 palavras, N2 11–14, N3 15–20, N4 21–45, incluindo
   três relatos de 2–3 frases), `kind` (literal, negativa, ordem, inferência, ação) e `domain`;
2. treino com **escada por semana** vinda do motor (`content.training_ladder`), não de
   uma lista fixa no app;
3. novo bloco **opcional** de compreensão de vida real: 4 frases longas fixas, +8 dB
   relativo, **% de acerto**, dois conjuntos alternados, sem escada adaptativa e fora do
   cálculo do SNR;
4. relatório com seção 2.4 própria e coluna na tabela de mudanças, sempre marcada como
   exploratória;
5. **formas A/B/C não foram reescritas** — a linha de base continua comparável; a
   diferença de extensão entre A e C fica declarada no relatório.

O que este adendo **não** afirma: que o % de vida real mede audição, que prevê
desempenho fora de casa, ou que um item (25 p.p.) seja efeito. A medida principal segue
sendo o HHIE-S.

## Como verificar

```bash
make test                                   # 99 passed
make check                                  # sintaxe + contratos do HTML
make demo                                   # protocolo em texto
python -m swarm.cli examples/profile.json --json > /tmp/p.json
NODE_PATH=/caminho/node_modules node tools/smoke_app.js   # 111/111, requer jsdom
```

Estado local desta auditoria: `99 passed`, `make check` exit 0, smoke 111/111. O teste de
smoke é opcional; a CI roda pytest + sintaxe + protocolo de exemplo.

## Referências principais

- Humes LE, et al. The effects of dosage and duration of auditory training for older
  adults with hearing impairment. J Acoust Soc Am. 2014;136(3):EL224–EL230.
- Bieber RE, Gordon-Salant S. Improving older adults' understanding of challenging
  speech. Hear Res. 2020;402:108054.
- Kishon-Rabin L, et al. Improved gap detection thresholds following auditory training.
  Am J Audiol. 2013;22(2):343–346.
- Killion MC, et al. Development of a QuickSIN. J Acoust Soc Am. 2004;116(4):2395–2405.
- Ventry IM, Weinstein BE. Identification of elderly people with hearing problems.
  ASHA. 1983;25(7):37–42.
- Wieselberg MB. A auto-percepção do handicap auditivo em idosos. PUC-SP; 1997.
- Lin FR, et al. ACHIEVE. Lancet. 2023;402:786–797.
