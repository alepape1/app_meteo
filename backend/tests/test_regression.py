"""
Paso 4 — Golden file de regresión del algoritmo detect_leaks()
==============================================================
Ejecuta detect_leaks() sobre tres datasets fijos y compara contra
la referencia guardada en tests/fixtures/leak_detection_golden.json.

Para regenerar la referencia cuando se cambia el algoritmo intencionalmente:
    python tests/test_regression.py --update
"""

import json
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta

# Permite importar pipeline_sim tanto desde tests/ como desde backend/
sys.path.insert(0, str(Path(__file__).parent.parent))

from pipeline_sim import simulate_reading, detect_leaks

FIXTURES_DIR = Path(__file__).parent / "fixtures"
GOLDEN_FILE  = FIXTURES_DIR / "leak_detection_golden.json"

# Ancla de tiempo fija: garantiza reproducibilidad entre ejecuciones
ANCHOR_TS = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)

# ── Definición de datasets de referencia ────────────────────────────────────

DATASETS = {
    "normal_valve_open": dict(n=60, valve_open=True,  scenario="normal", nominal_flow_lpm=12.0),
    "leak_valve_closed": dict(n=60, valve_open=False, scenario="leak",   nominal_flow_lpm=12.0),
    "burst_valve_open":  dict(n=30, valve_open=True,  scenario="burst",  nominal_flow_lpm=12.0),
}


def _build_fixed_history(n, valve_open, scenario, nominal_flow_lpm, interval_s=20):
    """
    Genera N lecturas ancladas a ANCHOR_TS (determinista, sin datetime.now()).
    """
    readings = []
    for i in range(n, 0, -1):
        ts = ANCHOR_TS - timedelta(seconds=i * interval_s)
        readings.append(simulate_reading(ts, valve_open, scenario, nominal_flow_lpm))
    return readings


def _run_detect(name):
    params   = DATASETS[name]
    readings = _build_fixed_history(**params)
    return detect_leaks(readings)


def _load_golden():
    with open(GOLDEN_FILE, encoding="utf-8") as f:
        return json.load(f)


def compute_golden():
    """Calcula y devuelve el golden dict completo (sin escribir a disco)."""
    golden = {}
    for name, params in DATASETS.items():
        readings = _build_fixed_history(**params)
        result   = detect_leaks(readings)
        golden[name] = {
            "status":        result["status"],
            "confidence":    round(result["confidence"],    6),
            "alert_count":   len(result["alerts"]),
            "ewma_pressure": round(result["ewma_pressure"], 6),
            "ewma_flow":     round(result["ewma_flow"],     6),
        }
    return golden


# ── Tests ────────────────────────────────────────────────────────────────────

def test_normal_status_unchanged():
    golden = _load_golden()
    result = _run_detect("normal_valve_open")
    assert result["status"] == golden["normal_valve_open"]["status"]


def test_normal_confidence_unchanged():
    golden = _load_golden()
    result = _run_detect("normal_valve_open")
    assert round(result["confidence"], 6) == golden["normal_valve_open"]["confidence"]


def test_leak_status_unchanged():
    golden = _load_golden()
    result = _run_detect("leak_valve_closed")
    assert result["status"] == golden["leak_valve_closed"]["status"]


def test_leak_alert_count_unchanged():
    golden = _load_golden()
    result = _run_detect("leak_valve_closed")
    assert len(result["alerts"]) == golden["leak_valve_closed"]["alert_count"]


def test_burst_status_unchanged():
    golden = _load_golden()
    result = _run_detect("burst_valve_open")
    assert result["status"] == golden["burst_valve_open"]["status"]


def test_burst_confidence_unchanged():
    golden = _load_golden()
    result = _run_detect("burst_valve_open")
    assert round(result["confidence"], 6) == golden["burst_valve_open"]["confidence"]


def test_ewma_values_stable():
    golden = _load_golden()
    for name in DATASETS:
        result = _run_detect(name)
        ref    = golden[name]
        assert round(result["ewma_pressure"], 6) == ref["ewma_pressure"], (
            f"{name}: ewma_pressure {result['ewma_pressure']} != {ref['ewma_pressure']}"
        )
        assert round(result["ewma_flow"], 6) == ref["ewma_flow"], (
            f"{name}: ewma_flow {result['ewma_flow']} != {ref['ewma_flow']}"
        )


# ── CLI para regenerar el golden file ────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(
        description="Gestión del golden file de detect_leaks()"
    )
    parser.add_argument(
        "--update", action="store_true",
        help="Regenerar el golden file con el output actual del algoritmo"
    )
    args = parser.parse_args()

    if args.update:
        FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
        golden = compute_golden()
        with open(GOLDEN_FILE, "w", encoding="utf-8") as f:
            json.dump(golden, f, indent=2, ensure_ascii=False)
        print(f"Golden file actualizado: {GOLDEN_FILE}")
        for name, vals in golden.items():
            print(
                f"  {name}: {vals['status']} "
                f"(conf={vals['confidence']}, alerts={vals['alert_count']}, "
                f"ewma_p={vals['ewma_pressure']}, ewma_q={vals['ewma_flow']})"
            )
    else:
        print("Usa --update para regenerar el golden file.")
        print(f"Referencia actual: {GOLDEN_FILE}")


if __name__ == "__main__":
    main()
