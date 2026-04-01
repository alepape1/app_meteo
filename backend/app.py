from flask import Flask, g, render_template, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os
import logging
import datetime
from database import get_db_connection, create_tables
from pipeline_sim import (
    simulate_reading,
    build_history_from_db_rows,
    build_synthetic_history,
    detect_leaks,
    STATIC_PRESSURE_BAR,
    DYNAMIC_PRESSURE_BAR,
)

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

TEMPLATE_FILE = "index.html"

def get_db():
    """Conexión única a la DB por petición (lazy init)."""
    if 'db' not in g:
        g.db = get_db_connection()
    return g.db


# ── Estado del relay persistido en SQLite ────────────────────────────────────
# Soporta múltiples dispositivos y múltiples relays por dispositivo.
# Cada relay es una fila (device_mac, relay_index). La fila id=1 es legacy.

def _relay_ensure(mac):
    """Crea filas de relay_state para cada relay del dispositivo si no existen."""
    db = get_db()
    row = db.execute(
        "SELECT relay_count FROM device_info WHERE mac_address=?", (mac,)
    ).fetchone()
    count = row['relay_count'] if row else 1
    for i in range(count):
        db.execute(
            "INSERT OR IGNORE INTO relay_state(device_mac, relay_index, desired, actual)"
            " VALUES (?, ?, 0, 0)",
            (mac, i)
        )
    db.commit()


def _relay_get(mac=None):
    """Devuelve lista de {index, desired, actual} para el dispositivo."""
    db = get_db()
    if mac:
        rows = db.execute(
            "SELECT relay_index, desired, actual FROM relay_state"
            " WHERE device_mac=? ORDER BY relay_index",
            (mac,)
        ).fetchall()
        return [{"index": r['relay_index'], "desired": bool(r['desired']),
                 "actual": bool(r['actual'])} for r in rows]
    # Legacy: fila id=1
    row = db.execute(
        "SELECT desired, actual FROM relay_state WHERE id=1"
    ).fetchone()
    if row:
        return [{"index": 0, "desired": bool(row['desired']),
                 "actual": bool(row['actual'])}]
    return [{"index": 0, "desired": False, "actual": False}]


def _relay_set_desired(mac, index, state):
    db = get_db()
    if mac:
        db.execute(
            "UPDATE relay_state SET desired=? WHERE device_mac=? AND relay_index=?",
            (1 if state else 0, mac, index)
        )
    else:
        db.execute("UPDATE relay_state SET desired=? WHERE id=1", (1 if state else 0,))
    db.commit()


def _relay_set_actual(mac, index, state):
    db = get_db()
    if mac:
        db.execute(
            "UPDATE relay_state SET actual=? WHERE device_mac=? AND relay_index=?",
            (1 if state else 0, mac, index)
        )
    else:
        db.execute("UPDATE relay_state SET actual=? WHERE id=1", (1 if state else 0,))
    db.commit()


# ── Configuración de la aplicación ───────────────────────────────────────────

def _get_settings():
    rows = get_db().execute("SELECT key, value FROM app_settings").fetchall()
    return {r['key']: r['value'] for r in rows}


@app.route("/api/settings")
def api_get_settings():
    """Devuelve todos los parámetros de configuración."""
    return jsonify(_get_settings())


@app.route("/api/settings", methods=["POST"])
def api_set_settings():
    """Actualiza uno o varios parámetros de configuración."""
    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"error": "JSON requerido"}), 400
    db = get_db()
    for key, value in payload.items():
        db.execute(
            "INSERT OR REPLACE INTO app_settings(key, value) VALUES (?, ?)",
            (key, str(value))
        )
    db.commit()
    logger.info("Settings actualizados: %s", list(payload.keys()))
    return jsonify(_get_settings())


@app.teardown_appcontext
def close_connection(exception):
    """Cierra la conexión a la DB al terminar la petición."""
    db = g.pop('db', None)
    if db is not None:
        db.close()


def parse_message_data(message):
    """Parsea el mensaje CSV recibido del ESP32."""
    try:
        parts = message.strip().split(",")
        if len(parts) not in (9, 11, 14, 15, 16, 17):
            return None
        return [float(v) for v in parts]
    except ValueError:
        return None


