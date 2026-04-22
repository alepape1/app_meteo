# test_pipeline_sim.py — tests de funciones puras en pipeline_sim.py
# Paso 1: cero dependencias externas (sin DB, sin MQTT, sin Docker)

import math
from datetime import datetime, timezone, timedelta

import pytest

from pipeline_sim import (
    DYNAMIC_PRESSURE_BAR,
    STATIC_PRESSURE_BAR,
    BURST_PRESSURE,
    LEAK_FLOW_BG,
    LEAK_FLOW_THRESHOLD,
    build_synthetic_history,
    detect_leaks,
    simulate_reading,
)

NOMINAL_FLOW = 10.0
FIXED_TS = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)


# ── simulate_reading ─────────────────────────────────────────────────────────

class TestSimulateReadingOutputShape:
    def test_returns_all_required_keys(self):
        r = simulate_reading(FIXED_TS, True, "normal", NOMINAL_FLOW)
        assert set(r.keys()) == {"timestamp", "valve_open", "scenario", "pressure_bar", "flow_lpm"}

    def test_timestamp_format(self):
        r = simulate_reading(FIXED_TS, True, "normal", NOMINAL_FLOW)
        # debe parsear sin excepciones
        datetime.strptime(r["timestamp"], "%Y-%m-%d %H:%M:%S")

    def test_valve_open_flag_stored(self):
        r_open   = simulate_reading(FIXED_TS, True,  "normal", NOMINAL_FLOW)
        r_closed = simulate_reading(FIXED_TS, False, "normal", NOMINAL_FLOW)
        assert r_open["valve_open"]   is True
        assert r_closed["valve_open"] is False

    def test_scenario_stored(self):
        for sc in ("normal", "leak", "burst"):
            r = simulate_reading(FIXED_TS, True, sc, NOMINAL_FLOW)
            assert r["scenario"] == sc

    def test_pressure_and_flow_are_nonnegative(self):
        for sc in ("normal", "leak", "burst"):
            for valve in (True, False):
                r = simulate_reading(FIXED_TS, valve, sc, NOMINAL_FLOW)
                assert r["pressure_bar"] >= 0.0
                assert r["flow_lpm"]     >= 0.0

    def test_values_rounded_to_3dp(self):
        r = simulate_reading(FIXED_TS, True, "normal", NOMINAL_FLOW)
        assert round(r["pressure_bar"], 3) == r["pressure_bar"]
        assert round(r["flow_lpm"],     3) == r["flow_lpm"]

    def test_is_deterministic(self):
        r1 = simulate_reading(FIXED_TS, True, "normal", NOMINAL_FLOW)
        r2 = simulate_reading(FIXED_TS, True, "normal", NOMINAL_FLOW)
        assert r1 == r2


