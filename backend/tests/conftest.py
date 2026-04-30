# conftest.py — fixtures compartidos del backend Aquantia
# Paso 1: no requiere infraestructura (sin DB, sin MQTT, sin Docker)

from datetime import datetime, timezone
import pytest

from pipeline_sim import simulate_reading, build_synthetic_history, detect_leaks

NOMINAL_FLOW = 10.0  # L/min — caudal nominal usado en todos los tests

# Timestamp fijo y determinista para que los resultados sean reproducibles
FIXED_TS = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)


@pytest.fixture
def fixed_ts():
    return FIXED_TS


@pytest.fixture
def normal_valve_open_reading(fixed_ts):
    return simulate_reading(fixed_ts, valve_open=True, scenario="normal", nominal_flow_lpm=NOMINAL_FLOW)


@pytest.fixture
def normal_valve_closed_reading(fixed_ts):
    return simulate_reading(fixed_ts, valve_open=False, scenario="normal", nominal_flow_lpm=NOMINAL_FLOW)


@pytest.fixture
def leak_valve_closed_reading(fixed_ts):
    return simulate_reading(fixed_ts, valve_open=False, scenario="leak", nominal_flow_lpm=NOMINAL_FLOW)


@pytest.fixture
def burst_reading(fixed_ts):
    return simulate_reading(fixed_ts, valve_open=True, scenario="burst", nominal_flow_lpm=NOMINAL_FLOW)


@pytest.fixture
def history_normal():
    """50 lecturas sintéticas en escenario normal con válvula abierta."""
    return build_synthetic_history(50, valve_open=True, scenario="normal", nominal_flow_lpm=NOMINAL_FLOW)


@pytest.fixture
def history_leak_closed():
    """50 lecturas sintéticas en escenario de fuga con válvula cerrada."""
    return build_synthetic_history(50, valve_open=False, scenario="leak", nominal_flow_lpm=NOMINAL_FLOW)


@pytest.fixture
def history_burst():
    """50 lecturas sintéticas en escenario de rotura con válvula abierta."""
    return build_synthetic_history(50, valve_open=True, scenario="burst", nominal_flow_lpm=NOMINAL_FLOW)
