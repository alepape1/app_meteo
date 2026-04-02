"""
mqtt_client.py — Suscriptor/publicador MQTT para el backend Aquantia.

Se conecta al broker Mosquitto (localhost o VPS via TLS) y:
  - Suscribe a aquantia/+/telemetry → inserta datos en home_weather_station
  - Suscribe a aquantia/+/alerts   → inserta alertas en la tabla alerts
  - Suscribe a aquantia/+/register → registra/actualiza device_info
  - Publica a  aquantia/<finca_id>/cmd → comandos de relay a los dispositivos

Configuración via variables de entorno (.env):
  MQTT_HOST      — hostname del broker     (defecto: localhost)
  MQTT_PORT      — puerto TCP              (defecto: 1883; 8883 para TLS)
  MQTT_USER      — usuario MQTT            (opcional)
  MQTT_PASSWORD  — contraseña MQTT         (opcional)
  MQTT_TLS       — "1" para habilitar TLS  (defecto: 0)
  MQTT_CA_CERT   — ruta al certificado CA  (solo si MQTT_TLS=1)
"""
import json
import logging
import os
import ssl
import threading

import paho.mqtt.client as mqtt
from database import get_db_connection

logger = logging.getLogger(__name__)

MQTT_HOST     = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT     = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER     = os.getenv("MQTT_USER", "")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "")
MQTT_TLS      = os.getenv("MQTT_TLS", "0") == "1"
MQTT_CA_CERT  = os.getenv("MQTT_CA_CERT", "")

_client: mqtt.Client | None = None
_lock = threading.Lock()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _finca_id_from_topic(topic: str) -> str | None:
    """Extrae finca_id de un topic 'aquantia/<finca_id>/subtopic'."""
    parts = topic.split("/")
    return parts[1] if len(parts) >= 3 and parts[0] == "aquantia" else None


# ── Callbacks de mensajes entrantes ──────────────────────────────────────────