class TestSimulateReadingScenarios:
    def test_normal_valve_open_pressure_near_dynamic(self):
        r = simulate_reading(FIXED_TS, True, "normal", NOMINAL_FLOW)
        # Dentro de ±0.2 bar del valor dinámico
        assert abs(r["pressure_bar"] - DYNAMIC_PRESSURE_BAR) < 0.2

    def test_normal_valve_open_flow_near_nominal(self):
        r = simulate_reading(FIXED_TS, True, "normal", NOMINAL_FLOW)
        assert abs(r["flow_lpm"] - NOMINAL_FLOW) < 0.5

    def test_normal_valve_closed_flow_near_zero(self):
        r = simulate_reading(FIXED_TS, False, "normal", NOMINAL_FLOW)
        # Con válvula cerrada el caudal debe ser muy pequeño (ruido ≈ 5% del ruido estd)
        assert r["flow_lpm"] < 0.1

    def test_normal_valve_closed_pressure_near_static(self):
        r = simulate_reading(FIXED_TS, False, "normal", NOMINAL_FLOW)
        assert abs(r["pressure_bar"] - STATIC_PRESSURE_BAR) < 0.2

    def test_burst_pressure_is_low(self):
        r = simulate_reading(FIXED_TS, True, "burst", NOMINAL_FLOW)
        # Presión burst debe estar cerca del valor de rotura
        assert r["pressure_bar"] < DYNAMIC_PRESSURE_BAR * 0.5

    def test_burst_valve_closed_flow_zero(self):
        r = simulate_reading(FIXED_TS, False, "burst", NOMINAL_FLOW)
        # Con válvula cerrada en burst, flow = 0
        assert r["flow_lpm"] == 0.0

    def test_leak_valve_closed_flow_above_background(self):
        r = simulate_reading(FIXED_TS, False, "leak", NOMINAL_FLOW)
        # Fuga de fondo debe superara el umbral de detección
        assert r["flow_lpm"] > LEAK_FLOW_THRESHOLD

    def test_leak_valve_closed_flow_near_background(self):
        r = simulate_reading(FIXED_TS, False, "leak", NOMINAL_FLOW)
        # El valor esperado es LEAK_FLOW_BG ± margen de ruido determinista
        assert abs(r["flow_lpm"] - LEAK_FLOW_BG) < 0.5

    def test_leak_valve_open_pressure_reduced(self):
        r_normal = simulate_reading(FIXED_TS, True, "normal", NOMINAL_FLOW)
        r_leak   = simulate_reading(FIXED_TS, True, "leak",   NOMINAL_FLOW)
        assert r_leak["pressure_bar"] < r_normal["pressure_bar"]


@pytest.mark.parametrize("nominal", [5.0, 8.0, 10.0, 15.0, 20.0])
def test_nominal_flow_scales_output(nominal):
    """El caudal simulado debe crecer con el caudal nominal."""
    r = simulate_reading(FIXED_TS, True, "normal", nominal)
    assert r["flow_lpm"] > 0.0
    # A mayor caudal nominal, el flow debe ser mayor
    r_low = simulate_reading(FIXED_TS, True, "normal", 5.0)
    r_high = simulate_reading(FIXED_TS, True, "normal", 20.0)
    assert r_high["flow_lpm"] > r_low["flow_lpm"]


# ── build_synthetic_history ──────────────────────────────────────────────────

class TestBuildSyntheticHistory:
    def test_returns_correct_number_of_readings(self):
        h = build_synthetic_history(30, True, "normal", NOMINAL_FLOW)
        assert len(h) == 30

    def test_timestamps_are_chronological(self):
        h = build_synthetic_history(10, True, "normal", NOMINAL_FLOW)
        ts = [datetime.strptime(r["timestamp"], "%Y-%m-%d %H:%M:%S") for r in h]
        assert ts == sorted(ts)

    def test_timestamps_spaced_by_interval(self):
        interval = 30
        h = build_synthetic_history(5, True, "normal", NOMINAL_FLOW, interval_s=interval)
        ts = [datetime.strptime(r["timestamp"], "%Y-%m-%d %H:%M:%S") for r in h]
        for i in range(1, len(ts)):
            diff = (ts[i] - ts[i - 1]).total_seconds()
            assert diff == interval

    def test_valve_flag_propagated(self):
        for valve in (True, False):
            h = build_synthetic_history(5, valve, "normal", NOMINAL_FLOW)
            assert all(r["valve_open"] == valve for r in h)

    def test_scenario_propagated(self):
        for sc in ("normal", "leak", "burst"):
            h = build_synthetic_history(5, True, sc, NOMINAL_FLOW)
            assert all(r["scenario"] == sc for r in h)

    def test_n_zero_returns_empty_list(self):
        assert build_synthetic_history(0, True, "normal", NOMINAL_FLOW) == []


# ── detect_leaks ─────────────────────────────────────────────────────────────

