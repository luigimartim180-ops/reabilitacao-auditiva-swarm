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
    assert mild["micro_sessions_per_day"] == normal["micro_sessions_per_day"] == 1
    assert mild["days_per_week"] < normal["days_per_week"]
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


def test_followup_schedule_has_four_checkpoints():
    protocol = build_protocol(profile())
    followup = protocol["followup"]
    assert [s["week"] for s in followup] == [1, 4, 8, 12]
    assert [s["checkpoint"] for s in followup] == [
        "baseline",
        "interim",
        "final",
        "retention",
    ]


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
    final = next(step for step in protocol["followup"] if step["week"] == 8)
    assert "2-3 dB" in final["target"]
    assert "calibrated" in final["target"]


def test_progress_markers_cover_day1_to_week8():
    protocol = build_protocol(profile())
    whens = [m["when"] for m in protocol["progress_markers"]]
    assert whens[0] == "day 1"
    assert "week 8" in whens


def test_measurement_uses_hhie_s_as_primary_outcome():
    protocol = build_protocol(profile())
    measurement = protocol["measurement"]
    assert measurement["primary_outcome"] == "hhie_s"
    levels = [row["level"] for row in measurement["outcome_hierarchy"]]
    assert levels == ["functional", "task", "ecological", "transfer", "temporal"]
    assert measurement["hhie_s"]["items"] == 10
    assert measurement["hhie_s"]["referral"] == ">=10"


def test_home_speech_test_is_not_called_quicksin():
    measurement = build_protocol(profile())["measurement"]
    speech = measurement["speech_in_noise"]
    assert "QuickSIN score" in speech["not_valid_as"]
    assert "audiogram" in speech["not_valid_as"]
    assert speech["practice_trials"] == 2
    assert speech["scored_trials"] == 12


def test_gap_test_is_task_specific_not_a_transfer_promise():
    measurement = build_protocol(profile())["measurement"]
    gap = measurement["gap_detection"]
    assert gap["catch_probability"] == 0.3
    temporal = next(
        row for row in measurement["outcome_hierarchy"] if row["level"] == "temporal"
    )
    assert "not established" in temporal["statement"]


def test_transfer_is_explicitly_exploratory():
    measurement = build_protocol(profile())["measurement"]
    transfer = next(
        row for row in measurement["outcome_hierarchy"] if row["level"] == "transfer"
    )
    assert transfer["role"] == "exploratory"
    assert "not proof" in transfer["statement"]


def test_training_dose_matches_the_tested_schedule():
    dosage = build_protocol(profile())["agents"][1]
    assert dosage["days_per_week"] in {2, 3}
    assert dosage["dose_cap_seconds"] == 600
    assert "daily arm was not tested" in dosage["dose_rationale"]
    assert any("tolerability guard" in gap for gap in dosage["evidence_gaps"])


def test_training_plan_has_eight_weeks_and_two_assessment_weeks():
    training = build_protocol(profile())["training"]
    assert [w["week"] for w in training["weeks"]] == list(range(1, 9))
    assessments = [w["week"] for w in training["weeks"] if w["assessment_week"]]
    assert assessments == [4, 8]
    assert training["session_structure"]["core_items"] == 8


def test_limits_block_declares_not_a_medical_device():
    limits = build_protocol(profile())["limits"]
    assert limits["calibrated_db"] is False
    assert limits["medical_device"] is False
    assert limits["clinical_inference"] is False
    assert limits["transfer_guaranteed"] is False
    assert any("not a medical device" in note for note in limits["notes"])


def test_safety_includes_stop_signs_and_streaming_precaution():
    safety = build_protocol(profile())["agents"][4]
    assert len(safety["training_stop_signs"]) >= 4
    assert any("stairs" in p for p in safety["precautions"])
    assert "ACHIEVE" in safety["cognition_note"]
    assert "achieve_2023" in safety["refs"]
    assert "streaming_environment_awareness" in safety["refs"]


def test_week8_does_not_recommend_daily_twenty_minutes():
    protocol = build_protocol(profile())
    week8 = protocol["plan"][-1]["actions"]
    assert not any("20 min/day" in action for action in week8)
    assert any("2-3 listening sessions/week" in action for action in week8)


def test_no_claim_promises_restoration_or_cure():
    protocol = build_protocol(profile())
    text = " ".join(
        [
            protocol["agents"][4]["ceiling"],
            *protocol["limits"]["notes"],
            *protocol["measurement"]["limits"],
        ]
    ).lower()
    assert "not restoration" in text or "not a medical device" in text
    assert "cure" not in text


