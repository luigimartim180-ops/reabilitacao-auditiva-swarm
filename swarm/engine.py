"""Deterministic personalization engine for the hearing-rehabilitation swarm.

Design rule: the planner is a pure function of the validated profile. It never
calls a language model and never writes free text that is not tied to an
evidence key. Language models may only *narrate* the JSON this module returns,
which is what keeps the system from inventing clinical claims.

Agents (each is a deterministic policy with an explicit contract):
    A1 SignalChainAgent   - fastest wins: signal engineering and device audit
    A2 DosageAgent        - adaptive training dose, fatigue control
    A3 TransferAgent      - ecological transfer: TV, phone, conversation, music
    A4 PartnerAgent       - communication partner (family) training
    A5 SafetyAgent        - red flags, medical escalation, contraindications
"""

from __future__ import annotations

from typing import Any

from .contracts import AGENT_CONTRACTS
from .evidence import EVIDENCE
from .measurement import GAP_TEST, SPEECH_TEST
from .schema import Profile

# --- reference constants ---------------------------------------------------

# QuickSIN reference bands. They are used for interpretation of a clinical
# QuickSIN score, not for the home browser test (which is closed-set and relative).
SNR_LOSS_BANDS = (
    (2.0, "normal_0_2db"),
    (7.0, "mild_3_7db"),
    (15.0, "moderate_8_15db"),
    (float("inf"), "severe_gt_15db"),
)

# TV ladder: signal first, then progressively harder content.
TV_LADDER = ("news_anchor", "interview", "soap_opera_with_questions", "film_with_music")

# Music dose from music_mci_2024 / choir_rct_2025.
MUSIC_DOSE_MIN_PER_SESSION = 15
MUSIC_SESSIONS_PER_WEEK = 2

# Default training dose from humes_dosage_2014.
DEFAULT_MICRO_SESSIONS_PER_DAY = 3
DEFAULT_MINUTES_PER_SESSION = 6


def _refs(*keys: str) -> list[str]:
    missing = [k for k in keys if k not in EVIDENCE]
    if missing:
        raise KeyError("unknown evidence keys: " + ", ".join(missing))
    return list(keys)


def classify_snr_loss(snr_loss_db: float) -> str:
    """Map an SNR loss value in dB to a band key (quicksin_norms)."""
    for threshold, name in SNR_LOSS_BANDS:
        if snr_loss_db <= threshold:
            return name
    return SNR_LOSS_BANDS[-1][1]  # pragma: no cover - inf covers all


# --- A1: signal chain ------------------------------------------------------


def _signal_chain(profile: Profile) -> dict[str, Any]:
    """A1: signal engineering. Fastest, largest, most reliable effect."""
    actions: list[dict[str, Any]] = []

    if profile.hearing_aid_streaming == "none":
        actions.append(
            {
                "priority": 1,
                "action": "enable_tv_audio_streaming",
                "detail": (
                    "Add a TV adapter or Bluetooth streaming path so TV audio goes "
                    "directly to the hearing aids instead of through the room."
                ),
                "expected_effect": "+11 to +14 percentage points of TV speech recognition",
                "effort": "15 min",
                "cost_band": "low",
                "why": "bypasses room acoustics, noise and distance in one step",
                "refs": _refs("tv_streaming_2024", "tv_adapter_2010"),
            }
        )
    elif profile.hearing_aid_streaming == "unknown":
        actions.append(
            {
                "priority": 1,
                "action": "verify_streaming_capability",
                "detail": (
                    "Check the hearing-aid model for TV adapter or Bluetooth "
                    "streaming support; this is the single fastest available win."
                ),
                "expected_effect": "unlocks the day-1 signal win if supported",
                "effort": "10 min",
                "cost_band": "none",
                "why": "capability unknown; verify before planning around it",
                "refs": _refs("tv_streaming_2024"),
            }
        )

    if profile.tv_can_configure:
        actions.append(
            {
                "priority": 2,
                "action": "configure_tv_streaming_today",
                "detail": (
                    "Configure the TV streaming path on day 1 and confirm the aids "
                    "are on the correct program for streamed audio."
                ),
                "expected_effect": "visible improvement on day 1 builds adherence",
                "effort": "15 min",
                "cost_band": "none",
                "why": "signal quality, not effort, drives the fastest gain",
                "refs": _refs("tv_streaming_2024"),
            }
        )
    else:
        actions.append(
            {
                "priority": 2,
                "action": "arrange_configuration_help",
                "detail": (
                    "Bring in a family member, neighbour or the audiologist to "
                    "configure the TV streaming path; it is the highest-value task "
                    "of week 1 and should not be skipped because it is fiddly."
                ),
                "expected_effect": "removes the main blocker to the day-1 win",
                "effort": "15 min",
                "cost_band": "none",
                "why": "configuration skill is the bottleneck, not the hardware",
                "refs": _refs("tv_streaming_2024"),
            }
        )

    if "phone" in profile.top_complaints:
        actions.append(
            {
                "priority": 2,
                "action": "enable_phone_streaming",
                "detail": (
                    "Route phone calls directly to the hearing aids instead of "
                    "holding the phone to the aid microphone."
                ),
                "expected_effect": "word recognition 30.0 -> 39.1 of 50; lower listening effort",
                "effort": "10 min",
                "cost_band": "none",
                "why": "phone calls are a high-frequency, high-frustration setting",
                "refs": _refs("phone_streaming_2024", "bluetooth_coupling_2024"),
            }
        )

    if "noise" in profile.top_complaints or "group" in profile.top_complaints:
        actions.append(
            {
                "priority": 3,
                "action": "introduce_remote_microphone",
                "detail": (
                    "For restaurants, family gatherings and car rides, place a "
                    "remote microphone on the talker rather than relying on the "
                    "hearing-aid microphones."
                ),
                "expected_effect": "+11 to +19.5 dB SNR, benefit independent of distance",
                "effort": "clinic visit",
                "cost_band": "medium",
                "why": "SNR is the bottleneck in noise, not audibility",
                "refs": _refs("remote_mic_2021", "snr_requirement_10db"),
            }
        )

    if profile.medications_ototoxic:
        actions.append(
            {
                "priority": 2,
                "action": "medication_review",
                "detail": (
                    "Ask the prescriber or pharmacist to review current medicines "
                    "for ototoxic effects. Do not stop any prescribed drug without "
                    "medical advice."
                ),
                "expected_effect": "prevents an avoidable, ongoing hearing insult",
                "effort": "clinic visit",
                "cost_band": "none",
                "why": "some drugs affect hearing or balance",
                "refs": _refs("ototoxic_meds"),
            }
        )

    actions.append(
        {
            "priority": 5,
            "action": "audit_room_acoustics",
            "detail": (
                "Reduce competing noise at the source (hard floors, running TV or "
                "radio, kitchen appliances) before increasing volume."
            ),
            "expected_effect": "raises the SNR the brain receives for free",
            "effort": "20 min",
            "cost_band": "none",
            "why": "SNR is driven by ambient noise, distance and reverberation",
            "refs": _refs("snr_requirement_10db"),
        }
    )

    actions.sort(key=lambda a: a["priority"])

    triggers = [
        {"id": "T1.1", "when": "hearing_aid_streaming == none", "fired": profile.hearing_aid_streaming == "none"},
        {"id": "T1.2", "when": "hearing_aid_streaming == unknown", "fired": profile.hearing_aid_streaming == "unknown"},
        {"id": "T1.3", "when": "tv_can_configure == false", "fired": not profile.tv_can_configure},
        {"id": "T1.4", "when": "complaint in {noise, group}", "fired": bool({"noise", "group"} & set(profile.top_complaints))},
        {"id": "T1.5", "when": "complaint == phone", "fired": "phone" in profile.top_complaints},
        {"id": "T1.6", "when": "medications_ototoxic == true", "fired": profile.medications_ototoxic},
    ]

    return {
        "agent": "A1_signal_chain",
        "objective": AGENT_CONTRACTS["A1_signal_chain"]["objective"],
        "rationale": AGENT_CONTRACTS["A1_signal_chain"]["rationale"],
        "inputs": AGENT_CONTRACTS["A1_signal_chain"]["inputs"],
        "triggers": triggers,
        "actions": actions,
        "stop_criteria": AGENT_CONTRACTS["A1_signal_chain"]["stop_criteria"],
        "evidence_gaps": AGENT_CONTRACTS["A1_signal_chain"]["evidence_gaps"],
        "refs": sorted({r for a in actions for r in a["refs"]}),
    }


