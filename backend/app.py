# flake8: noqa: E501

import datetime
import logging
import os

import bcrypt
from dotenv import load_dotenv
from flask import Flask, g, jsonify, redirect, render_template, request
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    get_jwt_identity,
    jwt_required,
)

load_dotenv()

import mqtt_client
from database import create_tables, get_db_connection, init_pool
from pipeline_sim import (
    DYNAMIC_PRESSURE_BAR,
    STATIC_PRESSURE_BAR,
    build_synthetic_history,
    detect_leaks,
    simulate_reading,
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

app.config["JWT_SECRET_KEY"] = os.environ.get(
    "JWT_SECRET_KEY",
    "cambia_esto_en_produccion",
)
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = datetime.timedelta(days=30)
jwt = JWTManager(app)

TEMPLATE_FILE = "index.html"

# Inicializar pool de conexiones PostgreSQL al arrancar
init_pool()


def get_db():
    """Conexión única a la DB por petición (devuelta al pool al finalizar)."""
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
            " VALUES (?, ?, 0, 0)", (mac, i))
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
        db.execute("UPDATE relay_state SET desired=? WHERE id=1",
                   (1 if state else 0,))
    db.commit()


def _relay_set_actual(mac, index, state):
    db = get_db()
    if mac:
        db.execute(
            "UPDATE relay_state SET actual=? WHERE device_mac=? AND relay_index=?",
            (1 if state else 0, mac, index)
        )
    else:
        db.execute("UPDATE relay_state SET actual=? WHERE id=1",
                   (1 if state else 0,))
    db.commit()


# ── Autenticación ────────────────────────────────────────────────────────────

@app.route("/api/auth/register", methods=["POST"])
def auth_register():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    name = (data.get("display_name") or "").strip()
    if not email or not password:
        return jsonify({"error": "Faltan email o contraseña"}), 400
    if len(password) < 8:
        return jsonify(
            {"error": "La contraseña debe tener al menos 8 caracteres"}), 400
    db = get_db()
    if db.execute("SELECT id FROM users WHERE email=%s", (email,)).fetchone():
        return jsonify({"error": "Email ya registrado"}), 409
    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    db.execute(
        "INSERT INTO users(email, password_hash, display_name) VALUES (%s, %s, %s)",
        (email, pw_hash, name or email.split("@")[0])
    )
    db.commit()
    user = db.execute(
        "SELECT id, email, display_name, role FROM users WHERE email=%s",
        (email,),
    ).fetchone()
    token = create_access_token(identity=str(user["id"]))
    return jsonify({
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "display_name": user["display_name"],
            "role": user["role"],
        },
    }), 201


@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not email or not password:
        return jsonify({"error": "Faltan email o contraseña"}), 400
    db = get_db()
    user = db.execute(
        "SELECT id, email, display_name, role, password_hash, is_active FROM users WHERE email=%s",
        (email,)
    ).fetchone()
    if not user or not bcrypt.checkpw(
            password.encode(),
            user["password_hash"].encode()):
        return jsonify({"error": "Credenciales incorrectas"}), 401
    if not user["is_active"]:
        return jsonify({"error": "Cuenta desactivada"}), 403
    token = create_access_token(identity=str(user["id"]))
    return jsonify({
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "display_name": user["display_name"],
            "role": user["role"],
        },
    })


@app.route("/api/auth/me")
@jwt_required()
def auth_me():
    user_id = int(get_jwt_identity())
    user = get_db().execute(
        "SELECT id, email, display_name, role FROM users WHERE id=%s",
        (user_id,),
    ).fetchone()
    if not user:
        return jsonify({"error": "Usuario no encontrado"}), 404
    return jsonify({"id": user["id"],
                    "email": user["email"],
                    "display_name": user["display_name"],
                    "role": user["role"]})


# ── Guard JWT para rutas /api/ ──────────────────────────────────────────
# Rutas públicas: llamadas por ESP32, mosquitto o el propio sistema de auth.
_JWT_PUBLIC = {
    "/api/auth/register",
    "/api/auth/login",
    "/api/mqtt/auth",
    "/api/mqtt/acl",
    "/api/devices/register_factory",
}


@app.before_request
def _require_jwt():
    if not request.path.startswith("/api/"):
        return  # ficheros estáticos del frontend
    if request.path in _JWT_PUBLIC:
        return  # auth y endpoints internos
    # GET de configuración del pipeline → lectura por el ESP32 sin JWT
    if (
        request.path in ("/api/pipeline/scenario", "/api/pipeline/config")
        and request.method == "GET"
    ):
        return
    # POST /api/device_info y GET+POST /api/relay/command y /api/relay/ack →
    # ESP32
    if request.path == "/api/device_info" and request.method == "POST":
        return
    if request.path in ("/api/relay/command", "/api/relay/ack"):
        return
    from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request
    try:
        verify_jwt_in_request()
        g.user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Autenticación requerida",
                       "code": "missing_token"}), 401