def rows_to_dict(rows):
    """Convierte filas de DB al formato esperado por los gráficos."""
    return {
        "timestamp":             [r["timestamp"]             for r in rows],
        "temperature":           [r["temperature"]           for r in rows],
        "temperature_bar":       [r["temperature_barometer"] for r in rows],
        "humidity":              [r["humidity"]              for r in rows],
        "pressure":              [r["pressure"]              for r in rows],
        "windSpeed":             [r["windSpeed"]             for r in rows],
        "windDirection":         [r["windDirection"]         for r in rows],
        "windSpeedFiltered":     [r["windSpeedFiltered"]     for r in rows],
        "windDirectionFiltered": [r["windDirectionFiltered"] for r in rows],
        "light":                 [r["light"]                 for r in rows],
        "dht_temperature":       [r["dht_temperature"]       for r in rows],
        "dht_humidity":          [r["dht_humidity"]          for r in rows],
        "rssi":                  [r["rssi"]                  for r in rows],
        "free_heap":             [r["free_heap"]             for r in rows],
        "uptime_s":              [r["uptime_s"]              for r in rows],
        "relay_active":          [r["relay_active"]          for r in rows],
        "pipeline_pressure":     [r["pipeline_pressure"]     for r in rows],
        "pipeline_flow":         [r["pipeline_flow"]         for r in rows],
        "soil_moisture":         [r["soil_moisture"]         for r in rows],
    }


# --- RUTAS ---

@app.route("/")
def fetch_data():
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        SELECT * FROM home_weather_station
        ORDER BY timestamp DESC
        LIMIT 2;
    """)
    rows = cursor.fetchall()
    cursor.close()

    context = {"message": "Últimos datos"} | rows_to_dict(rows)
    return render_template(TEMPLATE_FILE, **context)


@app.route("/descargar/<int:cantidad_muestras>")
def descargar_muestras(cantidad_muestras):
    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT COUNT(*) FROM home_weather_station;")
    total = cursor.fetchone()[0]
    offset = max(0, total - cantidad_muestras)

    cursor.execute("""
        SELECT * FROM home_weather_station
        ORDER BY timestamp ASC
        LIMIT ? OFFSET ?
    """, (cantidad_muestras, offset))
    rows = cursor.fetchall()
    cursor.close()

    context = {"message": f"{len(rows)} muestras"} | rows_to_dict(rows)
    return render_template(TEMPLATE_FILE, **context)


@app.route("/send_message", methods=["POST"])
def send_message():
    message = request.get_data().decode("utf-8")
    logger.info("Datos recibidos del ESP32: %s", message)

    data = parse_message_data(message)
    if data is None:
        logger.warning("Mensaje inválido descartado: %s", message)
        return "Error: se esperan 9, 11 u 14 valores separados por coma", 400

    dht_temp          = data[9]  if len(data) >= 11 else None
    dht_hum           = data[10] if len(data) >= 11 else None
    rssi              = int(data[11]) if len(data) >= 14 else None
    free_heap         = int(data[12]) if len(data) >= 14 else None
    uptime_s          = int(data[13]) if len(data) >= 14 else None
    relay_active      = int(data[14]) if len(data) >= 15 else 0
    soil_moisture     = data[15] if len(data) == 16 else None
    pipeline_pressure = data[15] if len(data) >= 17 else None
    pipeline_flow     = data[16] if len(data) >= 17 else None

    # Identificar dispositivo: primero por header X-Device-MAC, luego por IP
    device_mac = request.headers.get('X-Device-MAC')
    db = get_db()
    if not device_mac:
        mac_row = db.execute(
            "SELECT mac_address FROM device_info WHERE ip_address=?",
            (request.remote_addr,)
        ).fetchone()
        device_mac = mac_row['mac_address'] if mac_row else None

    cursor = db.cursor()
    cursor.execute("""
        INSERT INTO home_weather_station(
            temperature, pressure, temperature_barometer, humidity,
            windSpeed, windDirection, windSpeedFiltered, windDirectionFiltered,
            light, dht_temperature, dht_humidity,
            rssi, free_heap, uptime_s, relay_active,
            pipeline_pressure, pipeline_flow, soil_moisture, device_mac
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, tuple(data[:9]) + (dht_temp, dht_hum, rssi, free_heap, uptime_s,
                            relay_active, pipeline_pressure, pipeline_flow,
                            soil_moisture, device_mac))
    db.commit()
    cursor.close()

    return "OK", 200


