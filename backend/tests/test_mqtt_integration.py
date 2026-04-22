"""
test_mqtt_integration.py — Paso 3: tests de integración MQTT → DB

Llama directamente a _handle_telemetry, _handle_alert y _handle_register
(sin pasar por el broker MQTT) y verifica que la DB aquantia_test refleja
los cambios correctamente.

Requiere PostgreSQL en localhost:5432 (user=aquantia, pass=aquantia_dev).
Reutiliza la DB aquantia_test creada en el Paso 2.
"""
import os
import sys
from datetime import datetime, timezone

import psycopg2
import psycopg2.pool
import pytest

# ── Asegurar que backend/ está en el path ────────────────────────────────────
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Importar app primero: dispara load_dotenv() que fija PG_PASS, PG_HOST, etc.
# antes de que database.py lea las variables de entorno a nivel de módulo.
import app as _flask_app_module  # noqa: F401, E402
import database                  # noqa: E402
from mqtt_client import _handle_telemetry, _handle_alert, _handle_register  # noqa: E402

# ── Parámetros de conexión ────────────────────────────────────────────────────
TEST_DB = "aquantia_test"
PG_CONN = dict(
    host=os.environ.get("PG_HOST", "localhost"),
    port=int(os.environ.get("PG_PORT", 5432)),
    user=os.environ.get("PG_USER", "aquantia"),
    password=os.environ.get("PG_PASS", "aquantia_dev"),
)

# MAC y finca_id fijos para todos los tests
TEST_FINCA   = "finca-mqtt-test"
TEST_MAC     = "AA:BB:CC:DD:EE:FF"
TEST_TS      = 1700000000  # 2023-11-14 22:13:20 UTC

TELEMETRY_PAYLOAD = {
    "mac_address":       TEST_MAC,
    "ts":                TEST_TS,
    "temperature":       23.4,
    "humidity":          65.2,
    "pressure":          1013.2,
    "pipeline_pressure": 2.8,
    "pipeline_flow":     11.5,
    "relay_active":      1,
    "relay_count":       2,
    "rssi":              -68,
    "free_heap":         180000,
    "uptime_s":          3600,
    "firmware_version":  "0.1.0-beta",
}

ALERT_PAYLOAD = {
    "device_mac": TEST_MAC,
    "type":       "LEAK",
    "severity":   "HIGH",
    "message":    "Caudal detectado con válvula cerrada: 0.45 L/min",
}

REGISTER_PAYLOAD = {
    "mac_address":      TEST_MAC,
    "ip_address":       "192.168.1.10",
    "chip_model":       "ESP32-S3",
    "chip_revision":    3,
    "cpu_freq_mhz":     240,
    "flash_size_mb":    4,
    "sdk_version":      "5.1.2",
    "firmware_version": "0.1.0-beta",
    "relay_count":      2,
}


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def mqtt_db_pool():
    """Apunta database._pool a aquantia_test y garantiza el schema."""
    admin = psycopg2.connect(dbname="aquantia", **PG_CONN)
    admin.autocommit = True
    cur = admin.cursor()
    cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (TEST_DB,))
    if not cur.fetchone():
        cur.execute(f"CREATE DATABASE {TEST_DB}")
    cur.close()
    admin.close()

    pool = psycopg2.pool.ThreadedConnectionPool(
        minconn=2, maxconn=10, dbname=TEST_DB, **PG_CONN
    )
    original_pool = database._pool
    database._pool = pool

    conn = database.get_db_connection()
    database.create_tables(conn)
    conn.close()

    yield pool

    database._pool = original_pool
    pool.closeall()


@pytest.fixture(autouse=True)
def clean_tables(mqtt_db_pool):
    """Limpia las tablas afectadas antes de cada test."""
    raw = mqtt_db_pool.getconn()
    raw.autocommit = True
    cur = raw.cursor()
    cur.execute("TRUNCATE home_weather_station RESTART IDENTITY CASCADE")
    cur.execute("TRUNCATE alerts RESTART IDENTITY CASCADE")
    cur.execute("DELETE FROM relay_state WHERE device_mac = %s", (TEST_MAC,))
    cur.execute("DELETE FROM device_info  WHERE mac_address = %s", (TEST_MAC,))
    cur.close()
    mqtt_db_pool.putconn(raw)
    yield


def _query_one(mqtt_db_pool, sql, params=()):
    """Ejecuta una consulta y devuelve la primera fila como dict."""
    raw = mqtt_db_pool.getconn()
    raw.autocommit = True
    cur = raw.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(sql, params)
    row = cur.fetchone()
    cur.close()
    mqtt_db_pool.putconn(raw)
    return dict(row) if row else None


def _query_all(mqtt_db_pool, sql, params=()):
    """Ejecuta una consulta y devuelve todas las filas como lista de dicts."""
    raw = mqtt_db_pool.getconn()
    raw.autocommit = True
    cur = raw.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(sql, params)
    rows = cur.fetchall()
    cur.close()
    mqtt_db_pool.putconn(raw)
    return [dict(r) for r in rows]


# ── Tests de _handle_telemetry ────────────────────────────────────────────────

