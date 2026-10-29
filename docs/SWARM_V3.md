# SWARM v4 — Arquitetura auditável

> O nome do arquivo ficou por compatibilidade. O conteúdo foi atualizado para o v4.

Reabilitação auditiva de um idoso de 90 anos, orientada a resultado rápido e real.

## 1. Diagnóstico honesto do material original

O material original (Qwen, Fase 2 + protocolo SWARM v1) tinha três problemas sérios:

1. **A validação era inventada.** O código foi entregue com um "checklist de validação antes do uso clínico" que o próprio modelo não executou. Um agente de elite não afirma ter validado o que não validou.
2. **O "swarm" era decorativo.** Eram cinco personagens com nomes bonitos, não cinco agentes com gatilhos, entradas, saídas e critérios de parada. Swarm sem contrato de interface é apenas texto.
3. **O teste não media nada de forma defensável.** A voz sintética e o ruído do navegador não são calibrados; no v3 o gap usava dois tons (pista de duração) e o teste de fala dava feedback durante a medição. O v4 ancora a decisão em um **HHIE-S** (autorrelato validado) e em duas tarefas com procedimento explícito, e declara o que elas não podem provar. Não chama o teste caseiro de QuickSIN.

A v3 corrige os três: cada recomendação aponta para uma referência verificável, cada agente tem contrato explícito, e o que não é calibrado está rotulado como não calibrado.

## 2. Princípio central

**O modelo de linguagem não decide nada clínico.** A decisão vive num motor determinístico (`swarm/engine.py`), que é função pura do perfil validado. O LLM, quando existe, só *narra* o JSON que o motor devolve. É assim que se impede a alucinação clínica: não se pede ao modelo para "ser cuidadoso", remove-se dele a decisão.

## 3. Os cinco agentes (contratos)

Cada agente é uma política determinística. `refs` é a lista de chaves de evidência que sustentam cada saída.

| Agente | Objetivo | Gatilhos | Saída | Critério de parada |
|---|---|---|---|---|
| **A1 — SignalChainAgent** | Maximizar a relação sinal-ruído antes de qualquer treino | `streaming = none/unknown`, queixa `noise`/`group`/`phone`, `tv_can_configure`, `medications_ototoxic` | 6 gatilhos T1.x → ações priorizadas (P1–P5) com efeito esperado, esforço e faixa de custo | streaming configurado e verificado no dia 1 |
| **A2 — DosageAgent** | Atingir a janela terapêutica sem fadiga auditiva | sempre; reduz dose se `cognitive_impairment`; assento se `falls`; controle de fadiga | 4 gatilhos T2.x → dose + estrutura de sessão, progressão, sinais de fadiga, regras de parada, adesão alvo | platô em 5–7,5 semanas |
| **A3 — TransferAgent** | Levar o ganho para TV, telefone e conversa | sempre; ajusta legenda se `uses_captions`; escadas de telefone/conversa por queixa | 5 gatilhos T3.x → 3 escadas com alvos por degrau, dose de música, checagem semanal | acompanhar novela sem legenda |
| **A4 — PartnerAgent** | Aumentar a inteligibilidade mudando quem fala | `living`, `caregiver_hours_per_day` | 4 gatilhos T4.x → modo, script, regras faça/não faça, treino de 20 min, frases de reparo, checklist de ambiente | parceiro treinado |
| **A5 — SafetyAgent** | Nunca deixar a reabilitação atrasar cuidado médico | `falls_last_year`, `tinnitus`, `medications_ototoxic` | 4 gatilhos T5.x → red flags com urgência, encaminhamentos, contraindicações, teto declarado | red flag encaminhada |

Cada agente também declara as suas **lacunas de evidência** (`evidence_gaps`): o que a
ciência ainda não resolve. Um agente que afirma saber tudo está mentindo — declarar a
lacuna é parte do contrato.

Os contratos são de primeira classe em `swarm/contracts.py`, e cada payload carrega o
contrato inteiro. `tests/test_contracts.py` verifica que os cinco estão completos,
que os gatilhos têm id e condição, que cada gatilho é avaliado com booleano e que as
saídas profundas (estrutura de sessão, escadas, regras, red flags) existem.

