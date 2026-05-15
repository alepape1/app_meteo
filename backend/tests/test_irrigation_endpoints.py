"""
test_irrigation_endpoints.py — Tests de los endpoints de riego.

Cubre:
  GET  /api/irrigation/stats    — estadísticas mensuales de consumo
  GET  /api/irrigation/history  — barras agrupadas (ya cubierto en test_security,
                                   aquí ampliamos con shape y datos reales)
  GET  /api/irrigation/sessions — sesiones individuales de riego
  POST /api/irrigation/reset    — reset manual del contador
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import database
from conftest import (
    register_and_login,
    auth_headers,
    insert_device_credential,
    claim_device,
)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _setup(client, email, mac, serial):
    token = register_and_login(client, email)
    insert_device_credential(mac, serial)
    claim_device(client, token, mac, serial)
    return token


# ── GET /api/irrigation/stats ─────────────────────────────────────────────────

class TestIrrigationStats:
    def test_requires_auth(self, client):
        assert client.get("/api/irrigation/stats").status_code == 401

    def test_returns_zero_stats_without_device(self, client):
        token = register_and_login(client, "nodev@irr.com")
        resp = client.get("/api/irrigation/stats", headers=auth_headers(token))
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["monthly_seconds"] == 0
        assert body["monthly_liters"] == 0.0
        assert body["today_seconds"] == 0

    def test_response_shape(self, client):
        token = register_and_login(client, "shape@irr.com")
        body = client.get("/api/irrigation/stats",
                          headers=auth_headers(token)).get_json()
        for key in ("monthly_seconds", "monthly_liters", "today_seconds",
                    "today_liters", "baseline_liters", "savings_liters",
                    "days_elapsed", "daily", "leak_liters",
                    "today_leak_liters", "total_liters"):
            assert key in body, f"Clave faltante: {key}"

    def test_daily_is_list(self, client):
        token = register_and_login(client, "daily@irr.com")
        body = client.get("/api/irrigation/stats",
                          headers=auth_headers(token)).get_json()
        assert isinstance(body["daily"], list)

    def test_unauthorized_mac_returns_403(self, client):
        token = register_and_login(client, "idor@irr.com")
        resp = client.get("/api/irrigation/stats?mac=FF:FF:FF:FF:FF:FF",
                          headers=auth_headers(token))
        assert resp.status_code == 403

    def test_stats_with_device_returns_200(self, client):
        mac = "AA:11:22:33:44:55"
        token = _setup(client, "wdev@irr.com", mac, "SN-IRR-001")
        resp = client.get("/api/irrigation/stats", headers=auth_headers(token))
        assert resp.status_code == 200


# ── GET /api/irrigation/sessions ──────────────────────────────────────────────

class TestIrrigationSessions:
    def test_requires_auth(self, client):
        assert client.get("/api/irrigation/sessions").status_code == 401

    def test_returns_empty_list_without_device(self, client):
        token = register_and_login(client, "nosess@irr.com")
        resp = client.get("/api/irrigation/sessions", headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.get_json() == []

    def test_returns_list(self, client):
        mac = "BB:11:22:33:44:55"
        token = _setup(client, "sess@irr.com", mac, "SN-IRR-010")
        resp = client.get("/api/irrigation/sessions", headers=auth_headers(token))
        assert resp.status_code == 200
        assert isinstance(resp.get_json(), list)

    def test_unauthorized_mac_returns_403(self, client):
        token = register_and_login(client, "idor2@irr.com")
        resp = client.get("/api/irrigation/sessions?mac=FF:FF:FF:FF:FF:FF",
                          headers=auth_headers(token))
        assert resp.status_code == 403


# ── POST /api/irrigation/reset ────────────────────────────────────────────────

class TestIrrigationReset:
    def test_requires_auth(self, client):
        assert client.post("/api/irrigation/reset").status_code == 401

    def test_reset_returns_ok(self, client):
        token = register_and_login(client, "reset@irr.com")
        resp = client.post("/api/irrigation/reset", headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.get_json()["ok"] is True

    def test_reset_inserts_row_in_db(self, client):
        token = register_and_login(client, "resetdb@irr.com")

        conn = database.get_db_connection()
        before = conn.execute(
            "SELECT COUNT(*) AS n FROM irrigation_resets"
        ).fetchone()["n"]
        conn.close()

        client.post("/api/irrigation/reset", headers=auth_headers(token))

        conn = database.get_db_connection()
        after = conn.execute(
            "SELECT COUNT(*) AS n FROM irrigation_resets"
        ).fetchone()["n"]
        conn.close()
        assert after == before + 1

    def test_multiple_resets_accumulate(self, client):
        token = register_and_login(client, "multi@irr.com")
        client.post("/api/irrigation/reset", headers=auth_headers(token))
        client.post("/api/irrigation/reset", headers=auth_headers(token))

        conn = database.get_db_connection()
        total = conn.execute(
            "SELECT COUNT(*) AS n FROM irrigation_resets"
        ).fetchone()["n"]
        conn.close()
        assert total >= 2


# ── GET /api/irrigation/history (ampliación) ──────────────────────────────────

class TestIrrigationHistoryExtended:
    """Los tests básicos de período y SQL-injection ya están en test_security.py.
    Aquí cubrimos el aislamiento de dispositivo."""

    def test_requires_auth(self, client):
        assert client.get("/api/irrigation/history").status_code == 401

    def test_returns_empty_without_device(self, client):
        token = register_and_login(client, "nohist@irr.com")
        resp = client.get("/api/irrigation/history", headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.get_json() == []

    def test_unauthorized_mac_returns_403(self, client):
        token = register_and_login(client, "histidor@irr.com")
        resp = client.get("/api/irrigation/history?mac=FF:FF:FF:FF:FF:FF",
                          headers=auth_headers(token))
        assert resp.status_code == 403