# --- A2: dosage ------------------------------------------------------------


def _dosage(profile: Profile) -> dict[str, Any]:
    """A2: training dose.

    The only dose that has been tested in a randomised dosage study is 2 or 3
    sessions per week for 5-15 weeks (Humes 2014). The home app uses one short
    session per training day; that is a pragmatic adaptation, not a validated
    equivalence. The 10-minute daily cap is a tolerability guard for a very old
    adult, not an evidence-based optimum.
    """
    days = 3
    minutes = 6
    notes: list[str] = []

    if profile.cognitive_impairment:
        days = 2
        minutes = 5
        notes.append("shorter, less frequent sessions; stop at the first sign of fatigue")

    if profile.falls_last_year >= 1:
        notes.append("sit during training; keep the walk inside and supervised")

    if "fatigue" in profile.top_complaints:
        days = 2
        notes.append("front-load fatigue control: one extra rest before the last item")

    triggers = [
        {"id": "T2.1", "when": "always", "fired": True},
        {"id": "T2.2", "when": "cognitive_impairment == true", "fired": profile.cognitive_impairment},
        {"id": "T2.3", "when": "falls_last_year >= 1", "fired": profile.falls_last_year >= 1},
        {"id": "T2.4", "when": "complaint == fatigue", "fired": "fatigue" in profile.top_complaints},
    ]

    return {
        "agent": "A2_dosage",
        "objective": AGENT_CONTRACTS["A2_dosage"]["objective"],
        "rationale": AGENT_CONTRACTS["A2_dosage"]["rationale"],
        "inputs": AGENT_CONTRACTS["A2_dosage"]["inputs"],
        "triggers": triggers,
        "micro_sessions_per_day": 1,
        "minutes_per_session": minutes,
        "days_per_week": days,
        "session_model": "one short session per training day; 2-3 days/week",
        "dose_rationale": (
            "2x/week and 3x/week did not differ in the randomised dosage study; "
            "a daily arm was not tested. The home session is shorter than the "
            "laboratory protocol, so equivalence is unknown."
        ),
        "dose_cap_seconds": 600,
        "dose_cap_note": "10 minutes/day is a tolerability guard, not a proven optimal dose",
        "expected_plateau_weeks": "5-7.5 (most gain); benefit may continue to 15 weeks",
        "session_structure": [
            "warm-up: one easy item the participant already gets right",
            "core: 8 adaptive speech-in-noise items at the current level",
            "close: one guaranteed correct item (ends on success)",
        ],
        "progression": [
            "after 3 consecutive correct responses, make the next item 2 dB harder",
            "after 2 consecutive errors, make the next item 2 dB easier",
            "never move the level more than 4 dB within one session",
        ],
        "progression_note": "practical adaptive rule, not a validated training protocol",
        "fatigue_signs": [
            "rubbing the ear or the hearing aid",
            "asking to stop or looking away",
            "errors that suddenly cluster after a good start",
        ],
        "stop_rules": [
            "stop the session at the first fatigue sign",
            "stop and simplify if adherence drops below 80% in a week",
        ],
        "adherence_target": ">=80% of planned sessions; log missed days without penalty",
        "ending_rule": "always end the session on a correct response",
        "notes": notes,
        "stop_criteria": AGENT_CONTRACTS["A2_dosage"]["stop_criteria"],
        "evidence_gaps": [
            "optimal dose for adults over 85 is not separately established",
            "the 6-minute home session is shorter than the laboratory protocol; equivalence is unknown",
            "the 10-minute daily cap is a tolerability guard, not an evidence-based dose",
        ],
        "refs": _refs("humes_dosage_2014", "act_gamified_2025"),
    }


# --- A3: transfer ----------------------------------------------------------


