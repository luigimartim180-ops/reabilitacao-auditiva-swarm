"""Parity test: the browser mirror must match the Python engine.

The app must be able to personalise offline, so app/protocol.js re-implements
the planner. This test renders the Python protocol to JSON and the JavaScript
protocol to JSON for the same profiles and asserts they are identical.
"""

from __future__ import annotations

import json
import shutil
import subprocess

import pytest

from swarm.engine import build_protocol
from swarm.schema import Profile

PROFILES = [
    {
        "hearing_aid": "Phonak Audeo",
        "hearing_aid_streaming": "none",
        "tv_setup": "smart_tv",
        "tv_can_configure": True,
        "favourite_program": "novela",
        "favourite_time": "21h",
        "living": "with_family",
        "caregiver_hours_per_day": 4,
        "top_complaints": ["tv", "noise"],
        "medications_ototoxic": False,
        "walk_minutes_per_day": 20,
    },
    {
        "hearing_aid": "Oticon",
        "hearing_aid_streaming": "bluetooth",
        "tv_setup": "cable_box",
        "tv_can_configure": False,
        "favourite_program": "jornal",
        "favourite_time": "20h",
        "living": "alone",
        "caregiver_hours_per_day": 1,
        "top_complaints": ["group", "phone", "fatigue"],
        "medications_ototoxic": True,
        "walk_minutes_per_day": 0,
        "tinnitus": True,
        "falls_last_year": 2,
        "cognitive_impairment": True,
        "uses_captions": True,
    },
]


def _js_protocol(profile: dict) -> dict:
    script = (
        "const {buildProtocol}=require('./app/protocol.js');"
        "const p=" + json.dumps(profile) + ";"
        "process.stdout.write(JSON.stringify(buildProtocol(p)));"
    )
    out = subprocess.run(
        ["node", "-e", script],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(out.stdout)


def _py_protocol(profile: dict) -> dict:
    return build_protocol(Profile.from_dict(profile))


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
@pytest.mark.parametrize("profile", PROFILES)
def test_js_mirror_matches_python_engine(profile):
    py = _py_protocol(profile)
    js = _js_protocol(profile)
    assert js["agents"] == py["agents"]
    assert js["plan"] == py["plan"]
    assert js["followup"] == py["followup"]
    assert js["measurement"] == py["measurement"]
    assert js["training"] == py["training"]
    assert js["limits"] == py["limits"]
    assert js["progress_markers"] == py["progress_markers"]
    assert js["references"] == py["references"]


# --- measurement parity ---------------------------------------------------

from swarm.measurement import (  # noqa: E402
    GAP_TEST,
    SPEECH_TEST,
    estimate_gap_threshold,
    estimate_snr_threshold,
    gap_staircase_step,
    hhie_band,
    hhie_referral,
    hhie_total,
    speech_staircase_step,
)


def _run_node(script: str) -> dict:
    out = subprocess.run(
        ["node", "-e", script],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(out.stdout)


def _equivalent(a, b) -> bool:
    if isinstance(a, float) or isinstance(b, float):
        return abs(float(a) - float(b)) <= 1e-9
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(_equivalent(a[k], b[k]) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(_equivalent(x, y) for x, y in zip(a, b))
    return a == b


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_js_measurement_constants_match_python():
    js = _run_node(
        "const {SPEECH_TEST,GAP_TEST}=require('./app/protocol.js');"
        "process.stdout.write(JSON.stringify({SPEECH_TEST,GAP_TEST}));"
    )
    assert js["SPEECH_TEST"] == SPEECH_TEST
    assert js["GAP_TEST"] == GAP_TEST


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_js_measurement_math_matches_python():
    speech_cases = [
        [8.0, True, 0],
        [8.0, True, 1],
        [8.0, False, 1],
        [16.0, False, 0],
        [-12.0, True, 1],
    ]
    gap_cases = [
        [40.0, True, 0],
        [40.0, True, 1],
        [40.0, False, 1],
        [20.0, True, 1],
        [10.0, True, 1],
        [2.0, True, 1],
        [100.0, False, 0],
    ]
    snr_cases = [
        [[8, 4, 0, -4, -8], []],
        [[], [8, 4, 0]],
        [[], []],
    ]
    gap_est_cases = [
        [[40, 20, 10, 5], []],
        [[], [40, 20]],
        [[], []],
    ]
    hhie_cases = [
        [0] * 10,
        [2] * 10,
        [4] * 10,
        [4, 2, 4, 2, 4, 2, 4, 2, 4, 2],
    ]
    payload = {
        "speech": speech_cases,
        "gap": gap_cases,
        "snr": snr_cases,
        "gapEst": gap_est_cases,
        "hhie": hhie_cases,
    }
    script = (
        "const {measure}=require('./app/protocol.js');"
        "const c=" + json.dumps(payload) + ";"
        "const out={"
        "speech:c.speech.map(x=>measure.speechStaircaseStep(x[0],x[1],x[2])),"
        "gap:c.gap.map(x=>measure.gapStaircaseStep(x[0],x[1],x[2])),"
        "snr:c.snr.map(x=>measure.estimateSnrThreshold(x[0],x[1])),"
        "gapEst:c.gapEst.map(x=>measure.estimateGapThreshold(x[0],x[1])),"
        "hhie:c.hhie.map(a=>{const t=measure.hhieTotal(a);return [t,measure.hhieBand(t),measure.hhieReferral(t)];})"
        "};"
        "process.stdout.write(JSON.stringify(out));"
    )
    js = _run_node(script)

    py = {
        "speech": [speech_staircase_step(*case) for case in speech_cases],
        "gap": [gap_staircase_step(*case) for case in gap_cases],
        "snr": [estimate_snr_threshold(*case) for case in snr_cases],
        "gapEst": [estimate_gap_threshold(*case) for case in gap_est_cases],
        "hhie": [
            [
                hhie_total(case),
                hhie_band(hhie_total(case)),
                hhie_referral(hhie_total(case)),
            ]
            for case in hhie_cases
        ],
    }
    assert _equivalent(js, py), json.dumps({"js": js, "py": py}, indent=2)