# ── Configuración de la aplicación ───────────────────────────────────────────

def _get_settings():
    rows = get_db().execute("SELECT key, value FROM app_settings").fetchall()
    return {r['key']: r['value'] for r in rows}


def _get_int_setting(cfg, key, default, min_value=None, max_value=None):
    try:
        value = int(float(cfg.get(key, default)))
    except (TypeError, ValueError):
        value = default
    if min_value is not None:
        value = max(min_value, value)
    if max_value is not None:
        value = min(max_value, value)
    return value


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


def _user_owns_device(user_id, mac):
    if not mac:
        return False
    row = get_db().execute(
        "SELECT 1 FROM user_devices WHERE user_id=%s AND mac_address=%s",
        (user_id, mac)
    ).fetchone()
    return bool(row)


def _resolve_user_mac(user_id, requested_mac=None):
    if requested_mac:
        mac = str(requested_mac).strip().upper()
        return mac if _user_owns_device(user_id, mac) else None
    row = get_db().execute(
        "SELECT mac_address FROM user_devices WHERE user_id=%s ORDER BY claimed_at DESC LIMIT 1",
        (user_id,)
    ).fetchone()
    return row['mac_address'] if row else None


def _publish_pipeline_config(
        mac, scenario=None, mode=None, telemetry_interval_s=None,
        config_sync_interval_s=None, display_timeout_s=None):
    """Envía la configuración de pipeline por MQTT al dispositivo indicado."""
    if not mac:
        return False

    finca_row = get_db().execute(
        "SELECT finca_id FROM device_info WHERE mac_address=?",
        (mac,)
    ).fetchone()
    if not finca_row or not finca_row['finca_id']:
        return False

    payload = {
        "type": "pipeline_config",
        "mac": mac,
    }
    if scenario in ('normal', 'leak', 'burst'):
        payload["pipeline_scenario"] = scenario
    if mode in ('sim', 'real'):
        payload["pipeline_mode"] = mode
    if telemetry_interval_s is not None:
        payload["telemetry_interval_s"] = int(telemetry_interval_s)
    if config_sync_interval_s is not None:
        payload["config_sync_interval_s"] = int(config_sync_interval_s)
    if display_timeout_s is not None:
        payload["display_timeout_s"] = int(display_timeout_s)

    if len(payload) <= 2:
        return False
    return mqtt_client.publish_cmd(finca_row['finca_id'], payload)


def parse_message_data(message):
    """Parsea el mensaje CSV recibido del ESP32."""
    try:
        parts = message.strip().split(",")
        if len(parts) not in (9, 11, 14, 15, 16, 17, 18):
            return None
        return [float(v) for v in parts]
    except ValueError:
        return None


def rows_to_dict(rows):
    """Convierte filas de DB al formato esperado por los gráficos."""
    return {
        "timestamp": [r["timestamp"] for r in rows],
        "temperature": [r["temperature"] for r in rows],
        "temperature_bar": [r["temperature_barometer"] for r in rows],
        "humidity": [r["humidity"] for r in rows],
        "pressure": [r["pressure"] for r in rows],
        "windSpeed": [r["windSpeed"] for r in rows],
        "windDirection": [r["windDirection"] for r in rows],
        "windSpeedFiltered": [r["windSpeedFiltered"] for r in rows],
        "windDirectionFiltered": [r["windDirectionFiltered"] for r in rows],
        "light": [r["light"] for r in rows],
        "dht_temperature": [r["dht_temperature"] for r in rows],
        "dht_humidity": [r["dht_humidity"] for r in rows],
        "rssi": [r["rssi"] for r in rows],
        "free_heap": [r["free_heap"] for r in rows],
        "uptime_s": [r["uptime_s"] for r in rows],
        "relay_active": [r["relay_active"] for r in rows],
        "pipeline_pressure": [r["pipeline_pressure"] for r in rows],
        "pipeline_flow": [r["pipeline_flow"] for r in rows],
        "soil_moisture": [r["soil_moisture"] for r in rows],
    }


# --- RUTAS ---

