"""
test_alerts_crud.py — Tests CRUD completos para el sistema de alertas.

Cubre (los tests de ACK de alerta y ownership ya están en test_security.py):
  GET    /api/alerts               — listado con filtros mac y acked
  DELETE /api/alerts/<id>          — eliminar una alerta propia
  DELETE /api/alerts               — borrado masivo de alertas propias
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
    insert_alert,
)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _setup(client, email, mac, serial):
    """Registra un usuario con un dispositivo asociado; devuelve (token, mac)."""
    token = register_and_login(client, email)
    insert_device_credential(mac, serial)
    claim_device(client, token, mac, serial)
    return token


# ── GET /api/alerts ────────────────────────────────────────────────────────────

class TestGetAlerts:
    def test_requires_auth(self, client):
        assert client.get("/api/alerts").status_code == 401

    def test_returns_empty_list_for_new_user(self, client):
        token = register_and_login(client, "noalerts@test.com")
        resp = client.get("/api/alerts", headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.get_json() == []

    def test_returns_own_alerts(self, client):
        mac = "AA:10:20:30:40:50"
        token = _setup(client, "own@test.com", mac, "SN-ALRT-001")
        insert_alert(mac, "leak")
        insert_alert(mac, "burst")

        resp = client.get("/api/alerts", headers=auth_headers(token))
        assert resp.status_code == 200
        alerts = resp.get_json()
        assert len(alerts) == 2

    def test_does_not_return_other_users_alerts(self, client):
        mac_a = "AA:10:20:30:40:51"
        mac_b = "AA:10:20:30:40:52"
        token_a = _setup(client, "a@test.com", mac_a, "SN-ALRT-002")
        _setup(client, "b@test.com", mac_b, "SN-ALRT-003")
        insert_alert(mac_b, "leak")

        resp = client.get("/api/alerts", headers=auth_headers(token_a))
        assert resp.get_json() == []

    def test_filter_unacked_alerts(self, client):
        mac = "AA:10:20:30:40:53"
        token = _setup(client, "filter@test.com", mac, "SN-ALRT-004")
        alert_id = insert_alert(mac, "leak")
        # ACK la alerta
        client.post(f"/api/alerts/{alert_id}/ack", headers=auth_headers(token))
        # Crear otra sin ACK
        insert_alert(mac, "burst")

        resp = client.get("/api/alerts?acked=0", headers=auth_headers(token))
        alerts = resp.get_json()
        assert all(a["acked"] == 0 for a in alerts)
        assert len(alerts) == 1

    def test_filter_acked_alerts(self, client):
        mac = "AA:10:20:30:40:54"
        token = _setup(client, "filt2@test.com", mac, "SN-ALRT-005")
        alert_id = insert_alert(mac, "leak")
        client.post(f"/api/alerts/{alert_id}/ack", headers=auth_headers(token))

        resp = client.get("/api/alerts?acked=1", headers=auth_headers(token))
        alerts = resp.get_json()
        assert all(a["acked"] == 1 for a in alerts)

    def test_filter_by_own_mac(self, client):
        mac = "AA:10:20:30:40:55"
        token = _setup(client, "macfilt@test.com", mac, "SN-ALRT-006")
        insert_alert(mac, "leak")

        resp = client.get(f"/api/alerts?mac={mac}", headers=auth_headers(token))
        assert resp.status_code == 200
        assert len(resp.get_json()) == 1

    def test_filter_by_other_mac_returns_403(self, client):
        token = register_and_login(client, "intruder@test.com")
        resp = client.get("/api/alerts?mac=FF:FF:FF:FF:FF:FF",
                          headers=auth_headers(token))
        assert resp.status_code == 403

    def test_alert_row_has_expected_fields(self, client):
        mac = "AA:10:20:30:40:56"
        token = _setup(client, "shape@test.com", mac, "SN-ALRT-007")
        insert_alert(mac, "leak")

        alert = client.get("/api/alerts",
                           headers=auth_headers(token)).get_json()[0]
        for field in ("id", "device_mac", "alert_type", "message",
                      "acked", "created_at"):
            assert field in alert, f"Campo faltante: {field}"


# ── DELETE /api/alerts/<id> ────────────────────────────────────────────────────

class TestDeleteSingleAlert:
    def test_owner_can_delete_alert(self, client):
        mac = "BB:10:20:30:40:50"
        token = _setup(client, "del1@test.com", mac, "SN-ALRT-010")
        alert_id = insert_alert(mac)

        resp = client.delete(f"/api/alerts/{alert_id}",
                             headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.get_json()["ok"] is True

    def test_alert_is_removed_from_db(self, client):
        mac = "BB:10:20:30:40:51"
        token = _setup(client, "del2@test.com", mac, "SN-ALRT-011")
        alert_id = insert_alert(mac)

        client.delete(f"/api/alerts/{alert_id}", headers=auth_headers(token))

        conn = database.get_db_connection()
        row = conn.execute("SELECT id FROM alerts WHERE id=%s",
                           (alert_id,)).fetchone()
        conn.close()
        assert row is None

    def test_other_user_cannot_delete_alert(self, client):
        mac = "BB:10:20:30:40:52"
        _setup(client, "owner2@test.com", mac, "SN-ALRT-012")
        alert_id = insert_alert(mac)

        token_b = register_and_login(client, "intruder2@test.com")
        resp = client.delete(f"/api/alerts/{alert_id}",
                             headers=auth_headers(token_b))
        assert resp.status_code == 403

    def test_nonexistent_alert_returns_403(self, client):
        token = register_and_login(client, "nobody2@test.com")
        resp = client.delete("/api/alerts/999999", headers=auth_headers(token))
        assert resp.status_code == 403

    def test_requires_auth(self, client):
        assert client.delete("/api/alerts/1").status_code == 401


# ── DELETE /api/alerts (borrado masivo) ───────────────────────────────────────

class TestDeleteAllAlerts:
    def test_requires_auth(self, client):
        assert client.delete("/api/alerts").status_code == 401

    def test_deletes_all_own_alerts(self, client):
        mac = "CC:10:20:30:40:50"
        token = _setup(client, "mass1@test.com", mac, "SN-ALRT-020")
        insert_alert(mac, "leak")
        insert_alert(mac, "burst")

        resp = client.delete("/api/alerts", headers=auth_headers(token))
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["ok"] is True
        assert body["deleted"] == 2

        remaining = client.get("/api/alerts",
                               headers=auth_headers(token)).get_json()
        assert remaining == []

    def test_does_not_delete_other_users_alerts(self, client):
        mac_a = "CC:10:20:30:40:51"
        mac_b = "CC:10:20:30:40:52"
        token_a = _setup(client, "mass2a@test.com", mac_a, "SN-ALRT-021")
        token_b = _setup(client, "mass2b@test.com", mac_b, "SN-ALRT-022")
        insert_alert(mac_a, "leak")
        insert_alert(mac_b, "leak")

        # Usuario B elimina sus alertas
        client.delete("/api/alerts", headers=auth_headers(token_b))

        # Las alertas de A deben seguir
        remaining = client.get("/api/alerts",
                               headers=auth_headers(token_a)).get_json()
        assert len(remaining) == 1

    def test_delete_all_with_no_alerts_returns_deleted_zero(self, client):
        token = register_and_login(client, "empty3@test.com")
        resp = client.delete("/api/alerts", headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.get_json()["deleted"] == 0
