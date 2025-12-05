from flask import Flask, g, render_template, request , jsonify
import sqlite3
from database import get_db_connection, create_tables

app = Flask(__name__)

# Configuración
TEMPLATE_FILE = "index.html"

def get_db():
    """Conecta a la base de datos y asegura que exista una conexión única por petición."""
    if 'db' not in g:
        g.db = get_db_connection()
    return g.db

@app.before_request
def initialize_database():
    """Asegura que la tabla exista antes de procesar peticiones (opcional, pero útil)."""
    # Solo intentamos crear tablas si es la primera vez o para asegurar integridad
    conn = get_db_connection()
    create_tables(conn)
    conn.close()

@app.teardown_appcontext
def close_connection(exception):
    """Cierra la conexión a la base de datos al terminar la petición."""
    db = g.pop('db', None)
    if db is not None:
        db.close()

def parse_message_data(message):
    """Parsea el mensaje CSV recibido del sensor."""
    try:
        data_string = message.split(",")
        data_floats = [float(data) for data in data_string]
        return data_floats
    except ValueError:
        return None

# --- RUTAS ---

@app.route("/")
def fetch_data():
    db = get_db()
    cursor = db.cursor()
    
    # Consultar los últimos 2 registros
    cursor.execute("""
        SELECT * FROM home_weather_station
        ORDER BY timestamp DESC
        LIMIT 2;
    """)
    resultados = cursor.fetchall()
    cursor.close()

    # Mapeo de columnas (Asumiendo orden de creación en DB)
    # id(0), temp(1), temp_bar(2), hum(3), press(4), wS(5), wD(6), wSf(7), wDf(8), time(9)
    
    context = {
        "message": "No hay mensaje",
        "timestamp": [r[9] for r in resultados], # Ajustado al índice correcto del timestamp
        "temperature": [r[1] for r in resultados],
        "temperature_bar": [r[2] for r in resultados],
        "humidity": [r[3] for r in resultados],
        "pressure": [r[4] for r in resultados],
        "windSpeed": [r[5] for r in resultados],
        "windDirection": [r[6] for r in resultados],
        "windSpeedFiltered": [r[7] for r in resultados],
        "windDirectionFiltered": [r[8] for r in resultados],
    }

    return render_template(TEMPLATE_FILE, **context)

@app.route("/descargar/<int:cantidad_muestras>")
def descargar_muestras(cantidad_muestras):
    db = get_db()
    cursor = db.cursor()

    # Obtener total para calcular offset (paginación inversa)
    cursor.execute("SELECT COUNT(*) FROM home_weather_station;")
    total_registros = cursor.fetchone()[0]
    
    # Evitar offset negativo
    indice_inicial = max(0, total_registros - cantidad_muestras)

    # Usamos parámetros ? para evitar inyección SQL, aunque sean enteros
    cursor.execute("""
        SELECT * FROM home_weather_station
        ORDER BY timestamp ASC
        LIMIT ? OFFSET ?
    """, (cantidad_muestras, indice_inicial))
  
    resultados = cursor.fetchall()
    cursor.close()

    context = {
        "message": "Datos descargados",
        "timestamp": [r[9] for r in resultados],
        "temperature": [r[1] for r in resultados],
        "temperature_bar": [r[2] for r in resultados],
        "humidity": [r[3] for r in resultados],
        "pressure": [r[4] for r in resultados],
        "windSpeed": [r[5] for r in resultados],
        "windDirection": [r[6] for r in resultados],
        "windSpeedFiltered": [r[7] for r in resultados],
        "windDirectionFiltered": [r[8] for r in resultados]
    }

    return render_template(TEMPLATE_FILE, **context)

@app.route("/send_message", methods=["POST"])
def send_message():
    message = request.get_data().decode("utf-8")
    print(f"Mensaje recibido: {message}")
    
    data = parse_message_data(message)
    if not data or len(data) < 8:
        return "Error: Datos inválidos o incompletos", 400

    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
      INSERT INTO home_weather_station(
        temperature, pressure, temperature_barometer, humidity, 
        windSpeed, windDirection, windSpeedFiltered, windDirectionFiltered
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (data[0], data[1], data[2], data[3], data[4], data[5], data[6], data[7]))
    
    db.commit()
    cursor.close()

    return "Datos guardados correctamente", 200