@app.route("/")
def fetch_data():
    # En desarrollo local, el frontend moderno vive en Vite (:5173).
    # Redirigimos la raíz para evitar abrir por error la plantilla legacy.
    return redirect("http://localhost:5173", code=302)


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
        return "Error: se esperan 9, 11, 14, 15, 16, 17 o 18 valores separados por coma", 400

    dht_temp = data[9] if len(data) >= 11 else None
    dht_hum = data[10] if len(data) >= 11 else None
    rssi = int(data[11]) if len(data) >= 14 else None
    free_heap = int(data[12]) if len(data) >= 14 else None
    uptime_s = int(data[13]) if len(data) >= 14 else None
    relay_active = int(data[14]) if len(data) >= 15 else 0
    soil_moisture = data[15] if len(data) == 16 else (
        data[17] if len(data) >= 18 else None)
    pipeline_pressure = data[15] if len(data) >= 17 else None
    pipeline_flow = data[16] if len(data) >= 17 else None

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
        return render_template(
            TEMPLATE_FILE,
            message="Sin datos suficientes",
            timestamp=[],
            temperature=[],
            temperature_bar=[],
            humidity=[],
            pressure=[],
            windSpeed=[],
            windDirection=[],
            windSpeedFiltered=[],
            windDirectionFiltered=[])

    context = {
        "message": f"Promedio de {cantidad_muestras} muestras",
        "timestamp": [],
        "temperature": [row[0]],
        "temperature_bar": [row[1]],
        "humidity": [row[2]],
        "pressure": [row[3]],
        "windSpeed": [row[4]],
        "windDirection": [row[5]],
        "windSpeedFiltered": [row[6]],
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

    user_id = int(get_jwt_identity())
    requested_mac = payload.get('mac')
    mac = _resolve_user_mac(user_id, requested_mac)
    if requested_mac and not mac:
        return jsonify({"error": "Acceso denegado al dispositivo"}), 403
    if not mac:
        return jsonify(rows_to_dict([]))

    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        SELECT * FROM home_weather_station
        WHERE timestamp BETWEEN ? AND ? AND device_mac=?
        ORDER BY timestamp ASC
    """, (start_date, end_date, mac))
    rows = cursor.fetchall()
    cursor.close()

    return jsonify(rows_to_dict(rows))


@app.route("/api/muestras/<int:n>")
def api_muestras(n):
    """Devuelve las últimas N muestras del dispositivo del usuario."""
    user_id = int(get_jwt_identity())
    requested_mac = request.args.get('mac')
    mac = _resolve_user_mac(user_id, requested_mac)
    if requested_mac and not mac:
        return jsonify({"error": "Acceso denegado al dispositivo"}), 403
    if not mac:
        return jsonify(rows_to_dict([]))

    db = get_db()
    cursor = db.cursor()
    cursor.execute(
        "SELECT COUNT(*) FROM home_weather_station WHERE device_mac=?",
        (mac,)
    )
    total = cursor.fetchone()[0]
    offset = max(0, total - n)
    cursor.execute("""
        SELECT * FROM home_weather_station WHERE device_mac=?
        ORDER BY timestamp ASC LIMIT ? OFFSET ?
    """, (mac, n, offset))
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
            sdk_version, mac_address, ip_address, relay_count, firmware_version, last_seen
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(mac_address) DO UPDATE SET
            chip_model=excluded.chip_model,
            chip_revision=excluded.chip_revision,
            cpu_freq_mhz=excluded.cpu_freq_mhz,
            flash_size_mb=excluded.flash_size_mb,
            sdk_version=excluded.sdk_version,
            ip_address=excluded.ip_address,
            relay_count=excluded.relay_count,
            firmware_version=excluded.firmware_version,
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
        payload.get("firmware_version"),
    ))
    db.commit()
    cursor.close()
    logger.info("DeviceInfo actualizado: %s / %s",
                payload.get("chip_model"), payload.get("mac_address"))
    return "OK", 200


@app.route("/api/device_info", methods=["GET"])
def get_device_info():
    user_id = int(get_jwt_identity())
    requested_mac = request.args.get('mac')
    mac = _resolve_user_mac(user_id, requested_mac)
    if requested_mac and not mac:
        return jsonify({"error": "Acceso denegado al dispositivo"}), 403
    if not mac:
        return jsonify({})

    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT * FROM device_info WHERE mac_address=?", (mac,))
    row = cursor.fetchone()
    cursor.close()
    return jsonify(dict(row) if row else {})


def _get_user_devices_rows(user_id):
    """Lista solo los dispositivos vinculados al usuario autenticado."""
    db = get_db()
    rows = db.execute("""
        SELECT
            COALESCE(di.mac_address, ud.mac_address) AS mac_address,
            di.chip_model, di.relay_count, di.ip_address, di.last_seen, di.finca_id,
            ud.nickname, ud.claimed_at,
            dc.serial_number, dc.claimed_by_finca_id,
            (SELECT timestamp FROM home_weather_station
             WHERE device_mac = ud.mac_address
             ORDER BY timestamp DESC LIMIT 1) AS latest_reading
        FROM user_devices ud
        LEFT JOIN device_info di ON di.mac_address = ud.mac_address
        LEFT JOIN device_credentials dc ON dc.mac = ud.mac_address
        WHERE ud.user_id = %s
        ORDER BY ud.claimed_at DESC
    """, (user_id,)).fetchall()
    return [dict(r) for r in rows]


@app.route("/api/devices")
def api_devices():
    """Lista los dispositivos vinculados al usuario autenticado."""
    user_id = int(get_jwt_identity())
    return jsonify(_get_user_devices_rows(user_id))


@app.route("/api/latest")
def api_latest():
    """Devuelve el registro más reciente del dispositivo del usuario."""
    user_id = int(get_jwt_identity())
    requested_mac = request.args.get('mac')
    mac = _resolve_user_mac(user_id, requested_mac)
    if requested_mac and not mac:
        return jsonify({"error": "Acceso denegado al dispositivo"}), 403
    if not mac:
        return jsonify(rows_to_dict([]))

    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        SELECT * FROM home_weather_station WHERE device_mac=?
        ORDER BY timestamp DESC LIMIT 1
    """, (mac,))
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
    """Dashboard: devuelve estados solo del dispositivo del usuario."""
    user_id = int(get_jwt_identity())
    requested_mac = request.args.get('mac')
    mac = _resolve_user_mac(user_id, requested_mac)
    if requested_mac and not mac:
        return jsonify({"error": "Acceso denegado al dispositivo"}), 403
    if not mac:
        return jsonify([])
    _relay_ensure(mac)
    return jsonify(_relay_get(mac))


