"""
pipeline_sim.py — Simulación de caudalímetro y sensor de presión
================================================================
Genera lecturas sintéticas de presión (bar) y caudal (L/min) de forma
*determinista* usando ondas sinusoidales del timestamp como "ruido".
Al no usar random(), los valores son reproducibles entre workers Gunicorn.

Escenarios disponibles
----------------------
  'normal' — operación sin anomalías
  'leak'   — fuga pequeña (caudal de fondo ~0.3 L/min con válvula cerrada,
              presión ligeramente reducida con válvula abierta)
  'burst'  — rotura de tubería: presión colapsa, caudal mínimo

Detección de fugas (sin estado persistente)
--------------------------------------------
Se aplica sobre un array de lecturas pasado como argumento, por lo que
funciona correctamente con múltiples workers Gunicorn.

Métodos implementados:
  1. Umbral absoluto  — caudal > threshold con válvula cerrada → LEAK
  2. dP/dt             — caída brusca de presión en 2 muestras → BURST
  3. EWMA (λ=0.15)    — deriva estadística lenta en presión → LEAK_SUSPECTED
"""

import math
from datetime import datetime, timezone, timedelta

# ── Parámetros físicos ────────────────────────────────────────────────────────
STATIC_PRESSURE_BAR  = 3.5    # bar  — presión estática (válvula cerrada)
DYNAMIC_PRESSURE_BAR = 2.8    # bar  — presión dinámica a caudal nominal
PRESSURE_NOISE_STD   = 0.04   # bar  — dispersión del sensor de presión
FLOW_NOISE_STD       = 0.12   # L/min — dispersión del caudalímetro

# Escenarios de fuga/rotura
LEAK_FLOW_BG         = 0.28   # L/min — caudal de fuga de fondo (escenario 'leak')
LEAK_PRESSURE_DROP   = 0.18   # bar   — caída de presión asociada a la fuga
BURST_PRESSURE       = 0.25   # bar   — presión residual tras rotura

# ── Parámetros de detección ───────────────────────────────────────────────────
LEAK_FLOW_THRESHOLD  = 0.10   # L/min — umbral mínimo para alerta con válvula cerrada
BURST_DROP_RATIO     = 0.20   # caída relativa (20 %) en 2 muestras consecutivas → rotura
EWMA_LAMBDA          = 0.15   # factor de suavizado EWMA
EWMA_SIGMA_THRESHOLD = 2.5    # σ a partir del cual la EWMA emite alerta


# ── Generador de ruido determinista ──────────────────────────────────────────

def _noise(t_epoch: float, channel: int) -> float:
    """
    Combina tres ondas sinusoidales de frecuencias distintas para simular
    ruido de sensor realista. El resultado está en [-1, +1].
    """
    return (
        math.sin(t_epoch *  7.3 + channel * 1.7) * 0.55
      + math.sin(t_epoch * 13.1 + channel * 3.2) * 0.30
      + math.sin(t_epoch * 31.7 + channel * 5.1) * 0.15
    )


# ── Simulador de lectura individual ──────────────────────────────────────────

def simulate_reading(
    timestamp: datetime,
    valve_open: bool,
    scenario: str,
    nominal_flow_lpm: float,
) -> dict:
    """
    Genera una lectura simulada de presión y caudal para el instante dado.

    Parámetros
    ----------
    timestamp        : instante de la lectura
    valve_open       : estado confirmado de la electroválvula
    scenario         : 'normal' | 'leak' | 'burst'
    nominal_flow_lpm : caudal nominal del sistema (L/min)

    Retorna
    -------
    dict con: timestamp, valve_open, scenario, pressure_bar, flow_lpm
    """
    t = timestamp.timestamp()
    p_noise = _noise(t, 0) * PRESSURE_NOISE_STD
    q_noise = _noise(t, 1) * FLOW_NOISE_STD

    if scenario == 'burst':
        pressure = max(0.0, BURST_PRESSURE + p_noise * 0.4)
        flow     = max(0.0, nominal_flow_lpm * 0.08 + abs(q_noise) * 0.3) if valve_open else 0.0

    elif scenario == 'leak':
        if valve_open:
            pressure = max(0.0, DYNAMIC_PRESSURE_BAR - LEAK_PRESSURE_DROP + p_noise)
            flow     = max(0.0, nominal_flow_lpm - 0.45 + q_noise)
        else:
            # Con válvula cerrada: fuga de fondo constante + ruido pequeño
            pressure = max(0.0, STATIC_PRESSURE_BAR - 0.10 + p_noise)
            flow     = max(0.0, LEAK_FLOW_BG + abs(q_noise) * 0.35)

    else:  # 'normal'
        if valve_open:
            pressure = max(0.0, DYNAMIC_PRESSURE_BAR + p_noise)
            flow     = max(0.0, nominal_flow_lpm + q_noise)
        else:
            # Ruido mínimo alrededor de cero
            pressure = max(0.0, STATIC_PRESSURE_BAR + p_noise)
            flow     = max(0.0, abs(q_noise) * 0.05)

    return {
        "timestamp":    timestamp.strftime('%Y-%m-%d %H:%M:%S'),
        "valve_open":   valve_open,
        "scenario":     scenario,
        "pressure_bar": round(pressure, 3),
        "flow_lpm":     round(flow,     3),
    }


