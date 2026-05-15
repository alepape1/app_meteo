"""
test_relay_dashboard.py — Tests del relay visto desde el dashboard de usuario.

Cubre:
  GET  /api/relay   — estado de relays del dispositivo del usuario
  POST /api/relay   — cambiar estado deseado de un relay
  (Los endpoints ESP32 /api/relay/command y /api/relay/ack ya están en
   test_security.py como Fix 1.)
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


# ── GET /api/relay ─────────────────────────────────────────────────────────────

class TestGetRelayDashboard:
    def test_requires_auth(self, client):
        assert client.get("/api/relay").status_code == 401

    def test_returns_empty_list_without_device(self, client):
        token = register_and_login(client, "nodev@relay.com")
        resp = client.get("/api/relay", headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.get_json() == []

    def test_returns_relay_states_for_device(self, client):
        mac = "AA:22:33:44:55:66"
        token = _setup(client, "relget@relay.com", mac, "SN-REL-001")
        resp = client.get("/api/relay", headers=auth_headers(token))
        assert resp.status_code == 200
        states = resp.get_json()
        assert isinstance(states, list)
        assert len(states) > 0

    def test_relay_state_shape(self, client):
        mac = "AA:22:33:44:55:77"
        token = _setup(client, "shape@relay.com", mac, "SN-REL-002")
        state = client.get("/api/relay",
                           headers=auth_headers(token)).get_json()[0]
        assert "index" in state
        assert "desired" in state
        assert "actual" in state

    def test_unauthorized_mac_returns_403(self, client):
        token = register_and_login(client, "idor@relay.com")
        resp = client.get("/api/relay?mac=FF:FF:FF:FF:FF:FF",
                          headers=auth_headers(token))
        assert resp.status_code == 403


# ── POST /api/relay ────────────────────────────────────────────────────────────

class TestPostRelayDashboard:
    def test_requires_auth(self, client):
        resp = client.post("/api/relay", json={"state": True})
        assert resp.status_code == 401

    def test_missing_state_field_returns_400(self, client):
        token = register_and_login(client, "nostate@relay.com")
        resp = client.post("/api/relay", json={"index": 0},
                           headers=auth_headers(token))
        assert resp.status_code == 400

    def test_set_relay_without_device_returns_400(self, client):
        token = register_and_login(client, "nodev2@relay.com")
        resp = client.post("/api/relay", json={"state": True},
                           headers=auth_headers(token))
        assert resp.status_code == 400

    def test_set_relay_desired_on(self, client):
        mac = "BB:22:33:44:55:66"
        token = _setup(client, "set1@relay.com", mac, "SN-REL-010")
        resp = client.post("/api/relay",
                           json={"state": True, "index": 0, "mac": mac},
                           headers=auth_headers(token))
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["state"] is True
        assert body["index"] == 0

    def test_set_relay_desired_off(self, client):
        mac = "BB:22:33:44:55:77"
        token = _setup(client, "set2@relay.com", mac, "SN-REL-011")
        resp = client.post("/api/relay",
                           json={"state": False, "index": 0, "mac": mac},
                           headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.get_json()["state"] is False

    def test_desired_state_persists_in_relay_get(self, client):
        mac = "BB:22:33:44:55:88"
        token = _setup(client, "persist@relay.com", mac, "SN-REL-012")

        client.post("/api/relay",
                    json={"state": True, "index": 0, "mac": mac},
                    headers=auth_headers(token))

        states = client.get("/api/relay",
                            headers=auth_headers(token)).get_json()
        relay_0 = next((s for s in states if s["index"] == 0), None)
        assert relay_0 is not None
        assert relay_0["desired"] is True

    def test_unauthorized_mac_returns_403(self, client):
        token = register_and_login(client, "idor2@relay.com")
        resp = client.post("/api/relay",
                           json={"state": True, "mac": "FF:FF:FF:FF:FF:FF"},
                           headers=auth_headers(token))
        assert resp.status_code == 403
