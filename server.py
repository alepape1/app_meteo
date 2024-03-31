from flask import Flask, g, render_template, request
import json 
from dataBase import get_db_connection, create_tables 
from datetime import datetime
from flask_datepicker import datepicker


template_path="index.html"

# template_folder=r'/home/pi/Desktop/app_meteo'

app = Flask(__name__, static_folder='static',
            template_folder='templates')


def get_db():
    """Connects to the database and ensures a single connection exists."""
    if 'home_weather_station.db' not in g:
        g.db = get_db_connection()
        create_tables(g.db)
    return g.db

def get_message(message):
    data_string = message.split(",")
    data_floats = [float(data) for data in data_string]
    return data_floats

    
@app.teardown_appcontext
def close_connection(exception):
    """Closes the database connection after each request."""
    db = g.pop('db', None)
    if db is not None:
        db.close()

@app.route("/")
def fetch_data():

    db = get_db()
    create_tables(db)
    cursor = db.cursor()
    print("Here llega")
    # Consultar datos
    cursor.execute("""
    SELECT * FROM home_weather_station
    ORDER BY timestamp DESC
    LIMIT 200;
    """)
  
    resultados = cursor.fetchall()
    cursor.close()

    # print(resultados)
    # datetime_array= [datetime.strptime(resultado[5], '%Y-%m-%d %H:%M:%S') for resultado in resultados]
    # print(datetime_array)
    
    index = [resultado[0] for resultado in resultados]
    temperature = [resultado[1] for resultado in resultados]
    temperature_bar = [resultado[2] for resultado in resultados]
    humidity = [resultado[3] for resultado in resultados]
    pressure = [resultado[4] for resultado in resultados]
    windSpeed = [resultado[5] for resultado in resultados]
    windDirection = [resultado[6] for resultado in resultados]
    windSpeedFiltered = [resultado[7] for resultado in resultados]
    windDirectionFiltered = [resultado[8] for resultado in resultados]


    return render_template(template_path, message = "No hay mensaje", timestamp = index , temperature = temperature , pressure = pressure , humidity = humidity , temperature_bar = temperature_bar, windSpeed = windSpeed, windDirection = windDirection, windSpeedFiltered = windSpeedFiltered)

@app.route("/descargar/<int:cantidad_muestras>")
def descargar_muestras(cantidad_muestras):
    
    
    db = get_db()
    cursor = db.cursor()

    # Obtener la cantidad total de registros
    cursor.execute("SELECT COUNT(*) FROM home_weather_station;")
    total_registros = cursor.fetchone()[0]

    # Calcular el índice inicial
    indice_inicial = total_registros - cantidad_muestras

    # Ejecutar la consulta
    cursor.execute("""
    SELECT * FROM home_weather_station
    ORDER BY timestamp ASC
    LIMIT {}
    OFFSET {}
    """.format(cantidad_muestras, indice_inicial))
  
    resultados = cursor.fetchall()
    cursor.close()
    print(resultados)

    index = [resultado[0] for resultado in resultados]
    temperature = [resultado[1] for resultado in resultados]
    temperature_bar = [resultado[2] for resultado in resultados]
    humidity = [resultado[3] for resultado in resultados]
    pressure = [resultado[4] for resultado in resultados]
    windSpeed = [resultado[5] for resultado in resultados]
    windDirection = [resultado[6] for resultado in resultados]
    windSpeedFiltered = [resultado[7] for resultado in resultados]
    windDirectionFiltered = [resultado[8] for resultado in resultados]
    timestamp = [resultado[9] for resultado in resultados]
    print(timestamp)
    
   
    # # Opción 1: Imprimir los datos en la consola
    # for fila in resultados:
    #     timestamp, temperatura, humedad, presion = fila
    #     print(f"Timestamp: {timestamp}")
    #     print(f"Temperatura: {temperatura}")
    #     print(f"Humedad: {humedad}")
    #     print(f"Presión: {presion}")
    #     print("---------------")


    return render_template(template_path, message = "No hay mensaje", timestamp = timestamp , temperature = temperature , pressure = pressure , humidity = humidity , temperature_bar = temperature_bar, windSpeed = windSpeed, windDirection = windDirection, windSpeedFiltered = windSpeedFiltered, windDirectionFiltered = windDirectionFiltered )

@app.route("/send_message", methods=["POST"])
def send_message():

    message = request.get_data().decode("utf-8")  # Recibir el mensaje
    print("Mensaje recibido:", message)
    data = get_message(message)

    db = get_db()

    cursor = db.cursor()

    # Insertar datos
    cursor.execute("""
      INSERT INTO home_weather_station(temperature, pressure, temperature_barometer, humidity , windSpeed, windDirection ,windSpeedFiltered, windDirectionFiltered , timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    """, (data[0], data[1], data[2], data[3], data[4], data[5], data[6], data[7]))
    
    db.commit()

    # Consultar datos
    cursor.execute("""
    SELECT * FROM home_weather_station;
    """)

    cursor.close()

    return render_template(template_path)

# @app.route("/descargar/<int:cantidad_muestras>")
# def obtener_4_muestras_por_hora(fecha_inicio, fecha_fin):
#   """
#   Obtiene 4 muestras por hora entre dos fechas.

#   Args:
#       fecha_inicio: Fecha de inicio en formato datetime.
#       fecha_fin: Fecha final en formato datetime.

#   Returns:
#       Lista de tuples con los datos de las 4 muestras por hora.
#   """

#   db = get_db()
#   cursor = db.cursor()

#   cursor.execute("""
#   SELECT * FROM home_weather_station
#   WHERE timestamp BETWEEN ? AND ?
#   GROUP BY strftime('%Y-%m-%d %H:00:00', timestamp)
#   ORDER BY timestamp ASC
#   LIMIT 4;
#   """, (fecha_inicio, fecha_fin))

#   resultados = cursor.fetchall()
#   cursor.close()

#   return resultados


if __name__ == "__main__":
   
    app.run(host="0.0.0.0", port=5000, debug = True)