def _transfer(profile: Profile) -> dict[str, Any]:
    """A3: ecological transfer. TV/phone/conversation ladders + music."""
    ladder = list(TV_LADDER)
    if profile.uses_captions:
        ladder_note = (
            "Captions stay OFF during the training block only; keep them available "
            "outside training so leisure TV remains enjoyable."
        )
    else:
        ladder_note = "Introduce captions only if a week of the ladder stalls."

    phone_ladder = [
        "short call with a familiar speaker in a quiet room",
        "longer call with a familiar speaker, speakerphone allowed",
        "call with a less familiar speaker",
        "call in a mildly noisy room",
    ]
    conversation_ladder = [
        "one-to-one in a quiet room, face to face",
        "one-to-one at a small table with some room noise",
        "three people at a table with the remote microphone",
        "group gathering with the remote microphone on the main talker",
    ]

    triggers = [
        {"id": "T3.1", "when": "always", "fired": True},
        {"id": "T3.2", "when": "uses_captions == true", "fired": profile.uses_captions},
        {"id": "T3.3", "when": "complaint == phone", "fired": "phone" in profile.top_complaints},
        {"id": "T3.4", "when": "complaint in {group, noise}", "fired": bool({"group", "noise"} & set(profile.top_complaints))},
        {"id": "T3.5", "when": "always", "fired": True},
    ]

    return {
        "agent": "A3_transfer",
        "objective": AGENT_CONTRACTS["A3_transfer"]["objective"],
        "rationale": AGENT_CONTRACTS["A3_transfer"]["rationale"],
        "inputs": AGENT_CONTRACTS["A3_transfer"]["inputs"],
        "triggers": triggers,
        "tv_ladder": ladder,
        "tv_targets": {
            ladder[0]: "understand >=80% of a 10-minute block",
            ladder[1]: "understand the guest's main point with one repeat",
            ladder[2]: "follow the plot and answer one question per block",
            ladder[3]: "follow dialogue through music and effects",
        },
        "favourite_program": profile.favourite_program,
        "favourite_time": profile.favourite_time,
        "tv_note": ladder_note,
        "phone_ladder": phone_ladder,
        "conversation_ladder": conversation_ladder,
        "generalisation_check": (
            "weekly: pick one untrained situation and ask him to report what he "
            "understood; on-task gain does not transfer automatically"
        ),
        "transfer_note": (
            "The app separates trained items from untrained test forms. A gain on "
            "trained items is an on-task result; a gain on untrained forms is a "
            "limited and uncertain transfer signal, not proof of real-world benefit."
        ),
        "music": {
            "minutes_per_session": MUSIC_DOSE_MIN_PER_SESSION,
            "sessions_per_week": MUSIC_SESSIONS_PER_WEEK,
            "detail": "music from the participant's era, singing along where possible",
            "refs": _refs("music_mci_2024", "choir_rct_2025", "zendel_music_2019"),
        },
        "active_ingredients": [
            "adaptive closed-set speech-in-noise",
            "speech rate 0.90x (slower) -> 1.00x (normal); time compression above 1.0x is optional and not established for home use",
            "babble of competing voices (synthesised; not a real talker)",
            "gap detection (temporal resolution); task-specific, transfer to speech not established",
        ],
        "stop_criteria": AGENT_CONTRACTS["A3_transfer"]["stop_criteria"],
        "evidence_gaps": AGENT_CONTRACTS["A3_transfer"]["evidence_gaps"],
        "refs": _refs(
            "act_gamified_2025",
            "auditory_training_sin_meta",
            "transfer_limits_2020",
            "humes_specificity_2014",
            "gap_training_2013",
            "kraus_brainfit_2013",
            "phone_streaming_2024",
        ),
    }


# --- A4: partner -----------------------------------------------------------


def _partner(profile: Profile) -> dict[str, Any]:
    """A4: communication partner training. The family is treatment equipment."""
    if profile.living == "alone":
        mode = "self_and_remote"
        detail = "train the main remote contact by phone and any regular visitor"
    elif profile.living == "care_facility":
        mode = "staff_briefing"
        detail = "brief the care staff on clear speech and on the hearing-aid routine"
    else:
        mode = "household_partner"
        detail = "train the household partner who speaks with him most often"

    role_script = (
        "Before speaking, get his attention and face him. Then say: 'I want to be "
        "sure you understood - can you tell me the main point back?'"
    )

    do_rules = [
        "get attention before starting to speak",
        "face him, at the same level, with light on your face",
        "reduce background noise first (TV, radio, fan)",
        "speak slightly slower and slightly louder, without exaggerating",
        "rephrase instead of repeating the same words louder",
        "confirm understanding by asking for the key point back",
    ]
    dont_rules = [
        "never shout: it raises pitch and lowers clarity",
        "do not cover your mouth or talk from another room",
        "do not switch topic without a clear cue",
        "do not repeat the identical sentence when it was not understood",
    ]

    triggers = [
        {"id": "T4.1", "when": "living == with_family", "fired": profile.living == "with_family"},
        {"id": "T4.2", "when": "living == alone", "fired": profile.living == "alone"},
        {"id": "T4.3", "when": "living == care_facility", "fired": profile.living == "care_facility"},
        {"id": "T4.4", "when": "caregiver_hours_per_day < 2", "fired": profile.caregiver_hours_per_day < 2},
    ]

    notes: list[str] = []
    if profile.caregiver_hours_per_day < 2:
        notes.append("low supervision: keep the partner training to a single 10-minute block")

    return {
        "agent": "A4_partner",
        "objective": AGENT_CONTRACTS["A4_partner"]["objective"],
        "rationale": AGENT_CONTRACTS["A4_partner"]["rationale"],
        "inputs": AGENT_CONTRACTS["A4_partner"]["inputs"],
        "triggers": triggers,
        "mode": mode,
        "detail": detail,
        "caregiver_hours_per_day": profile.caregiver_hours_per_day,
        "role_script": role_script,
        "do_rules": do_rules,
        "dont_rules": dont_rules,
        "rules": do_rules + [r for r in dont_rules if r.startswith("never")],
        "training_session": [
            "2 min: explain that hearing aids amplify but do not restore",
            "5 min: practise the six 'do' rules face to face",
            "5 min: practise rephrasing instead of repeating louder",
            "5 min: rehearse the repair phrases together",
            "3 min: agree one signal to use in noisy places",
        ],
        "repair_strategies": [
            "'I heard that it is Tuesday - what time did you say?'",
            "'Could you say that another way?'",
            "'Please repeat just the last few words.'",
            "'Could you give me the main point first?'",
        ],
        "environment_checklist": [
            "TV and radio off or low while talking",
            "seat him facing the light, not the window behind the talker",
            "soft furnishings reduce echo in the room",
            "at restaurants, choose a corner table away from the kitchen",
        ],
        "notes": notes,
        "stop_criteria": AGENT_CONTRACTS["A4_partner"]["stop_criteria"],
        "evidence_gaps": AGENT_CONTRACTS["A4_partner"]["evidence_gaps"],
        "refs": _refs("clear_speech_partner_2016", "nia_communication_tips", "repair_strategies_ace"),
    }


