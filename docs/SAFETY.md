# Segurança e limites

## O sistema não é dispositivo médico

O app é uma ferramenta domiciliar de treino e triagem **orientativa**. Não é exame
clínico calibrado, não faz diagnóstico e não prescreve. A voz é sintética e o ruído não
é calibrado por audiômetro; os valores são **relativos**. Diagnóstico e conduta exigem
audiologista/otorrinolaringologista.

## Red flags — escalonar antes de treinar

| Situação | Ação |
|---|---|
| Mudança súbita de audição em um ouvido | avaliação médica urgente |
| Dor de ouvido, secreção ou vertigem súbita | avaliação médica |
| Zumbido novo em um ouvido com mudança de audição | otorrinolaringologista |
| Queda com tontura | avaliação de equilíbrio e audição |
| Piora rápida da audição ou do zumbido | avaliação médica |
| Sem progresso após 4 semanas com adesão ≥ 80% | nova audiometria e revisão do aparelho |

## Pausa por evento adverso

O app tem um botão **"Registrar evento adverso e pausar"**. Qualquer evento (dor,
zumbido, tontura, piora súbita, apito no aparelho, cansaço persistente) registra a data,
**bloqueia o treino** e mostra a orientação de procurar avaliação. A retomada só é
liberada por "Liberar retomada", depois de confirmação explícita. O app não decide se o
evento foi resolvido.

## Sinais para parar a sessão

- Esforço ou cansaço crescente, bocejos, irritabilidade, pedir para parar.
- Erros que se agrupam depois de um bom começo.
- Dor, zumbido, tontura ou sensação de ouvido tampado.
- Cansaço 4–5/5 no fim da sessão: manter o nível e reduzir a velocidade na próxima.

## Streaming e segurança do ambiente

- **Não usar streaming de TV ou telefone em escadas, na rua ou no trânsito.** O
  streaming reduz a percepção dos sons do ambiente. É uma precaução de segurança; não há
  ensaio clínico de caminhada em escada com streaming.
- Volume do aparelho fixo durante cada teste; mudar o volume no meio invalida a
  comparação.
- Não usar o app com dor, secreção, tontura ou zumbido novo unilateral.

## Medicamentos

O sistema nunca recomenda suspender ou alterar medicação. Se houver suspeita de efeito
ototóxico, ele apenas pede revisão ao prescritor ou farmacêutico.

## Limites de promessa

- Perda coclear é permanente; nenhum protocolo a reverte.
- Treino auditivo melhora a tarefa treinada; o efeito individual varia e a transferência
  para a vida real é limitada (`transfer_limits_2020`).
- Gap é tarefa específica; transferência para fala no ruído não foi estabelecida.
- ACHIEVE 2023: desfecho cognitivo primário nulo; não há promessa de prevenção de
  demência.
- tDCS é intervenção clínica e não entra no plano domiciliar.
- Atividade física tem associação (coorte) com menor risco de perda auditiva; não é
  promessa de melhora auditiva.

## Dose

O teto de **10 min/dia** é uma guarda de tolerabilidade, não uma dose ótima. O app usa
1 sessão curta por dia de treino, 2–3 dias por semana. O estudo randomizado de dose
comparou 2×/semana com 3×/semana e não testou o braço diário (`humes_dosage_2014`).

## Privacidade

O app roda inteiramente no dispositivo: sem servidor, sem conta, sem chave de API, sem
envio de dados. O perfil e os resultados ficam no navegador do usuário. O arquivo JSON
exportado contém dados pessoais (idade, aparelho, queixa, sessões) e deve ser guardado
com cuidado.

## Acessibilidade

Botões com no mínimo 54 px de altura, letra ampliável, alto contraste, rótulos em
português e mensagens de estado. A voz pode ser testada antes de cada avaliação.