@app.route("/api/relay", methods=["POST"])
def set_relay():
    """Dashboard: cambia el estado deseado de un relay del usuario."""
    payload = request.get_json(silent=True)
    if payload is None or "state" not in payload:
        return jsonify({"error": "Falta campo 'state'"}), 400
    user_id = int(get_jwt_identity())
    requested_mac = payload.get('mac')
    mac = _resolve_user_mac(user_id, requested_mac)
    if requested_mac and not mac:
        return jsonify({"error": "Acceso denegado al dispositivo"}), 403
    if not mac:
        return jsonify({"error": "No hay dispositivo seleccionado"}), 400
    index = int(payload.get('index', 0))
    state = bool(payload['state'])
    _relay_ensure(mac)
    _relay_set_desired(mac, index, state)
    logger.info("Relay %d deseado → %s (mac=%s)",
                index, "ON" if state else "OFF", mac)

    # Si el dispositivo tiene finca_id, envía el comando también por MQTT
    if mac:
        db = get_db()
        finca_row = db.execute(
            "SELECT finca_id FROM device_info WHERE mac_address=?", (mac,)
        ).fetchone()
        if finca_row and finca_row['finca_id']:
            mqtt_client.publish_cmd(finca_row['finca_id'], {
                "relay": index,
                "state": state,
            })
            # Actualizar actual de forma optimista — QoS 1 garantiza entrega.
            # La telemetría corregirá cualquier discrepancia en el siguiente
            # ciclo.
            _relay_set_actual(mac, index, state)

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
        _relay_ensure(mac)
        states = _relay_get(mac)
        for s in states:
            _relay_set_actual(mac, s['index'], bool(
                (bitmask >> s['index']) & 1))
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
        SELECT COALESCE(MAX(reset_at), date_trunc('month', now())) AS since
        FROM irrigation_resets
        WHERE reset_at >= date_trunc('month', now())
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
          AND DATE(timestamp) = CURRENT_DATE
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
        group_expr = "to_char(timestamp, 'YYYY-MM')"
        offset = "-12 months"
    elif period == 'week':
        group_expr = "to_char(timestamp, 'YYYY-\"W\"WW')"
        offset = "-16 weeks"
    else:
        group_expr = "to_char(timestamp, 'YYYY-MM-DD')"
        offset = "-30 days"

    rows = get_db().execute(f"""
        SELECT {group_expr} AS period_key, COUNT(*) AS cnt
        FROM home_weather_station
        WHERE relay_active > 0
          AND timestamp >= now() + interval %s
        GROUP BY {group_expr}
        ORDER BY period_key ASC
    """, (offset,)).fetchall()

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
          AND timestamp >= now() - INTERVAL '180 days'
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
            "timestamp": row["timestamp"],
            "valve_open": bool(row["relay_active"]),
            "scenario": scenario,
            "pressure_bar": row["pipeline_pressure"],
            "flow_lpm": row["pipeline_flow"],
        }
        for row in rows
        if row["pipeline_pressure"] is not None and row["pipeline_flow"] is not None
    ]


