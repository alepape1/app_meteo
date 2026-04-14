# Aquantia — Dashboard meteorológico y de riego

Dashboard web para la estación meteorológica y el sistema de riego doméstico Aquantia.

Soporta múltiples dispositivos ESP32 con dos perfiles: **METEO** (sensores + pantalla TFT) e **IRRIGATION** (4 relays de electroválvulas).

Repositorio del firmware ESP32: [alepape1/weather-station-ESP](https://github.com/alepape1/weather-station-ESP)

---

## Índice

- [Arquitectura del sistema](#arquitectura-del-sistema)
- [Servicios Docker](#servicios-docker)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Tecnologías](#tecnologías)
- [Vistas del dashboard](#vistas-del-dashboard)
- [Autenticación](#autenticación)
- [Base de datos](#base-de-datos)
- [API endpoints](#api-endpoints)
- [MQTT — topics y payloads](#mqtt--topics-y-payloads)
- [Configuración MQTT](#configuración-mqtt)
- [Dispositivos y provisioning](#dispositivos-y-provisioning)
- [Desarrollo local](#desarrollo-local)
- [Despliegue en producción](#despliegue-en-producción)
- [Monitor en tiempo real](#monitor-en-tiempo-real)
- [Simulador](#simulador)
- [Pipeline y detección de fugas](#pipeline-y-detección-de-fugas)

---

## Arquitectura del sistema

```
┌──────────────────────────────────────────────────────────────────────┐
│  ESP32 (firmware Aquantia, USE_MQTT)                                  │
│   Core 1: sensores                                                    │
│   Core 0: networkTask()                                               │
│    │                                                                  │
│    │  TLS 8883         ┌─────────────────────────────────────┐       │
│    ├─ CONNECT ────────►│  Mosquitto 2 (Docker)               │       │
│    ├─ PUBLISH ────────►│  :8883 TLS — dispositivos externos  │       │
│    ◄─ SUBSCRIBE ───────│  :1883 plain — red interna Docker   │       │
│                         └──────────────┬────────────────────┘       │
│                                        │ MQTT 1883 (interno)         │
│                         ┌──────────────▼────────────────────┐       │
│                         │  Flask / Gunicorn (Docker :7000)   │       │
│                         │  ├─ app.py          (REST API)     │       │
│                         │  ├─ mqtt_client.py  (hilo daemon)  │       │
│                         │  └─ database.py     (PostgreSQL)   │       │
│                         └──────────────┬────────────────────┘       │
│                                        │ pg 5432                     │
│                         ┌──────────────▼────────────────────┐       │
│                         │  TimescaleDB (Docker :5432)        │       │
│                         │  PostgreSQL 16 + extensión         │       │
│                         │  time-series                       │       │
│                         └────────────────────────────────────┘       │
│                                                                       │
│  Nginx (HestiaCP, puerto 443)                                         │
│  ├─ /        → Flask :7000/  (sirve frontend/dist/)                  │
│  └─ /api/*   → proxy → Flask :7000/api/*                             │
│                                                                       │
│  Navegador → https://meteo.aquantialab.com                            │
│  React (Vite) ──── fetch /api/* ──► Flask                            │
└──────────────────────────────────────────────────────────────────────┘
```

### Flujo de datos MQTT

1. ESP32 conecta al WiFi y se autentica contra `meteo.aquantialab.com:8883` (TLS)
2. Publica `register` al arrancar → Flask guarda chip info, MAC, IP, relay_count
3. Cada 20s: publica `telemetry` con 17 campos de sensores → Flask inserta en TimescaleDB
4. Cuando el usuario activa un relay: `POST /api/relay` → Flask publica `cmd` al broker → ESP actúa en <50ms
5. El navegador hace polling de `/api/muestras/150` al cargar y `/api/alerts` cada 60s

---

## Servicios Docker

El sistema completo arranca con `docker compose up -d`:

| Servicio | Imagen | Puerto | Descripción |
|----------|--------|:------:|-------------|
| `timescaledb` | `timescale/timescaledb:latest-pg16` | 5432 | PostgreSQL 16 + extensión TimescaleDB |
| `backend` | build local (`backend/Dockerfile`) | 7000 | Flask + Gunicorn + MQTT client |
| `mosquitto` | `iegomez/mosquitto-go-auth:latest` | 1883, 8883 | Broker MQTT (plain interno / TLS externo) |
| `adminer` | `adminer:latest` | 8888 | Interfaz web para PostgreSQL (desarrollo) |

### Variables de entorno requeridas (`.env`)

```env
PG_PASS=contraseña_postgres
MQTT_PASSWORD=contraseña_broker_backend
JWT_SECRET_KEY=clave_jwt_segura
```

Ver `.env.example` para la lista completa.

---

## Estructura del repositorio

```
app_meteo/
├── backend/
│   ├── app.py               # Flask: todos los endpoints REST
│   ├── database.py          # PostgreSQL ORM + migraciones
│   ├── mqtt_client.py       # paho-mqtt: suscriptor/publicador (hilo daemon)
│   ├── pipeline_sim.py      # Simulador de presión/caudal de tubería
│   ├── simulator.py         # Simulador ESP32 (envía datos HTTP)
│   ├── migrate_sqlite_to_pg.py  # Migración inicial desde SQLite legado
│   ├── create_demo_user.py  # Crea usuario de demostración
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env.example
│   └── static/              # Archivos legacy (no usados por el frontend React)
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx                  # Layout, navegación, guard de autenticación
│   │   ├── AuthContext.jsx          # JWT: login, logout, authFetch
│   │   ├── hooks/
│   │   │   └── useWeatherData.js    # Fetching, estado y auto-refresco (60s)
│   │   └── components/
│   │       ├── LoginView.jsx        # Pantalla de login
│   │       ├── Sidebar.jsx          # Navegación + filtros de fecha + selector ECU
│   │       ├── StatCard.jsx         # Card con valor, mín y máx
│   │       ├── WeatherChart.jsx     # Gráficos ApexCharts (área, línea, scatter)
│   │       ├── DeviceStatus.jsx     # Estado ESP32: señal, heap, uptime, info chip
│   │       ├── DevicesView.jsx      # Lista de dispositivos registrados
│   │       ├── ClaimDeviceView.jsx  # Vincular dispositivo nuevo por serial/QR
│   │       ├── IrrigationView.jsx   # Control relays + estadísticas de riego
│   │       ├── AlertsPanel.jsx      # Alertas: severidad, badge, acknowledge, filtro
│   │       ├── PipelineView.jsx     # Presión/caudal + detección de fugas
│   │       ├── NodesView.jsx        # Nodos LoRa (pendiente de hardware)
│   │       └── SettingsView.jsx     # Configuración de la estación
│   ├── dist/                # Build compilado — se sube al repo, el servidor lo sirve directamente
│   ├── package.json
│   └── vite.config.js
│
├── mosquitto/
│   └── config/
│       └── mosquitto.conf   # Listeners, TLS, ACL, rutas de certs
│
├── tools/
│   └── monitor.sh           # Sesión tmux: MQTT live + backend logs + DB watch
├── docker-compose.yml
├── deploy.sh                # Script de deploy (git pull + docker rebuild)
└── README.md
```

---

## Tecnologías

| Capa | Tecnología |
|------|-----------|
| Backend API | Python 3.12, Flask, flask-cors, flask-jwt-extended |
| Base de datos | TimescaleDB (PostgreSQL 16 + extensión time-series) |
| Broker MQTT | Mosquitto 2 (iegomez/mosquitto-go-auth) |
| Cliente MQTT Python | paho-mqtt |
| Servidor producción | Gunicorn — 1 worker (requerido por MQTT) |
| Frontend | React 18, Vite, Tailwind CSS, ApexCharts, Lucide React |
| Contenedores | Docker + Docker Compose |
| Proxy / TLS | Nginx (HestiaCP) + Let's Encrypt |

> **Por qué 1 worker en Gunicorn:** paho-mqtt usa un `client_id` fijo. Con 2 workers, ambos compiten por la misma conexión al broker y se desconectan mutuamente. Un solo worker es suficiente para el volumen de datos actual (una trama cada 20s).

---

## Vistas del dashboard

| Vista | Descripción |
|-------|-------------|
| **Meteorología** | Gráficos históricos de temperatura (MCP9808, HTU2x, DHT11), humedad, presión, viento (velocidad + dirección), luz y humedad de suelo. Filtro por rango de fechas con presets (Hoy, Ayer, 7d, 30d). |
| **Riego** | Control de electroválvulas (relays). Selector de zonas para PROFILE_IRRIGATION. |
| **Pipeline** | Presión de tubería y caudal en tiempo real. Detección de fugas con 4 algoritmos. Selector de escenario simulado. |
| **Nodos LoRa** | Preparada para nodos remotos de riego (pendiente de hardware). |
| **Alertas** | Panel de alertas MQTT: badge con contador de no resueltas, severidad (critical/warning/info), botón acknowledge, filtro pendientes/todas. |
| **ESP32** | Estado del dispositivo seleccionado: WiFi RSSI, heap libre, uptime, IP, chip model, última conexión. |
| **Mis dispositivos** | Lista de ECUs registradas con estado online/offline. Acceso al flujo de vinculación. |
| **Configuración** | Ajustes de la estación (nombre, ubicación, caudal nominal). |

El **selector de dispositivos** en el sidebar filtra todos los datos (gráficos, estado, riego) al dispositivo activo. El badge rojo de alertas se actualiza cada 60s.

---

## Autenticación

El dashboard usa **JWT** (JSON Web Tokens). El token se guarda en `localStorage` (`aq_token`, `aq_user`) y se adjunta automáticamente a todas las peticiones via `authFetch`.

| Endpoint | Descripción |
|----------|-------------|
| `POST /api/auth/login` | `{username, password}` → `{token, user}` |
| `POST /api/auth/logout` | Invalida la sesión |
| `GET /api/auth/me` | Info del usuario autenticado |

Crear usuario administrador:

```bash
docker compose exec backend python create_demo_user.py
```

---

## Base de datos

**TimescaleDB** (PostgreSQL 16 con extensión de series temporales). Las migraciones se aplican automáticamente en el arranque del backend.

### Tablas principales

```sql
-- Lecturas de sensores (hypertable TimescaleDB, particionada por timestamp)
CREATE TABLE home_weather_station (
    id                     BIGSERIAL,
    temperature            REAL,         -- MCP9808 exterior (°C)
    temperature_barometer  REAL,         -- HTU2x (°C)
    humidity               REAL,         -- HTU2x (%)
    pressure               REAL,         -- MicroPressure (kPa)
    windSpeed              REAL,         -- m/s instantáneo
    windDirection          REAL,         -- ° instantáneo
    windSpeedFiltered      REAL,         -- m/s media móvil
    windDirectionFiltered  REAL,         -- ° promedio vectorial
    light                  REAL,         -- lux
    dht_temperature        REAL,         -- DHT11 °C
    dht_humidity           REAL,         -- DHT11 %
    rssi                   INTEGER,      -- dBm
    free_heap              INTEGER,      -- bytes
    uptime_s               INTEGER,      -- segundos desde boot
    relay_active           INTEGER,      -- bitmask de relays activos
    pipeline_pressure      REAL,         -- bar (simulado)
    pipeline_flow          REAL,         -- L/min (simulado)
    soil_moisture          REAL,         -- % YL-69
    device_mac             TEXT,
    timestamp              TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, timestamp)
);

-- Dispositivos registrados (MQTT register)
CREATE TABLE device_info (
    id             SERIAL PRIMARY KEY,
    finca_id       TEXT,                  -- identidad MQTT del dispositivo
    mac_address    TEXT UNIQUE,
    serial_number  TEXT,                  -- AQ-XXXXXXXXXXXX (de NVS)
    chip_model     TEXT,
    chip_revision  INTEGER,
    cpu_freq_mhz   INTEGER,
    flash_size_mb  INTEGER,
    sdk_version    TEXT,
    ip_address     TEXT,
    relay_count    INTEGER DEFAULT 1,
    claimed_at     TIMESTAMPTZ,
    last_seen      TIMESTAMPTZ DEFAULT NOW()
);

-- Credenciales de dispositivos (generadas en fábrica por Flash Tool)
CREATE TABLE device_credentials (
    mac                 TEXT PRIMARY KEY,
    token_hash          TEXT NOT NULL,    -- bcrypt del token pre-flasheado en NVS
    serial_number       TEXT UNIQUE NOT NULL,
    claimed_by_finca_id TEXT,
    claimed_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Estado de relays por dispositivo e índice
CREATE TABLE relay_state (
    device_mac  TEXT,
    relay_index INTEGER,
    desired     INTEGER NOT NULL DEFAULT 0,  -- estado que quiere el dashboard
    actual      INTEGER NOT NULL DEFAULT 0,  -- último estado confirmado por ESP32
    PRIMARY KEY (device_mac, relay_index)
);

-- Alertas (MQTT topic aquantia/+/alerts)
CREATE TABLE alerts (
    id         BIGSERIAL PRIMARY KEY,
    finca_id   TEXT,
    device_mac TEXT,
    alert_type TEXT  NOT NULL DEFAULT 'unknown',
    severity   TEXT  NOT NULL DEFAULT 'info',  -- 'critical' | 'warning' | 'info'
    message    TEXT,
    acked      INTEGER NOT NULL DEFAULT 0,
    acked_at   TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usuarios (autenticación JWT)
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name  TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### Migración desde SQLite (primer despliegue)

Si vienes de una instalación con base de datos SQLite legada:

```bash
./deploy.sh --migrate
```

---

## API endpoints

### Autenticación

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Login → JWT token |
| `GET` | `/api/auth/me` | Info usuario autenticado |

### Datos de sensores

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/send_message` | Recibe CSV del ESP en modo HTTP legacy |
| `GET` | `/api/muestras/<N>?mac=XX` | Últimas N muestras como columnas JSON |
| `POST` | `/api/filtrar` | Filtra por rango `{start_date, end_date, mac}` |
| `GET` | `/api/latest?mac=XX` | Última lectura del dispositivo |

### Dispositivos

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/devices` | Lista dispositivos vinculados al usuario |
| `GET` | `/api/device_info?mac=XX` | Info estática del dispositivo |
| `POST` | `/api/devices/claim` | Vincular dispositivo por serial `{serial}` |
| `POST` | `/api/device_info` | ESP registra info (HTTP legacy) |
| `POST` | `/api/devices/register_factory` | Factory provision `{mac, token_hash, serial_number}` |

### Relays / riego

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/relay` | Activa/desactiva relay `{mac, index, state}` — MQTT o HTTP |
| `GET` | `/api/relay/command` | ESP consulta bitmask (HTTP legacy) |
| `POST` | `/api/relay/ack` | ESP confirma estado (HTTP legacy) |

### Alertas

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/alerts?acked=0` | Alertas (filtrables por estado) |
| `POST` | `/api/alerts/<id>/ack` | Marcar alerta como resuelta |

### Pipeline

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/pipeline/status` | Última lectura + resultado de detección |
| `GET` | `/api/pipeline/readings?n=N` | Histórico para gráficos |
| `GET` | `/api/pipeline/scenario` | Escenario activo |
| `POST` | `/api/pipeline/scenario` | Cambiar escenario (`normal`/`leak`/`burst`) |

---

## MQTT — topics y payloads

### Topics

| Topic | Dirección | Cuándo |
|-------|-----------|--------|
| `aquantia/<mac>/register` | ESP → broker → Flask | Al arrancar el dispositivo |
| `aquantia/<mac>/telemetry` | ESP → broker → Flask | Cada 20s |
| `aquantia/<mac>/cmd` | Flask → broker → ESP | Comando de relay desde el dashboard |

### Payload `telemetry`

```json
{
  "temperature": 22.5, "pressure": 101.3,
  "temperature_barometer": 21.8, "humidity": 65.2,
  "windSpeed": 3.5, "windDirection": 180.0,
  "windSpeedFiltered": 3.3, "windDirectionFiltered": 178.0,
  "light": 350.0, "dht_temperature": 21.6, "dht_humidity": 63.0,
  "rssi": -65, "free_heap": 245000, "uptime_s": 12345,
  "relay_active": 0, "soil_moisture": 50.0,
  "mac_address": "FC:B4:67:F3:77:48"
}
```

### Payload `register`

```json
{
  "mac_address": "FC:B4:67:F3:77:48", "ip_address": "192.168.1.9",
  "chip_model": "ESP32-D0WD-V3", "chip_revision": 3,
  "cpu_freq_mhz": 160, "flash_size_mb": 4,
  "sdk_version": "v5.5.2-729-g87912cd291", "relay_count": 1
}
```

### Payload `cmd`

```json
{ "relay": 0, "state": true }
```

`relay` es el índice 0–3. `state: true` activa (GPIO LOW en relays activo-LOW).

---

## Configuración MQTT

### `.env` del backend

```env
MQTT_HOST=mosquitto        # nombre servicio Docker (red interna)
MQTT_PORT=1883             # sin TLS en la red interna
MQTT_USER=backend
MQTT_PASSWORD=contraseña_backend
MQTT_TLS=0

PG_HOST=timescaledb
PG_PORT=5432
PG_DB=aquantia
PG_USER=aquantia
PG_PASS=contraseña_postgres

JWT_SECRET_KEY=clave_jwt_larga_y_aleatoria
```

### Autenticación MQTT (go-auth webhook)

El broker usa el plugin **mosquitto-go-auth** que delega toda la validación de credenciales a Flask via HTTP. **No hay fichero `passwd` de Mosquitto** — cualquier contraseña almacenada ahí se ignora.

#### Flujo de autenticación

```
ESP32 ──CONNECT(user, pass)──► Mosquitto (go-auth)
                                      │
                         POST /api/mqtt/auth
                         {"username":"...", "password":"..."}
                                      │
                                   Flask
                                      ├─ user == "backend" → compara con MQTT_PASSWORD del .env
                                      └─ user == "MAC"     → bcrypt contra token en device_credentials
                                      │
                              200 OK / 401 Unauthorized
                                      │
                              Mosquitto permite / rechaza
```

#### Credenciales por modo de operación

| Modo | `MQTT_USER` en firmware | `MQTT_PASS` en firmware | Validado contra |
|------|------------------------|------------------------|-----------------|
| **DEV** (`#define DEV_MODE`) | `"backend"` (literal en `secrets.h`) | Contraseña del `.env` | `MQTT_PASSWORD` del backend |
| **PROD** (sin `DEV_MODE`) | MAC del dispositivo (`FC:B4:67:F3:77:48`) | Token pre-flasheado en NVS | bcrypt hash en `device_credentials` |

> **Importante:** En DEV_MODE el firmware usa las credenciales literales de `secrets.h`. En PROD, el bloque `#ifndef DEV_MODE` sobreescribe esas variables con la MAC y el token NVS tras conectar al WiFi. Esto se controla con el guard `#ifndef DEV_MODE` en el firmware.

#### ACL

El endpoint `/api/mqtt/acl` devuelve siempre `200 OK` para cualquier usuario autenticado. El aislamiento entre dispositivos se garantiza porque cada uno solo conoce su `finca_id` (su propia MAC sin colones) y por tanto solo publica/suscribe a `aquantia/<su_mac>/#`.

#### Añadir un dispositivo (PROD)

Los dispositivos se registran automáticamente mediante el **Flash Tool** (`flasher_gui.py`):
1. Genera un token aleatorio + hash bcrypt → `POST /api/devices/register_factory`
2. Escribe token + serial en la partición NVS del chip
3. En el primer arranque PROD, el ESP32 usa ese token como contraseña MQTT

No es necesario tocar la configuración de Mosquitto.

---

## Dispositivos y provisioning

### Flujo de fábrica (Flash Tool → `flasher_gui.py`)

1. **Flashear firmware** con `DEVICE_PROFILE` correcto (METEO o IRRIGATION)
2. **Factory Provision** en la Flash Tool:
   - Lee la MAC del chip via `esptool`
   - Genera un token aleatorio + hash bcrypt
   - Registra en el backend (`POST /api/devices/register_factory`)
   - Escribe token + serial en la partición NVS del chip (`esptool write_flash 0x9000`)
   - Genera QR con la URL de claim y guarda en `devices_registry.csv`

### Flujo del usuario final (claim)

1. El usuario escanea el QR de la etiqueta del dispositivo o accede a `https://meteo.aquantialab.com/claim?serial=AQ-XXXXXX`
2. La app muestra `ClaimDeviceView` → `POST /api/devices/claim` con el serial
3. Flask verifica el token NVS vs. hash almacenado → vincula el dispositivo al usuario autenticado
4. El dispositivo aparece en el selector del sidebar

### Provisioning WiFi (SoftAP)

En el primer arranque (sin credenciales WiFi en NVS), el ESP32 levanta un punto de acceso `Aquantia-XXXXXX`. El usuario conecta su móvil, abre `http://192.168.4.1` y configura el WiFi. Las credenciales se guardan en NVS y el dispositivo no vuelve a solicitar configuración.

---

## Desarrollo local

### Requisitos

- Python 3.12+
- Node.js 18+
- Docker + Docker Compose

### Arrancar todos los servicios

```bash
# Copiar variables de entorno
cp backend/.env.example backend/.env
# Editar backend/.env con las contraseñas

# Arrancar TimescaleDB + Mosquitto + Backend + Adminer
docker compose up -d

# Acceder a Adminer (interfaz PostgreSQL)
# http://localhost:8888  — servidor: timescaledb, usuario: aquantia
```

### Frontend en modo desarrollo

```bash
cd frontend
npm install
npm run dev
# Vite en http://localhost:5173 — /api/* proxied a Flask :7000
```

### Crear usuario administrador

```bash
docker compose exec backend python create_demo_user.py
```

---

## Despliegue en producción

El `dist/` del frontend se compila **localmente** y se sube al repositorio. El servidor solo necesita `git pull` — no requiere Node.js.

### 1. Build del frontend (local)

```bash
cd frontend
npm run build
git add dist/
git commit -m "build: actualizar frontend"
git push
```

### 2. Deploy en el servidor

```bash
cd ~/web/meteo.aquantialab.com/app

# Actualización normal (backend + frontend)
./deploy.sh

# Solo frontend (sin rebuild Docker)
./deploy.sh --no-docker

# Primer despliegue (migra datos SQLite legado si existen)
./deploy.sh --migrate
```

El script hace:
1. `git pull` — descarga código y el `dist/` nuevo
2. `docker compose up -d --build` — rebuild del backend y reinicio
3. (con `--migrate`) Migra datos desde SQLite legado a PostgreSQL

### Comandos Docker útiles

```bash
docker compose ps                          # estado de servicios
docker compose logs backend --tail 30      # logs del backend
docker compose logs mosquitto --tail 30    # logs del broker
docker compose exec backend bash           # shell en el backend
docker compose restart backend             # reiniciar backend (recarga MQTT)
```

### Acceso a la base de datos

```bash
# Via Adminer web: http://servidor:8888
# Servidor: timescaledb | Usuario: aquantia | Base de datos: aquantia

# Via psql directo:
docker compose exec timescaledb psql -U aquantia -d aquantia

-- Últimas telemetrías
SELECT timestamp, device_mac, temperature, humidity FROM home_weather_station
ORDER BY timestamp DESC LIMIT 10;

-- Dispositivos registrados
SELECT serial_number, mac_address, chip_model, relay_count, last_seen FROM device_info;

-- Alertas pendientes
SELECT created_at, device_mac, alert_type, severity, message FROM alerts
WHERE acked = 0 ORDER BY created_at DESC;
```

---

## Monitor en tiempo real

`tools/monitor.sh` abre una sesión **tmux** con tres paneles para monitorizar el sistema en vivo:

```
┌──────────────────────────────────────┐
│   MQTT LIVE  (aquantia/#)            │  25% altura
├───────────────────────┬──────────────┤
│  BACKEND — todos los  │  DB — últimas│  75% altura
│  logs en tiempo real  │  20 lecturas │
└───────────────────────┴──────────────┘
```

```bash
./tools/monitor.sh
# Ctrl+B D  — desconectar (sesión sigue en background)
# Ctrl+B [  — modo scroll en cualquier panel
```

Lee `MQTT_PASSWORD` automáticamente del `.env`. Requiere `tmux` y acceso a los contenedores Docker.

---

## Simulador

Genera datos meteorológicos realistas y los envía al servidor Flask por HTTP (modo legacy). Útil para poblar la base de datos sin hardware.

```bash
docker compose exec backend python simulator.py
# o con opciones:
python backend/simulator.py --host localhost --port 7000 --interval 0.1 --count 500
```

---

## Pipeline y detección de fugas

La vista **Pipeline** monitoriza presión de tubería y caudal para detectar anomalías.

### Algoritmos de detección

| Método | Disparador | Status |
|--------|-----------|:------:|
| Umbral absoluto | Caudal > 0.10 L/min con válvula cerrada | `LEAK` |
| dP/dt absoluto | Presión < 30% del valor esperado | `BURST` |
| dP/dt consecutivo | Caída > 20% entre dos muestras con válvula abierta | `BURST` |
| EWMA (λ=0.15) | Deriva estadística > 2.5σ en presión o caudal | `LEAK_SUSPECTED` |

Los datos actuales los genera el simulador integrado en el ESP32 (ruido determinista). Cuando se instalen sensores físicos de presión y caudal, solo hay que sustituir las lecturas simuladas; el sistema de detección no requiere cambios.

### Escenarios de simulación

| Escenario | Descripción |
|-----------|-------------|
| `normal` | Presión y caudal en rango nominal |
| `leak` | Fuga pequeña — caudal residual con válvula cerrada |
| `burst` | Rotura — caída brusca de presión |

```bash
# Cambiar escenario via API
curl -X POST https://meteo.aquantialab.com/api/pipeline/scenario \
  -H "Content-Type: application/json" \
  -d '{"scenario": "leak"}'
```

---

## Versionado y flujo de trabajo

### Estructura de ramas

```
main              ← producción (solo merges de release/* o hotfix/*)
develop           ← integración continua
feature/*         ← nueva funcionalidad (sale de develop, merge a develop)
release/vX.Y.Z    ← congelado para pruebas (sale de develop)
hotfix/*          ← parche urgente sobre main
```

**Regla principal:** nunca se trabaja directamente en `main`. Todo cambio pasa por `develop` y, cuando llega a producción, lo hace a través de una rama `release/`.

### Versionado semántico (SemVer)

El backend sigue `MAJOR.MINOR.PATCH[-prerelease]`:

| Incremento | Cuándo |
|------------|--------|
| `PATCH` | Corrección de bug sin cambio de API |
| `MINOR` | Nuevo endpoint o campo, compatible con firmware anterior |
| `MAJOR` | Cambio de protocolo MQTT o HTTP incompatible con firmware |

Ejemplos de ciclo: `v0.1.0-beta.1` → `v0.1.0-rc.1` → `v0.1.0` → `v0.1.1` → `v0.2.0`

### Proceso de release

```bash
# 1. Crear rama de release desde develop
git checkout develop && git pull
git checkout -b release/v0.2.0

# 2. Actualizar CHANGELOG.md con los cambios

# 3. Commit de cierre de release
git add CHANGELOG.md
git commit -m "chore: bump backend to v0.2.0-rc.1"

# 4. Etiquetar
git tag -a v0.2.0-rc.1 -m "Release candidate v0.2.0-rc.1"
git push origin release/v0.2.0 --tags

# 5. Tras validación, merge a main y develop
git checkout main && git merge --no-ff release/v0.2.0
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin main --tags
git checkout develop && git merge --no-ff release/v0.2.0
git push origin develop
```

### Compatibilidad firmware ↔ backend

Ambos repositorios (`app_meteo` y `weather-station-ESP`) se versionan de forma independiente pero coordinada. El backend almacena en la tabla `app_settings` la clave `min_firmware_version` con la versión mínima de firmware aceptada:

```sql
SELECT value FROM app_settings WHERE key = 'min_firmware_version';
-- → '0.1.0-beta.1'
```

Para actualizar el mínimo aceptado al introducir un cambio incompatible:

```bash
curl -X POST https://meteo.aquantialab.com/api/settings \
  -H "Content-Type: application/json" \
  -d '{"key": "min_firmware_version", "value": "0.2.0"}'
```

| Firmware | Backend app_meteo | Estado |
|----------|-------------------|--------|
| `v0.1.x` | `v0.1.x` | Compatible |
| `v0.2.0` | `v0.1.x` | Puede no funcionar — revisar CHANGELOG |

### Versión del firmware en el dashboard

El firmware envía su versión (`FIRMWARE_VERSION` definido en el `.ino`) al registrarse vía MQTT y HTTP. El backend la almacena en `device_info.firmware_version` y la muestra como badge en la vista **Estado del Dispositivo** del dashboard.

### Historial de cambios

Ver [CHANGELOG.md](CHANGELOG.md) para el historial completo de versiones y [weather-station-ESP/CHANGELOG.md](../../weather-station-ESP/CHANGELOG.md) para el historial del firmware.