# --- A5: safety ------------------------------------------------------------


def _safety(profile: Profile) -> dict[str, Any]:
    """A5: safety and medical escalation."""
    flags: list[dict[str, str]] = []
    if profile.falls_last_year >= 1:
        flags.append(
            {
                "flag": "falls",
                "urgency": "soon",
                "action": "refer for balance and hearing review; consider vestibular assessment",
            }
        )
    if profile.tinnitus:
        flags.append(
            {
                "flag": "tinnitus",
                "urgency": "routine",
                "action": "mention tinnitus at the next audiology appointment; do not self-treat",
            }
        )
    if profile.medications_ototoxic:
        flags.append(
            {
                "flag": "ototoxic_medication",
                "urgency": "soon",
                "action": "prescriber or pharmacist medication review before any change",
            }
        )

    red_flags = [
        {"sign": "sudden hearing change in one ear", "urgency": "urgent", "target": "emergency or ENT same day"},
        {"sign": "ear pain, discharge or sudden dizziness", "urgency": "urgent", "target": "medical assessment"},
        {"sign": "new one-sided tinnitus with hearing change", "urgency": "urgent", "target": "ENT"},
        {"sign": "repeated falls with vertigo", "urgency": "soon", "target": "balance clinic"},
    ]

    triggers = [
        {"id": "T5.1", "when": "always", "fired": True},
        {"id": "T5.2", "when": "falls_last_year >= 1", "fired": profile.falls_last_year >= 1},
        {"id": "T5.3", "when": "tinnitus == true", "fired": profile.tinnitus},
        {"id": "T5.4", "when": "medications_ototoxic == true", "fired": profile.medications_ototoxic},
    ]

    return {
        "agent": "A5_safety",
        "objective": AGENT_CONTRACTS["A5_safety"]["objective"],
        "rationale": AGENT_CONTRACTS["A5_safety"]["rationale"],
        "inputs": AGENT_CONTRACTS["A5_safety"]["inputs"],
        "triggers": triggers,
        "red_flags": red_flags,
        "referral_targets": [
            "audiologist for audiometry, real-ear verification and accessory fitting",
            "ENT for sudden or one-sided changes",
            "prescriber or pharmacist for medication review",
            "balance clinic when falls and vertigo co-occur",
        ],
        "escalation_rules": [
            "sudden hearing change in one ear -> urgent medical assessment",
            "ear pain, discharge or sudden dizziness -> medical assessment",
            "no measurable progress after 4 weeks at >=80% adherence -> new audiometry and device review",
        ],
        "contraindications": [
            "do not run loud training with ear pain, discharge or active infection",
            "do not train through dizziness; stop and assess",
            "do not use tDCS or any electrical stimulation at home",
        ],
        "training_stop_signs": [
            "sudden hearing loss, ear pain, discharge, new one-sided tinnitus or dizziness -> stop and seek medical assessment",
            "two consecutive sessions with a marked drop plus new confusion or apathy -> suspend and assess",
            "new feedback, whistling or distorted sound from the hearing aid -> device review before training",
            "persistent fatigue, worse sleep or irritability after training -> reduce the dose and reassess",
        ],
        "precautions": [
            "do not use TV or phone streaming while walking on stairs or in traffic; streaming reduces awareness of environmental sounds",
            "keep the device volume fixed during a test; change it only between sessions",
        ],
        "cognition_note": (
            "ACHIEVE 2023 found no reduction in 3-year global cognitive decline in the "
            "primary analysis of the total cohort; do not promise cognitive protection "
            "from this training."
        ),
        "flags": flags,
        "ceiling": (
            "Cochlear hair-cell loss is permanent. The plan targets central "
            "processing, attention, strategy and signal quality, not restoration."
        ),
        "stop_criteria": AGENT_CONTRACTS["A5_safety"]["stop_criteria"],
        "evidence_gaps": AGENT_CONTRACTS["A5_safety"]["evidence_gaps"],
        "refs": _refs("presbycusis_irreversible", "ototoxic_meds", "streaming_environment_awareness", "achieve_2023"),
    }


# --- plan ------------------------------------------------------------------


def _plan_weeks(profile: Profile, dosage: dict[str, Any]) -> list[dict[str, Any]]:
    """Eight-week schedule derived from the dosage and transfer policies."""
    micro = dosage["micro_sessions_per_day"]
    minutes = dosage["minutes_per_session"]
    tv = TV_LADDER
    return [
        {
            "week": 1,
            "focus": "signal + first win",
            "actions": [
                "configure TV streaming and confirm the correct hearing-aid program",
                "baseline HHIE-S and home speech-in-noise threshold (relative dB; not QuickSIN)",
                "start music sessions and partner clear-speech training",
            ],
            "tv_content": tv[0],
            "refs": _refs("tv_streaming_2024", "hhie_s_screening", "clear_speech_partner_2016"),
        },
        {
            "week": 2,
            "focus": "establish the routine",
            "actions": [
                f"one {minutes}-min session per training day, {dosage['days_per_week']} days/week",
                "speech-in-noise at the easiest SNR",
                "end every session on a correct response",
            ],
            "tv_content": tv[0],
            "refs": _refs("humes_dosage_2014", "humes_specificity_2014"),
        },
        {
            "week": 3,
            "focus": "add difficulty",
            "actions": [
                "speech rate 0.90x -> 0.95x (slower to near-normal)",
                "introduce the babble-of-voices masker (not a real talker)",
                "first mid-point check of the TV ladder",
            ],
            "tv_content": tv[1],
            "refs": _refs("act_gamified_2025"),
        },
        {
            "week": 4,
            "focus": "first re-test",
            "actions": [
                "repeat HHIE-S and the home speech-in-noise threshold on an untrained form",
                "review adherence; if <80%, simplify rather than intensify",
            ],
            "tv_content": tv[1],
            "refs": _refs("hhie_s_screening", "zheng_rehab_meta_2024"),
        },
        {
            "week": 5,
            "focus": "temporal resolution",
            "actions": [
                "gap detection (task-specific) and speech rate 1.00x (normal)",
                "remote microphone in one real noisy setting",
            ],
            "tv_content": tv[2],
            "refs": _refs("remote_mic_2021"),
        },
        {
            "week": 6,
            "focus": "real-world transfer",
            "actions": [
                "TV content with questions after each block",
                "phone practice with a familiar speaker",
                "rehearse the communication repair phrases with the family",
            ],
            "tv_content": tv[2],
            "refs": _refs("clear_speech_partner_2016", "repair_strategies_ace", "phone_streaming_2024"),
        },
        {
            "week": 7,
            "focus": "consolidation",
            "actions": [
                "full-speed speech (1.0x)",
                "group conversation with the remote microphone",
            ],
            "tv_content": tv[3],
            "refs": _refs("remote_mic_2021", "choir_rct_2025"),
        },
        {
            "week": 8,
            "focus": "final re-test and maintenance",
            "actions": [
                "repeat HHIE-S and the home speech-in-noise threshold on an untrained form",
                "set the long-term routine: music 2x/week + 2-3 listening sessions/week; no daily training requirement",
                "book a full audiometry review",
            ],
            "tv_content": tv[3],
            "refs": _refs("hhie_s_screening", "humes_dosage_2014", "music_mci_2024"),
        },
    ]


