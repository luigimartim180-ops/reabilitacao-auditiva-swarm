"""Deterministic measurement maths shared by Python and the browser.

The home tests are *not* clinical instruments. These functions make the
arithmetic auditable; they do not turn a browser test into a calibrated
audiogram. Two rules matter:

* the speech test is a closed-set 4-alternative task and its threshold is a
  relative SNR, never a QuickSIN score;
* the gap test is a task-specific measure. Training improves the trained task
  (Kishon-Rabin 2013), but transfer to speech is not established.

The browser mirror lives in ``app/protocol.js`` under ``SwarmEngine.measure``
and ``tests/test_parity.py`` checks that both implementations agree.
"""

from __future__ import annotations

import math
from typing import Iterable, Sequence

# --- speech in noise -------------------------------------------------------

SPEECH_TEST = {
    "practice_trials": 2,
    "scored_trials": 12,
    "start_snr_db": 8.0,
    "step_db": 4.0,
    "min_snr_db": -12.0,
    "max_snr_db": 16.0,
    # 2-down / 1-up converges on ~70.9% correct, not on 50%. With four
    # alternatives, a 50% target would sit almost on top of chance (25%).
    "target_correct": 0.709,
    "reversals_used": 4,
}

# --- gap detection ---------------------------------------------------------

GAP_TEST = {
    "practice_trials": 2,
    "scored_trials": 12,
    "start_gap_ms": 40.0,
    "min_gap_ms": 2.0,
    "max_gap_ms": 100.0,
    "catch_probability": 0.3,
    "reversals_used": 4,
}

# --- HHIE-S ----------------------------------------------------------------

HHIE_ANSWERS = (0, 2, 4)  # No, Sometimes, Yes
HHIE_ITEMS = 10


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def hhie_total(answers: Sequence[int]) -> int:
    """Sum the ten HHIE-S items (No=0, Sometimes=2, Yes=4)."""
    if len(answers) != HHIE_ITEMS:
        raise ValueError(f"HHIE-S needs {HHIE_ITEMS} answers, got {len(answers)}")
    bad = [a for a in answers if a not in HHIE_ANSWERS]
    if bad:
        raise ValueError(f"HHIE-S answers must be one of {HHIE_ANSWERS}")
    return sum(answers)


def hhie_band(total: int) -> str:
    """Return the published HHIE-S screening band.

    The published bands are 0-8 (no perceived handicap), 10-24 (mild to
    moderate) and 26-40 (significant). Scores of 9 and 25 are boundary
    artefacts; they are assigned to the band above so that a referral is never
    delayed by a one-point rounding gap.
    """
    if total <= 8:
        return "no_perceived_handicap"
    if total <= 24:
        return "mild_to_moderate"
    return "significant"


def hhie_referral(total: int) -> bool:
    """HHIE-S >= 10 is the usual referral cut-off for older adults."""
    return total >= 10


# --- speech staircase ------------------------------------------------------


def speech_staircase_step(
    current_snr_db: float,
    correct: bool,
    correct_streak: int,
) -> dict[str, float | int | str | bool]:
    """Apply one 2-down / 1-up step.

    Correct responses do not move the level until two correct responses have
    accumulated. One incorrect response moves the level to easier. The return
    ``direction`` is -1 when difficulty increased, +1 when it decreased and 0
    when the level did not move.
    """
    streak = int(correct_streak)
    step = float(SPEECH_TEST["step_db"])
    lo = float(SPEECH_TEST["min_snr_db"])
    hi = float(SPEECH_TEST["max_snr_db"])
    hit_bound = False
    direction = 0

    if correct:
        streak += 1
        if streak >= 2:
            proposed = float(current_snr_db) - step
            new_snr = clamp(proposed, lo, hi)
            hit_bound = new_snr != proposed
            direction = 0 if hit_bound else -1
            streak = 0
        else:
            new_snr = float(current_snr_db)
    else:
        streak = 0
        proposed = float(current_snr_db) + step
        new_snr = clamp(proposed, lo, hi)
        hit_bound = new_snr != proposed
        direction = 0 if hit_bound else 1

    return {
        "snr_db": round(new_snr, 2),
        "correct_streak": streak,
        "direction": direction,
        "at_bound": hit_bound,
    }