def _handle_telemetry(finca_id: str, payload: dict):
    """Inserta lectura de telemetría JSON en home_weather_station."""
    db = get_db_connection()
    try:
        device_mac = payload.get("mac_address") or payload.get("device_mac")
        db.execute("""
            INSERT INTO home_weather_station(
                temperature, pressure, temperature_barometer, humidity,
                windSpeed, windDirection, windSpeedFiltered, windDirectionFiltered,
                light, dht_temperature, dht_humidity,
                rssi, free_heap, uptime_s, relay_active,
                pipeline_pressure, pipeline_flow, soil_moisture, device_mac
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            payload.get("temperature"),
            payload.get("pressure"),
            payload.get("temperature_barometer"),
            payload.get("humidity"),
            payload.get("windSpeed"),
            payload.get("windDirection"),
            payload.get("windSpeedFiltered"),
            payload.get("windDirectionFiltered"),
            payload.get("light"),
            payload.get("dht_temperature"),
            payload.get("dht_humidity"),
            payload.get("rssi"),
            payload.get("free_heap"),
            payload.get("uptime_s"),
            int(payload.get("relay_active", 0)),
            payload.get("pipeline_pressure"),
            payload.get("pipeline_flow"),
            payload.get("soil_moisture"),
            device_mac,
        ))
        db.commit()
        logger.debug("Telemetría MQTT insertada: finca_id=%s", finca_id)
    finally:
        db.close()


def _handle_alert(finca_id: str, payload: dict):
    """Inserta alerta en la tabla alerts."""
    db = get_db_connection()
    try:
        db.execute("""
            INSERT INTO alerts(finca_id, device_mac, alert_type, severity, message)
            VALUES (?, ?, ?, ?, ?)
        """, (
            finca_id,
            payload.get("device_mac"),
            payload.get("type", "unknown"),
            payload.get("severity", "info"),
            payload.get("message", ""),
        ))
        db.commit()
        logger.info("Alerta MQTT recibida: finca_id=%s type=%s severity=%s",
                    finca_id, payload.get("type"), payload.get("severity"))
    finally:
        db.close()


def _handle_register(finca_id: str, payload: dict):
    """Registra o actualiza device_info desde un mensaje MQTT de registro."""
    db = get_db_connection()
    try:
        db.execute("""
            INSERT INTO device_info(
                finca_id, chip_model, chip_revision, cpu_freq_mhz, flash_size_mb,
                sdk_version, mac_address, ip_address, relay_count, last_seen
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(mac_address) DO UPDATE SET
                finca_id      = excluded.finca_id,
                chip_model    = excluded.chip_model,
                chip_revision = excluded.chip_revision,
                cpu_freq_mhz  = excluded.cpu_freq_mhz,
                flash_size_mb = excluded.flash_size_mb,
                sdk_version   = excluded.sdk_version,
                ip_address    = excluded.ip_address,
                relay_count   = excluded.relay_count,
                last_seen     = CURRENT_TIMESTAMP
        """, (
            finca_id,
            payload.get("chip_model"),
            payload.get("chip_revision"),
            payload.get("cpu_freq_mhz"),
            payload.get("flash_size_mb"),
            payload.get("sdk_version"),
            payload.get("mac_address"),
            payload.get("ip_address"),
            int(payload.get("relay_count", 1)),
        ))
        db.commit()
        logger.info("Dispositivo MQTT registrado: finca_id=%s mac=%s",
                    finca_id, payload.get("mac_address"))
    finally:
        db.close()


def _on_connect(client, userdata, flags, rc):
    if rc == 0:
        logger.info("MQTT conectado a %s:%d", MQTT_HOST, MQTT_PORT)
        client.subscribe("aquantia/+/telemetry")
        client.subscribe("aquantia/+/alerts")
        client.subscribe("aquantia/+/register")
    else:
        logger.error("MQTT error de conexión: rc=%d", rc)


def _on_message(client, userdata, msg):
    try:
        finca_id = _finca_id_from_topic(msg.topic)
        if not finca_id:
            return
        payload = json.loads(msg.payload.decode("utf-8"))
        subtopic = msg.topic.split("/")[-1]
        if subtopic == "telemetry":
            _handle_telemetry(finca_id, payload)
        elif subtopic == "alerts":
            _handle_alert(finca_id, payload)
        elif subtopic == "register":
            _handle_register(finca_id, payload)
    except Exception:
        logger.exception("Error procesando mensaje MQTT: topic=%s payload=%s",
                         msg.topic, msg.payload[:200])


# ── API pública ───────────────────────────────────────────────────────────────

def publish_cmd(finca_id: str, payload: dict) -> bool:
    """Publica un comando JSON a un dispositivo.
    Devuelve True si se encoló correctamente, False si MQTT no está disponible."""
    global _client
    if _client is None:
        return False
    topic = f"aquantia/{finca_id}/cmd"
    result = _client.publish(topic, json.dumps(payload), qos=1)
    if result.rc == mqtt.MQTT_ERR_SUCCESS:
        logger.info("Cmd MQTT publicado: %s → %s", topic, payload)
        return True
    logger.warning("Cmd MQTT falló (rc=%d): %s", result.rc, topic)
    return False


def is_connected() -> bool:
    """Indica si el cliente MQTT está activo y conectado."""
    return _client is not None and _client.is_connected()


def start():
    """Inicia el cliente MQTT en un hilo daemon. Llámalo una sola vez al arrancar.
    Si el broker no está disponible arranca igualmente en modo sin MQTT (no bloquea)."""
    global _client
    with _lock:
        if _client is not None:
            return

    client = mqtt.Client(client_id="aquantia-backend", clean_session=True)

    if MQTT_USER:
        client.username_pw_set(MQTT_USER, MQTT_PASSWORD)

    if MQTT_TLS:
        ca = MQTT_CA_CERT if MQTT_CA_CERT else None
        client.tls_set(ca_certs=ca, tls_version=ssl.PROTOCOL_TLS_CLIENT)

    client.on_connect = _on_connect
    client.on_message = _on_message
    client.reconnect_delay_set(min_delay=2, max_delay=60)

    try:
        client.connect_async(MQTT_HOST, MQTT_PORT, keepalive=60)
    except Exception as exc:
        logger.warning("MQTT: no se pudo conectar a %s:%d (%s) — funcionando sin MQTT",
                       MQTT_HOST, MQTT_PORT, exc)
        return

    _client = client

    def _loop():
        client.loop_forever(retry_first_connection=True)

    t = threading.Thread(target=_loop, name="mqtt-loop", daemon=True)
    t.start()
    logger.info("MQTT cliente iniciado (hilo daemon) → %s:%d", MQTT_HOST, MQTT_PORT)
