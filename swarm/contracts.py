"""First-class contracts for the five agents.

A contract makes an agent auditable: what it consumes, which conditions fire it,
what it emits and when it must stop. The engine attaches the matching contract to
every agent payload, so a reviewer can see the trigger that produced each action.

``evidence_gaps`` records what the evidence base does *not* yet settle. Declaring
gaps is part of the contract: an agent that claims to know everything is lying.
"""

from __future__ import annotations

from typing import Any

AGENT_CONTRACTS: dict[str, dict[str, Any]] = {
    "A1_signal_chain": {
        "id": "A1_signal_chain",
        "name": "SignalChainAgent",
        "objective": "maximise signal-to-noise ratio and device configuration before any training",
        "rationale": "signal engineering is the fastest and largest lever (day-1 effect)",
        "inputs": [
            "hearing_aid",
            "hearing_aid_streaming",
            "tv_setup",
            "tv_can_configure",
            "top_complaints",
            "medications_ototoxic",
        ],
        "triggers": [
            {"id": "T1.1", "when": "hearing_aid_streaming == none", "fires": "enable_tv_audio_streaming"},
            {"id": "T1.2", "when": "hearing_aid_streaming == unknown", "fires": "verify_streaming_capability"},
            {"id": "T1.3", "when": "tv_can_configure == false", "fires": "arrange_configuration_help"},
            {"id": "T1.4", "when": "complaint in {noise, group}", "fires": "introduce_remote_microphone"},
            {"id": "T1.5", "when": "complaint == phone", "fires": "enable_phone_streaming"},
            {"id": "T1.6", "when": "medications_ototoxic == true", "fires": "medication_review"},
        ],
        "outputs": ["ordered action list with priority, expected_effect, effort, cost_band and refs"],
        "stop_criteria": "streaming path configured and verified on day 1; if not, refer to audiologist for accessory fitting",
        "evidence_gaps": [
            "no RCT compares TV streaming brands head-to-head",
            "remote-microphone benefit in the home is extrapolated from lab SNR studies",
        ],
    },
    "A2_dosage": {
        "id": "A2_dosage",
        "name": "DosageAgent",
        "objective": "reach the therapeutic window without inducing auditory fatigue",
        "rationale": "most dosage gain completes by 5-7.5 weeks; 2x and 3x/week did not differ; a daily arm was not tested",
        "inputs": ["cognitive_impairment", "falls_last_year", "top_complaints"],
        "triggers": [
            {"id": "T2.1", "when": "always", "fires": "base_schedule"},
            {"id": "T2.2", "when": "cognitive_impairment == true", "fires": "reduce_dose"},
            {"id": "T2.3", "when": "falls_last_year >= 1", "fires": "seated_training_and_supervised_walk"},
            {"id": "T2.4", "when": "complaint == fatigue", "fires": "front_load_fatigue_control"},
        ],
        "outputs": [
            "micro_sessions_per_day, minutes_per_session, days_per_week",
            "session_model, dose_rationale, dose_cap_seconds",
            "session_structure, progression, progression_note, fatigue_signs, stop_rules, adherence_target",
        ],
        "stop_criteria": "plateau at 5-7.5 weeks, or any fatigue sign -> stop the session immediately",
        "evidence_gaps": [
            "optimal dose for adults over 85 is not separately established",
            "the 6-minute home session is shorter than the laboratory protocol; equivalence is unknown",
            "the 10-minute daily cap is a tolerability guard, not an evidence-based dose",
        ],
    },
    "A3_transfer": {
        "id": "A3_transfer",
        "name": "TransferAgent",
        "objective": "move gains from exercises into TV, phone and real conversation",
        "rationale": "on-task gains do not transfer automatically; the environment must be staged",
        "inputs": ["favourite_program", "favourite_time", "uses_captions", "top_complaints"],
        "triggers": [
            {"id": "T3.1", "when": "always", "fires": "tv_ladder"},
            {"id": "T3.2", "when": "uses_captions == true", "fires": "caption_weaning_rule"},
            {"id": "T3.3", "when": "complaint == phone", "fires": "phone_ladder"},
            {"id": "T3.4", "when": "complaint in {group, noise}", "fires": "conversation_ladder"},
            {"id": "T3.5", "when": "always", "fires": "music_protocol"},
        ],
        "outputs": ["staged ladders with target accuracy per rung, music protocol, weekly generalisation check, transfer_note separating on-task from transfer"],
        "stop_criteria": "participant follows the favourite programme without captions for a full episode",
        "evidence_gaps": [
            "transfer to untrained talkers is smaller than on-task gain",
            "music dose in the home is extrapolated from lab and group protocols",
            "time compression above 1.0x is not established for home use",
        ],
    },
    "A4_partner": {
        "id": "A4_partner",
        "name": "PartnerAgent",
        "objective": "raise intelligibility by changing how others speak, not only how he listens",
        "rationale": "clear speech from a trained partner changes the signal at the source",
        "inputs": ["living", "caregiver_hours_per_day"],
        "triggers": [
            {"id": "T4.1", "when": "living == with_family", "fires": "household_partner_training"},
            {"id": "T4.2", "when": "living == alone", "fires": "remote_contact_training"},
            {"id": "T4.3", "when": "living == care_facility", "fires": "staff_briefing"},
            {"id": "T4.4", "when": "caregiver_hours_per_day < 2", "fires": "low_supervision_adaptation"},
        ],
        "outputs": ["mode, role_script, do/don't rules, 20-min training session, repair strategies, environment checklist"],
        "stop_criteria": "partner demonstrates the five clear-speech rules unaided in a real conversation",
        "evidence_gaps": [
            "clear-speech benefit is talker-dependent and measured mostly in lab tasks",
        ],
    },
    "A5_safety": {
        "id": "A5_safety",
        "name": "SafetyAgent",
        "objective": "never let a rehabilitation plan delay medical care",
        "rationale": "some symptoms require urgent assessment, not training",
        "inputs": ["falls_last_year", "tinnitus", "medications_ototoxic"],
        "triggers": [
            {"id": "T5.1", "when": "always", "fires": "red_flag_screen"},
            {"id": "T5.2", "when": "falls_last_year >= 1", "fires": "balance_referral"},
            {"id": "T5.3", "when": "tinnitus == true", "fires": "tinnitus_review"},
            {"id": "T5.4", "when": "medications_ototoxic == true", "fires": "medication_referral"},
        ],
        "outputs": ["red flags with urgency, referral targets, escalation thresholds, ceiling statement, contraindications, training stop signs, streaming precautions, cognition note"],
        "stop_criteria": "any red flag routes to medical assessment before training continues",
        "evidence_gaps": [
            "no validated digital screen for sudden sensorineural hearing loss in the home",
            "no trial evaluates stair walking during hearing-aid streaming; the precaution is conservative",
        ],
    },
}

REQUIRED_CONTRACT_KEYS = (
    "id",
    "name",
    "objective",
    "inputs",
    "triggers",
    "outputs",
    "stop_criteria",
    "evidence_gaps",
)


def contract_for(agent_id: str) -> dict[str, Any]:
    """Return the contract for ``agent_id`` or raise ``KeyError``."""
    return AGENT_CONTRACTS[agent_id]
