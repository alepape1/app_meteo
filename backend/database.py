import sqlite3
import os

# Definimos la ruta de la DB relativa a este archivo para evitar problemas de rutas
DB_NAME = "home_weather_station.db"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, DB_NAME)

def get_db_connection():
    conexion = sqlite3.connect(DB_PATH, check_same_thread=False)
    # Row permite acceder a columnas por nombre en vez de índice,
    # evitando bugs cuando el orden difiere entre DBs nuevas y migradas.
    conexion.row_factory = sqlite3.Row
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
        light REAL DEFAULT 0,
        dht_temperature REAL,
        dht_humidity REAL,
        rssi INTEGER,
        free_heap INTEGER,
        uptime_s INTEGER,
        relay_active INTEGER DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)
    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_timestamp ON home_weather_station(timestamp);
    """)
    # Tabla de información estática del dispositivo (una fila, id=1)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS device_info(
        id INTEGER PRIMARY KEY,
        chip_model TEXT,
        chip_revision INTEGER,
        cpu_freq_mhz INTEGER,
        flash_size_mb INTEGER,
        sdk_version TEXT,
        mac_address TEXT,
        ip_address TEXT,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)
    # Migraciones: añadir columnas nuevas si la tabla ya existía sin ellas
    for migration in [
        "ALTER TABLE home_weather_station ADD COLUMN light REAL DEFAULT 0;",
        "ALTER TABLE home_weather_station ADD COLUMN dht_temperature REAL;",
        "ALTER TABLE home_weather_station ADD COLUMN dht_humidity REAL;",
        "ALTER TABLE home_weather_station ADD COLUMN rssi INTEGER;",
        "ALTER TABLE home_weather_station ADD COLUMN free_heap INTEGER;",
        "ALTER TABLE home_weather_station ADD COLUMN uptime_s INTEGER;",
        "ALTER TABLE home_weather_station ADD COLUMN relay_active INTEGER DEFAULT 0;",
    ]:
        try:
            cursor.execute(migration)
            conn.commit()
        except Exception:
            pass  # La columna ya existe
    conn.commit()
    cursor.close()