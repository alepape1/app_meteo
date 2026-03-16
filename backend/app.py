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
        if len(parts) != 9:
            return None
        return [float(v) for v in parts]
    except ValueError:
        return None


def rows_to_dict(rows):
    """Convierte filas de DB al formato esperado por los gráficos."""
    return {
        "timestamp":            [r[10] for r in rows],
        "temperature":          [r[1]  for r in rows],
        "temperature_bar":      [r[2]  for r in rows],
        "humidity":             [r[3]  for r in rows],
        "pressure":             [r[4]  for r in rows],
        "windSpeed":            [r[5]  for r in rows],
        "windDirection":        [r[6]  for r in rows],
        "windSpeedFiltered":    [r[7]  for r in rows],
        "windDirectionFiltered":[r[8]  for r in rows],
        "light":                [r[9]  for r in rows],
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
        return "Error: se esperan exactamente 9 valores separados por coma", 400

    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        INSERT INTO home_weather_station(
            temperature, pressure, temperature_barometer, humidity,
            windSpeed, windDirection, windSpeedFiltered, windDirectionFiltered,
            light
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, tuple(data))
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


# Inicializar DB una sola vez al arrancar
with app.app_context():
    conn = get_db_connection()
    create_tables(conn)
    conn.close()

if __name__ == "__main__":
    host = os.getenv("FLASK_HOST", "0.0.0.0")
    port = int(os.getenv("FLASK_PORT", 7000))
    app.run(host=host, port=port, debug=False)
