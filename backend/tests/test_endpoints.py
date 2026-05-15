"""
test_endpoints.py — Paso 2: tests de integración de endpoints HTTP
Requiere PostgreSQL en localhost:5432 (user=aquantia, pass=aquantia).
Usa DB separada 'aquantia_test' para no contaminar la DB de dev.

Fixtures de infraestructura (test_db_pool, flask_app, client, clean_tables)
provienen de conftest.py; este módulo sólo define helpers y casos de test.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import app as flask_module  # noqa: E402
import database              # noqa: E402

from conftest import (  # noqa: E402
    register_and_login as _ral,
    auth_headers,
    insert_device_credential,
    claim_device as _claim,
)


# ── Helpers locales ────────────────────────────────────────────────────────────

def register_user(client, email="test@example.com", password="pass1234",
                  name="Tester"):
    return client.post("/api/auth/register", json={
        "email": email,
        "password": password,
        "display_name": name,
    })


def login_user(client, email="test@example.com", password="pass1234"):
    return client.post("/api/auth/login", json={
        "email": email,
        "password": password,
    })


# ── Registro de usuario ───────────────────────────────────────────────────────

class TestRegister:
    def test_register_success_returns_201(self, client):
        resp = register_user(client)
        assert resp.status_code == 201
        body = resp.get_json()
        assert "token" in body
        assert body["user"]["email"] == "test@example.com"
        assert body["user"]["role"] == "user"

    def test_register_returns_display_name(self, client):
        resp = register_user(client, name="Alice")
        assert resp.status_code == 201
        assert resp.get_json()["user"]["display_name"] == "Alice"

    def test_register_missing_email_returns_400(self, client):
        resp = client.post("/api/auth/register", json={"password": "pass1234"})
        assert resp.status_code == 400

    def test_register_missing_password_returns_400(self, client):
        resp = client.post("/api/auth/register", json={"email": "a@b.com"})
        assert resp.status_code == 400

    def test_register_short_password_returns_400(self, client):
        resp = client.post("/api/auth/register", json={
            "email": "a@b.com", "password": "short"
        })
        assert resp.status_code == 400

    def test_register_duplicate_email_returns_409(self, client):
        register_user(client)
        resp = register_user(client)
        assert resp.status_code == 409


# ── Login ─────────────────────────────────────────────────────────────────────

class TestLogin:
    def test_login_success_returns_200_with_token(self, client):
        register_user(client)
        resp = login_user(client)
        assert resp.status_code == 200
        body = resp.get_json()
        assert "token" in body
        assert body["user"]["email"] == "test@example.com"

    def test_login_wrong_password_returns_401(self, client):
        register_user(client)
        resp = client.post("/api/auth/login", json={
            "email": "test@example.com",
            "password": "wrongpassword"
        })
        assert resp.status_code == 401

    def test_login_unknown_email_returns_401(self, client):
        resp = client.post("/api/auth/login", json={
            "email": "nobody@example.com",
            "password": "pass1234"
        })
        assert resp.status_code == 401

    def test_login_missing_password_returns_400(self, client):
        resp = client.post("/api/auth/login", json={"email": "a@b.com"})
        assert resp.status_code == 400

    def test_login_missing_email_returns_400(self, client):
        resp = client.post("/api/auth/login", json={"password": "pass1234"})
        assert resp.status_code == 400


# ── JWT / rutas protegidas ────────────────────────────────────────────────────

class TestJWT:
    def test_protected_route_without_token_returns_401(self, client):
        resp = client.get("/api/devices/mine")
        assert resp.status_code == 401
        assert resp.get_json()["code"] == "missing_token"

    def test_protected_route_with_invalid_token_returns_401(self, client):
        resp = client.get("/api/devices/mine", headers={
            "Authorization": "Bearer this.is.not.a.valid.jwt"
        })
        assert resp.status_code == 401

    def test_protected_route_with_malformed_header_returns_401(self, client):
        resp = client.get("/api/devices/mine", headers={
            "Authorization": "NotBearer sometoken"
        })
        assert resp.status_code == 401

    def test_auth_me_with_valid_token_returns_user(self, client):
        register_user(client)
        token = login_user(client).get_json()["token"]
        resp = client.get("/api/auth/me", headers=auth_headers(token))
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["email"] == "test@example.com"

    def test_auth_me_without_token_returns_401(self, client):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401

    def test_api_settings_requires_auth(self, client):
        resp = client.get("/api/settings")
        assert resp.status_code == 401


# ── Dispositivos ──────────────────────────────────────────────────────────────

class TestDevices:

    def _token(self, client, email="dev@example.com", password="pass1234"):
        register_user(client, email=email, password=password)
        return login_user(client, email=email, password=password).get_json()["token"]

    def _insert_credential(self, mac, serial, token_hash="fakehash"):
        conn = database.get_db_connection()
        conn.execute(
            "INSERT INTO device_credentials(mac, token_hash, serial_number)"
            " VALUES (%s, %s, %s)",
            (mac, token_hash, serial),
        )
        conn.commit()
        conn.close()

    def test_list_devices_empty_for_new_user(self, client):
        token = self._token(client)
        resp = client.get("/api/devices/mine", headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.get_json() == []

    def test_claim_missing_serial_returns_400(self, client):
        token = self._token(client)
        resp = client.post(
            "/api/devices/claim",
            json={},
            headers=auth_headers(token),
        )
        assert resp.status_code == 400

    def test_claim_unknown_serial_returns_404(self, client):
        token = self._token(client)
        resp = client.post(
            "/api/devices/claim",
            json={"serial_number": "DOESNOTEXIST"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 404

    def test_claim_valid_device_returns_200_with_mac(self, client):
        token = self._token(client)
        mac = "AA:BB:CC:DD:EE:FF"
        serial = "SN-TEST-001"
        self._insert_credential(mac, serial)

        resp = client.post(
            "/api/devices/claim",
            json={"serial_number": serial, "finca_id": "finca01"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["mac"] == mac
        assert body["serial_number"] == serial
        assert body["finca_id"] == "finca01"

    def test_claimed_device_appears_in_devices_mine(self, client):
        token = self._token(client)
        mac = "AA:BB:CC:DD:EE:FF"
        serial = "SN-TEST-002"
        self._insert_credential(mac, serial)

        client.post(
            "/api/devices/claim",
            json={"serial_number": serial},
            headers=auth_headers(token),
        )

        resp = client.get("/api/devices/mine", headers=auth_headers(token))
        assert resp.status_code == 200
        devices = resp.get_json()
        assert len(devices) == 1
        assert devices[0]["mac_address"] == mac

    def test_claim_device_already_owned_by_other_user_returns_409(self, client):
        """Dispositivo reclamado por usuario A → usuario B obtiene 409."""
        mac = "BB:CC:DD:EE:FF:AA"
        serial = "SN-TEST-003"
        self._insert_credential(mac, serial)

        # Usuario 1 reclama
        token1 = self._token(client, email="user1@test.com")
        client.post(
            "/api/devices/claim",
            json={"serial_number": serial},
            headers=auth_headers(token1),
        )

        # Usuario 2 intenta reclamar el mismo dispositivo
        register_user(client, email="user2@test.com")
        token2 = login_user(client, email="user2@test.com").get_json()["token"]
        resp = client.post(
            "/api/devices/claim",
            json={"serial_number": serial},
            headers=auth_headers(token2),
        )
        assert resp.status_code == 409

    def test_claim_device_without_token_returns_401(self, client):
        resp = client.post(
            "/api/devices/claim",
            json={"serial_number": "SN-ANY"},
        )
        assert resp.status_code == 401

    def test_release_device_removes_from_mine(self, client):
        """DELETE /api/devices/<mac> desvincula el dispositivo correctamente."""
        token = self._token(client)
        mac = "CC:DD:EE:FF:00:11"
        serial = "SN-DEL-001"
        self._insert_credential(mac, serial)

        client.post("/api/devices/claim",
                    json={"serial_number": serial},
                    headers=auth_headers(token))

        resp = client.delete(f"/api/devices/{mac}", headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.get_json()["ok"] is True

        # Ya no aparece en /devices/mine
        devices = client.get("/api/devices/mine",
                             headers=auth_headers(token)).get_json()
        assert not any(d["mac_address"].upper() == mac for d in devices)

    def test_release_device_other_user_returns_404(self, client):
        """Un usuario no puede desvincular un dispositivo que no le pertenece."""
        mac = "DD:EE:FF:00:11:22"
        serial = "SN-DEL-002"
        self._insert_credential(mac, serial)

        token_a = self._token(client, email="owner@test.com")
        client.post("/api/devices/claim",
                    json={"serial_number": serial},
                    headers=auth_headers(token_a))

        register_user(client, email="intruder@test.com")
        token_b = login_user(client, email="intruder@test.com").get_json()["token"]
        resp = client.delete(f"/api/devices/{mac}", headers=auth_headers(token_b))
        assert resp.status_code == 404

    def test_release_nonexistent_device_returns_404(self, client):
        token = self._token(client)
        resp = client.delete("/api/devices/AA:BB:CC:DD:EE:FF",
                             headers=auth_headers(token))
        assert resp.status_code == 404


# ── Settings ──────────────────────────────────────────────────────────────────

class TestSettings:
    def _token(self, client):
        register_user(client, email="cfg@test.com")
        return login_user(client, email="cfg@test.com").get_json()["token"]

    def test_get_settings_returns_dict(self, client):
        token = self._token(client)
        resp = client.get("/api/settings", headers=auth_headers(token))
        assert resp.status_code == 200
        assert isinstance(resp.get_json(), dict)

    def test_post_settings_updates_value(self, client):
        token = self._token(client)
        resp = client.post(
            "/api/settings",
            json={"flow_lpm": "8.5"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body.get("flow_lpm") == "8.5"

    def test_post_settings_multiple_keys(self, client):
        token = self._token(client)
        resp = client.post(
            "/api/settings",
            json={"flow_lpm": "6.0", "baseline_daily_l": "12.0"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body.get("flow_lpm") == "6.0"
        assert body.get("baseline_daily_l") == "12.0"

    def test_post_settings_missing_json_returns_400(self, client):
        token = self._token(client)
        resp = client.post(
            "/api/settings",
            data="not json",
            content_type="text/plain",
            headers=auth_headers(token),
        )
        assert resp.status_code == 400

    def test_settings_require_auth(self, client):
        assert client.get("/api/settings").status_code == 401
        assert client.post("/api/settings", json={}).status_code == 401


# ── Cabeceras de seguridad ────────────────────────────────────────────────────

class TestSecurityHeaders:
    def test_security_headers_present(self, client):
        resp = client.get("/api/auth/register",
                          json={"email": "h@h.com", "password": "pass1234"})
        assert resp.headers.get("X-Content-Type-Options") == "nosniff"
        assert resp.headers.get("X-Frame-Options") == "DENY"
        assert "Content-Security-Policy" in resp.headers
