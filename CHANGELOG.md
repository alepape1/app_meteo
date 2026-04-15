# Changelog — Aquantia Dashboard (Backend + Frontend)

Todos los cambios notables de este proyecto se documentan en este archivo.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).
Versiones siguiendo [Semantic Versioning](https://semver.org/lang/es/).

> **Compatibilidad firmware:** Cada versión del backend indica el rango de firmware compatible.
> Ver [weather-station-ESP](https://github.com/alepape1/weather-station-ESP) para las versiones de firmware.

---

## [v0.1.0-beta.2] — 2026-04-16

**Firmware compatible:** `v0.1.0-beta.2`

Beta centrada en tiempo real del dashboard y preparación del pipeline para el futuro caudalímetro.

### Añadido
- Endpoint autenticado [POST] y público [GET] de configuración de pipeline para sincronizar escenario y modo `sim|real`
- Despacho inmediato por MQTT del cambio de escenario al dispositivo seleccionado
- Selector de modo en la vista Pipeline para dejar preparado el salto a hardware real

### Cambiado
- Actualización automática de gráficas meteorológicas sin recargar la página
- Refresco incremental de nuevas muestras para evitar redibujar todo el gráfico
- Estado del pipeline ahora informa del modo activo y la fuente del dato (`db`, `sim`, `sim-fallback`)

### Corregido
- El ESP32 ya puede leer la configuración del pipeline sin quedar bloqueado por JWT en las rutas de solo lectura
- El dashboard ya no depende únicamente del polling lento para propagar el escenario del simulador

## [v0.1.0-beta.1] — 2026-04-13

**Firmware compatible:** `v0.1.0-beta.1`

Primera versión beta pública. Sistema completo funcional: MQTT, multi-dispositivo,
provisioning, TimescaleDB, autenticación JWT y control de riego multi-relay.

### Añadido
- **MQTT completo**: broker Mosquitto con plugin `go-auth` — autenticación via webhook Flask
- **TimescaleDB**: migración de SQLite a PostgreSQL 16 + extensión time-series (hypertable `home_weather_station`)
- **Multi-dispositivo**: selector de ECU en sidebar, todos los datos filtrados por MAC
- **Provisioning**: portal SoftAP en primer arranque, vinculación de dispositivos con QR/serial
- **Sistema de login JWT**: autenticación completa con auto-logout por expiración de token
- **Control de riego multi-relay**: soporte para 4 relays por dispositivo (PROFILE_IRRIGATION), IrrigationView con selector de zona
- **Alertas MQTT**: panel con badge de no resueltas, severidad, acknowledge y filtros
- **Vista Pipeline**: presión/caudal en tiempo real, 4 algoritmos de detección de fugas (umbral, dP/dt, EWMA)
- **Vista Dispositivos**: listado de ECUs registradas con estado online/offline
- **ClaimDeviceView**: escáner QR con cámara (compatible iOS Safari) y entrada manual de serial
- **Flash Tool integrado**: `flasher_gui.py` con registro CSV de dispositivos, OTA, perfiles METEO/IRRIGATION
- **Script monitor.sh**: sesión tmux con 3 paneles (MQTT live, backend logs, DB watch)
- **Timestamp NTP**: el ESP32 sincroniza hora y la telemetría usa el epoch real del sensor
- **Sidebar responsive**: overlay en móvil, botón logout en parte inferior, filtro de fechas solo en dashboard
- **Adminer**: interfaz web para inspección de PostgreSQL en desarrollo (puerto 8888)
- **Deploy sin Node.js**: `frontend/dist/` se compila localmente y se sube al repo; el servidor solo hace `git pull`

### Cambiado
- Base de datos migrada de SQLite a **TimescaleDB** (PostgreSQL 16)
- Tablas renombradas: `readings` → `home_weather_station`, `devices` → `device_info`
- Nuevas tablas: `device_credentials`, `relay_state`, `user_devices`
- MQTT auth: sustituido `mosquitto_passwd` por webhook HTTP en `/api/mqtt/auth`
- ACL MQTT: permisivo vía `/api/mqtt/acl` (aislamiento por `finca_id` en el firmware)
- Endpoint `/api/relay`: payload actualizado a `{mac, index, state}` (soporte multi-relay)
- Gunicorn: forzado a **1 worker** para evitar conflictos de `client_id` MQTT
- Auto-refresh del dashboard: de 60s con `refresh()` a `fetchSamples(150)` (actualiza gráficos)

### Corregido
- Crash de ApexCharts con timestamps nulos o NaN en el eje X
- `relay_count` incorrecto al cambiar dispositivo (`selectedDevice ?? deviceInfo`)
- go-auth sin header `Content-Type: application/json` → `get_json(force=True)`
- Guard `#ifndef DEV_MODE` para `mqtt_user`/`mqtt_pass` en firmware
- Logout automático cuando el JWT expira (401 en `authFetch`)
- Escáner QR compatible con iOS Safari (Html5Qrcode directo)
- `client_id` MQTT único por worker de Gunicorn (evita desconexiones)

### Infraestructura
- **Docker Compose**: TimescaleDB + Mosquitto (go-auth) + Backend (Flask/Gunicorn) + Adminer
- **Nginx (HestiaCP)**: proxy `/api/*` → Flask `:7000`, estáticos servidos desde `frontend/dist/`
- **deploy.sh**: `git pull` + `docker compose up --build`; flag `--migrate` para SQLite legado

---

## [Sin versión — rama dev] — 2026-03-27 a 2026-04-02

Trabajo de desarrollo previo a la migración MQTT. Incluido en `v0.1.0-beta.1`.

- Multi-dispositivo por MAC (HTTP legacy)
- Vista Pipeline con simulador y detección de fugas
- Sensor YL-69 humedad de suelo
- Gráfico de consumo diario de riego
- Panel de configuración (nombre, ubicación, caudal nominal)
- Reset del contador de riego con confirmación

---

## [Sin versión — rama master] — 2026-03-25 a 2026-03-27

Primera versión operativa (HTTP legacy, SQLite).

- Dashboard meteorológico básico (temperatura, humedad, presión, viento, luz)
- Control relay electroválvula (1 relay, GPIO 26)
- Pantalla TFT 240×135 en firmware
- Deploy en VPS con HestiaCP + Nginx
- OTA via ArduinoOTA

---

[v0.1.0-beta.2]: https://github.com/alepape1/app_meteo/releases/tag/v0.1.0-beta.2
[v0.1.0-beta.1]: https://github.com/alepape1/app_meteo/releases/tag/v0.1.0-beta.1