@app.route("/average/<int:cantidad_muestras>")
def fetch_data_average(cantidad_muestras):
    """
    NOTA: Esta consulta calcula el promedio de los últimos X registros.
    Devolverá una sola fila con los promedios.
    """
    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT COUNT(*) FROM home_weather_station;")
    total_registros = cursor.fetchone()[0]
    indice_inicial = max(0, total_registros - cantidad_muestras)

    # Corregido: La consulta original tenía un error lógico. 
    # Aquí calculamos el promedio de las filas seleccionadas por el LIMIT/OFFSET
    query = f"""
    SELECT 
        AVG(temperature), AVG(pressure), AVG(humidity), 
        AVG(temperature_barometer), AVG(windSpeed), AVG(windDirection), 
        AVG(windSpeedFiltered), AVG(windDirectionFiltered)
    FROM (
        SELECT * FROM home_weather_station
        ORDER BY timestamp ASC
        LIMIT ? OFFSET ?
    )
    """
    
    cursor.execute(query, (cantidad_muestras, indice_inicial))
    resultados = cursor.fetchall() # Debería ser solo 1 fila con promedios
    cursor.close()

    # Si no hay datos, manejar gracefully
    if not resultados or resultados[0][0] is None:
         return render_template(TEMPLATE_FILE, message="No hay datos suficientes para el promedio")

    r = resultados[0]
    
    # Pasamos los datos como listas de un solo elemento para compatibilidad con el template
    context = {
        "message": "Promedio calculado",
        "timestamp": [], # El promedio no tiene un timestamp único
        "temperature": [r[0]],
        "pressure": [r[1]],
        "humidity": [r[2]],
        "temperature_bar": [r[3]],
        "windSpeed": [r[4]],
        "windDirection": [r[5]],
        "windSpeedFiltered": [r[6]],
        "windDirectionFiltered": [r[7]]
    }

    return render_template(TEMPLATE_FILE, **context)

@app.route("/api/filtrar", methods=["POST"])
def filtrar_datos_api():
    # 1. Obtener el JSON enviado por el navegador
    data = request.get_json()
    start_date = data.get('start_date')
    end_date = data.get('end_date')

    if not start_date or not end_date:
        return jsonify({"error": "Fechas inválidas"}), 400

    db = get_db()
    cursor = db.cursor()

    # 2. Consulta SQL para filtrar por rango de fechas
    # Usamos BETWEEN para obtener todo lo que esté entre inicio y fin
    query = """
        SELECT * FROM home_weather_station
        WHERE timestamp BETWEEN ? AND ?
        ORDER BY timestamp ASC
    """
    
    cursor.execute(query, (start_date, end_date))
    resultados = cursor.fetchall()
    cursor.close()

    # 3. Formatear los datos para Chart.js
    # Usamos los mismos índices que en tu función 'descargar_muestras'
    response_data = {
        "timestamp": [r[9] for r in resultados],           # Columna 9: timestamp
        "temperature": [r[1] for r in resultados],         # Columna 1: temperature
        "temperature_bar": [r[2] for r in resultados],     # Columna 2: temperature_barometer
        "humidity": [r[3] for r in resultados],            # Columna 3: humidity
        "pressure": [r[4] for r in resultados],            # Columna 4: pressure
        "windSpeed": [r[5] for r in resultados],           # Columna 5: windSpeed
        "windDirection": [r[6] for r in resultados],       # Columna 6: windDirection
        "windSpeedFiltered": [r[7] for r in resultados],   # Columna 7: windSpeedFiltered
        "windDirectionFiltered": [r[8] for r in resultados] # Columna 8: windDirectionFiltered
    }

    # 4. Devolver respuesta en formato JSON
    return jsonify(response_data)


if __name__ == "__main__":
    # En un servidor real, no uses debug=True y usa host 0.0.0.0
    app.run(host="0.0.0.0", port=5000, debug=True)