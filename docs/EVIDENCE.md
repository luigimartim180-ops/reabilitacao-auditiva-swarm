# Base de evidências

Toda recomendação do motor aponta para uma chave deste registro (`swarm/evidence.py`,
**40 entradas**). Graus: **A** meta-análise/RCT · **B** RCT pequeno, estudo controlado ou
revisão sistemática · **C** observacional/mecanístico · **D** consenso/diretriz.

O registro guarda `claim`, `effect`, `citation`, `url` e `grade`. `build_protocol`
termina com `_assert_refs_resolve`: uma recomendação que cite chave inexistente falha
alto, em vez de virar texto plausível.

## Sinal e ganho rápido (dia 1)

| Chave | Achado | Grau | Fonte |
|---|---|---|---|
| `tv_streaming_2024` | +11 a +14 pontos % na compreensão de TV; dz ≈ 1,0; idade e gravidade não moderam | B | https://www.scirp.org/journal/paperinformation?paperid=150363 |
| `tv_adapter_2010` | 36% → 81% de acerto; ganho individual 15–66% | B | https://hearingreview.com/inside-hearing/research/improving-tv-listening-for-hearing-aid-users |
| `bluetooth_coupling_2024` | acoplamento Bluetooth melhora reconhecimento de fala sobretudo com fala comprimida (40%: p = 0,001); sem ganho em ritmo normal | B | https://pmc.ncbi.nlm.nih.gov/articles/PMC10147467 |
| `tv_streaming_muted_mics_2024` | streaming de TV com microfones do aparelho mutados melhora compreensão e satisfação **no ruído**; em silêncio o ganho é pequeno | B | https://pubs.asha.org/doi/abs/10.1044/2023_AJA-23-00169 |
| `remote_mic_2021` | +11 a +19,5 dB de SNR; benefício cresce com a distância | B | https://pmc.ncbi.nlm.nih.gov/articles/PMC8072043/ |
| `phone_streaming_2024` | streaming de telefone melhora reconhecimento; latência e bateria precisam ser testadas | B | https://www.audiologynw.com/blog/hearing-aids-and-bluetooth |
| `snr_requirement_10db` | perda neurossensorial exige até ~10 dB mais SNR | D | https://hearinghealthmatters.org/hearing-aids/2024/hearing-aids-remote-microphones |
| `streaming_environment_awareness` | streaming reduz a percepção do ambiente; precaução de segurança, sem ensaio clínico de escada/rua | D | https://www.who.int/news-room/fact-sheets/detail/deafness-and-hearing-loss |

## Treino, dose e plasticidade

| Chave | Achado | Grau | Fonte |
|---|---|---|---|
| `humes_dosage_2014` | **2×/semana vs 3×/semana não diferiram**; braço diário **não testado**; maior parte do ganho em 5–7,5 semanas; retenção até 6 meses, mas atenuada | A | https://pmc.ncbi.nlm.nih.gov/articles/PMC4144170/ |
| `humes_specificity_2014` | ganho principal nos materiais treinados; ~7–10% em palavras novas; **sem generalização** para falantes/frases não treinados | A | https://pmc.ncbi.nlm.nih.gov/articles/PMC4144170/ |
| `act_gamified_2025` | 4 semanas de treino auditivo-cognitivo melhoram fala-em-ruído; ganho mantido | A | https://www.nature.com/articles/s41539-025-00369-4 |
| `auditory_training_sin_meta` | revisão: dificuldade adaptativa é central; evidência de transferência é limitada. **Grau rebaixado** de A para B: não é um único RCT e a fonte original era uma revisão de comércio | B | https://pmc.ncbi.nlm.nih.gov/articles/PMC7880302/ |
| `kraus_brainfit_2013` | treino melhora timing neural e QuickSIN; grupo controle ativo não melhora | B | https://brainvolts.northwestern.edu/wp-content/uploads/boxtrx/Kraus_Anderson_HearJour_May_2013.pdf |

## Transferência para a vida real