def test_gap_training_is_limited_to_one_week_and_stays_task_specific():
    training = build_protocol(profile())["training"]
    gap_weeks = [w["week"] for w in training["weeks"] if w["gap_trials"]]
    assert gap_weeks == [5]
    assert training["gap_training"]["trials_per_session"] == 4
    assert "transfer to speech is not established" in training["gap_training"]["claim"]
    assert any("not a substitute" in note for note in training["limits"])


def test_hhie_s_cites_the_brazilian_adaptation():
    measurement = build_protocol(profile())["measurement"]
    assert "hhie_s_pt_br" in EVIDENCE
    assert "hhie_s_pt_br" in measurement["hhie_s"]["refs"]
    assert "band boundaries vary" in measurement["hhie_s"]["note"]


def test_weekly_battery_separates_function_from_task():
    measurement = build_protocol(profile())["measurement"]
    roles = {row["level"]: row["role"] for row in measurement["outcome_hierarchy"]}
    assert roles == {
        "functional": "primary",
        "task": "secondary",
        "ecological": "exploratory",
        "transfer": "exploratory",
        "temporal": "task-specific",
    }


def test_real_life_block_is_optional_and_exploratory():
    measurement = build_protocol(profile())["measurement"]
    block = measurement["real_life_comprehension"]
    assert block["items_per_test"] == 4
    assert block["snr_db_relative"] == 8
    assert "non-adaptive" in block["design"]
    assert "percent correct" in block["scored"]
    assert "proof of daily-life transfer" in block["not_valid_as"]
    assert set(block["sets"]) == {"1", "2"}
    levels = {row["timepoint"]: row["tests"] for row in measurement["schedule"]}
    for timepoint in ("baseline", "week_4", "week_8", "retention_30d"):
        assert "real_life_comprehension" in levels[timepoint], timepoint


def test_real_life_block_says_what_it_does_not_measure():
    block = build_protocol(profile())["measurement"]["real_life_comprehension"]
    limits = " ".join(block["limits"])
    assert "not a hearing threshold" in limits
    assert "25 percentage points" in limits
    assert "not equated" in limits


def test_content_ladder_keeps_simple_items_and_adds_a_higher_ceiling():
    content = build_protocol(profile())["content"]
    ladder = content["training_ladder"]
    covered = [week for row in ladder for week in row["weeks"]]
    assert covered == list(range(1, 9))
    assert "N1" in ladder[0]["tiers"], "the easy end must stay in the plan"
    assert "N4" in ladder[-1]["tiers"], "the plan must reach realistic passages"
    tiers = content["material"]["tiers"]
    lengths = [tiers[name]["max_words"] for name in ("N1", "N2", "N3", "N4")]
    assert lengths == sorted(lengths), "the ladder must grow, not move randomly"
    assert content["material"]["test_forms_untouched"]


def test_content_counts_match_the_item_bank_in_the_app():
    import re as _re
    from pathlib import Path as _Path

    source = (_Path(__file__).resolve().parents[1] / "app" / "app.js").read_text(encoding="utf-8")
    start = source.index("const ITEMS = [")
    end = source.index("\n];", start)
    bank = source[start:end]
    content = build_protocol(profile())["content"]["material"]
    counts = {split: bank.count('split: "%s"' % split) for split in ("practice", "A", "B", "C", "train", "R")}
    assert counts["practice"] == content["practice_items"], counts
    assert counts["train"] == content["training_items"], counts
    assert counts["R"] == content["real_life_items"], counts
    assert counts["A"] == content["test_forms"]["A"], counts
    assert counts["B"] == content["test_forms"]["B"], counts
    assert counts["C"] == content["test_forms"]["C"], counts
    assert _re.search(r'split: "R".*?set: "1"', bank), "real-life set 1 must exist"


def test_evidence_doc_lists_every_key():
    import re as _re
    from pathlib import Path as _Path

    doc = (_Path(__file__).resolve().parents[1] / "docs" / "EVIDENCE.md").read_text(encoding="utf-8")
    listed = set(_re.findall(r"`([a-z0-9_]+)`", doc))
    missing = sorted(set(EVIDENCE) - listed)
    assert not missing, f"evidence keys missing from docs/EVIDENCE.md: {missing}"
