"""
test_security.py — Tests de seguridad para los 5 fixes implementados en app.py.

Fix 1: _verify_device_auth — MAC no registrada devuelve (None, False) → 401
Fix 2: irrigation_history — _PERIOD_MAP elimina f-string SQL con input usuario
Fix 3: IDOR en POST /api/alerts/<id>/ack — verificación de ownership
Fix 4: CORS — ALLOWED_ORIGINS=* lanza RuntimeError (no testeable por endpoint)
Fix 5: docker-compose.yml — infra, sin test
"""
import os
import sys

import bcrypt
import psycopg2
import psycopg2.pool
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import app as flask_module  # noqa: E402
import database              # noqa: E402

TEST_DB = "aquantia_test"
PG_CONN = dict(
    host=os.environ.get("PG_HOST", "localhost"),
    port=int(os.environ.get("PG_PORT", 5432)),
    user=os.environ.get("PG_USER", "aquantia"),
    password=os.environ.get("PG_PASS", "aquantia_dev"),
)


# ── Fixtures de infraestructura ───────────────────────────────────────────────

@pytest.fixture(scope="session")
def test_db_pool():
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
    flask_module.app.config.update({
        "TESTING": True,
        "JWT_SECRET_KEY": "test-secret-for-pytest-at-least-32-bytes",
        "JWT_ACCESS_TOKEN_EXPIRES": False,
        "RATELIMIT_ENABLED": False,
    })
    yield flask_module.app


@pytest.fixture
def client(flask_app):
    with flask_app.test_client() as c:
        yield c


