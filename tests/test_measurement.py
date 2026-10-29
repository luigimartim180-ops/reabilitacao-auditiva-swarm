"""Tests for the deterministic measurement maths.

These tests protect the arithmetic, not a clinical claim. The point is that a
threshold, its spread and its censoring flag are computed the same way every
time and can be reported honestly.
"""

import pytest

from swarm.measurement import (
    GAP_TEST,
    SPEECH_TEST,
    estimate_gap_threshold,
    estimate_snr_threshold,
    gap_staircase_step,
    gap_step_ms,
    hhie_band,
    hhie_referral,
    hhie_total,
    speech_staircase_step,
)


def test_hhie_scoring_and_bands():
    assert hhie_total([0] * 10) == 0
    assert hhie_band(0) == "no_perceived_handicap"
    assert hhie_band(8) == "no_perceived_handicap"
    assert hhie_band(10) == "mild_to_moderate"
    assert hhie_band(24) == "mild_to_moderate"
    assert hhie_band(26) == "significant"
    assert hhie_total([4] * 10) == 40
    assert hhie_band(40) == "significant"


def test_hhie_referral_threshold():
    assert hhie_referral(8) is False
    assert hhie_referral(10) is True
    assert hhie_referral(40) is True


def test_hhie_rejects_bad_input():
    with pytest.raises(ValueError):
        hhie_total([0] * 9)
    with pytest.raises(ValueError):
        hhie_total([0] * 9 + [3])


def test_speech_staircase_is_two_down_one_up():
    first = speech_staircase_step(8.0, True, 0)
    assert first == {"snr_db": 8.0, "correct_streak": 1, "direction": 0, "at_bound": False}

    harder = speech_staircase_step(8.0, True, 1)
    assert harder == {"snr_db": 4.0, "correct_streak": 0, "direction": -1, "at_bound": False}

    easier = speech_staircase_step(8.0, False, 1)
    assert easier == {"snr_db": 12.0, "correct_streak": 0, "direction": 1, "at_bound": False}


def test_speech_staircase_respects_bounds():
    bounded_high = speech_staircase_step(SPEECH_TEST["max_snr_db"], False, 0)
    assert bounded_high["snr_db"] == SPEECH_TEST["max_snr_db"]
    assert bounded_high["at_bound"] is True
    assert bounded_high["direction"] == 0

    bounded_low = speech_staircase_step(SPEECH_TEST["min_snr_db"], True, 1)
    assert bounded_low["snr_db"] == SPEECH_TEST["min_snr_db"]
    assert bounded_low["at_bound"] is True


def test_estimate_snr_uses_the_last_four_reversals():
    result = estimate_snr_threshold([8, 4, 0, -4, -8])
    assert result["threshold_db"] == -2.0
    assert result["range_db"] == 6.0
    assert result["n_reversals"] == 5
    assert result["censored"] is False


def test_estimate_snr_is_censored_without_reversals():
    result = estimate_snr_threshold([], [8, 4, 0])
    assert result["threshold_db"] == 4.0
    assert result["range_db"] is None
    assert result["censored"] is True

    empty = estimate_snr_threshold([], [])
    assert empty["threshold_db"] is None
    assert empty["censored"] is True


def test_gap_step_is_coarse_to_fine():
    assert gap_step_ms(40) == 10
    assert gap_step_ms(20) == 5
    assert gap_step_ms(10) == 2
    assert gap_step_ms(2) == 2


def test_gap_staircase_moves_in_the_right_direction():
    first = gap_staircase_step(40.0, True, 0)
    assert first["gap_ms"] == 40.0
    assert first["correct_streak"] == 1

    harder = gap_staircase_step(40.0, True, 1)
    assert harder["gap_ms"] == 30.0
    assert harder["direction"] == -1

    easier = gap_staircase_step(40.0, False, 1)
    assert easier["gap_ms"] == 50.0
    assert easier["direction"] == 1


def test_gap_staircase_respects_bounds():
    floor = gap_staircase_step(GAP_TEST["min_gap_ms"], True, 1)
    assert floor["gap_ms"] == GAP_TEST["min_gap_ms"]
    assert floor["at_bound"] is True

    ceiling = gap_staircase_step(GAP_TEST["max_gap_ms"], False, 0)
    assert ceiling["gap_ms"] == GAP_TEST["max_gap_ms"]
    assert ceiling["at_bound"] is True


def test_estimate_gap_is_geometric_mean():
    result = estimate_gap_threshold([40, 20, 10, 5])
    assert result["threshold_ms"] == pytest.approx(14.1, abs=0.1)
    assert result["low_ms"] == 5.0
    assert result["high_ms"] == 40.0
    assert result["censored"] is False


def test_estimate_gap_is_censored_without_reversals():
    result = estimate_gap_threshold([], [40, 20])
    assert result["threshold_ms"] == pytest.approx(28.3, abs=0.1)
    assert result["low_ms"] is None
    assert result["censored"] is True

    empty = estimate_gap_threshold([], [])
    assert empty["threshold_ms"] is None
    assert empty["censored"] is True