def _followup_schedule(profile: Profile) -> list[dict[str, Any]]:
    """Measurement and decision checkpoints.

    A rehabilitation plan that is never measured cannot be audited. The
    schedule separates a validated functional outcome (HHIE-S) from a home
    task measure (relative SNR), a task-specific temporal measure (gap) and an
    exploratory transfer probe. It also includes a retention check 30 days
    after the final assessment.
    """
    return [
        {
            "week": 1,
            "checkpoint": "baseline",
            "measures": [
                "HHIE-S questionnaire (0-40)",
                "home speech-in-noise threshold (relative dB; not QuickSIN)",
                "gap-detection threshold (ms; task-specific)",
                "hearing-aid program and TV streaming verified",
            ],
            "target": "baseline recorded before training starts; 2 practice trials per test are not scored",
            "action_if_not_met": "complete the baseline before the daily routine; if the voice is blocked, open the app in a full window",
            "refs": _refs("hhie_s_administration", "quicksin_measure_2004", "gap_training_2013", "tv_streaming_2024"),
        },
        {
            "week": 4,
            "checkpoint": "interim",
            "measures": [
                "adherence (sessions completed / sessions planned)",
                "HHIE-S questionnaire",
                "home speech-in-noise threshold on an untrained form",
                "gap-detection threshold",
            ],
            "target": "adherence >= 80% and no worsening of the HHIE-S score",
            "action_if_not_met": (
                "if adherence < 80%, simplify the routine instead of intensifying it; "
                "if the HHIE-S worsens by 4 or more points, or the speech threshold "
                "worsens beyond its reported range, book a new audiometry and device review"
            ),
            "refs": _refs("humes_dosage_2014", "hhie_s_administration", "transfer_limits_2020"),
        },
        {
            "week": 8,
            "checkpoint": "final",
            "measures": [
                "HHIE-S questionnaire",
                "home speech-in-noise threshold on an untrained form",
                "gap-detection threshold",
                "full audiometry review",
            ],
            "target": (
                "HHIE-S stable or better; a 2-3 dB improvement on a calibrated "
                "clinical test is the usual benchmark, while the home test's own "
                "range must be reported"
            ),
            "action_if_not_met": (
                "no measurable gain after 8 weeks at >= 80% adherence -> full audiometry, "
                "device review and implant assessment"
            ),
            "refs": _refs("hhie_s_administration", "quicksin_measure_2004", "zheng_rehab_meta_2024"),
        },
        {
            "week": 12,
            "checkpoint": "retention",
            "measures": [
                "HHIE-S questionnaire",
                "home speech-in-noise threshold (same form as baseline for comparability)",
            ],
            "target": "retain the gain or return to baseline; repetition of the baseline form may inflate the result",
            "action_if_not_met": (
                "if the gain is lost, restart 2-3 sessions/week for 4 weeks; if there is "
                "progressive decline, arrange audiology review"
            ),
            "refs": _refs("humes_dosage_2014", "transfer_limits_2020"),
        },
    ]


def _progress_markers() -> list[dict[str, str]]:
    return [
        {"when": "day 1", "marker": "TV volume lower and fewer requests to repeat"},
        {"when": "weeks 2-3", "marker": "tolerates background noise without irritation"},
        {"when": "weeks 4-6", "marker": "follows a soap opera without captions"},
        {
            "when": "week 8",
            "marker": (
                "HHIE-S stable or better; a 2-3 dB improvement on a calibrated "
                "clinical test is the benchmark, not a promise from the home test"
            ),
        },
    ]


def _content_plan() -> dict[str, Any]:
    """The sentence material and the order in which its difficulty grows.

    The simple, predictable sentences stay: they are the low end of the ladder
    and they protect confidence. Realistic everyday passages are added on top,
    because an item set that stays easy produces a ceiling, and a ceiling cannot
    show improvement. The scored test forms (A, B, C) are never rewritten, so the
    earlier baseline keeps its meaning.
    """
    tiers = {
        "N1": {"max_words": 10, "what": "frase curta e previsivel", "why": "aquecimento e confianca; o piso da escada"},
        "N2": {"max_words": 14, "what": "frase media do dia a dia, com um detalhe ou uma negacao", "why": "passo seguinte sem salto brusco"},
        "N3": {"max_words": 20, "what": "frase longa com dois fatos, ordem ou inferencia simples", "why": "memoria de trabalho e atencao entram na tarefa"},
        "N4": {"max_words": 45, "what": "frase longa com dois ou tres fatos encadeados, ou relato de 2 a 3 frases", "why": "teto mais alto; e o que a conversa real exige"},
    }
    ladder = [
        {"weeks": [1, 2], "tiers": ["N1", "N2"], "focus": "confianca e rotina; nunca comecar pelo dificil"},
        {"weeks": [3, 4], "tiers": ["N2", "N3"], "focus": "primeiro aumento real de extensao"},
        {"weeks": [5, 6], "tiers": ["N3"], "focus": "frases longas do dia a dia, ainda sem relato"},
        {"weeks": [7, 8], "tiers": ["N3", "N4"], "focus": "relato curto, com pergunta de sentido"},
    ]
    return {
        "principle": (
            "keep the simple sentences and add realistic ones; difficulty grows along a "
            "graded ladder in training, while the scored test stays fixed so the ruler "
            "does not move between measurements"
        ),
        "material": {
            "practice_items": 4,
            "test_forms": {"A": 12, "B": 12, "C": 12},
            "training_items": 41,
            "real_life_items": 8,
            "tiers": tiers,
            "item_fields": ["id", "split", "tier", "kind", "domain", "text", "q", "options"],
            "kinds": ["literal", "negative", "order", "infer", "action"],
            "kept_simple": "the original short sentences are unchanged and remain the first rung of the ladder",
            "test_forms_untouched": "forms A, B and C were not edited; the C form is longer than A, and the report states the form used at each timepoint",
        },
        "training_ladder": ladder,
        "plan": (
            "each training session draws 8 items from the tiers of the current week "
            "(plus 1 practice warm-up); the real-life block uses fixed long passages"
        ),
        "refs": _refs("ecosin_2020", "syntactic_complexity_aging", "humes_specificity_2014", "transfer_limits_2020"),
    }


