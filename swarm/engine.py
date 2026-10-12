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
from .schema import Profile

# --- reference constants ---------------------------------------------------

# QuickSIN-like SNR loss bands in dB. Source: quicksin_norms.
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
    """A2: training dose. 2-3 sessions/week, most gain by 5-7.5 weeks."""
    sessions = DEFAULT_MICRO_SESSIONS_PER_DAY
    minutes = DEFAULT_MINUTES_PER_SESSION
    notes: list[str] = []

    if profile.cognitive_impairment:
        sessions = 2
        minutes = 5
        notes.append("shorter, more frequent sessions; stop at the first sign of fatigue")

    if profile.falls_last_year >= 1:
        notes.append("sit during training; keep the walk inside and supervised")

    if "fatigue" in profile.top_complaints:
        notes.append("front-load fatigue control: one extra rest before the last micro-session")

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
        "micro_sessions_per_day": sessions,
        "minutes_per_session": minutes,
        "days_per_week": 3,
        "expected_plateau_weeks": "5-7.5",
        "session_structure": [
            "warm-up: one easy item the participant already gets right",
            "core: adaptive speech-in-noise at the current level",
            "close: one guaranteed correct item (ends on success)",
        ],
        "progression": [
            "raise difficulty after 3 consecutive correct responses without hesitation",
            "hold the level if two consecutive errors occur",
            "never advance two levels in one day",
        ],
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
        "evidence_gaps": AGENT_CONTRACTS["A2_dosage"]["evidence_gaps"],
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
        "music": {
            "minutes_per_session": MUSIC_DOSE_MIN_PER_SESSION,
            "sessions_per_week": MUSIC_SESSIONS_PER_WEEK,
            "detail": "music from the participant's era, singing along where possible",
            "refs": _refs("music_mci_2024", "choir_rct_2025", "zendel_music_2019"),
        },
        "active_ingredients": [
            "adaptive speech-in-noise",
            "time-compressed speech (0.85x -> 1.0x)",
            "competing talker",
            "gap detection (temporal resolution)",
            "auditory working memory",
        ],
        "stop_criteria": AGENT_CONTRACTS["A3_transfer"]["stop_criteria"],
        "evidence_gaps": AGENT_CONTRACTS["A3_transfer"]["evidence_gaps"],
        "refs": _refs(
            "act_gamified_2025",
            "auditory_training_sin_meta",
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
        "flags": flags,
        "ceiling": (
            "Cochlear hair-cell loss is permanent. The plan targets central "
            "processing, attention, strategy and signal quality, not restoration."
        ),
        "stop_criteria": AGENT_CONTRACTS["A5_safety"]["stop_criteria"],
        "evidence_gaps": AGENT_CONTRACTS["A5_safety"]["evidence_gaps"],
        "refs": _refs("presbycusis_irreversible", "ototoxic_meds"),
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
                "baseline QuickSIN-like SNR loss estimate and HHIE-S",
                "start music sessions and partner clear-speech training",
            ],
            "tv_content": tv[0],
            "refs": _refs("tv_streaming_2024", "hhie_s_screening", "clear_speech_partner_2016"),
        },
        {
            "week": 2,
            "focus": "establish the routine",
            "actions": [
                f"{micro} micro-sessions/day of {minutes} min, 3 days/week",
                "speech-in-noise at the easiest SNR",
                "end every session on a correct response",
            ],
            "tv_content": tv[0],
            "refs": _refs("humes_dosage_2014"),
        },
        {
            "week": 3,
            "focus": "add difficulty",
            "actions": [
                "speech compression 0.90x",
                "introduce the competing-talker task",
                "first mid-point check of the TV ladder",
            ],
            "tv_content": tv[1],
            "refs": _refs("act_gamified_2025"),
        },
        {
            "week": 4,
            "focus": "first re-test",
            "actions": [
                "repeat QuickSIN-like estimate and HHIE-S",
                "review adherence; if <80%, simplify rather than intensify",
            ],
            "tv_content": tv[1],
            "refs": _refs("hhie_s_screening", "zheng_rehab_meta_2024"),
        },
        {
            "week": 5,
            "focus": "temporal resolution",
            "actions": [
                "gap detection and time-compressed speech at 0.95x",
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
                "repeat QuickSIN-like estimate and HHIE-S",
                "set the long-term routine: music + 20 min/day of listening practice",
                "book a full audiometry review",
            ],
            "tv_content": tv[3],
            "refs": _refs("hhie_s_screening", "humes_dosage_2014", "music_mci_2024"),
        },
    ]


def _followup_schedule(profile: Profile) -> list[dict[str, Any]]:
    """Measurement and decision checkpoints.

    A rehabilitation plan that is never measured cannot be audited, so the
    schedule is part of the protocol: what to measure, when, the target and the
    decision to take when the target is missed.
    """
    return [
        {
            "week": 1,
            "checkpoint": "baseline",
            "measures": [
                "HHIE-S questionnaire (0-40)",
                "QuickSIN-like SNR loss estimate",
                "hearing-aid program and TV streaming verified",
            ],
            "target": "baseline recorded before training starts",
            "action_if_not_met": "complete the baseline before starting the daily routine",
            "refs": _refs("hhie_s_screening", "quicksin_norms", "tv_streaming_2024"),
        },
        {
            "week": 4,
            "checkpoint": "interim",
            "measures": [
                "adherence (sessions completed / sessions planned)",
                "HHIE-S questionnaire",
                "repeat QuickSIN-like SNR loss estimate",
            ],
            "target": "adherence >= 80% and no worsening of the HHIE-S score",
            "action_if_not_met": (
                "if adherence < 80%, simplify the routine instead of intensifying it; "
                "if there is no measurable progress, book a new audiometry and review the device"
            ),
            "refs": _refs("humes_dosage_2014", "hhie_s_screening", "zheng_rehab_meta_2024"),
        },
        {
            "week": 8,
            "checkpoint": "final",
            "measures": [
                "HHIE-S questionnaire",
                "QuickSIN-like SNR loss estimate",
                "full audiometry review",
            ],
            "target": "SNR loss reduced by >= 2-3 dB and HHIE-S improved",
            "action_if_not_met": (
                "no measurable gain after 8 weeks at >= 80% adherence -> full audiometry, "
                "device review and implant assessment"
            ),
            "refs": _refs("hhie_s_screening", "quicksin_norms", "zheng_rehab_meta_2024"),
        },
    ]


def _progress_markers() -> list[dict[str, str]]:
    return [
        {"when": "day 1", "marker": "TV volume lower and fewer requests to repeat"},
        {"when": "weeks 2-3", "marker": "tolerates background noise without irritation"},
        {"when": "weeks 4-6", "marker": "follows a soap opera without captions"},
        {"when": "week 8", "marker": "SNR loss reduced by >=2-3 dB on re-test"},
    ]


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