class TestDetectLeaksOutputShape:
    def test_returns_required_keys(self):
        h = build_synthetic_history(20, True, "normal", NOMINAL_FLOW)
        result = detect_leaks(h)
        expected = {
            "status", "confidence", "alerts",
            "ewma_pressure", "ewma_flow",
            "baseline_pressure", "baseline_flow",
            "std_pressure", "std_flow",
        }
        assert set(result.keys()) == expected

    def test_empty_input_returns_no_data(self):
        result = detect_leaks([])
        assert result["status"] == "NO_DATA"
        assert result["confidence"] == 0.0
        assert result["alerts"] == []

    def test_confidence_between_0_and_1(self):
        for sc in ("normal", "leak", "burst"):
            h = build_synthetic_history(30, True, sc, NOMINAL_FLOW)
            r = detect_leaks(h)
            assert 0.0 <= r["confidence"] <= 1.0


class TestDetectLeaksNormal:
    def test_normal_scenario_is_normal(self):
        h = build_synthetic_history(50, True, "normal", NOMINAL_FLOW)
        r = detect_leaks(h)
        assert r["status"] == "NORMAL"

    def test_normal_has_no_alerts(self):
        h = build_synthetic_history(50, True, "normal", NOMINAL_FLOW)
        r = detect_leaks(h)
        assert r["alerts"] == []

    def test_normal_confidence_is_zero(self):
        h = build_synthetic_history(50, True, "normal", NOMINAL_FLOW)
        r = detect_leaks(h)
        assert r["confidence"] == 0.0


class TestDetectLeaksBurst:
    def test_burst_scenario_detected(self):
        h = build_synthetic_history(50, True, "burst", NOMINAL_FLOW)
        r = detect_leaks(h)
        assert r["status"] == "BURST"

    def test_burst_has_critical_alert(self):
        h = build_synthetic_history(50, True, "burst", NOMINAL_FLOW)
        r = detect_leaks(h)
        severities = [a["severity"] for a in r["alerts"]]
        assert "CRITICAL" in severities

    def test_burst_confidence_above_threshold(self):
        h = build_synthetic_history(50, True, "burst", NOMINAL_FLOW)
        r = detect_leaks(h)
        assert r["confidence"] > 0.5


class TestDetectLeaksLeak:
    def test_leak_valve_closed_detected(self):
        h = build_synthetic_history(50, False, "leak", NOMINAL_FLOW)
        r = detect_leaks(h)
        assert r["status"] in ("LEAK", "LEAK_SUSPECTED")

    def test_leak_has_at_least_one_alert(self):
        h = build_synthetic_history(50, False, "leak", NOMINAL_FLOW)
        r = detect_leaks(h)
        assert len(r["alerts"]) >= 1

    def test_leak_alert_mentions_threshold(self):
        h = build_synthetic_history(50, False, "leak", NOMINAL_FLOW)
        r = detect_leaks(h)
        threshold_alerts = [a for a in r["alerts"] if a.get("method") == "threshold"]
        assert len(threshold_alerts) >= 1


class TestDetectLeaksEWMAValues:
    def test_ewma_pressure_is_a_float(self):
        h = build_synthetic_history(20, True, "normal", NOMINAL_FLOW)
        r = detect_leaks(h)
        assert isinstance(r["ewma_pressure"], float)

    def test_ewma_pressure_near_baseline_for_normal(self):
        h = build_synthetic_history(100, True, "normal", NOMINAL_FLOW)
        r = detect_leaks(h)
        assert abs(r["ewma_pressure"] - r["baseline_pressure"]) < 0.3

    def test_baseline_pressure_near_dynamic_when_valve_open(self):
        h = build_synthetic_history(50, True, "normal", NOMINAL_FLOW)
        r = detect_leaks(h)
        assert abs(r["baseline_pressure"] - DYNAMIC_PRESSURE_BAR) < 0.3

    def test_std_pressure_above_zero(self):
        h = build_synthetic_history(20, True, "normal", NOMINAL_FLOW)
        r = detect_leaks(h)
        assert r["std_pressure"] > 0.0


class TestDetectLeaksSingleReading:
    def test_single_reading_does_not_crash(self):
        r = simulate_reading(FIXED_TS, False, "leak", NOMINAL_FLOW)
        result = detect_leaks([r])
        assert result["status"] in ("NORMAL", "LEAK", "LEAK_SUSPECTED", "BURST")