@app.route("/average/<int:cantidad_muestras>")
def fetch_data_average(cantidad_muestras):
    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT COUNT(*) FROM home_weather_station;")
    total = cursor.fetchone()[0]
    offset = max(0, total - cantidad_muestras)

    cursor.execute("""
        SELECT
            AVG(temperature), AVG(temperature_barometer), AVG(humidity),
            AVG(pressure), AVG(windSpeed), AVG(windDirection),
            AVG(windSpeedFiltered), AVG(windDirectionFiltered)
        FROM (
            SELECT * FROM home_weather_station
            ORDER BY timestamp ASC
            LIMIT ? OFFSET ?
        )
    """, (cantidad_muestras, offset))
    row = cursor.fetchone()
    cursor.close()

    if not row or row[0] is None:
        return render_template(TEMPLATE_FILE, message="Sin datos suficientes",
                               timestamp=[], temperature=[], temperature_bar=[],
                               humidity=[], pressure=[], windSpeed=[],
                               windDirection=[], windSpeedFiltered=[], windDirectionFiltered=[])

    context = {
        "message": f"Promedio de {cantidad_muestras} muestras",
        "timestamp":             [],
        "temperature":           [row[0]],
        "temperature_bar":       [row[1]],
        "humidity":              [row[2]],
        "pressure":              [row[3]],
        "windSpeed":             [row[4]],
        "windDirection":         [row[5]],
        "windSpeedFiltered":     [row[6]],
        "windDirectionFiltered": [row[7]],
    }
    return render_template(TEMPLATE_FILE, **context)


@app.route("/api/filtrar", methods=["POST"])
def filtrar_datos_api():
    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"error": "JSON inválido"}), 400

    start_date = payload.get('start_date')
    end_date = payload.get('end_date')

    if not start_date or not end_date:
        return jsonify({"error": "Faltan fechas start_date o end_date"}), 400

    mac = payload.get('mac')
    db = get_db()
    cursor = db.cursor()
    if mac:
        cursor.execute("""
            SELECT * FROM home_weather_station
            WHERE timestamp BETWEEN ? AND ? AND device_mac=?
            ORDER BY timestamp ASC
        """, (start_date, end_date, mac))
    else:
        cursor.execute("""
            SELECT * FROM home_weather_station
            WHERE timestamp BETWEEN ? AND ?
            ORDER BY timestamp ASC
        """, (start_date, end_date))
    rows = cursor.fetchall()
    cursor.close()

    return jsonify(rows_to_dict(rows))


@app.route("/api/muestras/<int:n>")
def api_muestras(n):
    """Devuelve las últimas N muestras como JSON para el dashboard React."""
    mac = request.args.get('mac')
    db = get_db()
    cursor = db.cursor()
    if mac:
        cursor.execute(
            "SELECT COUNT(*) FROM home_weather_station WHERE device_mac=?",
            (mac,)
        )
    else:
        cursor.execute("SELECT COUNT(*) FROM home_weather_station;")
    total = cursor.fetchone()[0]
    offset = max(0, total - n)
    if mac:
        cursor.execute("""
            SELECT * FROM home_weather_station WHERE device_mac=?
            ORDER BY timestamp ASC LIMIT ? OFFSET ?
        """, (mac, n, offset))
    else:
        cursor.execute("""
            SELECT * FROM home_weather_station
            ORDER BY timestamp ASC LIMIT ? OFFSET ?
        """, (n, offset))
    rows = cursor.fetchall()
    cursor.close()
    return jsonify(rows_to_dict(rows))


