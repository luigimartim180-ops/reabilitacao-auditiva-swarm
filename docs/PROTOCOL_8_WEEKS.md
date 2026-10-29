# Protocolo de 8 semanas (visão de família)

Este é o plano que o motor gera, em linguagem simples. Os valores exatos dependem do
perfil respondido no app. O plano é uma adaptação domiciliar; não é um protocolo clínico
validado.

## Regra de ouro

O ganho mais rápido e mais barato não vem de exercício — vem de fazer o som chegar
limpo. Por isso a semana 1 começa pelo sinal (streaming de TV, programa correto do
aparelho) e pela linha de base.

## Semana 1 — sinal, linha de base e primeira vitória

- Configurar a transmissão do áudio da TV direto para os aparelhos auditivos, se houver.
- Medir a linha de base: **HHIE-S**, fala em ruído (dB relativo) e gap.
- Fazer 1 sessão curta de familiarização (não pontuada).
- Começar música (15 min, 2×/semana) e treinar a família em fala clara.

Resultado esperado: TV com volume menor e menos "como é?" já no primeiro dia. Isso é
ganho de sinal, não de plasticidade.

## Semanas 2–4 — rotina e dificuldade

- **1 sessão curta por dia de treino, 2–3 dias por semana** (não todos os dias).
- 1 aquecimento + 8 itens adaptativos + 1 fechamento garantido em acerto.
- Semana 2: ruído rosa, fala a 0,90× (mais lenta).
- Semana 3: ruído de casa, fala a 0,90×.
- Semana 4: ruído de TV/vozes, fala a 0,95×; **reavaliação intermediária** (HHIE-S,
  fala em ruído em forma não treinada, vida real — conjunto 2, opcional — e gap). Se
  adesão < 80%, simplificar — não intensificar.

A regra de progressão é prática: 3 acertos seguidos → 2 dB mais difícil; 2 erros →
2 dB mais fácil; no máximo 4 dB de mudança por sessão. Ela não é um protocolo validado.

## Semanas 5–8 — transferência e consolidação

- Semana 5: 4 ensaios de treino de gap (3 com pausa + 1 sem pausa como controle) + ruído
  de restaurante. O gap é tarefa treinada; **não** foi estabelecido que ele transfere para
  fala no ruído.
- Semana 6: fala em velocidade normal (1,00×), conteúdo de TV.
- Semana 7: ruído mais difícil, conversa em grupo.
- Semana 8: **avaliação final** (HHIE-S, fala em ruído em forma não treinada, vida
  real — conjunto 1 outra vez — e gap), audiometria de revisão e plano de manutenção.

TV progride: telejornal → entrevista → novela com perguntas → filme com música. O alvo é
entender o conteúdo, não apenas ouvir som.

As frases do treino sobem em degraus ao longo das 8 semanas: N1+N2 (semanas 1–2),
N2+N3 (3–4), N3 (5–6), N3+N4 (7–8). O nível de cada semana vem do motor
(`content.training_ladder`), não de uma lista fixa no app. Ver
[docs/SENTENCES_V5.md](SENTENCES_V5.md).

## Dose e teto

- 1 sessão de ~6 min por dia de treino, 2–3 dias por semana.
- Teto de **10 min/dia** no app: é uma **guarda de tolerabilidade**, não uma dose ótima.
- O estudo randomizado de dose comparou 2×/semana com 3×/semana e **não encontrou
  diferença**; o braço diário **não foi testado**. A sessão de 6 min é mais curta que o
  protocolo de laboratório; equivalência é desconhecida.
- Se houver cansaço 4–5/5, o nível é mantido e a fala fica um pouco mais lenta na
  próxima sessão.

## Marcadores práticos

| Quando | O que se espera ver |
|---|---|
| Dia 1 | volume da TV menor, menos pedidos de repetição |
| Semanas 2–3 | tolera ruído sem irritação |
| Semanas 4–6 | acompanha novela sem legenda |
| Semana 8 | HHIE-S estável ou melhor; mudança na fala em ruído **maior que a faixa do teste** |

O marco de "2–3 dB" é uma referência de teste clínico calibrado, não uma promessa do
teste caseiro. O relatório mostra a faixa de medição e diz quando a mudança é pequena
demais para interpretar.

## Acompanhamento e medições

O protocolo carrega **quatro checkpoints** auditáveis (`protocol.followup`): o que medir,
quando, o alvo e a decisão quando o alvo não é atingido.

| Semana | Checkpoint | O que medir | Alvo | Se não atingir |
|---|---|---|---|---|
| 1 | linha de base | HHIE-S, fala em ruído (dB relativo), gap, aparelho e streaming verificados | linha de base registrada antes de treinar | completar a linha de base antes da rotina |
| 4 | intermediária | adesão, HHIE-S, fala em ruído em forma não treinada, gap | adesão ≥ 80% e HHIE-S sem piora | adesão < 80% → simplificar; piora ≥ 4 pontos ou além da faixa → nova audiometria e revisão do aparelho |
| 8 | final | HHIE-S, fala em ruído em forma não treinada, gap, audiometria completa | HHIE-S estável/melhor; mudança na fala maior que a faixa | sem ganho mensurável após 8 semanas com adesão ≥ 80% → audiometria, revisão do aparelho e avaliação de implante |
| 12 | retenção (≈30 dias) | HHIE-S, fala em ruído na forma da linha de base | manter o ganho ou voltar à linha de base | perda do ganho → reiniciar 2–3 sessões/semana por 4 semanas; declínio progressivo → audiologia |

## Sinais de alerta (procurar médico antes de continuar)

- Mudança súbita de audição em um ouvido.
- Dor de ouvido, secreção ou vertigem súbita.
- Zumbido novo em um ouvido, com mudança de audição.
- Queda com tontura.
- Sem progresso mensurável após 4 semanas com boa adesão → nova audiometria e revisão
  do aparelho ou avaliação de implante.

## O teto, dito sem rodeio

A perda de células ciliadas aos 90 anos não volta. O que pode melhorar, com evidência
razoável, é o processamento central, a atenção, a estratégia e a qualidade do sinal que
chega. O app não promete cura, não previne demência e não substitui avaliação
audiológica. Quem promete mais do que isso está vendendo, não tratando.