Os cinco são instanciados em `build_protocol()` e o resultado é serializável em JSON, o que permite testar, auditar e versionar.

## 4. Por que "resultado rápido" é verdade aqui

A evidência separa dois relógios diferentes:

- **Dia 1 — engenharia de sinal.** Transmitir o áudio da TV direto para o aparelho auditivo melhora a compreensão em 11–14 pontos percentuais, com efeito grande (Cohen's dz ≈ 1,0), e nem idade nem gravidade moderam o benefício (`tv_streaming_2024`). Em estudo intra-sujeito, todos os participantes melhoraram, de 36% para 81% de acerto (`tv_adapter_2010`). Microfone remoto entrega +11 a +19,5 dB de SNR (`remote_mic_2021`). Isto é ganho visível no primeiro dia.
- **Semanas 2–8 — plasticidade.** Treino auditivo adaptativo melhora a tarefa treinada (`act_gamified_2025`); a maior parte do ganho de dosagem se completa em 5–7,5 semanas, com 2–3 sessões por semana (`humes_dosage_2014`). A generalização para estímulos não treinados é limitada (`transfer_limits_2020`, `humes_specificity_2014`).

A ordem importa: sinal primeiro (ganho imediato e barato), treino depois (consolida). O material original colocava treino e exercício no mesmo plano, o que atrasa a primeira vitória.

## 5. Orquestração

```
perfil validado (schema estrito)
        |
        v
[ A1 ] -> [ A2 ] -> [ A3 ] -> [ A4 ] -> [ A5 ]     (pipeline determinístico)
        |         |         |         |         |
        +---------+---------+---------+---------+
                          |
                          v
              protocolo JSON + referências
                          |
                          v
        narração opcional por LLM (somente leitura)
```

- **Sem laço de agente autônomo na decisão clínica.** O pipeline é acíclico e reprodutível.
- **Falha é explícita.** Campo faltando levanta `ProfileError`; não existe default silencioso para dado clínico.
- **Offline por padrão.** O app roda o mesmo motor em JavaScript (`app/protocol.js`), sem servidor e sem chave de API.

## 6. Evals (como se mede que o sistema não piorou)

| Eval | O que garante | Onde |
|---|---|---|
| Unidade do motor | gatilhos corretos por perfil | `tests/test_engine.py` |
| Contratos | 5 contratos completos, gatilhos booleanos, saídas profundas | `tests/test_contracts.py` |
| Paridade Python↔JS | app não diverge do motor auditável | `tests/test_parity.py` |
| Resolução de referências | toda citação existe e tem URL | `test_every_reference_resolves_to_evidence` |
| Rejeição de entrada | perfil incompleto/inválido falha alto | `test_missing_field_is_rejected`, `test_invalid_enum_is_rejected` |
| Medição | HHIE-S, escadas, estimadores, censura | `tests/test_measurement.py` |
| Contratos do app | IDs, abas, claims proibidos, campos do pacote | `tests/test_app_static.py` |
| Sintaxe de UI | `protocol.js` e `app.js` não quebram | `node --check` no CI/local |
| Fluxo do app | avaliação, treino, relatório, import/export | `tools/smoke_app.js` (jsdom, opcional) |

Comando único: `make test`.

## 7. Guarda-corpos clínicos

- O teto é declarado: perda coclear não se reverte (`presbycusis_irreversible`).
- Red flags (mudança súbita de audição, dor, vertigem) escalam para avaliação médica antes de qualquer treino.
- Medicamentos nunca são suspensos pelo sistema; só se pede revisão ao prescritor (`ototoxic_meds`).
- Sem progresso mensurável após 4 semanas com adesão ≥80% → nova audiometria e revisão do aparelho.

## 8. O que ficou de fora, de propósito

- tDCS (`zhou_tdcs_2025`): é intervenção de clínica, não domiciliar. Fica citado como acelerador opcional, nunca no plano de casa.
- tDCS com música e outros protocolos experimentais: sinal promissor, mas sem protocolo domiciliar padronizado.
- Exercício aeróbico como "reabilitação auditiva": a associação com menor risco de perda auditiva é de coorte (`physical_activity_cohort`), não causal. Fica como saúde geral, não como promessa de audição.
