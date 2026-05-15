# conftest.py — fixtures compartidos del backend Aquantia
#
# Paso 1 (sin infra): fixtures de pipeline_sim — sin DB, Docker ni MQTT.
# Paso 2+ (infra):    fixtures de DB/Flask compartidos por todos los módulos
#                     de test de integración. test_endpoints.py y
#                     test_security.py ya tienen sus propias versiones locales
#                     (toman precedencia en pytest), por lo que no hay
#                     conflicto.

import os
import sys
from datetime import datetime, timezone

import bcrypt
import psycopg2
import psycopg2.pool
import pytest

# Asegurar que los imports del backend resuelvan correctamente
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from pipeline_sim import simulate_reading, build_synthetic_history, detect_leaks
import app as flask_module  # dispara load_dotenv(), luego importamos database
import database

# ── Constantes ────────────────────────────────────────────────────────────────

NOMINAL_FLOW = 10.0  # L/min
FIXED_TS = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)

TEST_DB = "aquantia_test"
PG_CONN = dict(
    host=os.environ.get("PG_HOST", "localhost"),
    port=int(os.environ.get("PG_PORT", 5432)),
    user=os.environ.get("PG_USER", "aquantia"),
    password=os.environ.get("PG_PASS", "aquantia_dev"),
)

# ── Fixtures puro-Paso-1 (pipeline_sim, sin infraestructura) ─────────────────

@pytest.fixture
def fixed_ts():
    return FIXED_TS


@pytest.fixture
def normal_valve_open_reading(fixed_ts):
    return simulate_reading(fixed_ts, valve_open=True, scenario="normal", nominal_flow_lpm=NOMINAL_FLOW)


@pytest.fixture
def normal_valve_closed_reading(fixed_ts):
    return simulate_reading(fixed_ts, valve_open=False, scenario="normal", nominal_flow_lpm=NOMINAL_FLOW)


@pytest.fixture
def leak_valve_closed_reading(fixed_ts):
    return simulate_reading(fixed_ts, valve_open=False, scenario="leak", nominal_flow_lpm=NOMINAL_FLOW)


@pytest.fixture
def burst_reading(fixed_ts):
    return simulate_reading(fixed_ts, valve_open=True, scenario="burst", nominal_flow_lpm=NOMINAL_FLOW)


@pytest.fixture
def history_normal():
    """50 lecturas sintéticas en escenario normal con válvula abierta."""
    return build_synthetic_history(50, valve_open=True, scenario="normal", nominal_flow_lpm=NOMINAL_FLOW)


@pytest.fixture
def history_leak_closed():
    """50 lecturas sintéticas en escenario de fuga con válvula cerrada."""
    return build_synthetic_history(50, valve_open=False, scenario="leak", nominal_flow_lpm=NOMINAL_FLOW)


@pytest.fixture
def history_burst():
    """50 lecturas sintéticas en escenario de rotura con válvula abierta."""
    return build_synthetic_history(50, valve_open=True, scenario="burst", nominal_flow_lpm=NOMINAL_FLOW)


# ── Infraestructura compartida (Paso 2+, requiere PostgreSQL) ─────────────────
# Estos fixtures son usados por los módulos de test nuevos.
# test_endpoints.py y test_security.py definen sus propias versiones locales
# de los mismos nombres, que tienen precedencia dentro de esos módulos.

@pytest.fixture(scope="session")
def test_db_pool():
    """Pool de conexiones hacia aquantia_test; crea la DB si no existe."""
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


@pytest.fixture(scope="session")
def flask_app(test_db_pool):
    """App Flask en modo TESTING con JWT secret fijo y rate-limit desactivado."""
    flask_module.app.config.update({
        "TESTING": True,
        "JWT_SECRET_KEY": "test-secret-for-pytest-at-least-32-bytes",
        "JWT_ACCESS_TOKEN_EXPIRES": False,
        "RATELIMIT_ENABLED": False,
    })
    yield flask_module.app


@pytest.fixture
def client(flask_app):
    """Cliente HTTP fresco por test."""
    with flask_app.test_client() as c:
        yield c


@pytest.fixture(autouse=True)
def clean_tables(test_db_pool):
    """Limpia todas las tablas antes de cada test para garantizar aislamiento."""
    try:
        flask_module.limiter._storage.reset()
    except Exception:
        pass
    yield
    conn = database.get_db_connection()
    conn.execute("DELETE FROM alerts")
    conn.execute("DELETE FROM relay_state")
    conn.execute("DELETE FROM pipeline_window_history")
    conn.execute("DELETE FROM irrigation_resets")
    conn.execute("DELETE FROM home_weather_station")
    conn.execute("DELETE FROM device_info")
    conn.execute("DELETE FROM app_settings")
    conn.execute("DELETE FROM user_devices")
    conn.execute("DELETE FROM device_credentials")
    conn.execute("DELETE FROM users")
    conn.commit()
    conn.close()


# ── Helpers de datos de prueba (funciones, no fixtures) ───────────────────────

def register_and_login(client, email, password="pass1234", name="Tester"):
    """Registra un usuario y devuelve el JWT."""
    client.post("/api/auth/register", json={
        "email": email, "password": password, "display_name": name,
    })
    resp = client.post("/api/auth/login", json={
        "email": email, "password": password,
    })
    return resp.get_json()["token"]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def insert_device_credential(mac, serial, raw_token="test-device-secret"):
    """Inserta credenciales bcrypt; devuelve el token en claro."""
    token_hash = bcrypt.hashpw(raw_token.encode(), bcrypt.gensalt()).decode()
    conn = database.get_db_connection()
    conn.execute(
        "INSERT INTO device_credentials(mac, token_hash, serial_number)"
        " VALUES (%s, %s, %s)",
        (mac, token_hash, serial),
    )
    conn.commit()
    conn.close()
    return raw_token


def claim_device(client, token, mac, serial, finca_id="finca-test"):
    """Asocia el dispositivo al usuario autenticado."""
    resp = client.post(
        "/api/devices/claim",
        json={"serial_number": serial, "finca_id": finca_id},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200, f"claim_device falló: {resp.get_json()}"
    return resp


def insert_alert(device_mac, alert_type="leak", message="test alert"):
    """Inserta una alerta en DB; devuelve su id."""
    conn = database.get_db_connection()
    conn.execute(
        "INSERT INTO alerts(device_mac, alert_type, message) VALUES (%s, %s, %s)",
        (device_mac, alert_type, message),
    )
    conn.commit()
    alert_id = conn.execute(
        "SELECT id FROM alerts WHERE device_mac=%s ORDER BY id DESC LIMIT 1",
        (device_mac,),
    ).fetchone()["id"]
    conn.close()
    return alert_id