def _measurement_plan(profile: Profile) -> dict[str, Any]:
    """What is measured, how, and what the number does not mean.

    The hierarchy is deliberate: a validated self-report questionnaire is the
    primary functional outcome; the home speech test is a task measure; the
    untrained-form probe is exploratory; gap detection is task-specific.
    """
    return {
        "primary_outcome": "hhie_s",
        "outcome_hierarchy": [
            {
                "level": "functional",
                "measure": "HHIE-S (0-40)",
                "role": "primary",
                "statement": "self-perceived hearing handicap; a validated screening questionnaire, not an audiogram",
                "refs": _refs("hhie_s_screening", "hhie_s_administration"),
            },
            {
                "level": "task",
                "measure": "closed-set speech-in-noise threshold (relative dB)",
                "role": "secondary",
                "statement": "on-task performance; not QuickSIN and not a calibrated audiogram",
                "refs": _refs("quicksin_measure_2004", "humes_specificity_2014"),
            },
            {
                "level": "ecological",
                "measure": "compreensao de vida real: 4 frases longas fixas, % de acerto",
                "role": "exploratory",
                "statement": (
                    "fixed (not adaptive) realistic sentences scored as percent correct; "
                    "it exercises hearing, memory and attention together, so a change is "
                    "not a measurement of hearing alone and not proof of real-world benefit"
                ),
                "refs": _refs("ecosin_2020", "syntactic_complexity_aging"),
            },
            {
                "level": "transfer",
                "measure": "untrained sentence forms in noise",
                "role": "exploratory",
                "statement": "transfer is limited and uncertain; a change on a new form is not proof of real-world benefit",
                "refs": _refs("transfer_limits_2020"),
            },
            {
                "level": "temporal",
                "measure": "gap-detection threshold (ms)",
                "role": "task-specific",
                "statement": "training improves the trained gap task; transfer to speech is not established",
                "refs": _refs("gap_training_2013"),
            },
        ],
        "schedule": [
            {
                "timepoint": "baseline",
                "week": 0,
                "tests": ["hhie_s", "speech_in_noise", "real_life_comprehension", "gap_detection"],
                "note": "record before training; 2 practice trials per test are not scored; keep the device volume fixed",
                "refs": _refs("hhie_s_administration", "quicksin_measure_2004"),
            },
            {
                "timepoint": "week_4",
                "week": 4,
                "tests": ["hhie_s", "speech_in_noise", "real_life_comprehension", "gap_detection", "transfer_form"],
                "note": "use an untrained speech form and the same device volume",
                "refs": _refs("humes_dosage_2014", "transfer_limits_2020"),
            },
            {
                "timepoint": "week_8",
                "week": 8,
                "tests": ["hhie_s", "speech_in_noise", "real_life_comprehension", "gap_detection", "transfer_form"],
                "note": "use the third untrained form and the first real-life set again; forms are not formally equated",
                "refs": _refs("hhie_s_administration", "transfer_limits_2020"),
            },
            {
                "timepoint": "retention_30d",
                "week": 12,
                "tests": ["hhie_s", "speech_in_noise", "real_life_comprehension"],
                "note": "about 30 days after the final assessment; repeat the baseline form and the second real-life set for comparability",
                "refs": _refs("humes_dosage_2014", "transfer_limits_2020"),
            },
        ],
        "real_life_comprehension": {
            "method": (
                "4 fixed long everyday passages read once at a fixed noise level, each "
                "followed by one 4-alternative question about meaning, order or what the "
                "person has to do"
            ),
            "design": "fixed and non-adaptive, so it never enters the speech staircase and cannot change the SNR estimate",
            "items_per_test": 4,
            "snr_db_relative": 8,
            "scored": "percent correct (0-100); there is no threshold estimate",
            "sets": {
                "1": "baseline and week 8",
                "2": "week 4 and the 30-day retention",
            },
            "progression": (
                "the long passages also appear in training, in a graded ladder N1 (short, "
                "predictable) to N4 (a full short story); the graded ladder is what lets the "
                "ceiling move, the test measures whether it did"
            ),
            "not_valid_as": ["speech-in-noise threshold", "auditory-only measure", "proof of daily-life transfer"],
            "limits": [
                "comprehension combines hearing, memory and attention; a low score is not a hearing threshold",
                "only 4 items per test, so one item is 25 percentage points",
                "the two sets are not equated; a change between baseline and a later test that uses the other set also reflects item difficulty",
                "high scores can mean ceiling, not real-world ability",
            ],
            "refs": _refs("ecosin_2020", "real_world_sentences_2022", "ecological_validity_tradeoff_2025", "syntactic_complexity_aging"),
        },
        "speech_in_noise": {
            "method": "closed-set 4-alternative adaptive staircase (2-down/1-up)",
            "why_2down_1up": (
                "with four alternatives, chance is 25%; a 2-down/1-up rule targets "
                "about 71% correct, which is above chance"
            ),
            "practice_trials": SPEECH_TEST["practice_trials"],
            "scored_trials": SPEECH_TEST["scored_trials"],
            "start_snr_db": SPEECH_TEST["start_snr_db"],
            "step_db": SPEECH_TEST["step_db"],
            "range_db": [SPEECH_TEST["min_snr_db"], SPEECH_TEST["max_snr_db"]],
            "estimate": "mean of the last 4 reversals",
            "uncertainty": "half-range of those reversals; a spread indicator, not a 95% CI",
            "report": ["threshold_db_relative", "range_db", "n_reversals", "censored"],
            "not_valid_as": ["QuickSIN score", "audiogram", "SNR loss in dB HL"],
            "refs": _refs("quicksin_measure_2004", "humes_specificity_2014"),
        },
        "gap_detection": {
            "method": "2-alternative forced choice: a fixed-duration band-pass noise burst with or without a silent gap",
            "why_not_one_vs_two_tones": (
                "a one-tone versus two-tone task lets duration cues solve the trial; "
                "a fixed-duration burst removes that cue"
            ),
            "practice_trials": GAP_TEST["practice_trials"],
            "scored_trials": GAP_TEST["scored_trials"],
            "catch_probability": GAP_TEST["catch_probability"],
            "start_gap_ms": GAP_TEST["start_gap_ms"],
            "range_ms": [GAP_TEST["min_gap_ms"], GAP_TEST["max_gap_ms"]],
            "step_rule": "10 ms above 20 ms, 5 ms from 10-20 ms, 2 ms below 10 ms",
            "estimate": "geometric mean of the last 4 reversals",
            "uncertainty": "smallest and largest reversal; a spread indicator, not a 95% CI",
            "report": ["threshold_ms", "low_ms", "high_ms", "n_reversals", "censored", "false_positive_rate"],
            "refs": _refs("gap_training_2013", "transfer_limits_2020"),
        },
        "hhie_s": {
            "items": 10,
            "scoring": {"yes": 4, "sometimes": 2, "no": 0},
            "range": [0, 40],
            "bands": [
                {"max": 8, "label": "no_perceived_handicap"},
                {"max": 24, "label": "mild_to_moderate"},
                {"max": 40, "label": "significant"},
            ],
            "referral": ">=10",
            "note": "self-report; it measures perceived handicap, not hearing sensitivity; the pt-BR adaptation exists and band boundaries vary slightly by source",
            "refs": _refs("hhie_s_screening", "hhie_s_administration", "hhie_s_pt_br"),
        },
        "rules": [
            "keep the device volume fixed during a test; changing it invalidates the comparison",
            "2 practice trials per test are not scored",
            "do not give correctness feedback during a test; give feedback during training",
            "use one form per timepoint; the forms are not formally equated",
            "report the range with every threshold",
            "if the voice is blocked, stop the assessment; do not substitute a different voice mid-test",
            "a change smaller than the reported range is not interpretable",
        ],
        "limits": [
            "no control group; individual change can be measurement noise or practice",
            "dB is relative and uncalibrated; it is not comparable to audiometry",
            "the synthetic voice is more uniform and usually easier than human speech",
            "closed-set alternatives make the task easier than open-set QuickSIN",
            "test forms are not equated",
            "not a medical device; no diagnosis or prescription",
            "transfer is possible, not guaranteed",
        ],
        "refs": _refs(
            "hhie_s_screening",
            "hhie_s_administration",
            "hhie_s_pt_br",
            "quicksin_measure_2004",
            "humes_specificity_2014",
            "gap_training_2013",
            "transfer_limits_2020",
            "ecosin_2020",
            "real_world_sentences_2022",
            "ecological_validity_tradeoff_2025",
            "syntactic_complexity_aging",
        ),
    }


