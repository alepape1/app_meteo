import sqlite3
import os

# Definimos la ruta de la DB relativa a este archivo para evitar problemas de rutas
DB_NAME = "home_weather_station.db"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# DATA_DIR permite montar la DB en un volumen persistente via variable de entorno.
# En Docker: DATA_DIR=/app/data. En local: usa el directorio del script.
DATA_DIR = os.environ.get('DATA_DIR', BASE_DIR)
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, DB_NAME)

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
        relay_active       INTEGER DEFAULT 0,
        pipeline_pressure  REAL    DEFAULT NULL,
        pipeline_flow      REAL    DEFAULT NULL,
        soil_moisture      REAL    DEFAULT NULL,
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
        "ALTER TABLE home_weather_station ADD COLUMN pipeline_pressure REAL DEFAULT NULL;",
        "ALTER TABLE home_weather_station ADD COLUMN soil_moisture REAL DEFAULT NULL;",
        "ALTER TABLE home_weather_station ADD COLUMN pipeline_flow REAL DEFAULT NULL;",
        "ALTER TABLE home_weather_station ADD COLUMN device_mac TEXT DEFAULT NULL;",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_device_info_mac ON device_info(mac_address);",
        "CREATE INDEX IF NOT EXISTS idx_device_mac ON home_weather_station(device_mac);",
        "ALTER TABLE device_info ADD COLUMN relay_count INTEGER DEFAULT 1;",
        "ALTER TABLE relay_state ADD COLUMN device_mac TEXT DEFAULT NULL;",
        "ALTER TABLE relay_state ADD COLUMN relay_index INTEGER DEFAULT 0;",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_relay_state ON relay_state(device_mac, relay_index);",
        "ALTER TABLE device_info ADD COLUMN finca_id TEXT DEFAULT NULL;",
        "CREATE INDEX IF NOT EXISTS idx_device_info_finca ON device_info(finca_id);",
    ]:
        try:
            cursor.execute(migration)
            conn.commit()
        except Exception:
            pass  # La columna/índice ya existe

    # Tabla de configuración de la aplicación (clave-valor).
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS app_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """)
    for key, value in [
        ('flow_lpm',           '5.0'),
        ('baseline_daily_l',   '15.0'),
        ('station_name',       'Aquantia'),
        ('station_location',   'Lanzarote'),
        ('pipeline_scenario',  'normal'),
    ]:
        cursor.execute(
            "INSERT OR IGNORE INTO app_settings(key, value) VALUES (?, ?)",
            (key, value)
        )

    # Tabla de alertas generadas por los dispositivos via MQTT.
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS alerts(
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        finca_id   TEXT,
        device_mac TEXT,
        alert_type TEXT NOT NULL DEFAULT 'unknown',
        severity   TEXT NOT NULL DEFAULT 'info',
        message    TEXT,
        acked      INTEGER NOT NULL DEFAULT 0,
        acked_at   DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)
    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_alerts_finca ON alerts(finca_id);
    """)
    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at);
    """)

    # Tabla de resets de consumo — cada fila es un reset manual del usuario.
    # Las estadísticas solo cuentan registros posteriores al último reset.
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS irrigation_resets(
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        reset_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Tabla de estado del relay — fila única (id=1), compartida entre workers Gunicorn.
    # Fallo-seguro: desired y actual arrancan en 0 (válvula cerrada).
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS relay_state(
        id          INTEGER PRIMARY KEY,
        desired     INTEGER NOT NULL DEFAULT 0,
        actual      INTEGER NOT NULL DEFAULT 0,
        device_mac  TEXT    DEFAULT NULL,
        relay_index INTEGER DEFAULT 0
    );
    """)
    cursor.execute("""
    INSERT OR IGNORE INTO relay_state(id, desired, actual) VALUES (1, 0, 0);
    """)

    # Tabla de credenciales por dispositivo — una fila por ESP32 registrado en fábrica.
    # token_hash: bcrypt del token único del dispositivo (nunca el token en claro).
    # serial_number: SN legible para el usuario, impreso en la etiqueta del dispositivo.
    # claimed_by_finca_id: NULL hasta que el usuario reclame el dispositivo.
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS device_credentials(
        mac                  TEXT PRIMARY KEY,
        token_hash           TEXT NOT NULL,
        serial_number        TEXT UNIQUE NOT NULL,
        claimed_by_finca_id  TEXT DEFAULT NULL,
        claimed_at           DATETIME DEFAULT NULL,
        created_at           DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)
    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_devcred_serial
    ON device_credentials(serial_number);
    """)

    # Migraciones aditivas para device_info
    for migration in [
        "ALTER TABLE device_info ADD COLUMN serial_number TEXT DEFAULT NULL;",
        "ALTER TABLE device_info ADD COLUMN claimed_at DATETIME DEFAULT NULL;",
    ]:
        try:
            cursor.execute(migration)
            conn.commit()
        except Exception:
            pass

    conn.commit()
    cursor.close()