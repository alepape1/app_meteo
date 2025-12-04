import sqlite3
import os

# Definimos la ruta de la DB relativa a este archivo para evitar problemas de rutas
DB_NAME = "home_weather_station.db"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, DB_NAME)

def get_db_connection():
    # Detect check_same_thread=False permite que SQLite funcione mejor con Flask en desarrollo
    conexion = sqlite3.connect(DB_PATH, check_same_thread=False)
    return conexion

def create_tables(conn):
    cursor = conn.cursor()
    
    # Esta sentencia solo crea la tabla si no existe. Es más segura y limpia.
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS home_weather_station(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        temperature REAL,
        temperature_barometer REAL,      
        humidity REAL,
        pressure REAL,
        windSpeed REAL,
        windDirection REAL,
        windSpeedFiltered REAL,
        windDirectionFiltered REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP      
    );
    """)
    conn.commit()
    cursor.close()