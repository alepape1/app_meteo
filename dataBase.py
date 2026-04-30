import sqlite3

def get_db_connection():
    conexion = sqlite3.connect("home_weather_station.db")
    return conexion

# Función para crear la tabla si la base de datos no existe (opcional)
def create_tables(conn):
    
    print("Checking DB alredy exist....")
    cursor = conn.cursor()
   # Comprobar si la base de datos ya existe
    cursor.execute("""
    PRAGMA schema_version;
    """)

    # Si la base de datos ya existe, no hacer nada
    if cursor.fetchone()[0] > 0:
        return cursor

    # Si la base de datos no existe, crearla
    else:
        print("Nueva Base de datos ha sido creada.")
        # Crear una tabla
        cursor.execute("""
        CREATE TABLE home_weather_station(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        temperature FLOAT,
        temperature_barometer FLOAT,      
        humidity FLOAT,
        pressure FLOAT,
        windSpeed FLOAT,
        windDirection FLOAT,
        windSpeedFiltered FLOAT,
        windDirectionFiltered FLOAT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP      
        );
        """)
        return cursor







