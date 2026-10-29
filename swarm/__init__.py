"""Deterministic hearing-rehabilitation swarm."""

from .engine import build_protocol, calibration_questions, classify_snr_loss
from .evidence import EVIDENCE
from .measurement import (
    GAP_TEST,
    SPEECH_TEST,
    estimate_gap_threshold,
    estimate_snr_threshold,
    hhie_band,
    hhie_total,
)
from .schema import Profile, ProfileError

__all__ = [
    "EVIDENCE",
    "GAP_TEST",
    "SPEECH_TEST",
    "Profile",
    "ProfileError",
    "build_protocol",
    "calibration_questions",
    "classify_snr_loss",
    "estimate_gap_threshold",
    "estimate_snr_threshold",
    "hhie_band",
    "hhie_total",
]
