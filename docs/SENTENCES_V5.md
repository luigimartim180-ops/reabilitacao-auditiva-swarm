# Frases v5 — manter o simples e subir o teto

Documento de decisão do material de frases. Ele responde à queixa do participante
("os testes com uma frase só são muito simples") sem quebrar a régua que já foi
usada na linha de base.

> **Continuidade (v6).** Este documento trata das **frases**. O passo seguinte,
> para o áudio que não para (telejornal, entrevista, esporte), está em
> [CONNECTED_SPEECH_V6.md](CONNECTED_SPEECH_V6.md).

## O problema, medido

Antes desta versão o banco tinha 60 itens e o treino usava as mesmas frases
curtas desde a semana 1:

| Grupo | Itens | Média de palavras |
|---|---|---|
| prática | 4 | 10,0 |
| forma A | 12 | 11,2 |
| forma B | 12 | 12,4 |
| forma C | 12 | 15,3 |
| treino | 20 | 12,2 (9–19) |

Depois desta versão (mesmos itens simples + material novo):

| Grupo | Itens | Média de palavras | Faixa |
|---|---|---|---|
| prática | 4 | 10,0 | 9–11 |
| forma A | 12 | 11,2 | 8–14 (intocada) |
| forma B | 12 | 12,4 | 9–15 (intocada) |
| forma C | 12 | 15,3 | 12–19 (intocada) |
| treino | 41 | 16,1 | 8–40 |
| vida real | 8 | 21,2 | 2 conjuntos de 4 |

Dois defeitos aparecem nessa tabela:

1. **Teto.** O treino não passava de ~19 palavras e a pergunta podia ser
   respondida com uma palavra ouvida ao acaso. Um item que já está no teto não
   mostra melhora — ele só mostra que o participante acertou de novo.
2. **Régua torta entre formas.** A forma C é bem mais longa que a A. Isso não se
   corrige reescrevendo a C: A, B e C são medidas repetidas e o participante já
   fez a linha de base. A correção é **declarar a forma** em cada medida (o app já
   faz) e não comparar C com A como se fossem o mesmo teste.

## A decisão

**Manter as frases simples e acrescentar material realista em cima delas.**
Nada foi removido: os itens originais continuam com o mesmo texto e continuam
sendo o primeiro degrau.

### Escada de dificuldade (treino)

| Nível | Palavras | O que é | Papel |
|---|---|---|---|
| N1 | ≤ 10 | frase curta e previsível | aquecimento e confiança |
| N2 | 11–14 | frase média do dia a dia, com um detalhe ou negação | passo sem salto |
| N3 | 15–20 | frase longa com dois fatos, ordem ou inferência simples | memória de trabalho e atenção entram |
| N4 | 21–45 | frase longa com dois ou três fatos encadeados, **ou** relato de 2–3 frases | teto mais alto, o que a conversa exige |


Distribuição do treino por semana (o app lê isso do motor, campo
`content.training_ladder`, e não de uma lista escondida no código):

| Semanas | Níveis | Foco |
|---|---|---|
| 1–2 | N1 + N2 | confiança e rotina; nunca começar pelo difícil |
| 3–4 | N2 + N3 | primeiro aumento real de extensão |
| 5–6 | N3 | frases longas do dia a dia, ainda sem relato |
| 7–8 | N3 + N4 | relato curto, com pergunta de sentido |

Cada sessão sorteia 8 itens dos níveis da semana + 1 item de aquecimento. Se o
nível da semana já foi usado demais, o app repete itens antes de sair do nível —
na prática é melhor repetir do que dar um salto de dificuldade.

### Bloco de vida real (medida)

- 4 frases longas fixas, lidas uma vez, no mesmo ruído relativo (+8 dB), sem
  escada adaptativa. Pontuação: **% de acerto**, nada de limiar.
- Dois conjuntos de 4 frases, alternados: conjunto 1 na linha de base e na
  semana 8; conjunto 2 na semana 4 e na retenção de 30 dias. Assim o mesmo
  material não é decorado entre duas medidas próximas.
- Opcional e pulável. Quando pulado, fica registrado como pulado (o relatório
  não inventa um número).
- Quando a linha de base e a última medida usam conjuntos diferentes, o
  relatório avisa que a comparação mistura dificuldade do item.

### O que cada item carrega

`{ id, split, tier, kind, domain, text, q, options[4] }` (+ `set` nos itens de
vida real). `kind` ∈ `literal`, `negative`, `order`, `infer`, `action` — a
pergunta não é sempre "qual palavra você ouviu". `domain` cobre saúde, família,
mercado, dinheiro, transporte, casa, futebol, jornal e tecnologia, para o
vocabulário do treino ser o mesmo da vida dele.

## Por que isso é defensável (e onde para)

O painel de especialistas foi consultado em quatro frentes: fonoaudiologia de
reabilitação, psicolinguística do envelhecimento, audição ecológica
("real-world hearing") e metodologia de medida.