def _training_plan(profile: Profile, dosage: dict[str, Any]) -> dict[str, Any]:
    """Week-by-week home training configuration.

    The app uses these values as defaults. The participant can override the
    noise type and level; every override is logged so the analysis can see it.
    """
    days = dosage["days_per_week"]
    minutes = dosage["minutes_per_session"]
    base_refs = _refs("humes_dosage_2014", "act_gamified_2025", "auditory_training_sin_meta")

    def week(
        number: int,
        sessions: int,
        snr: float,
        rate: float,
        noise: str,
        level: int,
        focus: str,
        assessment: bool = False,
        extra_refs: tuple[str, ...] = (),
        gap_trials: int = 0,
    ) -> dict[str, Any]:
        return {
            "week": number,
            "sessions_planned": sessions,
            "minutes": minutes,
            "core_trials": 8,
            "snr_start_db": snr,
            "snr_step_db": 2.0,
            "rate": rate,
            "noise": noise,
            "noise_level": level,
            "competing_voices": noise in {"tv", "restaurante"},
            "assessment_week": assessment,
            "gap_trials": gap_trials,
            "focus": focus,
            "refs": sorted(set(base_refs + list(extra_refs))),
        }

    weeks = [
        week(1, 1, 8.0, 0.90, "rosa", 1, "familiarisation after the baseline (not scored)", False),
        week(2, days, 8.0, 0.90, "rosa", 1, "establish the routine; end on a correct item", False),
        week(3, days, 6.0, 0.90, "casa", 1, "add household noise; keep speech slower", False),
        week(4, days, 4.0, 0.95, "tv", 2, "add babble of voices; interim assessment", True, ("hhie_s_administration", "transfer_limits_2020")),
        week(5, days, 4.0, 0.95, "restaurante", 2, "gap detection and restaurant noise", False, ("gap_training_2013",), 4),
        week(6, days, 2.0, 1.00, "tv", 2, "normal speech rate; transfer to TV content", False, ("transfer_limits_2020",)),
        week(7, days, 0.0, 1.00, "restaurante", 3, "hardest noise; group conversation practice", False),
        week(8, days, 0.0, 1.00, "restaurante", 3, "final assessment and maintenance plan", True, ("hhie_s_administration", "transfer_limits_2020")),
    ]

    return {
        "model": "one short session per training day; 2-3 days/week",
        "days_per_week": days,
        "minutes_per_session": minutes,
        "dose_cap_seconds": dosage["dose_cap_seconds"],
        "dose_source": "humes_dosage_2014",
        "dose_note": (
            "2x/week and 3x/week did not differ in the randomised dosage study; "
            "a daily arm was not tested. The 6-minute home session is shorter than "
            "the laboratory protocol, so equivalence is unknown."
        ),
        "session_structure": {
            "warm_up_items": 1,
            "core_items": 8,
            "closing_items": 1,
            "ending_rule": "the closing item must be one the participant gets right; try another easy item if needed",
        },
        "progression": [
            "after 3 consecutive correct responses, make the next item 2 dB harder",
            "after 2 consecutive errors, make the next item 2 dB easier",
            "never move the level more than 4 dB within one session",
        ],
        "fatigue_rule": "rate fatigue 0-5 after the session; if >=4, hold the level in the next session",
        "gap_training": {
            "trials_per_session": 4,
            "weeks": [5],
            "task": "the same fixed-duration burst discrimination used in the assessment, now with feedback",
            "rule": "2 correct -> smaller gap; 1 error -> larger gap; stop at the first fatigue sign",
            "claim": "improves the trained gap task; transfer to speech is not established",
            "refs": _refs("gap_training_2013", "transfer_limits_2020"),
        },
        "weeks": weeks,
        "limits": [
            "the 6-minute session is shorter than the laboratory protocols; equivalence is unknown",
            "the 10-minute daily cap is a tolerability guard, not an evidence-based optimum",
            "synthetic voice and babble are not a real talker or a real restaurant",
            "on-task accuracy is not a real-world outcome",
            "gap training is task-specific and is not a substitute for speech-in-noise training",
            "no control group; practice and fatigue can change scores",
        ],
        "refs": sorted(set(base_refs + ["humes_specificity_2014", "transfer_limits_2020", "hhie_s_administration"])),
    }


