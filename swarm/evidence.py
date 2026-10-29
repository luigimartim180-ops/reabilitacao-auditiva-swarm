"""Evidence registry for the hearing-rehabilitation swarm.

Each entry is a claim the planner is allowed to make, together with the source
that supports it and a coarse evidence grade:

    A = meta-analysis or randomized controlled trial
    B = small RCT / controlled study with active or sham comparator
    C = observational, mechanistic or single-arm study
    D = expert consensus / clinical guidance (no primary data)

The engine references entries by key only, so every recommendation can be
audited back to a source.
"""

from __future__ import annotations

from typing import Any

EVIDENCE: dict[str, dict[str, Any]] = {
    "humes_dosage_2014": {
        "claim": (
            "For older adults with hearing impairment, most of the gain from "
            "word-based auditory training was reached after 5-7.5 weeks at 2 or "
            "3 sessions per week; the 2x and 3x groups did not differ. A "
            "daily-training arm was not tested, so the study does not support a "
            "claim that daily training is useless."
        ),
        "effect": "most gain by 5-7.5 weeks; 2x/week vs 3x/week not different; daily training not tested",
        "citation": "Humes LE, et al. The effects of dosage and duration of auditory training for older adults with hearing impairment. J Acoust Soc Am. 2014.",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC4144170/",
        "grade": "A",
    },
    "zheng_rehab_meta_2024": {
        "claim": (
            "Hearing rehabilitation programs for presbycusis reduce self-perceived "
            "hearing handicap and negative emotions and increase hearing-aid use, "
            "but do not by themselves change satisfaction with amplification."
        ),
        "effect": "HHIE MD -5.80 (95% CI -8.16 to -3.44); negative emotion MD -1.66; HA use MD 0.22",
        "citation": "Zheng Z, et al. Impact of hearing rehabilitation programs on presbycusis management: systematic review and meta-analysis of RCTs. 2024.",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC11532099/",
        "grade": "A",
    },
    "remote_mic_2021": {
        "claim": (
            "A wireless remote microphone attached to the talker improves speech "
            "recognition in noise for hearing-aid users by roughly 11-19.5 dB SNR, "
            "and the benefit grows with distance."
        ),
        "effect": "+11 to +19.5 dB SNR for adults; benefit independent of listener-to-source distance",
        "citation": "Effects of Wireless Remote Microphone on Speech Recognition in Noise for Hearing Aid Users in China. 2021.",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC8072043/",
        "grade": "B",
    },
    "tv_streaming_2024": {
        "claim": (
            "Streaming TV audio directly to hearing aids improves TV speech "
            "recognition by 11-14 percentage points with a large effect size, and "
            "neither age nor hearing-loss severity moderates the benefit."
        ),
        "effect": "+11 to +14 percentage points; Cohen's dz ~ 1.0; Z = -5.73, p < 0.001",
        "citation": "Improving TV-Watching Speech Recognition for Hearing Aid Users through Wireless Audio Streaming in a Household Setup. 2024.",
        "url": "https://www.scirp.org/journal/paperinformation?paperid=150363",
        "grade": "B",
    },
    "tv_adapter_2010": {
        "claim": (
            "In a within-subject study, every participant scored higher on TV "
            "speech recognition with a TV adapter streaming to hearing aids than "
            "with hearing aids alone."
        ),
        "effect": "mean 36% -> 81% words correct; individual gains 15-66% (mean +45%)",
        "citation": "Improving TV Listening for Hearing Aid Users. The Hearing Review.",
        "url": "https://hearingreview.com/inside-hearing/research/improving-tv-listening-for-hearing-aid-users",
        "grade": "B",
    },
    "music_mci_2024": {
        "claim": (
            "Eight weeks of music-based auditory training (40 min, twice weekly) in "
            "hearing-impaired older adults with mild cognitive impairment improved "
            "phoneme, word and sentence recognition and some memory measures."
        ),
        "effect": "significant gains in phoneme/word/sentence recognition; ~8% maintained at 2-week follow-up",
        "citation": "The Effects of Music-Based Auditory Training on Hearing-Impaired Older Adults With Mild Cognitive Impairment. 2024.",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC10933806/",
        "grade": "B",
    },
    "choir_rct_2025": {
        "claim": (
            "A 14-week choir-singing intervention improved unaided speech-in-noise "
            "perception and frequency-following responses in older adult hearing-aid "
            "users compared with a do-nothing control."
        ),
        "effect": "significant improvement in unaided SIN and FFR vs control; no difference vs music appreciation",
        "citation": "Choir Singing and Music Appreciation Training Enhances Unaided Speech-in-Noise Perception and Frequency Following Responses for Older Adult Hearing Aid Users: A RCT. 2025.",
        "url": "https://pubmed.ncbi.nlm.nih.gov/41036261",
        "grade": "A",
    },
    "act_gamified_2025": {
        "claim": (
            "Four weeks of gamified, personalized auditory-cognitive training "
            "improved naturalistic speech-in-noise comprehension in older adults "
            "with mild-to-moderate hearing loss, with gains retained at follow-up."
        ),
        "effect": "significant SIN comprehension gain vs active control, retained at follow-up",
        "citation": "Personalized and gamified auditory-cognitive training improves naturalistic speech-in-noise comprehension in older adults with hearing loss. npj Science of Learning. 2025.",
        "url": "https://www.nature.com/articles/s41539-025-00369-4",
        "grade": "A",
    },
    "kraus_brainfit_2013": {
        "claim": (
            "Auditory-based cognitive training in older adults improved neural "
            "timing and produced gains on the Quick Speech-in-Noise test and "
            "cognitive measures; an active control group did not show these gains."
        ),
        "effect": "earlier brainstem latencies, reduced temporal jitter, QuickSIN and cognitive gains",
        "citation": "Anderson S, Kraus N. In Older Adults, the Brain Can Still Be Trained to Hear in Noise. The Hearing Journal. 2013 (reporting PNAS 2013;110:4357-4362).",
        "url": "https://brainvolts.northwestern.edu/wp-content/uploads/boxtrx/Kraus_Anderson_HearJour_May_2013.pdf",
        "grade": "B",
    },
    "zendel_music_2019": {
        "claim": (
            "Musical training in older adults improved speech-in-noise understanding, "
            "accompanied by changes in cortical responses linked to the speech-motor "
            "system."
        ),
        "effect": "behavioural SIN improvement plus increased fronto-left cortical activity",
        "citation": "Zendel BR, et al. Musical training improves the ability to understand speech-in-noise in older adults. Neurobiol Aging. 2019.",
        "url": "https://peretzlab.ca/wp-content/uploads/2020/12/zendel-_b__r__et_al-_2019.pdf",
        "grade": "B",
    },
    "zhou_tdcs_2025": {
        "claim": (
            "tDCS-assisted auditory rehabilitation in 100 elderly patients with "
            "hearing impairment lowered pure-tone hearing thresholds and HHIE-S "
            "scores more than sham stimulation, alongside cognitive gains."
        ),
        "effect": "threshold 44.6 -> 35.08 dB vs 45.10 -> 38.84 dB sham; HHIE-S delta -10.02 vs -8.24",
        "citation": "Zhou Y, et al. Dual improvement of cognitive function and auditory ability in elderly patients with hearing impairment by tDCS-assisted auditory rehabilitation training. 2025.",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC12434129/",
        "grade": "A",
    },
    "clear_speech_partner_2016": {
        "claim": (
            "Training communication partners (spouses) to use clear speech improves "
            "speech recognition for the person with hearing loss, and training on a "
            "familiar talker's voice transfers to recognition of that talker."
        ),
        "effect": "improved recognition of spouse's speech after partner training",
        "citation": "Tye-Murray N, et al. Auditory Training With Frequent Communication Partners. J Speech Lang Hear Res. 2016.",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC5280067/",
        "grade": "B",
    },
    "snr_requirement_10db": {
        "claim": (
            "People with sensorineural hearing loss need up to about 10 dB more "
            "signal-to-noise ratio than normal-hearing listeners to reach the same "
            "speech understanding, even for moderate losses."
        ),
        "effect": "up to ~10 dB additional SNR required; SNR driven by ambient noise, distance and reverberation",
        "citation": "How Remote Microphones Help Hearing Aid Users Cut Through the Noise. Hearing Health & Technology Matters. 2024.",
        "url": "https://hearinghealthmatters.org/hearing-aids/2024/hearing-aids-remote-microphones",
        "grade": "D",
    },
    "hhie_s_screening": {
        "claim": (
            "The Hearing Handicap Inventory for the Elderly - Screening version "
            "(HHIE-S, 10 items, 0-40) is a validated self-report measure of hearing "
            "handicap in older adults and is widely used as a treatment outcome."
        ),
        "effect": "0-8 no handicap; 10-24 mild-to-moderate; 26-40 significant handicap",
        "citation": "How Does the HHIE Score Predict the Intention of Hearing Aid Adoption in Older Adults? 2025 (review of HHIE validation).",
        "url": "https://pubmed.ncbi.nlm.nih.gov/40875366",
        "grade": "B",
    },
    "auditory_training_sin_meta": {
        "claim": (
            "Older listeners retain a capacity for auditory perceptual learning, "
            "and adaptive auditory training can improve performance on the trained "
            "speech task; the evidence for transfer to untrained speech is mixed."
        ),
        "effect": "on-task learning is robust; transfer to untrained stimuli is limited and inconsistent",
        "citation": "Bieber RE, Gordon-Salant S. Improving older adults' understanding of challenging speech: auditory training, rapid adaptation and perceptual learning. Hear Res. 2020;402:108054.",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC7880302/",
        "grade": "B",
    },
    "presbycusis_irreversible": {
        "claim": (
            "Age-related cochlear hair-cell loss is not reversed by any behavioural "
            "or electrical intervention; rehabilitation improves central processing, "
            "attention, strategy and signal quality."
        ),
        "effect": "no restoration of cochlear function; gains come from central/strategic and signal factors",
        "citation": "WHO fact sheet on deafness and hearing loss: age-related hearing loss is permanent and manageable, not reversible.",
        "url": "https://www.who.int/news-room/fact-sheets/detail/deafness-and-hearing-loss",
        "grade": "D",
    },
    "quicksin_norms": {
        "claim": (
            "The QuickSIN expresses speech-in-noise ability as SNR loss in dB, "
            "where 0 dB is normal; older adults with hearing loss typically score "
            "about 2.6-10 dB SNR loss (mean ~6.3 dB)."
        ),
        "effect": "normal ~0 dB; older adults with hearing loss ~2.6-10 dB, mean ~6.3 dB",
        "citation": "Davidson A, et al. Hearing Aid Technology Settings and Speech-in-Noise Performance. 2022 (PMC9128736).",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC9128736/",
        "grade": "B",
    },
    "physical_activity_cohort": {
        "claim": (
            "In a prospective cohort of 27,537 adults followed about 6 years, "
            "moderate and high leisure-time physical activity was associated with "
            "lower risk of hearing loss, and physical function has shown a "
            "protective association with hearing in older adults."
        ),
        "effect": "lower hearing-loss risk with moderate/high leisure-time activity (cohort, not causal)",
        "citation": "Physical Activity and Hearing Health. Signia Lifestyle Medicine Partnership toolkit, citing prospective cohort of 27,537 adults.",
        "url": "https://audiologist.org/_resources/documents/educate/signia/Lifestyle-Medicine-Partnership-LMP-Toolkit-Flyer-2.pdf",
        "grade": "C",
    },
    "ototoxic_meds": {
        "claim": (
            "Some medications can affect hearing or balance (for example certain "
            "loop diuretics, aminoglycoside antibiotics and high-dose salicylates), "
            "so a hearing change should trigger a medication review by the prescriber "
            "or pharmacist rather than a self-directed change."
        ),
        "effect": "medication review by prescriber/pharmacist; never stop prescribed drugs without advice",
        "citation": "Ototoxic medications: clinical guidance on drug-induced hearing loss and the need for prescriber review.",
        "url": "https://www.who.int/news-room/fact-sheets/detail/deafness-and-hearing-loss",
        "grade": "D",
    },
    "nia_communication_tips": {
        "claim": (
            "Face-to-face positioning, reducing background noise before speaking, "
            "speaking slightly more slowly and clearly, and never shouting are "
            "recommended communication strategies for older adults with hearing loss."
        ),
        "effect": "reduce noise, face the listener, slow down, do not shout (shouting raises pitch and reduces clarity)",
        "citation": "National Institute on Aging / Cleveland Hearing & Speech Center communication strategies guidance.",
        "url": "https://blog.chsc.org/blog/how-clear-speech-helps-those-with-hearing-loss",
        "grade": "D",
    },
    "phone_streaming_2024": {
        "claim": (
            "Streaming phone calls directly to hearing aids improved word "
            "recognition during noisy phone calls and reduced self-reported "
            "listening effort in adults with moderate-to-severe hearing loss."
        ),
        "effect": "word recognition 30.0 -> 39.1 of 50; listening effort 85.5 -> 72.5 of 100",
        "citation": "Journal of Audiology and Otology. 2024, summarised in Audiology Northwest: hearing aids and Bluetooth.",
        "url": "https://www.audiologynw.com/blog/hearing-aids-and-bluetooth",
        "grade": "B",
    },
    "bluetooth_coupling_2024": {
        "claim": (
            "Bluetooth coupling of the hearing aid to the audio source improves "
            "speech recognition especially when speech is time-compressed, and is "
            "rated higher in quality even in quiet."
        ),
        "effect": "significant gain at 40% compression (t(1,19)=3.942, p=0.001); no gain at normal rate",
        "citation": "Bluetooth Coupling in Hearing Aids: Effect on Audiovisual Speech Recognition in Older Individuals with Sloping Hearing Loss. 2023.",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC10147467",
        "grade": "B",
    },
    "tv_streaming_muted_mics_2024": {
        "claim": (
            "In background noise, TV streaming with the hearing-aid microphones "
            "muted produced better speech understanding and satisfaction than "
            "standard hearing-aid listening; in quiet the benefit was small."
        ),
        "effect": "benefit concentrated in noise when hearing-aid microphones are muted",
        "citation": "Plyler PN, et al. Effectiveness of Television Streaming on Hearing Aid User Performance. American Journal of Audiology. 2024.",
        "url": "https://pubs.asha.org/doi/abs/10.1044/2023_AJA-23-00169",
        "grade": "B",
    },
    "repair_strategies_ace": {
        "claim": (
            "Structured communication training such as Active Communication "
            "Education increases the use of communication repair strategies, "
            "improves acceptance of hearing loss and yields gains in quality of "
            "life and social relationships."
        ),
        "effect": "more repair strategies used; better acceptance and quality of life in RCTs of communication training",
        "citation": "Active Communication Education RCTs, summarised in Practical Communication Strategies for People with Hearing Loss. HearingTracker.",
        "url": "https://www.hearingtracker.com/resources/7-practical-communication-strategies-for-people-with-hearing-loss",
        "grade": "B",
    },
    "humes_specificity_2014": {
        "claim": (
            "In the Humes 2014 dosage study, gains were significant for the speech "
            "materials used in training, but new words improved only about 7-10% and "
            "the study did not find generalization to untrained talkers or sentences."
        ),
        "effect": "on-task gain; ~7-10% for new words; no generalization to untrained talkers/sentences",
        "citation": "Humes LE, Kinney DL, Brown SE, Kiener AL, Quigley TM. The effects of dosage and duration of auditory training for older adults with hearing impairment. J Acoust Soc Am. 2014;136(3):EL224-EL230.",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC4144170/",
        "grade": "A",
    },
    "hhie_s_pt_br": {
        "claim": (
            "The HHIE-S was adapted to Brazilian Portuguese by Wieselberg (1997) "
            "and is used as a self-report hearing-handicap measure in Brazilian "
            "studies. Published Brazilian work reports slightly different band "
            "boundaries (0-8 / 10-23 / 24-40), so the score should be reported "
            "raw and the band treated as descriptive."
        ),
        "effect": "pt-BR adaptation exists; bands vary slightly by source",
        "citation": (
            "Wieselberg MB. A auto-percepcao do handicap auditivo em idosos "
            "[dissertation]. Sao Paulo: PUC-SP; 1997. As cited in Rosis ACA, "
            "Souza MRF, Iorio MCM. Rev Soc Bras Fonoaudiol. 2009;14(3):339-345."
        ),
        "url": "https://www.scielo.br/j/rsbf/a/mWWFPX9zjw43TTrkwXbBQBh/?format=html&lang=pt",
        "grade": "B",
    },
    "quicksin_measure_2004": {
        "claim": (
            "QuickSIN estimates SNR loss from six sentences with five key words each "
            "(SNR loss = 25.5 - total correct); one list is accurate to about 2.7 dB "
            "at the 95% confidence level. It is an open-set test and is not equivalent "
            "to a closed-set browser task."
        ),
        "effect": "6 sentences x 5 key words; +/-2.7 dB (95% CI) for one list; +/-1.3 dB for two lists",
        "citation": "Killion MC, Niquette PA, Gudmundsen GI, Revit LJ, Banerjee S. Development of a quick speech-in-noise test for measuring signal-to-noise ratio loss in normal-hearing and hearing-impaired listeners. J Acoust Soc Am. 2004;116(4):2395-2405.",
        "url": "https://pubs.aip.org/asa/jasa/article-abstract/116/4/2395/545472/Development-of-a-quick-speech-in-noise-test-for",
        "grade": "B",
    },
    "gap_training_2013": {
        "claim": (
            "Ten days of gap-detection training improved gap-detection thresholds in "
            "older adults, and the learning was retained at one month. The study did "
            "not establish transfer from gap detection to speech-in-noise."
        ),
        "effect": "gap-detection threshold improved in the trained task; retention at 1 month; no speech-transfer claim",
        "citation": "Kishon-Rabin L, et al. Improved gap detection thresholds following auditory training: evidence of auditory plasticity in older adults. Am J Audiol. 2013;22(2):343-346.",
        "url": "https://pubmed.ncbi.nlm.nih.gov/24018576/",
        "grade": "B",
    },
    "transfer_limits_2020": {
        "claim": (
            "Across auditory perceptual-learning studies in older adults, learning "
            "on the trained stimuli is usually robust, but transfer to untrained "
            "stimuli is limited and inconsistent. On-task gain must not be presented "
            "as real-world benefit."
        ),
        "effect": "trained-task gain does not reliably transfer to untrained speech",
        "citation": "Bieber RE, Gordon-Salant S. Improving older adults' understanding of challenging speech: auditory training, rapid adaptation and perceptual learning. Hear Res. 2020;402:108054.",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC7880302/",
        "grade": "B",
    },
    "achieve_2023": {
        "claim": (
            "In the ACHIEVE randomised trial, a hearing intervention did not reduce "
            "3-year global cognitive decline in the primary analysis of the total "
            "cohort (difference 0.002 SD, p=0.96). A prespecified subgroup at higher "
            "risk showed slower decline, but cognitive protection must not be promised "
            "to an individual."
        ),
        "effect": "primary analysis null for global cognition; subgroup signal only; do not promise cognitive benefit",
        "citation": "Lin FR, et al. Hearing intervention versus health education control to reduce cognitive decline in older adults with hearing loss in the USA (ACHIEVE): a multicentre, randomised controlled trial. Lancet. 2023;402:786-797.",
        "url": "https://pubmed.ncbi.nlm.nih.gov/37478886/",
        "grade": "A",
    },
    "hhie_s_administration": {
        "claim": (
            "The HHIE-S has 10 items scored Yes=4, Sometimes=2, No=0 (total 0-40); "
            "0-8 indicates no perceived handicap, 10-24 mild-to-moderate and 26-40 "
            "significant handicap. A score of 10 or more is the usual referral "
            "threshold for audiologic evaluation. The original instructions ask the "
            "respondent not to skip an item because the situation is avoided and to "
            "answer as they hear without the hearing aid."
        ),
        "effect": "0-40; bands 0-8 / 10-24 / 26-40; refer at >=10; unaided administration",
        "citation": "Ventry IM, Weinstein BE. Identification of elderly people with hearing problems. ASHA. 1983;25(7):37-42. Scoring and bands as summarised by the Hartford Institute for Geriatric Nursing (Try This: Hearing Screening in Older Adults).",
        "url": "https://hign.org/sites/default/files/2020-06/Try_This_General_Assessment_12.pdf",
        "grade": "B",
    },
    "continuous_speech_training_2025": {
        "claim": (
            "Training on natural continuous speech followed by a comprehension "
            "question, with the memory load varied across trials, improved "
            "speech-in-noise perception in older adults; the gain was larger in "
            "participants with more hearing loss or lower auditory working memory. "
            "The study is short-term (one session, crossover) and does not show that "
            "the improvement reaches everyday conversation."
        ),
        "effect": "about 0.5 dB better SRT right after a session; larger in lower working memory",
        "citation": "Frei V, Giroud N. Immersive auditory-cognitive training improves speech-in-noise perception in older adults with varying hearing and working memory. npj Sci Learn. 2025;10(1).",
        "url": "https://doi.org/10.1038/s41539-025-00306-5",
        "grade": "B",
    },
    "connected_speech_memory_1995": {
        "claim": (
            "Remembering spoken language is harder for older adults and for listeners "
            "with hearing loss, and the cost grows when the signal is degraded; "
            "context helps, but it also consumes resources. A test that asks about a "
            "whole passage measures memory and attention together with audibility."
        ),
        "effect": "recall of speech in noise falls with age and hearing loss",
        "citation": "Pichora-Fuller MK, Schneider BA, Daneman M. How young and old adults listen to and remember speech in noise. J Acoust Soc Am. 1995;97(1):593-608.",
        "url": "https://doi.org/10.1121/1.412282",
        "grade": "C",
    },
    "fast_speech_aging_2001": {
        "claim": (
            "Older listeners lose more recognition than younger listeners as speech "
            "rate increases, and the loss is larger when the linguistic cues are "
            "reduced. This is why running broadcast speech, which is fast and "
            "unsegmented, is harder than a single slow sentence."
        ),
        "effect": "steeper decline with faster speech in older adults",
        "citation": "Gordon-Salant S, Fitzgibbons PJ. Sources of age-related recognition difficulty for time-compressed speech. J Speech Lang Hear Res. 2001;44(4):709-719.",
        "url": "https://doi.org/10.1044/1092-4388(2001/056)",
        "grade": "C",
    },
    "working_memory_sin_2008": {
        "claim": (
            "Across twenty studies, working memory (especially reading span) is a "
            "consistent but secondary predictor of speech reception once hearing loss "
            "is accounted for. Comprehension of long material therefore depends on "
            "both the ear and the memory, and a passage score cannot be read as a "
            "hearing threshold."
        ),
        "effect": "working memory explains part, not most, of the variance",
        "citation": "Akeroyd MA. Are individual differences in speech reception related to individual differences in cognitive ability? A survey of twenty experimental studies with normal and hearing-impaired adults. Int J Audiol. 2008;47(Suppl 2):S53-S71.",
        "url": "https://doi.org/10.1080/14992020802301142",
        "grade": "B",
    },
    "ecosin_2020": {
        "claim": (
            "Everyday conversational sentences recorded at natural rate and effort "
            "form a valid speech-in-noise test material; sentence material drawn from "
            "real conversation is more representative of daily listening than "
            "laboratory sentences."
        ),
        "effect": "ECO-SiN corpus: 192 natural sentences, average 6.3 words, three vocal efforts",
        "citation": "Miles KM, Keidser G, Freeston K, Beechey T, Best V, Buchholz JM. Development of the everyday conversational sentences in noise test. J Acoust Soc Am. 2020;147(3):1562-1576.",
        "url": "https://doi.org/10.1121/10.0000780",
        "grade": "B",
    },
    "real_world_sentences_2022": {
        "claim": (
            "Embedding everyday sentences in several real-world background noises "
            "allows the difficulty of a speech test to be set away from ceiling and "
            "floor for listeners with different hearing loss; scores are driven by the "
            "hearing loss, the noise and also strongly by the sentence material."
        ),
        "effect": "choosing the environment sets a usable operating point; material effect is large",
        "citation": "Miles K, Beechey T, Best V, Buchholz J. Measuring speech intelligibility and hearing-aid benefit using everyday conversational sentences in real-world environments. Front Neurosci. 2022;16:789565.",
        "url": "https://doi.org/10.3389/fnins.2022.789565",
        "grade": "B",
    },
    "ecological_validity_tradeoff_2025": {
        "claim": (
            "In cochlear-implant users, speech audiometry results and a "
            "patient-reported outcome measure did not correlate across all test "
            "conditions: there is a tension between precision audiometry (control, "
            "reproducibility) and ecological validity (resemblance to daily listening). "
            "The study is in CI users, so it is cited here as a general warning, not as "
            "evidence about hearing-aid users."
        ),
        "effect": "realistic material buys face validity at the cost of precision",
        "citation": "Hey M, Hocke T. Precision audiometry and ecological validity: exploring the link between patient-reported outcome measures and speech testing in CI users. Audiol Res. 2025;15(5):142.",
        "url": "https://doi.org/10.3390/audiolres15050142",
        "grade": "B",
    },
    "syntactic_complexity_aging": {
        "claim": (
            "Older adults, and especially older adults with hearing loss, understand "
            "syntactically complex sentences less accurately than simple ones even when "
            "the words are audible; the cost is attributed to limited working memory and "
            "to the effort of listening."
        ),
        "effect": "clause complexity and hearing loss both reduce report accuracy; effort consumes resources",
        "citation": "Stewart R, Wingfield A. Hearing loss and cognitive effort in older adults' report accuracy for verbal materials. J Am Acad Audiol. 2009;20(2):147-154.",
        "url": "https://pubmed.ncbi.nlm.nih.gov/19927677/",
        "grade": "C",
    },
    "streaming_environment_awareness": {
        "claim": (
            "Streaming audio to hearing aids reduces the awareness of environmental "
            "sounds because the ear is partly occluded and attention is directed to "
            "the stream. It is a conservative safety precaution, not a training "
            "claim, to avoid streaming while walking on stairs or in traffic."
        ),
        "effect": "safety precaution: do not stream while walking on stairs or in the street",
        "citation": "Clinical guidance on hearing-aid use and environmental awareness (safety precaution; no primary trial of stair walking under streaming).",
        "url": "https://www.who.int/news-room/fact-sheets/detail/deafness-and-hearing-loss",
        "grade": "D",
    },
}


def citation_for(key: str) -> dict[str, Any]:
    """Return the evidence entry for ``key`` or raise ``KeyError``."""
    return EVIDENCE[key]
