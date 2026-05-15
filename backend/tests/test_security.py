"""
test_security.py — Tests de seguridad para los fixes implementados en app.py.

Fix 1: _verify_device_auth — MAC no registrada devuelve (None, False) → 401
Fix 2: irrigation_history — _PERIOD_MAP elimina f-string SQL con input usuario
Fix 3: IDOR en POST /api/alerts/<id>/ack — verificación de ownership
Fix 4: CORS — ALLOWED_ORIGINS=* lanza RuntimeError (no testeable por endpoint)
Fix 5: docker-compose.yml — infra, sin test
Fix 6: /api/mqtt/auth y /api/mqtt/acl — aislamiento por finca_id
"""
import os
import sys

import bcrypt
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import app as flask_module  # noqa: E402
import database              # noqa: E402

from conftest import (  # noqa: E402
    register_and_login as _register_and_login,
    auth_headers as _auth,
    insert_device_credential as _insert_device_credential,
    claim_device as _claim_device,
    insert_alert as _insert_alert,
)


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


# ── Fix 6: /api/mqtt/auth — autenticación de dispositivos y backend ───────────

class TestMQTTAuth:
    """Valida el endpoint mosquitto-go-auth POST /api/mqtt/auth."""

    def _insert_cred(self, mac, serial, raw_token="mqtt-secret"):
        """Inserta hash bcrypt directamente para el endpoint mqtt/auth."""
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

    def test_missing_credentials_returns_401(self, client):
        resp = client.post("/api/mqtt/auth", json={})
        assert resp.status_code == 401

    def test_backend_user_valid_password_returns_200(self, client, monkeypatch):
        monkeypatch.setenv("MQTT_PASSWORD", "secret-backend-pw")
        resp = client.post("/api/mqtt/auth",
                           json={"username": "backend", "password": "secret-backend-pw"})
        assert resp.status_code == 200
        assert resp.get_json()["ok"] is True

    def test_backend_user_wrong_password_returns_401(self, client, monkeypatch):
        monkeypatch.setenv("MQTT_PASSWORD", "correct-pw")
        resp = client.post("/api/mqtt/auth",
                           json={"username": "backend", "password": "wrong-pw"})
        assert resp.status_code == 401

    def test_device_valid_token_returns_200(self, client):
        mac = "AA:00:11:22:33:44"
        raw = self._insert_cred(mac, "SN-MQTT-001")
        resp = client.post("/api/mqtt/auth",
                           json={"username": mac, "password": raw})
        assert resp.status_code == 200
        assert resp.get_json()["ok"] is True

    def test_device_wrong_token_returns_401(self, client):
        mac = "AA:00:11:22:33:55"
        self._insert_cred(mac, "SN-MQTT-002")
        resp = client.post("/api/mqtt/auth",
                           json={"username": mac, "password": "wrong-token"})
        assert resp.status_code == 401

    def test_unknown_device_returns_401(self, client):
        resp = client.post("/api/mqtt/auth",
                           json={"username": "FF:FF:FF:FF:FF:FF", "password": "any"})
        assert resp.status_code == 401


# ── Fix 6: /api/mqtt/acl — aislamiento de topics por finca_id ────────────────

class TestMQTTACL:
    """Valida la política de ACL: un dispositivo solo accede a su finca."""

    def _setup_device(self, mac, serial, finca_id, raw_token="acl-secret"):
        """Registra credenciales y asigna finca_id en device_credentials."""
        token_hash = bcrypt.hashpw(raw_token.encode(), bcrypt.gensalt()).decode()
        conn = database.get_db_connection()
        conn.execute(
            "INSERT INTO device_credentials(mac, token_hash, serial_number,"
            " claimed_by_finca_id) VALUES (%s, %s, %s, %s)",
            (mac, token_hash, serial, finca_id),
        )
        conn.commit()
        conn.close()

    def test_backend_user_can_access_any_topic(self, client):
        resp = client.post("/api/mqtt/acl", json={
            "username": "backend",
            "topic": "aquantia/finca01/telemetry",
            "acc": 2,
        })
        assert resp.status_code == 200

    def test_device_can_publish_to_own_finca_telemetry(self, client):
        mac = "BB:11:22:33:44:55"
        self._setup_device(mac, "SN-ACL-001", "finca01")
        resp = client.post("/api/mqtt/acl", json={
            "username": mac,
            "topic": "aquantia/finca01/telemetry",
            "acc": 2,
        })
        assert resp.status_code == 200

    def test_device_cannot_publish_to_other_finca(self, client):
        mac = "BB:11:22:33:44:66"
        self._setup_device(mac, "SN-ACL-002", "finca01")
        resp = client.post("/api/mqtt/acl", json={
            "username": mac,
            "topic": "aquantia/finca02/telemetry",
            "acc": 2,
        })
        assert resp.status_code == 401

    def test_device_can_subscribe_to_own_cmd(self, client):
        mac = "BB:11:22:33:44:77"
        self._setup_device(mac, "SN-ACL-003", "finca01")
        resp = client.post("/api/mqtt/acl", json={
            "username": mac,
            "topic": "aquantia/finca01/cmd",
            "acc": 1,
        })
        assert resp.status_code == 200

    def test_malformed_topic_returns_401(self, client):
        mac = "BB:11:22:33:44:88"
        self._setup_device(mac, "SN-ACL-004", "finca01")
        resp = client.post("/api/mqtt/acl", json={
            "username": mac,
            "topic": "bad-topic",
            "acc": 2,
        })
        assert resp.status_code == 401

    def test_missing_fields_returns_401(self, client):
        resp = client.post("/api/mqtt/acl", json={})
        assert resp.status_code == 401