| Chave | Achado | Grau | Fonte |
|---|---|---|---|
| `transfer_limits_2020` | aprendizado na tarefa treinada é robusto; transferência para estímulos não treinados é **limitada e inconsistente** | B | https://pmc.ncbi.nlm.nih.gov/articles/PMC7880302/ |
| `clear_speech_partner_2016` | treinar o parceiro melhora o reconhecimento da fala dele | B | https://pmc.ncbi.nlm.nih.gov/articles/PMC5280067/ |
| `repair_strategies_ace` | estratégias de reparo e comunicação ativa reduzem handicap | B | https://www.hearingtracker.com/resources/7-practical-communication-strategies-for-people-with-hearing-loss |
| `nia_communication_tips` | rosto a rosto, reduzir ruído, falar devagar, nunca gritar | D | https://blog.chsc.org/blog/how-clear-speech-helps-those-with-hearing-loss |
| `zheng_rehab_meta_2024` | reabilitação reduz handicap (HHIE −5,80) e aumenta uso do aparelho | A | https://pmc.ncbi.nlm.nih.gov/articles/PMC11532099/ |

## Música

| Chave | Achado | Grau | Fonte |
|---|---|---|---|
| `music_mci_2024` | 40 min, 2×/semana, 8 semanas melhora fonema/palavra/frase em comprometimento cognitivo leve | B | https://pmc.ncbi.nlm.nih.gov/articles/PMC10933806/ |
| `choir_rct_2025` | 14 semanas de canto melhoram fala-em-ruído e FFR vs controle | A | https://pubmed.ncbi.nlm.nih.gov/41036261 |
| `zendel_music_2019` | treino musical melhora fala-em-ruído com mudança cortical | B | https://peretzlab.ca/wp-content/uploads/2020/12/zendel-_b__r__et_al-_2019.pdf |

## Medição

| Chave | Achado | Grau | Fonte |
|---|---|---|---|
| `hhie_s_screening` | HHIE-S (0–40) é medida validada de handicap autorreferido | B | https://pubmed.ncbi.nlm.nih.gov/40875366 |
| `hhie_s_administration` | 10 itens; Sim=4, Às vezes=2, Não=0; 0–8 / 10–24 / 26–40; ≥10 indica avaliação | B | https://hign.org/sites/default/files/2020-06/Try_This_General_Assessment_12.pdf |
| `hhie_s_pt_br` | adaptação brasileira (Wieselberg, 1997); faixas variam um pouco entre fontes (0–8 / 10–23 / 24–40 em um estudo brasileiro) | B | https://www.scielo.br/j/rsbf/a/mWWFPX9zjw43TTrkwXbBQBh/?format=html&lang=pt |
| `quicksin_measure_2004` | QuickSIN aberto: 6 frases × 5 palavras-chave; SNR loss = 25,5 − acertos; ±2,7 dB (95%) por lista; **não equivale** a teste fechado no navegador | B | https://pubs.aip.org/asa/jasa/article-abstract/116/4/2395/545472/Development-of-a-quick-speech-in-noise-test-for |
| `gap_training_2013` | 10 dias de treino de gap melhoram o limiar na tarefa treinada; retenção em 1 mês; **sem transferência para fala** | B | https://pubmed.ncbi.nlm.nih.gov/24018576/ |
| `quicksin_norms` | SNR loss normal ~0 dB; idosos com perda ~2,6–10 dB (média 6,3) | B | https://pmc.ncbi.nlm.nih.gov/articles/PMC9128736/ |
| `ecosin_2020` | frases de conversa real, gravadas em ritmo e esforço naturais, servem como material válido de fala-em-ruído (ECO-SiN: 192 frases, média 6,3 palavras) | B | https://doi.org/10.1121/10.0000780 |
| `real_world_sentences_2022` | frases do dia a dia embutidas em ruídos reais mantêm a tarefa longe de teto e de piso; o material e o ambiente mudam muito a dificuldade | B | https://doi.org/10.3389/fnins.2022.789565 |
| `ecological_validity_tradeoff_2025` | em usuários de implante coclear, audiometria e questionário não concordam em todas as condições: existe tensão entre precisão e validade ecológica (**não é estudo de aparelho auditivo**) | B | https://doi.org/10.3390/audiolres15050142 |
| `syntactic_complexity_aging` | complexidade sintática e esforço de escuta reduzem o relato de materiais verbais em idosos; a tarefa consome memória de trabalho | C | https://pubmed.ncbi.nlm.nih.gov/19927677/ |
| `continuous_speech_training_2025` | treinar com fala contínua natural + pergunta de compreensão, com carga de memória variável, melhora fala-em-ruído em idosos (1 sessão, cruzado; maior ganho em menor memória de trabalho e maior perda) | B | https://doi.org/10.1038/s41539-025-00306-5 |
| `connected_speech_memory_1995` | lembrar fala no ruído piora com idade e perda auditiva; contexto ajuda e consome recursos — texto corrido mede memória e atenção junto com audição | C | https://doi.org/10.1121/1.412282 |
| `fast_speech_aging_2001` | idosos perdem mais reconhecimento que jovens conforme a velocidade da fala aumenta, sobretudo com menos pistas linguísticas — daí a fala "corrida" da TV ser mais difícil | C | https://doi.org/10.1044/1092-4388(2001/056) |
| `working_memory_sin_2008` | em 20 estudos, memória de trabalho (reading span) prediz fala-em-ruído de forma consistente mas secundária à perda auditiva; escore de texto não é limiar | B | https://doi.org/10.1080/14992020802301142 |