@app.route("/api/device_info", methods=["POST"])
def post_device_info():
    payload = request.get_json(silent=True)
    if not payload:
        return "JSON inválido", 400
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        INSERT INTO device_info(
            chip_model, chip_revision, cpu_freq_mhz, flash_size_mb,
            sdk_version, mac_address, ip_address, relay_count, last_seen
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(mac_address) DO UPDATE SET
            chip_model=excluded.chip_model,
            chip_revision=excluded.chip_revision,
            cpu_freq_mhz=excluded.cpu_freq_mhz,
            flash_size_mb=excluded.flash_size_mb,
            sdk_version=excluded.sdk_version,
            ip_address=excluded.ip_address,
            relay_count=excluded.relay_count,
            last_seen=CURRENT_TIMESTAMP
    """, (
        payload.get("chip_model"),
        payload.get("chip_revision"),
        payload.get("cpu_freq_mhz"),
        payload.get("flash_size_mb"),
        payload.get("sdk_version"),
        payload.get("mac_address"),
        payload.get("ip_address"),
        int(payload.get("relay_count", 1)),
    ))
    db.commit()
    cursor.close()
    logger.info("DeviceInfo actualizado: %s / %s",
                payload.get("chip_model"), payload.get("mac_address"))
    return "OK", 200


@app.route("/api/device_info", methods=["GET"])
def get_device_info():
    mac = request.args.get('mac')
    db = get_db()
    cursor = db.cursor()
    if mac:
        cursor.execute("SELECT * FROM device_info WHERE mac_address=?", (mac,))
        row = cursor.fetchone()
        cursor.close()
        return jsonify(dict(row) if row else {})
    # Sin filtro: devuelve el más reciente (compatibilidad con DeviceStatus)
    cursor.execute("SELECT * FROM device_info ORDER BY last_seen DESC LIMIT 1")
    row = cursor.fetchone()
    cursor.close()
    return jsonify(dict(row) if row else {})


@app.route("/api/devices")
def api_devices():
    """Lista todos los dispositivos conocidos con su último timestamp de lectura."""
    db = get_db()
    rows = db.execute(
        "SELECT * FROM device_info ORDER BY last_seen DESC"
    ).fetchall()

    if rows:
        result = []
        for r in rows:
            d = dict(r)
            latest = db.execute(
                "SELECT timestamp FROM home_weather_station"
                " WHERE device_mac=? ORDER BY timestamp DESC LIMIT 1",
                (r['mac_address'],)
            ).fetchone()
            d['latest_reading'] = latest['timestamp'] if latest else None
            result.append(d)
        return jsonify(result)

    # Fallback: device_info vacía (contenedor recién reiniciado, ESP32 aún no reenvió
    # el DeviceInfo). Inferir dispositivos desde los datos recibidos.
    mac_rows = db.execute(
        "SELECT DISTINCT device_mac FROM home_weather_station"
        " WHERE device_mac IS NOT NULL"
    ).fetchall()
    result = []
    for r in mac_rows:
        mac = r['device_mac']
        latest = db.execute(
            "SELECT timestamp FROM home_weather_station"
            " WHERE device_mac=? ORDER BY timestamp DESC LIMIT 1",
            (mac,)
        ).fetchone()
        result.append({
            'id': mac,
            'chip_model': None,
            'mac_address': mac,
            'relay_count': 1,
            'latest_reading': latest['timestamp'] if latest else None,
        })
    return jsonify(result)


@app.route("/api/latest")
def api_latest():
    """Devuelve el registro más reciente como JSON (útil para auto-refresco)."""
    mac = request.args.get('mac')
    db = get_db()
    cursor = db.cursor()
    if mac:
        cursor.execute("""
            SELECT * FROM home_weather_station WHERE device_mac=?
            ORDER BY timestamp DESC LIMIT 1
        """, (mac,))
    else:
        cursor.execute("""
            SELECT * FROM home_weather_station
            ORDER BY timestamp DESC LIMIT 1
        """)
    rows = cursor.fetchall()
    cursor.close()

    return jsonify(rows_to_dict(rows))


@app.route("/api/relay/command")
def relay_command():
    """El ESP32 consulta el estado deseado de sus relays.
    Devuelve bitmask en texto plano: bit 0 = relay 0, bit 1 = relay 1, etc."""
    mac = request.args.get('mac')
    if mac:
        _relay_ensure(mac)
    states = _relay_get(mac)
    bitmask = sum((1 << s['index']) for s in states if s['desired'])
    return str(bitmask), 200


@app.route("/api/relay", methods=["GET"])
def get_relay():
    """Dashboard: devuelve lista de estados [{index, desired, actual}] para el dispositivo."""
    mac = request.args.get('mac')
    return jsonify(_relay_get(mac))


@app.route("/api/relay", methods=["POST"])
def set_relay():
    """Dashboard: cambia el estado deseado de un relay específico."""
    payload = request.get_json(silent=True)
    if payload is None or "state" not in payload:
        return jsonify({"error": "Falta campo 'state'"}), 400
    mac = payload.get('mac')
    index = int(payload.get('index', 0))
    state = bool(payload['state'])
    if mac:
        _relay_ensure(mac)
    _relay_set_desired(mac, index, state)
    logger.info("Relay %d deseado → %s (mac=%s)", index, "ON" if state else "OFF", mac)
    return jsonify({"index": index, "state": state})


@app.route("/api/relay/ack", methods=["POST"])
def relay_ack():
    """El ESP32 confirma el estado real de sus relays (bitmask)."""
    mac = request.headers.get('X-Device-MAC') or request.args.get('mac')
    body = request.get_data(as_text=True).strip()
    try:
        bitmask = int(body)
    except ValueError:
        bitmask = 0
    if mac:
        states = _relay_get(mac)
        for s in states:
            _relay_set_actual(mac, s['index'], bool((bitmask >> s['index']) & 1))
        logger.info("Relay ACK (mac=%s) bitmask=%d", mac, bitmask)
        return jsonify({"mac": mac, "bitmask": bitmask})
    # Legacy sin mac
    _relay_set_actual(None, 0, bool(bitmask & 1))
    logger.info("Relay ACK (legacy) → %s", "ON" if bitmask & 1 else "OFF")
    return jsonify({"actual": bool(bitmask & 1)})


@app.route("/api/irrigation/reset", methods=["POST"])
def irrigation_reset():
    """Registra un reset manual del contador de consumo."""
    db = get_db()
    db.execute("INSERT INTO irrigation_resets DEFAULT VALUES")
    db.commit()
    logger.info("Reset de consumo de riego registrado")
    return jsonify({"ok": True})


@app.route("/api/irrigation/stats")
def irrigation_stats():
    """Estadísticas de consumo y ahorro de riego del mes actual.

    Cada registro con relay_active=1 representa ~20s de válvula abierta.
    Caudal nominal: 5 L/min → 5/60 L/s.
    Baseline de ahorro: 15 L/día de riego manual diario.
    Solo cuenta registros posteriores al último reset manual (si existe).
    """
    cfg = _get_settings()
    FLOW_LPS = float(cfg.get('flow_lpm', '5.0')) / 60.0
    INTERVAL_S = 20
    BASELINE_DAILY_L = float(cfg.get('baseline_daily_l', '15.0'))

    db = get_db()
    cursor = db.cursor()

    # Fecha del último reset (o inicio del mes si no hay ninguno)
    cursor.execute("""
        SELECT COALESCE(MAX(reset_at), strftime('%Y-%m-01T00:00:00', 'now')) AS since
        FROM irrigation_resets
        WHERE reset_at >= strftime('%Y-%m-01', 'now')
    """)
    since = cursor.fetchone()["since"]

    # Registros con relay activo desde el último reset, agrupados por día
    # relay_active es bitmask: >0 significa al menos una válvula abierta
    cursor.execute("""
        SELECT DATE(timestamp) AS day, COUNT(*) AS cnt
        FROM home_weather_station
        WHERE relay_active > 0
          AND timestamp >= ?
        GROUP BY DATE(timestamp)
        ORDER BY day ASC
    """, (since,))
    daily_rows = cursor.fetchall()

    # Total registros con relay activo desde el último reset
    cursor.execute("""
        SELECT COUNT(*) FROM home_weather_station
        WHERE relay_active > 0
          AND timestamp >= ?
    """, (since,))
    total_active = cursor.fetchone()[0]

    # Total registros con relay activo hoy
    cursor.execute("""
        SELECT COUNT(*) FROM home_weather_station
        WHERE relay_active > 0
          AND DATE(timestamp) = DATE('now')
          AND timestamp >= ?
    """, (since,))
    today_active = cursor.fetchone()[0]

    cursor.close()

    monthly_seconds = total_active * INTERVAL_S
    monthly_liters = round(monthly_seconds * FLOW_LPS, 1)
    today_seconds = today_active * INTERVAL_S
    today_liters = round(today_seconds * FLOW_LPS, 1)

    days_elapsed = datetime.date.today().day
    baseline_liters = round(days_elapsed * BASELINE_DAILY_L, 1)
    savings_liters = round(max(0.0, baseline_liters - monthly_liters), 1)

    daily = [
        {
            "date": row["day"],
            "seconds": row["cnt"] * INTERVAL_S,
            "liters": round(row["cnt"] * INTERVAL_S * FLOW_LPS, 1),
        }
        for row in daily_rows
    ]

    return jsonify({
        "monthly_seconds": monthly_seconds,
        "monthly_liters": monthly_liters,
        "today_seconds": today_seconds,
        "today_liters": today_liters,
        "baseline_liters": baseline_liters,
        "savings_liters": savings_liters,
        "days_elapsed": days_elapsed,
        "daily": daily,
    })


@app.route("/api/irrigation/history")
def irrigation_history():
    """Consumo agrupado por periodo (day/week/month) para el gráfico de barras."""
    period = request.args.get('period', 'day')
    if period not in ('day', 'week', 'month'):
        period = 'day'

    cfg = _get_settings()
    flow_lps = float(cfg.get('flow_lpm', '5.0')) / 60.0
    interval_s = 20

    if period == 'month':
        group_expr = "strftime('%Y-%m', timestamp)"
        offset = "-12 months"
    elif period == 'week':
        group_expr = "strftime('%Y-W%W', timestamp)"
        offset = "-16 weeks"
    else:
        group_expr = "DATE(timestamp)"
        offset = "-30 days"

    rows = get_db().execute(f"""
        SELECT {group_expr} AS period_key, COUNT(*) AS cnt
        FROM home_weather_station
        WHERE relay_active > 0
          AND timestamp >= DATE('now', :offset)
        GROUP BY {group_expr}
        ORDER BY period_key ASC
    """, {"offset": offset}).fetchall()

    return jsonify([
        {
            "period": r["period_key"],
            "liters": round(r["cnt"] * interval_s * flow_lps, 1),
            "seconds": r["cnt"] * interval_s,
        }
        for r in rows
    ])


@app.route("/api/irrigation/sessions")
def irrigation_sessions():
    """Sesiones individuales de riego.

    Agrupa registros consecutivos relay_active=1 con gaps < gap_s segundos.
    Devuelve las 60 sesiones más recientes en orden descendente.
    """
    cfg = _get_settings()
    flow_lps = float(cfg.get('flow_lpm', '5.0')) / 60.0
    interval_s = 20
    gap_s = 60  # salto > 60s entre registros activos → nueva sesión

    rows = get_db().execute("""
        SELECT timestamp
        FROM home_weather_station
        WHERE relay_active > 0
          AND timestamp >= datetime('now', '-180 days')
        ORDER BY timestamp ASC
    """).fetchall()

    sessions = []
    if not rows:
        return jsonify([])

    session_start = None
    session_end = None
    session_count = 0
    prev_ts = None

    def _parse(ts_str):
        s = str(ts_str).replace(' ', 'T').rstrip('Z')
        return datetime.datetime.fromisoformat(s)

    def _close_session():
        sessions.append({
            "start": str(session_start).replace(' ', 'T'),
            "end": str(session_end).replace(' ', 'T'),
            "duration_s": session_count * interval_s,
            "liters": round(session_count * interval_s * flow_lps, 1),
        })

    for row in rows:
        ts = _parse(row["timestamp"])
        if prev_ts is None:
            session_start = ts
            session_end = ts
            session_count = 1
        else:
            gap = (ts - prev_ts).total_seconds()
            if gap > gap_s:
                _close_session()
                session_start = ts
                session_end = ts
                session_count = 1
            else:
                session_end = ts
                session_count += 1
        prev_ts = ts

    if session_start is not None:
        _close_session()

    sessions.reverse()
    return jsonify(sessions[:60])


# ── Pipeline: simulación de caudalímetro y sensor de presión ─────────────────

def _db_rows_to_pipeline(rows, scenario):
    """Convierte filas de DB con pipeline_pressure/flow a dicts para detect_leaks."""
    return [
        {
            "timestamp":    row["timestamp"],
            "valve_open":   bool(row["relay_active"]),
            "scenario":     scenario,
            "pressure_bar": row["pipeline_pressure"],
            "flow_lpm":     row["pipeline_flow"],
        }
        for row in rows
        if row["pipeline_pressure"] is not None and row["pipeline_flow"] is not None
    ]


@app.route("/api/pipeline/status")
def pipeline_status():
    """Estado actual del pipeline + análisis de detección de fugas.

    Usa datos reales del ESP32 (pipeline_pressure/flow de la DB) si existen.
    Si la DB no tiene aún datos de pipeline, genera un histórico sintético
    como fallback para que la vista funcione desde el primer arranque.
    """
    cfg = _get_settings()
    scenario = cfg.get('pipeline_scenario', 'normal')
    nominal_flow = float(cfg.get('flow_lpm', '5.0'))
    states = _relay_get()
    actual = states[0]['actual'] if states else False

    rows = get_db().execute("""
        SELECT timestamp, relay_active, pipeline_pressure, pipeline_flow
        FROM home_weather_station
        ORDER BY timestamp DESC
        LIMIT 90
    """).fetchall()

    real_history = _db_rows_to_pipeline(list(reversed(rows)), scenario)
    using_db = bool(real_history)

    if using_db:
        history = real_history
        current = history[-1]
    else:
        # Fallback: sin datos de pipeline en DB aún → simular
        history = build_synthetic_history(90, actual, scenario, nominal_flow)
        now = datetime.datetime.now(datetime.timezone.utc)
        current = simulate_reading(now, actual, scenario, nominal_flow)

    detection = detect_leaks(history)

    return jsonify({
        "current":   current,
        "detection": detection,
        "config": {
            "scenario":             scenario,
            "nominal_flow_lpm":     nominal_flow,
            "static_pressure_bar":  STATIC_PRESSURE_BAR,
            "dynamic_pressure_bar": DYNAMIC_PRESSURE_BAR,
            "source":               "db" if using_db else "sim",
        },
    })


@app.route("/api/pipeline/readings")
def pipeline_readings():
    """Histórico de lecturas de presión y caudal para gráficos.

    Usa datos reales del ESP32 si existen; si no, fallback a simulación.
    Query params:
      n    (int, máx 500, defecto 90) — para modo en vivo
      from (datetime str)             — rango histórico inicio
      to   (datetime str)             — rango histórico fin
    Si se proveen from/to se ignora n y no hay fallback a simulación.
    """
    cfg = _get_settings()
    scenario = cfg.get('pipeline_scenario', 'normal')
    nominal_flow = float(cfg.get('flow_lpm', '5.0'))

    from_dt = request.args.get('from')
    to_dt   = request.args.get('to')

    if from_dt and to_dt:
        rows = get_db().execute("""
            SELECT timestamp, relay_active, pipeline_pressure, pipeline_flow
            FROM home_weather_station
            WHERE timestamp BETWEEN ? AND ?
            ORDER BY timestamp ASC
        """, (from_dt, to_dt)).fetchall()
        readings = _db_rows_to_pipeline(list(rows), scenario)
        return jsonify(readings)

    n = min(int(request.args.get('n', 90)), 500)
    rows = get_db().execute("""
        SELECT timestamp, relay_active, pipeline_pressure, pipeline_flow
        FROM home_weather_station
        ORDER BY timestamp DESC
        LIMIT ?
    """, (n,)).fetchall()

    readings = _db_rows_to_pipeline(list(reversed(rows)), scenario)

    if not readings:
        states = _relay_get()
        actual = states[0]['actual'] if states else False
        readings = build_synthetic_history(n, actual, scenario, nominal_flow)

    return jsonify(readings)


@app.route("/api/pipeline/scenario", methods=["GET"])
def get_pipeline_scenario():
    """El ESP32 consulta este endpoint para saber el escenario activo.
    Devuelve texto plano: 'normal', 'leak' o 'burst'."""
    cfg = _get_settings()
    return cfg.get('pipeline_scenario', 'normal'), 200


@app.route("/api/pipeline/scenario", methods=["POST"])
def set_pipeline_scenario():
    """Cambia el escenario de simulación del pipeline.

    Body JSON: {"scenario": "normal" | "leak" | "burst"}
    """
    payload = request.get_json(silent=True)
    if not payload or 'scenario' not in payload:
        return jsonify({"error": "Falta campo 'scenario'"}), 400
    scenario = payload['scenario']
    if scenario not in ('normal', 'leak', 'burst'):
        return jsonify({"error": "Escenario inválido. Use: normal, leak, burst"}), 400

    db = get_db()
    db.execute(
        "INSERT OR REPLACE INTO app_settings(key, value) VALUES ('pipeline_scenario', ?)",
        (scenario,)
    )
    db.commit()
    logger.info("Pipeline scenario → %s", scenario)
    return jsonify({"scenario": scenario})


# Inicializar DB una sola vez al arrancar
with app.app_context():
    conn = get_db_connection()
    create_tables(conn)
    conn.close()

if __name__ == "__main__":
    host = os.getenv("FLASK_HOST", "0.0.0.0")
    port = int(os.getenv("FLASK_PORT", 7000))
    app.run(host=host, port=port, debug=False)