def _limits() -> dict[str, Any]:
    """Machine-readable limits for the export package."""
    return {
        "calibrated_db": False,
        "medical_device": False,
        "clinical_inference": False,
        "control_group": False,
        "transfer_guaranteed": False,
        "synthetic_speech": True,
        "notes": [
            "home task measures only; no diagnosis and no prescription",
            "relative dB is not dB HL and cannot be compared with audiometry",
            "on-task gain is not proof of real-world or physiological change",
            "individual change may be measurement noise, practice or fatigue",
            "the app is an experimental prototype, not a medical device",
        ],
        "refs": _refs("transfer_limits_2020", "achieve_2023", "presbycusis_irreversible"),
    }


def _assert_refs_resolve(payload: Any) -> None:
    """Fail loudly if any recommendation cites an unknown evidence key."""
    if isinstance(payload, dict):
        for key, value in payload.items():
            if key == "refs":
                for ref in value:
                    if ref not in EVIDENCE:
                        raise KeyError(f"unresolved evidence reference: {ref}")
            else:
                _assert_refs_resolve(value)
    elif isinstance(payload, list):
        for item in payload:
            _assert_refs_resolve(item)


def build_protocol(profile: Profile) -> dict[str, Any]:
    """Build the full, auditable protocol for a validated profile."""
    dosage = _dosage(profile)
    agents = [
        _signal_chain(profile),
        dosage,
        _transfer(profile),
        _partner(profile),
        _safety(profile),
    ]

    references = sorted({key for agent in agents for key in agent.get("refs", [])})
    plan = _plan_weeks(profile, dosage)
    for week in plan:
        references.extend(week.get("refs", []))
    followup = _followup_schedule(profile)
    for step in followup:
        references.extend(step.get("refs", []))
    measurement = _measurement_plan(profile)
    references.extend(measurement.get("refs", []))
    content = _content_plan()
    references.extend(content.get("refs", []))
    training = _training_plan(profile, dosage)
    references.extend(training.get("refs", []))
    for week in training.get("weeks", []):
        references.extend(week.get("refs", []))
    limits = _limits()
    references.extend(limits.get("refs", []))
    references = sorted(set(references))

    protocol = {
        "profile_summary": {
            "hearing_aid": profile.hearing_aid,
            "streaming": profile.hearing_aid_streaming,
            "living": profile.living,
            "complaints": profile.top_complaints,
            "favourite_program": profile.favourite_program,
            "favourite_time": profile.favourite_time,
        },
        "agents": agents,
        "plan": plan,
        "followup": followup,
        "measurement": measurement,
        "content": content,
        "training": training,
        "limits": limits,
        "progress_markers": _progress_markers(),
        "references": references,
        "evidence": {key: EVIDENCE[key] for key in references},
    }
    _assert_refs_resolve(protocol)
    return protocol


def calibration_questions() -> list[dict[str, Any]]:
    """The questions the profile needs before the plan can be personalised."""
    return [
        {"id": "hearing_aid", "question": "Marca e modelo dos aparelhos auditivos?", "type": "text"},
        {"id": "hearing_aid_streaming", "question": "Os aparelhos ja transmitem audio da TV (Bluetooth, adaptador ou microfone remoto)?", "type": "choice", "options": ["none", "bluetooth", "tv_adapter", "remote_mic", "unknown"]},
        {"id": "tv_setup", "question": "Como e a TV da casa?", "type": "choice", "options": ["smart_tv", "cable_box", "old_tv", "streaming_stick", "unknown"]},
        {"id": "tv_can_configure", "question": "Alguem consegue configurar a TV hoje?", "type": "bool"},
        {"id": "favourite_program", "question": "Qual o programa favorito dele?", "type": "text"},
        {"id": "favourite_time", "question": "Em que horario ele costuma assistir?", "type": "text"},
        {"id": "living", "question": "Ele mora sozinho, com a familia ou em instituicao?", "type": "choice", "options": ["alone", "with_family", "care_facility"]},
        {"id": "caregiver_hours_per_day", "question": "Quantas horas por dia ha um cuidador por perto?", "type": "number"},
        {"id": "top_complaints", "question": "Quais as principais queixas, em ordem?", "type": "multi", "options": ["tv", "noise", "group", "phone", "quick_speech", "female_voice", "fatigue"]},
        {"id": "medications_ototoxic", "question": "Ele usa medicamentos que podem afetar a audicao ou o equilibrio?", "type": "bool"},
        {"id": "walk_minutes_per_day", "question": "Quantos minutos ele caminha por dia, em media?", "type": "number"},
        {"id": "uses_captions", "question": "Ele costuma usar legenda na TV?", "type": "bool"},
        {"id": "tinnitus", "question": "Ele tem zumbido?", "type": "bool"},
        {"id": "falls_last_year", "question": "Quantas quedas no ultimo ano?", "type": "number"},
        {"id": "cognitive_impairment", "question": "Existe diagnostico de declinio cognitivo?", "type": "bool"},
    ]