## Limites, cognição e medicamentos

| Chave | Achado | Grau | Fonte |
|---|---|---|---|
| `presbycusis_irreversible` | perda coclear é permanente e manejável, não reversível | D | https://www.who.int/news-room/fact-sheets/detail/deafness-and-hearing-loss |
| `achieve_2023` | ACHIEVE: desfecho cognitivo **primário nulo** na coorte total (0,002 SD, p=0,96); sinal apenas no subgrupo de maior risco; nenhuma promessa de prevenção de demência | A | https://pubmed.ncbi.nlm.nih.gov/37478886/ |
| `ototoxic_meds` | revisar medicamentos com prescritor; nunca suspender sozinho | D | https://www.who.int/news-room/fact-sheets/detail/deafness-and-hearing-loss |
| `physical_activity_cohort` | atividade física associada a menor risco de perda auditiva (coorte) | C | https://audiologist.org/_resources/documents/educate/signia/Lifestyle-Medicine-Partnership-LMP-Toolkit-Flyer-2.pdf |
| `zhou_tdcs_2025` | tDCS + reabilitação: limiar 44,6→35,08 dB vs 45,10→38,84 sham; intervenção de clínica, fora do plano domiciliar | A | https://pmc.ncbi.nlm.nih.gov/articles/PMC12434129/ |

## Material de frases (v5)

O banco de frases tem dois papéis e não se mistura:

- **Teste (formas A, B, C)** — 12 frases cada, nunca reescritas, para a linha de base continuar comparável.
- **Treino (N1→N4)** — escada de dificuldade: N1 curta e previsível (o que já existia, mantido), N2 média do dia a dia, N3 longa com dois fatos/ordem/inferência, N4 relato de 2–3 frases com pergunta de sentido.
- **Vida real (8 frases, 2 conjuntos)** — bloco opcional, fixo, sem escada adaptativa; pontuado só em % de acerto e sempre rotulado como exploratório.

O que a evidência sustenta e o que não sustenta:

- frases de conversa real e ruídos reais são material válido e mantêm a tarefa longe de teto (`ecosin_2020`, `real_world_sentences_2022`);
- material mais realista ganha validade ecológica e **perde precisão** (`ecological_validity_tradeoff_2025`) — por isso a medida principal continua sendo o HHIE-S;
- frase longa e sintaticamente complexa custa memória de trabalho (`syntactic_complexity_aging`), então acerto em frase longa não é limiar auditivo;
- ganho maior no material treinado do que em frases novas (`transfer_limits_2020`, `humes_specificity_2014`) — por isso o treino reusa vocabulário do dia a dia e o teste continua fixo.

## Como ler os graus

Um grau A numa meta-análise não significa que a intervenção funcione em qualquer pessoa:
significa que, naquela população e naquele desfecho, o efeito é consistente. O sistema
nunca converte grau A em promessa individual — daí os marcadores de progresso, a faixa
de incerteza em cada medida e a regra de reavaliação em 4 semanas.

Três leituras que o repositório evita de propósito:

- **"Treino melhora a vida real."** A evidência mostra ganho na tarefa treinada e
  transferência limitada. O app separa os dois e chama a transferência de exploratória.
- **"Gap prevê fala no ruído."** O treino de gap melhora o gap; o estudo não mostra
  transferência para fala.
- **"Treino auditivo previne demência."** ACHIEVE não confirmou o desfecho primário; o
  sinal de subgrupo é exploratório.
