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
    assert js["references"] == py["references"]