def _fetch_pipeline_rows(mac, limit=None, from_dt=None, to_dt=None):
    """Devuelve lecturas de pipeline deduplicadas por timestamp para una MAC."""
    if not mac:
        return []

    where = [
        "device_mac=?",
        "pipeline_pressure IS NOT NULL",
        "pipeline_flow IS NOT NULL",
    ]
    params = [mac]

    if from_dt and to_dt:
        where.append("timestamp BETWEEN ? AND ?")
        params.extend([from_dt, to_dt])

    order = "ASC" if (from_dt and to_dt) else "DESC"
    query = f"""
        SELECT timestamp, relay_active, pipeline_pressure, pipeline_flow
        FROM (
            SELECT DISTINCT ON (timestamp)
                   id, timestamp, relay_active, pipeline_pressure, pipeline_flow
            FROM home_weather_station
            WHERE {' AND '.join(where)}
            ORDER BY timestamp, id DESC
        ) dedup
        ORDER BY timestamp {order}
    """

    if limit is not None:
        query += "\nLIMIT ?"
        params.append(limit)

    return get_db().execute(query, tuple(params)).fetchall()


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
    user_id = int(get_jwt_identity())
    requested_mac = request.args.get('mac')
    mac = _resolve_user_mac(user_id, requested_mac) if user_id else None
    if requested_mac and not mac:
        return jsonify({"error": "Dispositivo no autorizado"}), 403

    states = _relay_get(mac)
    actual = states[0]['actual'] if states else False

    rows = _fetch_pipeline_rows(mac, limit=90)

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

    mode = cfg.get('pipeline_mode', 'sim')
    source = "db" if using_db else (
        "sim-fallback" if mode == 'real' else "sim")

    return jsonify({
        "current": current,
        "detection": detection,
        "config": {
            "scenario": scenario,
            "mode": mode,
            "nominal_flow_lpm": nominal_flow,
            "static_pressure_bar": STATIC_PRESSURE_BAR,
            "dynamic_pressure_bar": DYNAMIC_PRESSURE_BAR,
            "source": source,
            "telemetry_interval_s": _get_int_setting(
                cfg, 'telemetry_interval_s', 20, min_value=5, max_value=3600),
            "config_sync_interval_s": _get_int_setting(
                cfg, 'config_sync_interval_s', 20, min_value=5, max_value=3600),
            "display_timeout_s": _get_int_setting(
                cfg, 'display_timeout_s', 60, min_value=0, max_value=3600),
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
    user_id = int(get_jwt_identity())
    requested_mac = request.args.get('mac')
    mac = _resolve_user_mac(user_id, requested_mac) if user_id else None
    if requested_mac and not mac:
        return jsonify({"error": "Dispositivo no autorizado"}), 403

    from_dt = request.args.get('from')
    to_dt = request.args.get('to')

    if from_dt and to_dt:
        rows = _fetch_pipeline_rows(mac, from_dt=from_dt, to_dt=to_dt)
        readings = _db_rows_to_pipeline(list(rows), scenario)
        return jsonify(readings)

    n = min(int(request.args.get('n', 90)), 500)
    rows = _fetch_pipeline_rows(mac, limit=n)

    readings = _db_rows_to_pipeline(list(reversed(rows)), scenario)

    if not readings:
        states = _relay_get(mac)
        actual = states[0]['actual'] if states else False
        readings = build_synthetic_history(n, actual, scenario, nominal_flow)

    return jsonify(readings)


@app.route("/api/pipeline/config", methods=["GET"])
def get_pipeline_config():
    """Devuelve la configuración activa del pipeline para dashboard y ESP32."""
    cfg = _get_settings()
    return jsonify({
        "scenario": cfg.get('pipeline_scenario', 'normal'),
        "mode": cfg.get('pipeline_mode', 'sim'),
        "telemetry_interval_s": _get_int_setting(
            cfg, 'telemetry_interval_s', 20, min_value=5, max_value=3600),
        "config_sync_interval_s": _get_int_setting(
            cfg, 'config_sync_interval_s', 20, min_value=5, max_value=3600),
        "display_timeout_s": _get_int_setting(
            cfg, 'display_timeout_s', 60, min_value=0, max_value=3600),
    })


@app.route("/api/pipeline/scenario", methods=["GET"])
def get_pipeline_scenario():
    """Compatibilidad con firmware anterior: devuelve solo el escenario en texto plano."""
    cfg = _get_settings()
    return cfg.get('pipeline_scenario', 'normal'), 200


@app.route("/api/pipeline/config", methods=["POST"])
def set_pipeline_config():
    """Actualiza la configuración de simulación/lectura del pipeline.

    Body JSON: {"scenario": "normal"|"leak"|"burst", "mode": "sim"|"real", "mac": "..."}
    """
    payload = request.get_json(silent=True) or {}
    if not payload:
        return jsonify({"error": "JSON requerido"}), 400

    scenario = payload.get('scenario')
    mode = payload.get('mode')

    if scenario is not None and scenario not in ('normal', 'leak', 'burst'):
        return jsonify(
            {"error": "Escenario inválido. Use: normal, leak, burst"}), 400
    if mode is not None and mode not in ('sim', 'real'):
        return jsonify({"error": "Modo inválido. Use: sim, real"}), 400

    def _parse_int_field(name, min_value, max_value):
        raw = payload.get(name)
        if raw in (None, ""):
            return None, None
        try:
            value = int(raw)
        except (TypeError, ValueError):
            return None, f"{name} debe ser un entero"
        if value < min_value or value > max_value:
            return None, (
                f"{name} fuera de rango. Use un valor entre "
                f"{min_value} y {max_value}")
        return value, None

    telemetry_interval_s, telemetry_error = _parse_int_field(
        'telemetry_interval_s', 5, 3600)
    if telemetry_error:
        return jsonify({"error": telemetry_error}), 400

    config_sync_interval_s, sync_error = _parse_int_field(
        'config_sync_interval_s', 5, 3600)
    if sync_error:
        return jsonify({"error": sync_error}), 400

    display_timeout_s, display_error = _parse_int_field(
        'display_timeout_s', 0, 3600)
    if display_error:
        return jsonify({"error": display_error}), 400

    if all(v is None for v in (
            scenario, mode, telemetry_interval_s,
            config_sync_interval_s, display_timeout_s)):
        return jsonify({
            "error": "Debe enviar scenario, mode o un ajuste del dispositivo"
        }), 400

    user_id = int(get_jwt_identity())
    requested_mac = payload.get('mac')
    mac = _resolve_user_mac(user_id, requested_mac)
    if requested_mac and not mac:
        return jsonify({"error": "Acceso denegado al dispositivo"}), 403

    db = get_db()
    if scenario is not None:
        db.execute(
            "INSERT INTO app_settings(key, value) VALUES ('pipeline_scenario', ?)"
            " ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", (scenario,))
    if mode is not None:
        db.execute(
            "INSERT INTO app_settings(key, value) VALUES ('pipeline_mode', ?)"
            " ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            (mode,)
        )
    if telemetry_interval_s is not None:
        db.execute(
            "INSERT INTO app_settings(key, value) VALUES ('telemetry_interval_s', ?)"
            " ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            (str(telemetry_interval_s),)
        )
    if config_sync_interval_s is not None:
        db.execute(
            "INSERT INTO app_settings(key, value) VALUES ('config_sync_interval_s', ?)"
            " ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            (str(config_sync_interval_s),)
        )
    if display_timeout_s is not None:
        db.execute(
            "INSERT INTO app_settings(key, value) VALUES ('display_timeout_s', ?)"
            " ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            (str(display_timeout_s),)
        )
    db.commit()

    dispatched = _publish_pipeline_config(
        mac,
        scenario=scenario,
        mode=mode,
        telemetry_interval_s=telemetry_interval_s,
        config_sync_interval_s=config_sync_interval_s,
        display_timeout_s=display_timeout_s,
    ) if mac else False
    cfg = _get_settings()
    logger.info(
        "Pipeline config → scenario=%s mode=%s telemetry=%ss sync=%ss display=%ss mac=%s mqtt=%s",
        cfg.get('pipeline_scenario', 'normal'),
        cfg.get('pipeline_mode', 'sim'),
        cfg.get('telemetry_interval_s', '20'),
        cfg.get('config_sync_interval_s', '20'),
        cfg.get('display_timeout_s', '60'),
        mac,
        dispatched,
    )
    return jsonify({
        "scenario": cfg.get('pipeline_scenario', 'normal'),
        "mode": cfg.get('pipeline_mode', 'sim'),
        "telemetry_interval_s": _get_int_setting(
            cfg, 'telemetry_interval_s', 20, min_value=5, max_value=3600),
        "config_sync_interval_s": _get_int_setting(
            cfg, 'config_sync_interval_s', 20, min_value=5, max_value=3600),
        "display_timeout_s": _get_int_setting(
            cfg, 'display_timeout_s', 60, min_value=0, max_value=3600),
        "mac": mac,
        "mqtt_dispatched": dispatched,
    })


@app.route("/api/pipeline/scenario", methods=["POST"])
def set_pipeline_scenario():
    """Compatibilidad con la UI actual: delega en la configuración completa."""
    payload = request.get_json(silent=True) or {}
    if 'scenario' not in payload:
        return jsonify({"error": "Falta campo 'scenario'"}), 400
    return set_pipeline_config()


@app.route("/api/alerts")
def api_alerts():
    """Lista alertas recientes (últimas 100). Filtros opcionales: mac, finca_id, acked."""
    mac = request.args.get('mac')
    finca_id = request.args.get('finca_id')
    # "0" solo no acks, "1" solo acks, None = todas
    acked = request.args.get('acked')

    query = "SELECT * FROM alerts WHERE 1=1"
    params = []
    if mac:
        query += " AND device_mac=?"
        params.append(mac)
    if finca_id:
        query += " AND finca_id=?"
        params.append(finca_id)
    if acked == "0":
        query += " AND acked=0"
    elif acked == "1":
        query += " AND acked=1"
    query += " ORDER BY created_at DESC LIMIT 100"

    rows = get_db().execute(query, params).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/alerts/<int:alert_id>/ack", methods=["POST"])
def api_alert_ack(alert_id):
    """Marca una alerta como resuelta."""
    db = get_db()
    db.execute(
        "UPDATE alerts SET acked=1, acked_at=CURRENT_TIMESTAMP WHERE id=?",
        (alert_id,)
    )
    db.commit()
    return jsonify({"ok": True, "id": alert_id})


# ── Provisioning endpoints ──────────────────────────────────────────────────

@app.route("/api/mqtt/auth", methods=["POST"])
def mqtt_auth():
    """Llamado por mosquitto-go-auth para validar credenciales.
    - Usuario 'backend': contraseña comparada con env MQTT_BACKEND_PASSWORD
    - Dispositivos (MAC): token comparado con bcrypt hash en device_credentials
    """
    data = request.get_json(silent=True, force=True) or {}
    username = data.get("username", "")
    password = data.get("password", "")
    app.logger.info(
        f"[mqtt/auth] user={username!r} ok={bool(username and password)}")
    if not username or not password:
        return jsonify({"error": "missing"}), 401

    # Usuario interno del backend Flask
    if username == "backend":
        expected = os.getenv("MQTT_PASSWORD", "")
        if expected and password == expected:
            return jsonify({"ok": True}), 200
        return jsonify({"error": "forbidden"}), 401

    # Dispositivos: username = MAC, password = token en claro
    row = get_db().execute(
        "SELECT token_hash FROM device_credentials WHERE mac=?", (username,)
    ).fetchone()
    if not row:
        return jsonify({"error": "unknown"}), 401
    if not bcrypt.checkpw(password.encode(), row["token_hash"].encode()):
        return jsonify({"error": "forbidden"}), 401
    return jsonify({"ok": True}), 200


@app.route("/api/mqtt/acl", methods=["POST"])
def mqtt_acl():
    """Llamado por mosquitto-go-auth para validar permisos de topic.
    Por ahora permisivo para todos los usuarios autenticados.
    """
    return jsonify({"ok": True}), 200


@app.route("/api/devices/mine")
def api_devices_mine():
    """Alias compatible para listar los dispositivos del usuario autenticado."""
    user_id = int(get_jwt_identity())
    return jsonify(_get_user_devices_rows(user_id))


@app.route("/api/devices/<mac>", methods=["DELETE"])
def api_release_device(mac):
    """Desvincula un dispositivo del usuario (lo libera para ser reclamado de nuevo)."""
    user_id = int(get_jwt_identity())
    mac = mac.upper()
    db = get_db()
    existing = db.execute(
        "SELECT id FROM user_devices WHERE user_id=%s AND mac_address=%s",
        (user_id, mac)
    ).fetchone()
    if not existing:
        return jsonify({"error": "Dispositivo no encontrado"}), 404
    db.execute(
        "DELETE FROM user_devices WHERE user_id=%s AND mac_address=%s",
        (user_id, mac)
    )
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/devices/claim", methods=["POST"])
def claim_device():
    """El usuario reclama un dispositivo introduciendo su serial number."""
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    serial_number = (data.get("serial_number") or "").strip().upper()
    finca_id = data.get("finca_id", "").strip()
    nickname = data.get("nickname", "").strip()
    if not serial_number:
        return jsonify({"error": "Falta serial_number"}), 400
    db = get_db()
    row = db.execute(
        "SELECT mac, claimed_by_finca_id FROM device_credentials WHERE serial_number=?",
        (serial_number,)
    ).fetchone()
    if not row:
        return jsonify({"error": "Dispositivo no encontrado"}), 404
    # Verificar si ya está reclamado por otro usuario
    existing = db.execute(
        "SELECT user_id FROM user_devices WHERE mac_address=?", (row["mac"],)
    ).fetchone()
    if existing and existing["user_id"] != user_id:
        return jsonify(
            {"error": "Dispositivo ya reclamado por otro usuario"}), 409
    db.execute(
        "UPDATE device_credentials SET claimed_by_finca_id=?, claimed_at=CURRENT_TIMESTAMP WHERE serial_number=?",
        (finca_id or serial_number, serial_number)
    )
    db.execute(
        "INSERT INTO user_devices(user_id, mac_address, nickname) VALUES (%s, %s, %s)"
        " ON CONFLICT (user_id, mac_address) DO UPDATE SET nickname = EXCLUDED.nickname",
        (user_id, row["mac"], nickname or serial_number)
    )
    db.commit()
    device = db.execute(
        "SELECT chip_model, relay_count, ip_address FROM device_info WHERE mac_address=?",
        (row["mac"],)
    ).fetchone()
    return jsonify({
        "mac": row["mac"],
        "serial_number": serial_number,
        "finca_id": finca_id or serial_number,
        "chip_model": device["chip_model"] if device else None,
        "relay_count": device["relay_count"] if device else None,
    })


@app.route("/api/devices/register_factory", methods=["POST"])
def register_factory():
    """Llamado por el script de fábrica para registrar un dispositivo nuevo."""
    allowed = ("127.0.0.1", "::1")
    addr = request.remote_addr or ""
    # Permitir también redes internas Docker (172.16-31.x.x, 10.x.x.x,
    # 192.168.x.x)
    if addr not in allowed and not (
        addr.startswith("172.") or addr.startswith(
            "10.") or addr.startswith("192.168.")
    ):
        return jsonify({"error": "forbidden"}), 403
    data = request.get_json(silent=True) or {}
    mac = (data.get("mac") or "").upper()
    token_hash = data.get("token_hash", "")
    serial_number = (data.get("serial_number") or "").upper()
    if not mac or not token_hash or not serial_number:
        return jsonify(
            {"error": "Faltan campos: mac, token_hash, serial_number"}), 400
    db = get_db()
    db.execute(
        "INSERT INTO device_credentials(mac, token_hash, serial_number) VALUES (%s, %s, %s)"
        " ON CONFLICT (mac) DO UPDATE SET token_hash = EXCLUDED.token_hash,"
        " serial_number = EXCLUDED.serial_number", (mac, token_hash, serial_number))
    db.commit()
    logger.info("Dispositivo registrado en fábrica: mac=%s sn=%s",
                mac, serial_number)
    return jsonify({"ok": True, "mac": mac, "serial_number": serial_number})


def _autostart_mqtt():
    """Arranca el cliente MQTT también bajo Gunicorn.

    En desarrollo con el autoreload de Flask evitamos el proceso padre para no
    duplicar la suscripción.
    """
    if os.getenv("MQTT_AUTOSTART", "1") != "1":
        logger.info("MQTT autostart deshabilitado por entorno")
        return

    debug = os.getenv("FLASK_DEBUG", "0") == "1"
    if debug and os.environ.get("WERKZEUG_RUN_MAIN") != "true":
        logger.info("MQTT autostart omitido en el proceso padre del reloader")
        return

    mqtt_client.start()


# Inicializar DB una sola vez al arrancar
with app.app_context():
    conn = get_db_connection()
    create_tables(conn)
    conn.close()

# Importante: Gunicorn importa este módulo pero no ejecuta __main__.
# Por eso el cliente MQTT debe arrancar aquí también.
_autostart_mqtt()

if __name__ == "__main__":
    host = os.getenv("FLASK_HOST", "0.0.0.0")
    port = int(os.getenv("FLASK_PORT", 7000))
    debug = os.getenv("FLASK_DEBUG", "0") == "1"
    app.run(host=host, port=port, debug=debug)