def estimate_snr_threshold(
    reversals: Iterable[float],
    tested: Iterable[float] = (),
) -> dict[str, float | int | bool | None]:
    """Estimate the relative SNR threshold from staircase reversals.

    The point estimate is the mean of the last four reversals. ``range_db`` is
    half the distance between the largest and smallest reversal; it is a
    spread indicator, **not** a 95% confidence interval. When no reversal was
    observed, the threshold falls back to the mean of tested levels and is
    marked ``censored``.
    """
    rev = [float(v) for v in reversals]
    used = rev[-int(SPEECH_TEST["reversals_used"]):] if rev else []
    if used:
        point = sum(used) / len(used)
        spread = (max(used) - min(used)) / 2.0 if len(used) >= 2 else None
        return {
            "threshold_db": round(point, 1),
            "range_db": None if spread is None else round(spread, 1),
            "n_reversals": len(rev),
            "censored": False,
        }
    levels = [float(v) for v in tested]
    if not levels:
        return {
            "threshold_db": None,
            "range_db": None,
            "n_reversals": 0,
            "censored": True,
        }
    return {
        "threshold_db": round(sum(levels) / len(levels), 1),
        "range_db": None,
        "n_reversals": 0,
        "censored": True,
    }


# --- gap staircase ---------------------------------------------------------


def gap_step_ms(current_gap_ms: float) -> float:
    """Coarse-to-fine step size: 10 ms, then 5 ms, then 2 ms."""
    if current_gap_ms > 20:
        return 10.0
    if current_gap_ms > 10:
        return 5.0
    return 2.0


def gap_staircase_step(
    current_gap_ms: float,
    correct: bool,
    correct_streak: int,
) -> dict[str, float | int | str | bool]:
    """Apply one 2-down / 1-up step to gap detection.

    Correct responses make the gap smaller (harder); one incorrect response
    makes it larger (easier).
    """
    streak = int(correct_streak)
    step = gap_step_ms(float(current_gap_ms))
    lo = float(GAP_TEST["min_gap_ms"])
    hi = float(GAP_TEST["max_gap_ms"])
    hit_bound = False
    direction = 0

    if correct:
        streak += 1
        if streak >= 2:
            proposed = float(current_gap_ms) - step
            new_gap = clamp(proposed, lo, hi)
            hit_bound = new_gap != proposed
            direction = 0 if hit_bound else -1
            streak = 0
        else:
            new_gap = float(current_gap_ms)
    else:
        streak = 0
        proposed = float(current_gap_ms) + step
        new_gap = clamp(proposed, lo, hi)
        hit_bound = new_gap != proposed
        direction = 0 if hit_bound else 1

    return {
        "gap_ms": round(new_gap, 2),
        "correct_streak": streak,
        "direction": direction,
        "at_bound": hit_bound,
    }


def estimate_gap_threshold(
    reversals: Iterable[float],
    tested: Iterable[float] = (),
) -> dict[str, float | int | bool | None]:
    """Geometric mean of the last four gap reversals.

    The geometric mean is the usual summary for a duration threshold; the
    returned low/high values are the smallest and largest reversal, not a
    confidence interval.
    """
    rev = [float(v) for v in reversals if float(v) > 0]
    used = rev[-int(GAP_TEST["reversals_used"]):] if rev else []
    if used:
        logs = [math.log(v) for v in used]
        point = math.exp(sum(logs) / len(logs))
        return {
            "threshold_ms": round(point, 1),
            "low_ms": round(min(used), 1),
            "high_ms": round(max(used), 1),
            "n_reversals": len(rev),
            "censored": False,
        }
    levels = [float(v) for v in tested if float(v) > 0]
    if not levels:
        return {
            "threshold_ms": None,
            "low_ms": None,
            "high_ms": None,
            "n_reversals": 0,
            "censored": True,
        }
    logs = [math.log(v) for v in levels]
    return {
        "threshold_ms": round(math.exp(sum(logs) / len(logs)), 1),
        "low_ms": None,
        "high_ms": None,
        "n_reversals": 0,
        "censored": True,
    }


