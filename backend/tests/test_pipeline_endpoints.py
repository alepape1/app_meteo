"""
test_pipeline_endpoints.py — Tests de los endpoints del pipeline de presión/caudal.

Cubre:
  GET  /api/pipeline/config      (público — ESP32 sin JWT)
  GET  /api/pipeline/scenario    (público — compatibilidad firmware anterior)
  POST /api/pipeline/config      (requiere JWT)
  POST /api/pipeline/scenario    (requiere JWT, delega en config)
  GET  /api/pipeline/status      (requiere JWT)
  GET  /api/pipeline/readings    (requiere JWT)
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from conftest import register_and_login, auth_headers, insert_device_credential, claim_device


# ── Helpers ────────────────────────────────────────────────────────────────────

def _user_token(client, email="pipe@test.com"):
    return register_and_login(client, email)


def _setup_device(client, token, mac="AA:BB:CC:11:22:33", serial="SN-PIPE-001"):
    insert_device_credential(mac, serial)
    claim_device(client, token, mac, serial)
    return mac


# ── GET /api/pipeline/config (público — sin JWT) ──────────────────────────────

class TestGetPipelineConfigPublic:
    def test_returns_200_without_auth(self, client):
        resp = client.get("/api/pipeline/config")
        assert resp.status_code == 200

    def test_response_shape(self, client):
        resp = client.get("/api/pipeline/config")
        body = resp.get_json()
        assert "scenario" in body
        assert "mode" in body
        assert "telemetry_interval_s" in body
        assert "irrigation_type" in body

    def test_default_scenario_is_normal(self, client):
        resp = client.get("/api/pipeline/config")
        assert resp.get_json()["scenario"] == "normal"

    def test_default_mode_is_sim(self, client):
        resp = client.get("/api/pipeline/config")
        assert resp.get_json()["mode"] == "sim"


# ── GET /api/pipeline/scenario (público) ──────────────────────────────────────

class TestGetPipelineScenarioPublic:
    def test_returns_200_without_auth(self, client):
        resp = client.get("/api/pipeline/scenario")
        assert resp.status_code == 200

    def test_returns_plain_text_scenario(self, client):
        resp = client.get("/api/pipeline/scenario")
        assert resp.data.decode().strip() == "normal"


# ── POST /api/pipeline/config (requiere JWT) ──────────────────────────────────

class TestPostPipelineConfig:
    def test_update_scenario_leak(self, client):
        token = _user_token(client)
        resp = client.post("/api/pipeline/config",
                           json={"scenario": "leak"},
                           headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.get_json()["scenario"] == "leak"

    def test_update_mode_real(self, client):
        token = _user_token(client)
        resp = client.post("/api/pipeline/config",
                           json={"mode": "real"},
                           headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.get_json()["mode"] == "real"

    def test_update_irrigation_type(self, client):
        token = _user_token(client)
        resp = client.post("/api/pipeline/config",
                           json={"irrigation_type": "drip"},
                           headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.get_json()["irrigation_type"] == "drip"

    def test_update_telemetry_interval(self, client):
        token = _user_token(client)
        resp = client.post("/api/pipeline/config",
                           json={"telemetry_interval_s": 30},
                           headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.get_json()["telemetry_interval_s"] == 30

    def test_invalid_scenario_returns_400(self, client):
        token = _user_token(client)
        resp = client.post("/api/pipeline/config",
                           json={"scenario": "explosion"},
                           headers=auth_headers(token))
        assert resp.status_code == 400

    def test_invalid_mode_returns_400(self, client):
        token = _user_token(client)
        resp = client.post("/api/pipeline/config",
                           json={"mode": "auto"},
                           headers=auth_headers(token))
        assert resp.status_code == 400

    def test_invalid_irrigation_type_returns_400(self, client):
        token = _user_token(client)
        resp = client.post("/api/pipeline/config",
                           json={"irrigation_type": "flood"},
                           headers=auth_headers(token))
        assert resp.status_code == 400

    def test_telemetry_interval_out_of_range_returns_400(self, client):
        token = _user_token(client)
        # Fuera del rango permitido [5, 3600]
        resp = client.post("/api/pipeline/config",
                           json={"telemetry_interval_s": 1},
                           headers=auth_headers(token))
        assert resp.status_code == 400

    def test_empty_body_returns_400(self, client):
        token = _user_token(client)
        resp = client.post("/api/pipeline/config",
                           json={},
                           headers=auth_headers(token))
        assert resp.status_code == 400

    def test_requires_auth(self, client):
        resp = client.post("/api/pipeline/config", json={"scenario": "normal"})
        assert resp.status_code == 401

    def test_config_persists_on_get(self, client):
        """El escenario guardado vía POST debe aparecer en el GET público."""
        token = _user_token(client)
        client.post("/api/pipeline/config",
                    json={"scenario": "burst"},
                    headers=auth_headers(token))
        resp = client.get("/api/pipeline/config")
        assert resp.get_json()["scenario"] == "burst"

    def test_unauthorized_mac_returns_403(self, client):
        token = _user_token(client)
        resp = client.post("/api/pipeline/config",
                           json={"scenario": "normal",
                                 "mac": "FF:FF:FF:FF:FF:FF"},
                           headers=auth_headers(token))
        assert resp.status_code == 403


# ── POST /api/pipeline/scenario (delegación en config) ────────────────────────

class TestPostPipelineScenario:
    def test_set_scenario_returns_200(self, client):
        token = _user_token(client)
        resp = client.post("/api/pipeline/scenario",
                           json={"scenario": "obstruction"},
                           headers=auth_headers(token))
        assert resp.status_code == 200

    def test_missing_scenario_field_returns_400(self, client):
        token = _user_token(client)
        resp = client.post("/api/pipeline/scenario",
                           json={"mode": "sim"},
                           headers=auth_headers(token))
        assert resp.status_code == 400

    def test_requires_auth(self, client):
        resp = client.post("/api/pipeline/scenario", json={"scenario": "normal"})
        assert resp.status_code == 401


# ── GET /api/pipeline/status (requiere JWT) ───────────────────────────────────

class TestGetPipelineStatus:
    def test_requires_auth(self, client):
        resp = client.get("/api/pipeline/status")
        assert resp.status_code == 401

    def test_returns_200_for_authenticated_user(self, client):
        token = _user_token(client)
        resp = client.get("/api/pipeline/status", headers=auth_headers(token))
        assert resp.status_code == 200

    def test_response_shape(self, client):
        token = _user_token(client)
        body = client.get("/api/pipeline/status",
                          headers=auth_headers(token)).get_json()
        assert "current" in body
        assert "detection" in body
        assert "config" in body

    def test_detection_shape(self, client):
        token = _user_token(client)
        detection = client.get("/api/pipeline/status",
                               headers=auth_headers(token)).get_json()["detection"]
        assert "status" in detection
        assert "confidence" in detection
        assert "alerts" in detection

    def test_config_shape(self, client):
        token = _user_token(client)
        cfg = client.get("/api/pipeline/status",
                         headers=auth_headers(token)).get_json()["config"]
        assert "scenario" in cfg
        assert "source" in cfg
        assert "nominal_flow_lpm" in cfg

    def test_unauthorized_mac_returns_403(self, client):
        token = _user_token(client)
        resp = client.get("/api/pipeline/status?mac=FF:FF:FF:FF:FF:FF",
                          headers=auth_headers(token))
        assert resp.status_code == 403


# ── GET /api/pipeline/readings (requiere JWT) ─────────────────────────────────

class TestGetPipelineReadings:
    def test_requires_auth(self, client):
        resp = client.get("/api/pipeline/readings")
        assert resp.status_code == 401

    def test_returns_list(self, client):
        token = _user_token(client)
        body = client.get("/api/pipeline/readings",
                          headers=auth_headers(token)).get_json()
        assert isinstance(body, list)
        assert len(body) > 0

    def test_each_reading_has_required_keys(self, client):
        token = _user_token(client)
        readings = client.get("/api/pipeline/readings",
                              headers=auth_headers(token)).get_json()
        r = readings[0]
        assert "timestamp" in r
        assert "pressure_bar" in r
        assert "flow_lpm" in r
        assert "valve_open" in r

    def test_n_param_limits_results(self, client):
        token = _user_token(client)
        body = client.get("/api/pipeline/readings?n=10",
                          headers=auth_headers(token)).get_json()
        assert len(body) <= 10

    def test_unauthorized_mac_returns_403(self, client):
        token = _user_token(client)
        resp = client.get("/api/pipeline/readings?mac=FF:FF:FF:FF:FF:FF",
                          headers=auth_headers(token))
        assert resp.status_code == 403
