from flask import Flask, g, render_template, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os
import sqlite3
import logging
from database import get_db_connection, create_tables

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

TEMPLATE_FILE = "index.html"

# Estado deseado del relay (en memoria). El ESP lo consulta tras cada envío.
# Fallo-seguro: arranca en False (válvula cerrada).
relay_desired_state = False


def get_db():
    """Conexión única a la DB por petición (lazy init)."""
    if 'db' not in g:
        g.db = get_db_connection()
    return g.db


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
        if len(parts) not in (9, 11, 14, 15):
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

    dht_temp     = data[9]  if len(data) >= 11 else None
    dht_hum      = data[10] if len(data) >= 11 else None
    rssi         = int(data[11]) if len(data) >= 14 else None
    free_heap    = int(data[12]) if len(data) >= 14 else None
    uptime_s     = int(data[13]) if len(data) >= 14 else None
    relay_active = int(data[14]) if len(data) >= 15 else 0

    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        INSERT INTO home_weather_station(
            temperature, pressure, temperature_barometer, humidity,
            windSpeed, windDirection, windSpeedFiltered, windDirectionFiltered,
            light, dht_temperature, dht_humidity,
            rssi, free_heap, uptime_s, relay_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, tuple(data[:9]) + (dht_temp, dht_hum, rssi, free_heap, uptime_s, relay_active))
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

    db = get_db()
    cursor = db.cursor()
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
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT COUNT(*) FROM home_weather_station;")
    total = cursor.fetchone()[0]
    offset = max(0, total - n)
    cursor.execute("""
        SELECT * FROM home_weather_station
        ORDER BY timestamp ASC
        LIMIT ? OFFSET ?
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
        INSERT OR REPLACE INTO device_info(
            id, chip_model, chip_revision, cpu_freq_mhz, flash_size_mb,
            sdk_version, mac_address, ip_address, last_seen
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    """, (
        payload.get("chip_model"),
        payload.get("chip_revision"),
        payload.get("cpu_freq_mhz"),
        payload.get("flash_size_mb"),
        payload.get("sdk_version"),
        payload.get("mac_address"),
        payload.get("ip_address"),
    ))
    db.commit()
    cursor.close()
    logger.info("DeviceInfo actualizado: %s", payload.get("chip_model"))
    return "OK", 200


@app.route("/api/device_info", methods=["GET"])
def get_device_info():
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT * FROM device_info WHERE id = 1")
    row = cursor.fetchone()
    cursor.close()
    if not row:
        return jsonify({}), 200
    return jsonify(dict(row))


@app.route("/api/latest")
def api_latest():
    """Devuelve el registro más reciente como JSON (útil para auto-refresco)."""
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        SELECT * FROM home_weather_station
        ORDER BY timestamp DESC
        LIMIT 1;
    """)
    rows = cursor.fetchall()
    cursor.close()

    return jsonify(rows_to_dict(rows))


@app.route("/api/relay/command")
def relay_command():
    """El ESP32 consulta este endpoint para saber el estado deseado del relay.
    Devuelve '1' (abrir válvula) o '0' (cerrar válvula) en texto plano."""
    return "1" if relay_desired_state else "0", 200


@app.route("/api/relay", methods=["GET"])
def get_relay():
    """Dashboard: devuelve el estado deseado del relay."""
    return jsonify({"state": relay_desired_state})


@app.route("/api/relay", methods=["POST"])
def set_relay():
    """Dashboard: cambia el estado deseado del relay."""
    global relay_desired_state
    payload = request.get_json(silent=True)
    if payload is None or "state" not in payload:
        return jsonify({"error": "Falta campo 'state'"}), 400
    relay_desired_state = bool(payload["state"])
    logger.info("Relay deseado → %s", "ON" if relay_desired_state else "OFF")
    return jsonify({"state": relay_desired_state})


# Inicializar DB una sola vez al arrancar
with app.app_context():
    conn = get_db_connection()
    create_tables(conn)
    conn.close()

if __name__ == "__main__":
    host = os.getenv("FLASK_HOST", "0.0.0.0")
    port = int(os.getenv("FLASK_PORT", 7000))
    app.run(host=host, port=port, debug=False)