# ── Generador de histórico sintético ────────────────────────────────────────

def build_history_from_db_rows(rows, scenario: str, nominal_flow_lpm: float) -> list:
    """
    Genera lecturas simuladas usando los timestamps y estado de relay de la DB.

    rows: iterable de sqlite3.Row con columnas 'timestamp' y 'relay_active'
    """
    readings = []
    for row in rows:
        raw_ts = row["timestamp"]
        try:
            ts = datetime.fromisoformat(raw_ts.replace(' ', 'T'))
        except (ValueError, AttributeError):
            continue
        rdg = simulate_reading(ts, bool(row["relay_active"]), scenario, nominal_flow_lpm)
        readings.append(rdg)
    return readings


def build_synthetic_history(
    n: int,
    valve_open: bool,
    scenario: str,
    nominal_flow_lpm: float,
    interval_s: int = 20,
) -> list:
    """
    Genera N lecturas sintéticas hacia atrás desde el instante actual.
    Se usa cuando la DB aún no tiene registros.
    """
    now = datetime.now(timezone.utc)
    readings = []
    for i in range(n, 0, -1):
        ts = now - timedelta(seconds=i * interval_s)
        readings.append(simulate_reading(ts, valve_open, scenario, nominal_flow_lpm))
    return readings


# ── Motor de detección ───────────────────────────────────────────────────────