def test_handle_telemetry_inserta_fila(mqtt_db_pool):
    """_handle_telemetry inserta exactamente una fila en home_weather_station."""
    _handle_telemetry(TEST_FINCA, TELEMETRY_PAYLOAD)

    row = _query_one(
        mqtt_db_pool,
        "SELECT * FROM home_weather_station WHERE device_mac = %s",
        (TEST_MAC,),
    )
    assert row is not None, "No se insertó ninguna fila en home_weather_station"
    assert row["temperature"]        == pytest.approx(23.4)
    assert row["humidity"]           == pytest.approx(65.2)
    assert row["pressure"]           == pytest.approx(1013.2)
    assert row["pipeline_pressure"]  == pytest.approx(2.8)
    assert row["pipeline_flow"]      == pytest.approx(11.5)
    assert row["rssi"]               == -68
    assert row["free_heap"]          == 180000
    assert row["uptime_s"]           == 3600
    assert row["relay_active"]       == 1
    assert row["device_mac"]         == TEST_MAC


def test_handle_telemetry_timestamp_del_esp32(mqtt_db_pool):
    """El timestamp guardado coincide con el campo 'ts' del ESP32, no con NOW()."""
    expected_ts = datetime.fromtimestamp(TEST_TS, tz=timezone.utc)

    _handle_telemetry(TEST_FINCA, TELEMETRY_PAYLOAD)

    row = _query_one(
        mqtt_db_pool,
        "SELECT timestamp FROM home_weather_station WHERE device_mac = %s",
        (TEST_MAC,),
    )
    assert row is not None
    saved_ts = row["timestamp"]
    # psycopg2 devuelve TIMESTAMPTZ como datetime aware
    if saved_ts.tzinfo is None:
        saved_ts = saved_ts.replace(tzinfo=timezone.utc)
    assert saved_ts == expected_ts, (
        f"Timestamp guardado {saved_ts!r} ≠ timestamp del ESP32 {expected_ts!r}"
    )


def test_handle_telemetry_actualiza_device_info(mqtt_db_pool):
    """_handle_telemetry crea o actualiza la fila en device_info con el mac correcto."""
    _handle_telemetry(TEST_FINCA, TELEMETRY_PAYLOAD)

    row = _query_one(
        mqtt_db_pool,
        "SELECT * FROM device_info WHERE mac_address = %s",
        (TEST_MAC,),
    )
    assert row is not None, "No se creó fila en device_info"
    assert row["mac_address"]       == TEST_MAC
    assert row["finca_id"]          == TEST_FINCA
    assert row["firmware_version"]  == "0.1.0-beta"
    assert int(row["relay_count"])  >= 2


def test_handle_telemetry_actualiza_relay_state(mqtt_db_pool):
    """relay_active=3 (bits 0 y 1 activos) → relay_state actual=1 para índices 0 y 1."""
    payload = {**TELEMETRY_PAYLOAD, "relay_active": 3, "relay_count": 2}
    _handle_telemetry(TEST_FINCA, payload)

    rows = _query_all(
        mqtt_db_pool,
        "SELECT relay_index, actual FROM relay_state "
        "WHERE device_mac = %s ORDER BY relay_index",
        (TEST_MAC,),
    )
    assert len(rows) == 2, f"Se esperaban 2 filas en relay_state, se obtuvieron {len(rows)}"
    by_index = {r["relay_index"]: r["actual"] for r in rows}
    assert by_index[0] == 1, "relay_index=0 debería tener actual=1"
    assert by_index[1] == 1, "relay_index=1 debería tener actual=1"


# ── Test de _handle_alert ─────────────────────────────────────────────────────

def test_handle_alert_inserta_fila(mqtt_db_pool):
    """_handle_alert inserta una fila en la tabla alerts con los campos correctos."""
    _handle_alert(TEST_FINCA, ALERT_PAYLOAD)

    row = _query_one(
        mqtt_db_pool,
        "SELECT * FROM alerts WHERE finca_id = %s",
        (TEST_FINCA,),
    )
    assert row is not None, "No se insertó ninguna fila en alerts"
    assert row["device_mac"]  == TEST_MAC
    assert row["alert_type"]  == "LEAK"
    assert row["severity"]    == "HIGH"
    assert "válvula" in row["message"]


# ── Tests de _handle_register ─────────────────────────────────────────────────

def test_handle_register_inserta_device_info(mqtt_db_pool):
    """_handle_register inserta la fila en device_info con todos los campos del ESP32."""
    _handle_register(TEST_FINCA, REGISTER_PAYLOAD)

    row = _query_one(
        mqtt_db_pool,
        "SELECT * FROM device_info WHERE mac_address = %s",
        (TEST_MAC,),
    )
    assert row is not None, "No se creó fila en device_info tras _handle_register"
    assert row["mac_address"]      == TEST_MAC
    assert row["finca_id"]         == TEST_FINCA
    assert row["chip_model"]       == "ESP32-S3"
    assert row["ip_address"]       == "192.168.1.10"
    assert int(row["relay_count"]) == 2
    assert row["firmware_version"] == "0.1.0-beta"


def test_handle_register_upsert(mqtt_db_pool):
    """Segunda llamada a _handle_register actualiza firmware_version (upsert)."""
    _handle_register(TEST_FINCA, REGISTER_PAYLOAD)

    updated_payload = {**REGISTER_PAYLOAD, "firmware_version": "0.2.0-rc1"}
    _handle_register(TEST_FINCA, updated_payload)

    rows = _query_all(
        mqtt_db_pool,
        "SELECT firmware_version FROM device_info WHERE mac_address = %s",
        (TEST_MAC,),
    )
    assert len(rows) == 1, "El upsert creó una fila duplicada en device_info"
    assert rows[0]["firmware_version"] == "0.2.0-rc1", (
        f"firmware_version no se actualizó: {rows[0]['firmware_version']!r}"
    )
