import pytest

from swarm.engine import build_protocol, classify_snr_loss, calibration_questions
from swarm.evidence import EVIDENCE
from swarm.schema import Profile, ProfileError

BASE = {
    "hearing_aid": "Phonak Audeo",
    "hearing_aid_streaming": "none",
    "tv_setup": "smart_tv",
    "tv_can_configure": True,
    "favourite_program": "novela das nove",
    "favourite_time": "21h",
    "living": "with_family",
    "caregiver_hours_per_day": 4,
    "top_complaints": ["tv", "noise"],
    "medications_ototoxic": False,
    "walk_minutes_per_day": 20,
}


def profile(**overrides):
    data = dict(BASE)
    data.update(overrides)
    return Profile.from_dict(data)


def test_classify_snr_loss_bands():
    assert classify_snr_loss(0.0) == "normal_0_2db"
    assert classify_snr_loss(2.0) == "normal_0_2db"
    assert classify_snr_loss(6.3) == "mild_3_7db"
    assert classify_snr_loss(10.0) == "moderate_8_15db"
    assert classify_snr_loss(26.0) == "severe_gt_15db"


def test_missing_field_is_rejected():
    data = dict(BASE)
    del data["hearing_aid"]
    with pytest.raises(ProfileError, match="missing profile fields"):
        Profile.from_dict(data)


def test_invalid_enum_is_rejected():
    with pytest.raises(ProfileError):
        profile(hearing_aid_streaming="telepathy")
    with pytest.raises(ProfileError):
        profile(living="moon")


def test_unknown_complaint_is_rejected():
    with pytest.raises(ProfileError, match="unknown complaints"):
        profile(top_complaints=["tv", "aliens"])


def test_protocol_has_five_agents_and_eight_weeks():
    protocol = build_protocol(profile())
    assert [a["agent"] for a in protocol["agents"]] == [
        "A1_signal_chain",
        "A2_dosage",
        "A3_transfer",
        "A4_partner",
        "A5_safety",
    ]
    assert len(protocol["plan"]) == 8
    assert [w["week"] for w in protocol["plan"]] == list(range(1, 9))


def test_every_reference_resolves_to_evidence():
    protocol = build_protocol(profile())
    assert protocol["references"]
    for key in protocol["references"]:
        assert key in EVIDENCE
        assert EVIDENCE[key]["url"].startswith("http")


def test_no_streaming_triggers_tv_streaming_action():
    protocol = build_protocol(profile(hearing_aid_streaming="none"))
    actions = {a["action"] for a in protocol["agents"][0]["actions"]}
    assert "enable_tv_audio_streaming" in actions


def test_existing_bluetooth_does_not_retrigger_install():
    protocol = build_protocol(profile(hearing_aid_streaming="bluetooth"))
    actions = {a["action"] for a in protocol["agents"][0]["actions"]}
    assert "enable_tv_audio_streaming" not in actions


def test_noise_complaint_adds_remote_microphone():
    protocol = build_protocol(profile(top_complaints=["noise"]))
    actions = {a["action"] for a in protocol["agents"][0]["actions"]}
    assert "introduce_remote_microphone" in actions


def test_cognitive_impairment_reduces_dose():
    normal = build_protocol(profile())["agents"][1]
    mild = build_protocol(profile(cognitive_impairment=True))["agents"][1]
    assert mild["micro_sessions_per_day"] < normal["micro_sessions_per_day"]
    assert mild["minutes_per_session"] < normal["minutes_per_session"]


def test_living_alone_changes_partner_mode():
    protocol = build_protocol(profile(living="alone"))
    partner = protocol["agents"][3]
    assert partner["mode"] == "self_and_remote"


def test_safety_flags_track_risk_fields():
    protocol = build_protocol(
        profile(tinnitus=True, falls_last_year=2, medications_ototoxic=True)
    )
    flags = {f["flag"] for f in protocol["agents"][4]["flags"]}
    assert flags == {"tinnitus", "falls", "ototoxic_medication"}


def test_ototoxic_adds_medication_review_action():
    protocol = build_protocol(profile(medications_ototoxic=True))
    actions = {a["action"] for a in protocol["agents"][0]["actions"]}
    assert "medication_review" in actions


def test_calibration_questions_cover_profile_fields():
    ids = {q["id"] for q in calibration_questions()}
    assert {"hearing_aid", "top_complaints", "living"} <= ids


def test_followup_schedule_has_three_checkpoints():
    protocol = build_protocol(profile())
    followup = protocol["followup"]
    assert [s["week"] for s in followup] == [1, 4, 8]
    assert [s["checkpoint"] for s in followup] == ["baseline", "interim", "final"]


def test_followup_steps_are_actionable_and_referenced():
    protocol = build_protocol(profile())
    for step in protocol["followup"]:
        assert step["measures"], "every checkpoint must list what to measure"
        assert step["target"], "every checkpoint must state a target"
        assert step["action_if_not_met"], "every checkpoint must state the fallback"
        for ref in step["refs"]:
            assert ref in EVIDENCE


def test_followup_references_are_merged_into_protocol_references():
    protocol = build_protocol(profile())
    followup_refs = {r for step in protocol["followup"] for r in step["refs"]}
    assert followup_refs <= set(protocol["references"])


def test_followup_week8_target_mentions_measurable_gain():
    protocol = build_protocol(profile())
    final = protocol["followup"][-1]
    assert "2-3 dB" in final["target"]


def test_progress_markers_cover_day1_to_week8():
    protocol = build_protocol(profile())
    whens = [m["when"] for m in protocol["progress_markers"]]
    assert whens[0] == "day 1"
    assert "week 8" in whens
