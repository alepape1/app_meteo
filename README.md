# Aquantia — MeteoStation Dashboard

Dashboard web para la estación meteorológica doméstica Aquantia, basada en **ESP32 / ESP8266**.

El sistema soporta **dos modos de comunicación** entre el firmware y el servidor:

| Modo | Protocolo | Dirección | Latencia relay |
|------|-----------|-----------|----------------|
| **HTTP legacy** | HTTPS + CSV | ESP → servidor (push periódico) | ~2 s (polling) |
| **MQTT** | MQTT/TLS + JSON | Bidireccional, broker intermediario | Inmediata (push) |

Ambos modos comparten la misma base de datos, el mismo frontend y las mismas API REST.

Repositorio del firmware ESP32: [alepape1/weather-station-ESP](https://github.com/alepape1/weather-station-ESP)

---

## Índice

- [Arquitectura completa del sistema](#arquitectura-completa-del-sistema)
  - [Modo HTTP (legacy)](#modo-http-legacy)
  - [Modo MQTT (actual)](#modo-mqtt-actual)
  - [Capa de transporte MQTT en detalle](#capa-de-transporte-mqtt-en-detalle)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Tecnologías](#tecnologías)
- [Vistas del dashboard](#vistas-del-dashboard)
- [Base de datos](#base-de-datos)
- [API endpoints](#api-endpoints)
- [Configuración MQTT](#configuración-mqtt)
- [Instalación y desarrollo local](#instalación-y-desarrollo-local)
- [Despliegue en producción](#despliegue-en-producción)
- [Simulador (sin hardware)](#simulador-sin-hardware)
- [Pipeline y detección de fugas](#pipeline-y-detección-de-fugas)

---

## Arquitectura completa del sistema

### Modo HTTP (legacy)

```
┌─────────────────────────────────────────────────────────────────────┐
│  RED LOCAL / INTERNET                                               │
│                                                                     │
│  ESP32                         VPS (meteo.aquantialab.com)          │
│  ──────                        ─────────────────────────           │
│  Core 1: sensores              Nginx (HestiaCP)                     │
│  Core 0: networkTask()    ──►  puerto 443 (HTTPS)                   │
│                                │                                    │
│   POST /send_message ──────────┤  proxy /api/* → Docker :5000      │
│   (CSV, cada 20s)              │                                    │
│                                │  Flask (Gunicorn, 1 worker)        │
│   POST /api/device_info ───────┤  ├─ app.py          (endpoints)   │
│   (JSON, al arrancar)          │  ├─ database.py      (SQLite ORM)  │
│                                │  └─ home_weather_station.db        │
│   GET /api/relay/command ──────┤                                    │
│   (poll cada 2s)               │  frontend/dist/    (estáticos)     │
│                                │  servido por Nginx directamente    │
│   POST /api/relay/ack ─────────┘                                    │
│                                                                     │
│  Navegador → https://meteo.aquantialab.com                          │
│  React (Vite build) ────────────────────────────────────────────►  │
│  fetch /api/* → Flask (proxy Nginx)                                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Flujo de datos HTTP paso a paso:**

1. El ESP32 conecta al WiFi y arranca `networkTask()` en Core 0
2. Una vez: `POST /api/device_info` → Flask guarda chip model, MAC, IP en `device_info`
3. Cada 2s: `GET /api/relay/command` → Flask devuelve el bitmask de relays deseado → ESP aplica el cambio y hace `POST /api/relay/ack`
4. Cada 20s: el ESP hace snapshot atómico de sensores (bajo mutex FreeRTOS) → construye un CSV de 16 campos → `POST /send_message`
5. Flask parsea el CSV → inserta fila en `home_weather_station`
6. El navegador hace `GET /api/muestras/150` al cargar y `GET /api/latest` cada 60s para el refresco automático

### Modo MQTT (actual)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  RED LOCAL / INTERNET                                                   │
│                                                                         │
│  ESP32 (USE_MQTT definido)                                              │
│  ──────────────────────────                                             │
│  Core 1: sensores                                                       │
│  Core 0: networkTask()                                                  │
│   │                                                                     │
│   │  TLS 8883          ┌──────────────────────────────────────────┐    │
│   ├─ CONNECT ─────────►│  Mosquitto 2 (Docker)                    │    │
│   │   user=finca_id    │  meteo.aquantialab.com:8883 (TLS)        │    │
│   │   pass=***         │  Puerto interno: 1883 (sin TLS)          │    │
│   │                    │                                           │    │
│   ├─ PUBLISH ─────────►│  aquantia/<finca_id>/register  (boot)   │    │
│   ├─ PUBLISH ─────────►│  aquantia/<finca_id>/telemetry (20s)    │    │
│   ◄─ SUBSCRIBE ────────│  aquantia/<finca_id>/cmd               │    │
│   ◄─ PUBLISH ──────────│  (relay command desde Flask)            │    │
│                         └─────────────┬──────────────────────────┘    │
│                                       │ MQTT 1883 (interno)            │
│                         ┌─────────────▼──────────────────────────┐    │
│                         │  Flask (Gunicorn, 1 worker)             │    │
│                         │  ├─ mqtt_client.py  (hilo daemon)       │    │
│                         │  │   subscribe: aquantia/+/telemetry   │    │
│                         │  │   subscribe: aquantia/+/alerts      │    │
│                         │  │   subscribe: aquantia/+/register    │    │
│                         │  │   publish:  aquantia/<id>/cmd       │    │
│                         │  ├─ app.py          (REST API)          │    │
│                         │  ├─ database.py     (SQLite)            │    │
│                         │  └─ home_weather_station.db             │    │
│                         └────────────────────────────────────────┘    │
│                                                                         │
│  Nginx (HestiaCP, puerto 443)                                           │
│  ├─ /          → frontend/dist/    (React build, estáticos)            │
│  └─ /api/*     → proxy → Docker Flask :5000                            │
│                                                                         │
│  Navegador → https://meteo.aquantialab.com                              │
└─────────────────────────────────────────────────────────────────────────┘
```

**Flujo de datos MQTT paso a paso:**

1. ESP32 arranca y conecta al WiFi
2. `networkTask()` inicializa `WiFiClientSecure` con el certificado ISRG Root X1 (CA raíz de Let's Encrypt) hardcodeado en `mqtt_cert.h`
3. `mqttConnect()`: TLS handshake contra `meteo.aquantialab.com:8883` → autenticación con usuario/contraseña (`finca_id` / `MQTT_PASS`) → suscripción a `aquantia/<finca_id>/cmd`
4. Inmediatamente: `mqttPublishRegister()` → publica JSON en `aquantia/<finca_id>/register` con MAC, IP, chip model, relay count
5. Cada 20s: snapshot atómico de sensores → `StaticJsonDocument<384>` → `mqttClient.publish(topic, buf)` en `aquantia/<finca_id>/telemetry`
6. **Mosquitto** recibe los mensajes y los reenvía al suscriptor backend (Flask via paho-mqtt interno en 1883, sin TLS)
7. Flask (`mqtt_client.py`, hilo daemon): `_on_message()` → parsea subtopic → llama `_handle_telemetry()`, `_handle_register()` o `_handle_alert()` → `INSERT INTO home_weather_station / device_info / alerts`
8. Cuando el usuario pulsa un relay en el dashboard: `POST /api/relay` → Flask llama `publish_cmd(finca_id, {"relay": 0, "state": true})` → Mosquitto → ESP32 recibe en `mqttCallback()` → `digitalWrite(RELAY_PINS[relay], state ? LOW : HIGH)` en <50ms

### Capa de transporte MQTT en detalle

#### Broker Mosquitto

Mosquitto corre como servicio Docker separado en el mismo `docker-compose.yml` que Flask:

```
Exterior     → puerto 8883 (TLS) → Mosquitto
Flask interno → puerto 1883 (sin TLS, red Docker interna) → Mosquitto
```

**Autenticación y ACL:**

```
# ACL Mosquitto
user backend
topic readwrite aquantia/#       ← Flask tiene acceso completo

pattern readwrite aquantia/%u/#  ← cada dispositivo solo accede a su namespace
                                   (username = finca_id, ej. "aquantia_prototype_1")
```

El patrón `%u` hace que la ACL sea automáticamente multi-tenant: si añades un dispositivo nuevo con `finca_id = "finca_del_norte"`, le das acceso creando su usuario MQTT y ya puede operar en `aquantia/finca_del_norte/#` sin tocar la configuración del broker.

#### Topics MQTT

| Topic | Dirección | Descripción |
|-------|-----------|-------------|
| `aquantia/<finca_id>/telemetry` | ESP → broker → Flask | Datos de sensores, cada 20s |
| `aquantia/<finca_id>/register` | ESP → broker → Flask | Info del dispositivo al arrancar |
| `aquantia/<finca_id>/alerts` | ESP → broker → Flask | Alertas del dispositivo |
| `aquantia/<finca_id>/cmd` | Flask → broker → ESP | Comandos de relay |

#### Certificados TLS

El broker usa el certificado Let's Encrypt de `meteo.aquantialab.com`:
- `certfile`: `fullchain.pem` (hoja + intermedia R3, concatenados)
- `keyfile`: `meteo.aquantialab.com.key`

El firmware verifica el certificado del broker usando **ISRG Root X1** (CA raíz de Let's Encrypt), hardcodeada en `mqtt_cert.h` como `const char MQTT_CA_CERT_PEM[] PROGMEM`.

Un cron job en el VPS regenera `fullchain.pem` cada día a las 4:00 AM tras la renovación automática de Let's Encrypt y reinicia Mosquitto:

```bash
# /etc/cron.d/mosquitto-cert-renewal
0 4 * * * root \
  cat /home/.../meteo.aquantialab.com.crt \
      /home/.../meteo.aquantialab.com.ca \
      > /home/.../mosquitto/certs/fullchain.pem && \
  cp  /home/.../meteo.aquantialab.com.key \
      /home/.../mosquitto/certs/ && \
  chmod 644 /home/.../mosquitto/certs/* && \
  docker restart meteostation_mosquitto
```

---

## Estructura del repositorio

```
app_meteo/
├── backend/
│   ├── app.py              # Flask: todos los endpoints REST + arranque MQTT
│   ├── database.py         # SQLite: creación de tablas + migraciones automáticas
│   ├── mqtt_client.py      # Cliente paho-mqtt: suscriptor/publicador (hilo daemon)
│   ├── requirements.txt    # Flask, flask-cors, gunicorn, paho-mqtt, python-dotenv
│   ├── .env.example        # Variables de entorno (MQTT_HOST, MQTT_PORT, etc.)
│   ├── simulator.py        # Simulador ESP: genera y envía datos por HTTP
│   └── templates/index.html  # Dashboard HTML legacy (solo referencia histórica)
│
├── frontend/
│   └── src/
│       ├── App.jsx                  # Layout principal, navegación, polling alertas
│       ├── hooks/
│       │   └── useWeatherData.js    # Fetching, estado y auto-refresco
│       └── components/
│           ├── Sidebar.jsx          # Navegación + filtros de fecha + selector dispositivo
│           ├── StatCard.jsx         # Card con valor, min y max
│           ├── WeatherChart.jsx     # Gráficos ApexCharts (área, línea, scatter)
│           ├── DeviceStatus.jsx     # Estado ESP32: señal, heap, uptime, info chip
│           ├── IrrigationView.jsx   # Control relay + estadísticas de riego
│           ├── AlertsPanel.jsx      # Alertas MQTT: badge, severidad, ack, filtro
│           ├── PipelineView.jsx     # Presión/caudal + detección de fugas
│           ├── NodesView.jsx        # Nodos LoRa (pendiente de hardware)
│           └── SettingsView.jsx     # Configuración general
│
├── mosquitto/                       # Configuración del broker (en el VPS)
│   ├── config/
│   │   ├── mosquitto.conf           # Listeners 1883 y 8883(TLS), ACL, passwd
│   │   ├── acl                      # Reglas de acceso por usuario
│   │   └── passwd                   # Fichero de contraseñas (mosquitto_passwd)
│   └── certs/
│       ├── fullchain.pem            # Certificado leaf + intermedia (renovación auto)
│       └── meteo.aquantialab.com.key
│
├── docker-compose.yml               # Servicios: meteostation (Flask) + mosquitto
├── Dockerfile
└── README.md
```

---

## Tecnologías

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Backend API | Python, Flask, flask-cors, python-dotenv | 3.x |
| Broker MQTT | Eclipse Mosquitto | 2.1.x |
| Cliente MQTT Python | paho-mqtt | 1.6.x |
| Persistencia | SQLite3 | — |
| Servidor producción | Gunicorn (1 worker — requerido por MQTT) | — |
| Frontend | React, Vite, Tailwind CSS 3, ApexCharts, Lucide React | 18 / 4 / 3 |
| Proxy/TLS exterior | Nginx (gestionado por HestiaCP) + Let's Encrypt | — |
| Contenedores | Docker + Docker Compose | — |
| Firmware | ESP32 FreeRTOS + Arduino framework | — |

> **Por qué solo 1 worker en Gunicorn:** paho-mqtt crea una conexión persistente con un `client_id` fijo. Con 2 workers, ambos intentan conectarse con el mismo ID y Mosquitto los desconecta mutuamente en bucle. Un solo worker es suficiente dado el volumen de datos (una trama cada 20s).

---

## Vistas del dashboard

| Vista | Ruta nav | Descripción |
|-------|----------|-------------|
| **Meteorología** | dashboard | Gráficos históricos de temperatura, humedad, presión, viento, luz y humedad de suelo. Filtro por rango de fechas con presets (Hoy, Ayer, 7d, 30d). |
| **Riego** | riego | Control de electroválvulas (relay). Temporizador de sesión, estadísticas de consumo mensual y ahorro estimado vs. riego manual. |
| **Pipeline** | pipeline | Presión de tubería y caudal en tiempo real. Detección de fugas con 3 algoritmos (umbral, dP/dt, EWMA). Selector de escenario de simulación. |
| **Nodos LoRa** | nodos | Preparada para nodos remotos de riego (pendiente de hardware). |
| **Alertas** | alerts | Panel de alertas MQTT: badge con contador de no resueltas, severidad (crítico/aviso/info), botón de acknowledge, filtro pendientes/todas. |
| **ESP32** | device | Estado del dispositivo activo: WiFi RSSI, heap libre, uptime, IP, chip model, última conexión. |
| **Configuración** | settings | Caudal nominal, referencia diaria de riego, nombre y ubicación de la estación. |

El selector de dispositivos en el sidebar permite cambiar entre múltiples ECUs registradas. El badge rojo de alertas se actualiza por polling cada 60s.

---

## Base de datos

SQLite en `backend/home_weather_station.db`. Las migraciones se aplican automáticamente al arrancar (columnas nuevas se añaden si no existen con `ALTER TABLE ... ADD COLUMN`).

### Esquema actual

```sql
-- Lecturas de sensores (HTTP legacy y MQTT telemetry)
CREATE TABLE home_weather_station (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    temperature             REAL,                -- MCP9808 (°C)
    temperature_barometer   REAL,                -- HTU2x (°C)
    humidity                REAL,                -- HTU2x (%)
    pressure                REAL,                -- MicroPressure (kPa)
    windSpeed               REAL,                -- m/s instantáneo
    windDirection           REAL,                -- ° instantáneo
    windSpeedFiltered       REAL,                -- m/s media móvil 10
    windDirectionFiltered   REAL,                -- ° promedio vectorial 20s
    light                   REAL DEFAULT 0,      -- lux
    dht_temperature         REAL,                -- DHT11 °C
    dht_humidity            REAL,                -- DHT11 %
    rssi                    INTEGER,             -- dBm
    free_heap               INTEGER,             -- bytes
    uptime_s                INTEGER,             -- segundos desde boot
    relay_active            INTEGER DEFAULT 0,   -- bitmask de relays
    pipeline_pressure       REAL,                -- bar (simulado)
    pipeline_flow           REAL,                -- L/min (simulado)
    soil_moisture           REAL,                -- % YL-69
    device_mac              TEXT,                -- MAC del dispositivo emisor
    timestamp               DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Dispositivos registrados (HTTP POST /api/device_info o MQTT register)
CREATE TABLE device_info (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    finca_id        TEXT,                        -- namespace MQTT (ej. "aquantia_prototype_1")
    chip_model      TEXT,
    chip_revision   INTEGER,
    cpu_freq_mhz    INTEGER,
    flash_size_mb   INTEGER,
    sdk_version     TEXT,
    mac_address     TEXT UNIQUE,                 -- clave natural para upsert MQTT
    ip_address      TEXT,
    relay_count     INTEGER DEFAULT 1,
    last_seen       DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Alertas recibidas por MQTT (topic aquantia/+/alerts)
CREATE TABLE alerts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    finca_id    TEXT,
    device_mac  TEXT,
    alert_type  TEXT,                            -- identificador de la alerta
    severity    TEXT DEFAULT 'info',             -- 'critical' | 'warning' | 'info'
    message     TEXT,
    acked       INTEGER DEFAULT 0,               -- 0=pendiente, 1=resuelta
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_timestamp ON home_weather_station(timestamp);
```

---

## API endpoints

### Datos meteorológicos

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/send_message` | Recibe CSV del ESP en modo HTTP legacy |
| `GET` | `/api/muestras/<N>` | Últimas N muestras en JSON (columnas como arrays) |
| `POST` | `/api/filtrar` | Filtra por rango de fechas `{start_date, end_date}` |
| `GET` | `/api/latest` | Último registro en JSON |

### Dispositivos

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/device_info` | ESP registra info estática (HTTP legacy) |
| `GET` | `/api/device_info` | Info del dispositivo seleccionado |
| `GET` | `/api/devices` | Lista todos los dispositivos registrados |

### Relays / riego

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/relay/command` | ESP consulta bitmask deseado (HTTP legacy) |
| `POST` | `/api/relay` | Dashboard envía bitmask → Flask aplica (HTTP) o publica MQTT cmd |
| `POST` | `/api/relay/ack` | ESP confirma estado real (HTTP legacy) |

Cuando el dispositivo tiene `finca_id` en `device_info` (modo MQTT), `POST /api/relay` publica automáticamente en `aquantia/<finca_id>/cmd` en lugar de escribir en la tabla de polling.

### Alertas MQTT

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/alerts` | Todas las alertas (JSON array) |
| `GET` | `/api/alerts?acked=0` | Solo alertas sin resolver |
| `POST` | `/api/alerts/<id>/ack` | Marcar alerta como resuelta |

### Pipeline

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/pipeline/status` | Última lectura + resultado de detección |
| `GET` | `/api/pipeline/readings?n=N` | Histórico para gráficos |
| `GET` | `/api/pipeline/scenario` | Escenario activo (texto plano) |
| `POST` | `/api/pipeline/scenario` | Cambiar escenario (`normal`/`leak`/`burst`) |

### Payload JSON MQTT — telemetría

El topic `aquantia/<finca_id>/telemetry` publica este JSON cada 20s:

```json
{
  "temperature":           22.5,
  "pressure":              101.3,
  "temperature_barometer": 21.8,
  "humidity":              65.2,
  "windSpeed":             3.5,
  "windDirection":         180.0,
  "windSpeedFiltered":     3.3,
  "windDirectionFiltered": 178.0,
  "light":                 350.0,
  "dht_temperature":       21.6,
  "dht_humidity":          63.0,
  "rssi":                  -65,
  "free_heap":             245000,
  "uptime_s":              12345,
  "relay_active":          0,
  "soil_moisture":         50.0,
  "mac_address":           "88:13:BF:FD:A2:38"
}
```

### Payload JSON MQTT — registro

El topic `aquantia/<finca_id>/register` publica al arrancar:

```json
{
  "mac_address":   "88:13:BF:FD:A2:38",
  "ip_address":    "192.168.1.11",
  "chip_model":    "ESP32-D0WD-V3",
  "chip_revision": 3,
  "cpu_freq_mhz":  160,
  "flash_size_mb": 4,
  "sdk_version":   "v5.5.2-729-g87912cd291",
  "relay_count":   4
}
```

### Payload JSON MQTT — comando de relay

El topic `aquantia/<finca_id>/cmd` recibe:

```json
{ "relay": 0, "state": true }
```

`relay` es el índice (0–3 para PROFILE_IRRIGATION). `state: true` activa el relay (GPIO LOW en relays activo-LOW).

---

## Configuración MQTT

### Variables de entorno (`.env`)

```env
# Servidor MQTT (Flask → Mosquitto, red interna Docker sin TLS)
MQTT_HOST=mosquitto
MQTT_PORT=1883
MQTT_USER=backend
MQTT_PASSWORD=contraseña_backend
MQTT_TLS=0

# Si Flask conecta externamente al broker (fuera de Docker):
# MQTT_HOST=meteo.aquantialab.com
# MQTT_PORT=8883
# MQTT_TLS=1
# MQTT_CA_CERT=/ruta/al/ca.pem
```

### Añadir un dispositivo nuevo al broker

```bash
# En el VPS, dentro del directorio de la app:
docker exec -it meteostation_mosquitto \
  mosquitto_passwd /mosquitto/config/passwd <finca_id>
# (introduce la contraseña cuando lo pida)

docker restart meteostation_mosquitto
```

Luego en el firmware del nuevo dispositivo, configurar en `secrets.h`:
```cpp
#define USE_MQTT
#define MQTT_SERVER  "meteo.aquantialab.com"
#define MQTT_PORT    8883
#define FINCA_ID     "<finca_id>"
#define MQTT_USER    "<finca_id>"     // username = finca_id (ACL pattern)
#define MQTT_PASS    "<contraseña>"
```

El broker acepta automáticamente el nuevo dispositivo gracias al ACL `pattern readwrite aquantia/%u/#`. No hay que tocar ningún archivo de configuración del broker.

---

## Instalación y desarrollo local

### Requisitos

- Python 3.9+
- Node.js 18+
- (Opcional) Docker para correr Mosquitto localmente

### Backend

```bash
cd app_meteo
cp backend/.env.example backend/.env
pip install -r backend/requirements.txt
```

Si no tienes broker MQTT en desarrollo, Flask arranca igualmente sin MQTT (falla silenciosamente). Para tener un broker local:

```bash
docker run -d --name mosquitto-dev \
  -p 1883:1883 \
  eclipse-mosquitto:2 \
  sh -c "echo 'listener 1883\nallow_anonymous true' > /tmp/m.conf && mosquitto -c /tmp/m.conf"
```

### Frontend

```bash
cd frontend
npm install
```

### Arrancar en desarrollo

**Terminal 1 — Backend Flask:**
```bash
cd backend
python app.py
# Flask en http://0.0.0.0:7000
# Si MQTT_HOST es alcanzable, el cliente MQTT se conecta automáticamente
```

**Terminal 2 — Frontend React:**
```bash
cd frontend
npm run dev
# Vite en http://localhost:5173
# /api/* redirigido automáticamente a Flask :7000
```

### Scripts de arranque rápido

```bash
# Linux / macOS
./start.sh

# Windows
start.bat
```

---

## Despliegue en producción

### Arquitectura VPS

```
VPS Hetzner (Ubuntu 24.04)
├── HestiaCP
│   ├── Nginx — meteo.aquantialab.com
│   │   ├── / → /home/alejandro/web/.../public_html/  (frontend/dist/)
│   │   └── /api/* → proxy http://127.0.0.1:5000
│   └── Let's Encrypt (renovación automática)
│
└── Docker Compose
    ├── meteostation_app    (Flask + Gunicorn, puerto interno 5000)
    │   └── --workers 1     ← obligatorio para MQTT (un solo client_id)
    └── meteostation_mosquitto  (Mosquitto, puerto externo 8883 TLS)
```

### `docker-compose.yml` (simplificado)

```yaml
services:
  meteostation:
    build: .
    command: ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--timeout", "30", "app:app"]
    environment:
      - MQTT_HOST=mosquitto        # nombre del servicio Docker (red interna)
      - MQTT_PORT=1883             # sin TLS en la red interna
      - MQTT_USER=backend
      - MQTT_PASSWORD=${MQTT_BACKEND_PASSWORD}
      - MQTT_TLS=0
    depends_on:
      - mosquitto

  mosquitto:
    image: eclipse-mosquitto:2
    ports:
      - "0.0.0.0:8883:8883"       # TLS para dispositivos externos
    volumes:
      - ./mosquitto/config:/mosquitto/config:ro
      - ./mosquitto/certs:/mosquitto/certs:ro
      - mosquitto_data:/mosquitto/data
```

### Flujo de deploy (actualizar producción)

**1. En local:**
```bash
cd frontend
npm run build

cd ..
git add frontend/dist frontend/src backend/
git commit -m "feat: descripción del cambio"
git push
```

**2. En el servidor:**
```bash
cd ~/web/meteo.aquantialab.com/app
./deploy.sh           # git pull + docker compose up -d --build

# Si solo cambió el frontend:
./deploy.sh --no-docker
```

### Gestión Docker

```bash
docker compose ps                    # estado de los dos servicios
docker compose logs -f               # logs Flask + Mosquitto en tiempo real
docker compose logs meteostation -f  # solo Flask
docker compose logs mosquitto -f     # solo Mosquitto
docker compose restart meteostation  # reiniciar Flask (recarga MQTT)
docker compose restart mosquitto     # reiniciar broker
docker compose up -d --build         # rebuild completo
```

### Acceso a la base de datos en producción

```bash
docker compose exec meteostation bash
sqlite3 /app/data/home_weather_station.db

-- Últimas telemetrías MQTT
SELECT timestamp, temperature, humidity, device_mac FROM home_weather_station ORDER BY timestamp DESC LIMIT 10;

-- Dispositivos registrados con finca_id
SELECT finca_id, mac_address, chip_model, ip_address, last_seen FROM device_info;

-- Alertas pendientes
SELECT created_at, finca_id, alert_type, severity, message FROM alerts WHERE acked=0;
```

---

## Simulador (sin hardware)

Genera datos meteorológicos realistas y los envía al servidor Flask por HTTP (modo legacy).

```bash
python backend/simulator.py [--host HOST] [--port PORT] [--interval SEG] [--count N]
```

```bash
# Poblar 500 muestras rápido
python backend/simulator.py --interval 0.05 --count 500
```

---

## Pipeline y detección de fugas

La vista **Pipeline** monitoriza la presión de tubería y el caudal para detectar fugas y roturas.

### Algoritmos de detección

| Método | Disparador | Status |
|--------|-----------|--------|
| **Umbral absoluto** | Caudal > 0.10 L/min con válvula cerrada | `LEAK` |
| **dP/dt** | Presión < 30% del valor esperado | `BURST` |
| **dP/dt consecutivo** | Caída > 20% entre dos muestras (válvula abierta) | `BURST` |
| **EWMA** (λ=0.15) | Deriva estadística > 2.5σ en presión o caudal | `LEAK_SUSPECTED` |

Los datos de presión y caudal los genera actualmente el simulador integrado en el ESP32 (ruido determinista con ondas sinusoidales). Cuando se instalen los sensores físicos, solo hay que sustituir `sim_pipeline_pressure` y `sim_pipeline_flow` por las lecturas reales; el resto del sistema no requiere cambios.