@pytest.fixture(autouse=True)
def clean_tables(test_db_pool):
    try:
        flask_module.limiter._storage.reset()
    except Exception:
        pass
    yield
    conn = database.get_db_connection()
    conn.execute("DELETE FROM alerts")
    conn.execute("DELETE FROM user_devices")
    conn.execute("DELETE FROM device_credentials")
    conn.execute("DELETE FROM users")
    conn.commit()
    conn.close()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _register_and_login(client, email, password="pass1234", name="Tester"):
    client.post("/api/auth/register", json={
        "email": email,
        "password": password,
        "display_name": name,
    })
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    return resp.get_json()["token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _insert_device_credential(mac, serial="SN-SEC-001"):
    """Inserta credenciales reales con bcrypt para que _verify_device_auth pueda validar."""
    raw_token = "test-device-secret"
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


def _claim_device(client, token, mac, serial):
    """Asocia el dispositivo al usuario autenticado."""
    resp = client.post(
        "/api/devices/claim",
        json={"serial_number": serial},
        headers=_auth(token),
    )
    assert resp.status_code == 200, f"Claim falló: {resp.get_json()}"


def _insert_alert(device_mac, alert_type="leak"):
    conn = database.get_db_connection()
    conn.execute(
        "INSERT INTO alerts(device_mac, alert_type, message) VALUES (%s, %s, %s)",
        (device_mac, alert_type, "test alert"),
    )
    conn.commit()
    alert_id = conn.execute(
        "SELECT id FROM alerts WHERE device_mac=%s ORDER BY id DESC LIMIT 1",
        (device_mac,),
    ).fetchone()["id"]
    conn.close()
    return alert_id


# ── Fix 1: _verify_device_auth — MAC no registrada → 401 ────────────────────

UNKNOWN_MAC = "AA:BB:CC:DD:EE:FF"


class TestDeviceAuthUnregisteredMAC:
    def test_relay_command_unknown_mac_returns_401(self, client):
        resp = client.get(
            "/api/relay/command",
            headers={"X-Device-MAC": UNKNOWN_MAC},
        )
        assert resp.status_code == 401

    def test_relay_ack_unknown_mac_returns_401(self, client):
        resp = client.post(
            "/api/relay/ack",
            data="0",
            headers={
                "X-Device-MAC": UNKNOWN_MAC,
                "Content-Type": "text/plain",
            },
        )
        assert resp.status_code == 401

    def test_send_message_unknown_mac_returns_401(self, client):
        resp = client.post(
            "/send_message",
            data="20.5,1013.25,60.0,10.5,180.0,10.5,180.0,100.0",
            headers={
                "X-Device-MAC": UNKNOWN_MAC,
                "Content-Type": "text/plain",
            },
        )
        assert resp.status_code == 401

    def test_relay_command_without_mac_returns_200_legacy(self, client):
        """Sin MAC → dispositivo legacy → _verify_device_auth devuelve (None, True)."""
        resp = client.get("/api/relay/command")
        assert resp.status_code == 200

    def test_relay_command_registered_mac_valid_token_returns_200(self, client):
        mac = "CC:DD:EE:FF:00:11"
        raw_token = _insert_device_credential(mac, serial="SN-REG-001")
        resp = client.get(
            "/api/relay/command",
            headers={
                "X-Device-MAC": mac,
                "X-Device-Token": raw_token,
            },
        )
        assert resp.status_code == 200

    def test_relay_command_registered_mac_wrong_token_returns_401(self, client):
        mac = "CC:DD:EE:FF:00:22"
        _insert_device_credential(mac, serial="SN-REG-002")
        resp = client.get(
            "/api/relay/command",
            headers={
                "X-Device-MAC": mac,
                "X-Device-Token": "wrong-token",
            },
        )
        assert resp.status_code == 401

    def test_relay_command_registered_mac_missing_token_returns_401(self, client):
        mac = "CC:DD:EE:FF:00:33"
        _insert_device_credential(mac, serial="SN-REG-003")
        resp = client.get(
            "/api/relay/command",
            headers={"X-Device-MAC": mac},
        )
        assert resp.status_code == 401


# ── Fix 2: irrigation_history — _PERIOD_MAP, sin f-string con input usuario ──

class TestIrrigationHistoryPeriod:
    def _token(self, client):
        return _register_and_login(client, "irr@example.com")

    def test_period_day_returns_200(self, client):
        token = self._token(client)
        resp = client.get("/api/irrigation/history?period=day", headers=_auth(token))
        assert resp.status_code == 200
        assert isinstance(resp.get_json(), list)

    def test_period_week_returns_200(self, client):
        token = self._token(client)
        resp = client.get("/api/irrigation/history?period=week", headers=_auth(token))
        assert resp.status_code == 200
        assert isinstance(resp.get_json(), list)

    def test_period_month_returns_200(self, client):
        token = self._token(client)
        resp = client.get("/api/irrigation/history?period=month", headers=_auth(token))
        assert resp.status_code == 200
        assert isinstance(resp.get_json(), list)

    def test_invalid_period_falls_back_to_day(self, client):
        token = self._token(client)
        resp_invalid = client.get(
            "/api/irrigation/history?period=INVALID", headers=_auth(token)
        )
        resp_day = client.get(
            "/api/irrigation/history?period=day", headers=_auth(token)
        )
        assert resp_invalid.status_code == 200
        assert resp_day.status_code == 200
        # Ambas respuestas deben ser listas (misma estructura, mismos datos vacíos)
        assert isinstance(resp_invalid.get_json(), list)
        assert isinstance(resp_day.get_json(), list)

    def test_sql_injection_attempt_in_period_does_not_crash(self, client):
        """El whitelist convierte cualquier valor inválido a 'day'; no hay ejecución directa."""
        import urllib.parse
        token = self._token(client)
        malicious = urllib.parse.quote("'; DROP TABLE home_weather_station; --")
        resp = client.get(
            f"/api/irrigation/history?period={malicious}", headers=_auth(token)
        )
        assert resp.status_code == 200
        assert isinstance(resp.get_json(), list)

    def test_period_response_shape(self, client):
        token = self._token(client)
        resp = client.get("/api/irrigation/history?period=day", headers=_auth(token))
        data = resp.get_json()
        assert isinstance(data, list)
        for row in data:
            assert "period" in row
            assert "liters" in row
            assert "seconds" in row

    def test_endpoint_requires_auth(self, client):
        resp = client.get("/api/irrigation/history?period=day")
        assert resp.status_code == 401


# ── Fix 3: IDOR en POST /api/alerts/<id>/ack ─────────────────────────────────

class TestAlertAckIDOR:
    def test_owner_can_ack_own_alert(self, client):
        mac = "11:22:33:44:55:66"
        serial = "SN-IDOR-001"
        _insert_device_credential(mac, serial)

        token = _register_and_login(client, "owner@example.com")
        _claim_device(client, token, mac, serial)

        alert_id = _insert_alert(mac)
        resp = client.post(f"/api/alerts/{alert_id}/ack", headers=_auth(token))
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["ok"] is True
        assert body["id"] == alert_id

    def test_other_user_cannot_ack_alert_returns_403(self, client):
        mac_a = "AA:11:22:33:44:55"
        serial_a = "SN-IDOR-002"
        _insert_device_credential(mac_a, serial_a)

        token_a = _register_and_login(client, "user_a@example.com")
        _claim_device(client, token_a, mac_a, serial_a)

        alert_id = _insert_alert(mac_a)

        # Usuario B intenta hacer ACK de una alerta del dispositivo de A
        token_b = _register_and_login(client, "user_b@example.com")
        resp = client.post(f"/api/alerts/{alert_id}/ack", headers=_auth(token_b))
        assert resp.status_code == 403
        body = resp.get_json()
        assert "error" in body

    def test_nonexistent_alert_id_returns_403(self, client):
        """alert_row será None → 'not alert_row or mac not in user_macs' → 403."""
        token = _register_and_login(client, "nobody@example.com")
        resp = client.post("/api/alerts/999999/ack", headers=_auth(token))
        # app.py: if not alert_row or alert_row["device_mac"] not in user_macs → 403
        assert resp.status_code == 403

    def test_alert_ack_without_token_returns_401(self, client):
        resp = client.post("/api/alerts/1/ack")
        assert resp.status_code == 401

    def test_ack_marks_alert_as_resolved(self, client):
        mac = "22:33:44:55:66:77"
        serial = "SN-IDOR-003"
        _insert_device_credential(mac, serial)

        token = _register_and_login(client, "verifier@example.com")
        _claim_device(client, token, mac, serial)

        alert_id = _insert_alert(mac)

        # Verificar que la alerta empieza sin ACK
        conn = database.get_db_connection()
        row_before = conn.execute(
            "SELECT acked FROM alerts WHERE id=%s", (alert_id,)
        ).fetchone()
        conn.close()
        assert row_before["acked"] == 0

        client.post(f"/api/alerts/{alert_id}/ack", headers=_auth(token))

        conn = database.get_db_connection()
        row_after = conn.execute(
            "SELECT acked, acked_at FROM alerts WHERE id=%s", (alert_id,)
        ).fetchone()
        conn.close()
        assert row_after["acked"] == 1
        assert row_after["acked_at"] is not None