1. **Frase de conversa real é material válido.** O ECO-SiN foi construído
   exatamente assim: 192 frases de conversa espontânea, ritmo e esforço
   naturais, média de 6,3 palavras — e serve para medir fala em ruído
   (`ecosin_2020`). Materiais de frases do dia a dia em ruídos reais mantêm a
   tarefa longe de teto e de piso (`real_world_sentences_2022`).
2. **Frase "com sentido, mas não previsível" evita o chute por contexto.** Se a
   frase é previsível, ele completa pelo contexto e o teste deixa de medir
   audição. Por isso os itens N3/N4 têm informação específica (número, ordem,
   nome) que não se adivinha.
3. **Complexidade sintática custa memória de trabalho.** Idosos com perda
   auditiva relatam menos conteúdo de materiais verbais quando a sintaxe é
   complexa e o esforço de escuta é maior (`syntactic_complexity_aging`). Isso
   justifica a escada — e também obriga a rotular o bloco como exploratório,
   porque acerto em frase longa não é limiar auditivo.
4. **Validade ecológica se compra com precisão.** Existe uma tensão real entre
   precisão de medida e semelhança com a vida diária
   (`ecological_validity_tradeoff_2025`, feito em usuários de implante coclear).
   A consequência prática adotada aqui: o desfecho primário continua sendo o
   HHIE-S; o bloco realista é exploratório e é reportado em % com o aviso de
   que 4 itens = 25 pontos percentuais por item.
5. **Transferência é limitada.** Treino melhora o material treinado; frases
   nunca vistas melhoram pouco e nem sempre (`transfer_limits_2020`,
   `humes_specificity_2014`). Por isso o treino usa o vocabulário da casa dele
   (futebol, jornal, médico, mercado), para que o material treinado já seja
   parecido com a vida real.

O que este material **não** permite afirmar:

- que o treino melhorou a audição dele (não mede sensibilidade auditiva);
- que o % de vida real prevê desempenho na rua, na igreja ou no jantar em família;
- que uma mudança de um item (25 p.p.) seja efeito e não variação;
- que ele compreende melhor "em geral" porque acertou o relato do futebol.

## Como o app mostra isso

- **Avaliação** (4 partes): HHIE-S → fala em ruído → vida real (opcional) → gap.
- **Relatório**, seção 2.4: primeira medida, última medida e mudança em pontos
  percentuais, com o aviso de conjuntos diferentes.
- **Tabela de mudanças**: coluna "Vida real" com direção (melhor/pior/estável).
- **Aba Vida**: cartão com o histórico de % e a legenda de que percentual não é
  limiar.
- **Treino**: o cartão da sessão informa o nível das frases da semana.

## Limites conhecidos desta versão

- Formas A/B/C seguem não equacionadas (C é mais longa que A); a correção é
  declarar a forma, não reescrever a C.
- 4 itens por medida de vida real: resolução de 25 p.p. Serve como sinal, não
  como medida fina.
- O conjunto 1 e o conjunto 2 não foram equalizados por dificuldade.
- A voz sintética é mais uniforme que a fala humana; o material é mais realista
  na linguagem, não no sinal acústico.
- O bloco de vida real é sempre no mesmo +8 dB relativo: com SNR muito fácil o
  participante pode bater no teto de 100%, e aí o número para de informar.

## Como acrescentar itens (sem quebrar a régua)

1. Escolha o nível pelo número de palavras (N1 ≤ 10, N2 11–14, N3 15–20, N4 21–45).
2. A **primeira** opção de `options` é a resposta certa; o app embaralha na hora.
3. Uma pergunta por item, com 4 alternativas plausíveis — nenhuma absurda, para
   o acerto significar compreensão.
4. Nunca edite os itens das formas A, B ou C.
5. Rode `make check`. O teste `test_content_counts_match_the_item_bank_in_the_app`
   compara a contagem real do banco com os números declarados no motor; se você
   mudar a quantidade, ajuste `content.material` em `swarm/engine.py` e em
   `app/protocol.js` (os dois precisam ficar idênticos por causa do teste de
   paridade).

## Referências

- Miles KM, Keidser G, Freeston K, Beechey T, Best V, Buchholz JM. *Development
  of the everyday conversational sentences in noise test.* J Acoust Soc Am.
  2020;147(3):1562–1576. → `ecosin_2020`
- Miles K, Beechey T, Best V, Buchholz J. *Measuring speech intelligibility and
  hearing-aid benefit using everyday conversational sentences in real-world
  environments.* Front Neurosci. 2022;16:789565. → `real_world_sentences_2022`
- Hey M, Hocke T. *Precision audiometry and ecological validity.* Audiol Res.
  2025;15(5):142. → `ecological_validity_tradeoff_2025`
- Stewart R, Wingfield A. *Hearing loss and cognitive effort in older adults'
  report accuracy for verbal materials.* J Am Acad Audiol. 2009;20(2):147–154.
  → `syntactic_complexity_aging`
- Humes LE et al. (2014) → `humes_dosage_2014`; transferência → `transfer_limits_2020`;
  especificidade do treino → `humes_specificity_2014`.