def detect_leaks(readings: list) -> dict:
    """
    Aplica tres métodos de detección sobre una serie de lecturas cronológicas.

    Retorna
    -------
    dict con:
      status          : 'NORMAL' | 'LEAK_SUSPECTED' | 'LEAK' | 'BURST'
      confidence      : 0.0 – 1.0
      alerts          : lista de alertas individuales
      ewma_pressure   : último valor EWMA de presión (bar)
      ewma_flow       : último valor EWMA de caudal (L/min)
      baseline_pressure, baseline_flow, std_pressure, std_flow
    """
    if not readings:
        return {
            "status": "NO_DATA", "confidence": 0.0, "alerts": [],
            "ewma_pressure": None, "ewma_flow": None,
            "baseline_pressure": None, "baseline_flow": None,
            "std_pressure": None, "std_flow": None,
        }

    status     = "NORMAL"
    confidence = 0.0
    alerts     = []

    open_rdgs   = [r for r in readings if     r["valve_open"]]
    closed_rdgs = [r for r in readings if not r["valve_open"]]

    # ── Estadísticos base (tomados con válvula abierta) ──────────────────────
    if open_rdgs:
        baseline_p = sum(r["pressure_bar"] for r in open_rdgs) / len(open_rdgs)
        baseline_q = sum(r["flow_lpm"]     for r in open_rdgs) / len(open_rdgs)
        if len(open_rdgs) > 1:
            std_p = math.sqrt(
                sum((r["pressure_bar"] - baseline_p) ** 2 for r in open_rdgs)
                / (len(open_rdgs) - 1)
            )
            std_q = math.sqrt(
                sum((r["flow_lpm"]     - baseline_q) ** 2 for r in open_rdgs)
                / (len(open_rdgs) - 1)
            )
        else:
            std_p, std_q = PRESSURE_NOISE_STD, FLOW_NOISE_STD
    else:
        # Sin datos de válvula abierta: usar valores físicos nominales
        baseline_p = DYNAMIC_PRESSURE_BAR
        baseline_q = readings[0]["flow_lpm"] if readings else 5.0
        std_p, std_q = PRESSURE_NOISE_STD, FLOW_NOISE_STD

    # Evitar std=0 (división por cero en EWMA)
    std_p = max(std_p, PRESSURE_NOISE_STD)
    std_q = max(std_q, FLOW_NOISE_STD)

    # ── Método 1: umbral de caudal con válvula cerrada ────────────────────────
    if closed_rdgs:
        recent = closed_rdgs[-6:]  # últimas 6 lecturas (≈ 2 min)
        avg_closed_flow = sum(r["flow_lpm"] for r in recent) / len(recent)
        if avg_closed_flow > LEAK_FLOW_THRESHOLD:
            severity = "CRITICAL" if avg_closed_flow > LEAK_FLOW_THRESHOLD * 4 else "HIGH"
            alerts.append({
                "method":   "threshold",
                "severity": severity,
                "message":  (
                    f"Caudal detectado con válvula cerrada: "
                    f"{avg_closed_flow:.2f} L/min "
                    f"(umbral: {LEAK_FLOW_THRESHOLD} L/min)"
                ),
            })
            c = min(1.0, avg_closed_flow / (LEAK_FLOW_THRESHOLD * 5))
            if c > confidence:
                confidence = c
                status = "LEAK"

    # ── Método 2: tasa de cambio de presión (burst) ──────────────────────────
    if len(readings) >= 2:
        last = readings[-1]
        prev = readings[-2]
        if last["valve_open"] and prev["valve_open"] and prev["pressure_bar"] > 0.1:
            dp      = last["pressure_bar"] - prev["pressure_bar"]
            rel_drop = -dp / prev["pressure_bar"]
            if rel_drop > BURST_DROP_RATIO:
                alerts.append({
                    "method":   "dpdt",
                    "severity": "CRITICAL",
                    "message":  (
                        f"Caída brusca de presión: {dp:+.3f} bar "
                        f"({rel_drop * 100:.0f}% en 20 s)"
                    ),
                })
                c = min(1.0, rel_drop / BURST_DROP_RATIO)
                if c > confidence:
                    confidence = c
                    status = "BURST"

    # ── Método 3: EWMA sobre residuos de presión y caudal ────────────────────
    ewma_p = baseline_p
    ewma_q = baseline_q
    max_res_p = 0.0
    max_res_q = 0.0

    for r in readings:
        if not r["valve_open"]:
            continue
        ewma_p = EWMA_LAMBDA * r["pressure_bar"] + (1 - EWMA_LAMBDA) * ewma_p
        ewma_q = EWMA_LAMBDA * r["flow_lpm"]     + (1 - EWMA_LAMBDA) * ewma_q
        res_p  = abs(ewma_p - baseline_p) / std_p
        res_q  = abs(ewma_q - baseline_q) / std_q
        if res_p > max_res_p:
            max_res_p = res_p
        if res_q > max_res_q:
            max_res_q = res_q

    ewma_conf_score = max(max_res_p, max_res_q) / EWMA_SIGMA_THRESHOLD
    if ewma_conf_score > 1.0 and status == "NORMAL":
        alerts.append({
            "method":   "ewma",
            "severity": "MEDIUM",
            "message":  (
                f"Deriva estadística (EWMA): "
                f"P={ewma_p:.3f} bar (base {baseline_p:.3f}), "
                f"Q={ewma_q:.2f} L/min (base {baseline_q:.2f})"
            ),
        })
        c = min(1.0, ewma_conf_score / 2.0)
        if c > confidence:
            confidence = c
            status = "LEAK_SUSPECTED"

    return {
        "status":             status,
        "confidence":         round(confidence, 3),
        "alerts":             alerts,
        "ewma_pressure":      round(ewma_p, 3),
        "ewma_flow":          round(ewma_q, 3),
        "baseline_pressure":  round(baseline_p, 3),
        "baseline_flow":      round(baseline_q, 3),
        "std_pressure":       round(std_p, 4),
        "std_flow":           round(std_q, 4),
    }
