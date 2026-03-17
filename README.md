# MeteoStation Dashboard

Dashboard web para una estación meteorológica casera basada en **ESP32 / ESP8266**.
El microcontrolador recoge datos de los sensores y los envía por HTTP al servidor Flask, que los almacena en SQLite y los muestra en un dashboard React en tiempo real.

---

## Índice

- [Estructura del repositorio](#estructura-del-repositorio)
- [Tecnologías](#tecnologías)
- [Datos que recoge la estación](#datos-que-recoge-la-estación)
- [Instalación](#instalación)
- [Arrancar en desarrollo](#arrancar-en-desarrollo)
- [Scripts de arranque rápido](#scripts-de-arranque-rápido)
- [Simulador (sin hardware)](#simulador-sin-hardware)
- [API endpoints](#api-endpoints)
- [Formato de datos del ESP](#formato-de-datos-del-esp)
- [Base de datos](#base-de-datos)
- [Despliegue en producción](#despliegue-en-producción)

---

## Estructura del repositorio

```
app_meteo/
├── backend/                    # Backend Flask (API + legacy HTML)
│   ├── app.py                  # Servidor Flask con todos los endpoints
│   ├── database.py             # Conexión SQLite y creación de tablas
│   ├── requirements.txt        # Dependencias Python
│   ├── .env.example            # Plantilla de configuración de puertos
│   ├── simulator.py            # Simulador del ESP (desarrollo sin hardware)
│   ├── templates/index.html    # Dashboard HTML legacy
│   └── static/                 # Assets del dashboard legacy
│
├── frontend/                   # Frontend React (activo)
│   ├── src/
│   │   ├── App.jsx             # Layout principal, navegación entre vistas
│   │   ├── components/
│   │   │   ├── Sidebar.jsx     # Sidebar con navegación, selector y filtros
│   │   │   ├── StatCard.jsx    # Cards con valor actual, min y max
│   │   │   ├── WeatherChart.jsx# Gráficos ApexCharts con eje datetime
│   │   │   └── DeviceStatus.jsx# Vista de estado del ESP32 (señal, heap, info)
│   │   ├── hooks/
│   │   │   └── useWeatherData.js # Hook: fetching, estado y auto-refresco
│   │   └── index.css           # Tailwind + fuente Inter
│   ├── package.json
│   └── vite.config.js          # Proxy /api → Flask :7000 (lee backend/.env)
│
├── start.sh                    # Arranque rápido Linux/macOS
├── start.bat                   # Arranque rápido Windows
└── README.md
```

---

## Tecnologías

| Capa | Tecnología |
|------|-----------|
| Backend API | Python 3, Flask, flask-cors, python-dotenv, SQLite3 |
| Servidor producción | Gunicorn |
| Frontend | React 18, Vite, Tailwind CSS 3, ApexCharts, Lucide React |
| Hardware ESP32 | MCP9808 · HTU2x · SparkFun MicroPressure · APDS-9930/TSL2584 · DHT11 · anemómetro · veleta |
| Hardware ESP8266 | HTU2x · APDS-9930/TSL2584 · DHT11 · anemómetro (sin veleta ni pantalla) |
| Despliegue | Raspberry Pi / PC en red local |

---

## Datos que recoge la estación

### Datos ambientales (CSV periódico, cada 20 s)

| Campo | Unidad | Sensor | Descripción |
|-------|--------|--------|-------------|
| `temperature` | °C | MCP9808 (0x19) | Temperatura exterior principal |
| `temperature_bar` | °C | HTU2x (0x40) | Temperatura interior (sensor T+H) |
| `humidity` | % | HTU2x (0x40) | Humedad relativa |
| `pressure` | kPa* | SparkFun MicroPressure (0x18) | Presión atmosférica |
| `windSpeed` | m/s | Anemómetro (ADC) | Velocidad instantánea |
| `windDirection` | ° | Veleta (ADC, solo ESP32) | Dirección instantánea 0–360° |
| `windSpeedFiltered` | m/s | — | Velocidad filtrada (media móvil 10) |
| `windDirectionFiltered` | ° | — | Dirección filtrada (promedio vectorial) |
| `light` | lux | APDS-9930 / TSL2584 (0x39) | Luz ambiente |
| `dht_temperature` | °C | DHT11 | Temperatura secundaria |
| `dht_humidity` | % | DHT11 | Humedad secundaria |
| `rssi` | dBm | WiFi ESP | Intensidad de señal WiFi |
| `free_heap` | bytes | ESP32 | Memoria heap libre |
| `uptime_s` | s | ESP32 | Segundos desde el arranque |

> *La presión se almacena en kPa (~101.3). Pendiente corregir a hPa en firmware.

### Info estática del dispositivo (al arrancar)

Guardada en la tabla `device_info` vía `POST /api/device_info`:

| Campo | Descripción |
|-------|-------------|
| `chip_model` | Modelo del chip (ej. ESP32-D0WDQ6) |
| `chip_revision` | Revisión del chip (ej. 101 = v1.1) |
| `cpu_freq_mhz` | Frecuencia CPU en MHz |
| `flash_size_mb` | Tamaño de flash en MB |
| `sdk_version` | Versión del SDK de Espressif |
| `mac_address` | Dirección MAC WiFi |
| `ip_address` | IP asignada por DHCP |

---

## Instalación

### Requisitos

- Python 3.9 o superior
- Node.js 18 o superior

### Backend

```bash
git clone https://github.com/alepape1/app_meteo.git
cd app_meteo

cp backend/.env.example backend/.env

pip install -r backend/requirements.txt
```

### Frontend

```bash
cd frontend
npm install
```

---

## Arrancar en desarrollo

**Terminal 1 — Backend Flask:**
```bash
cd backend
python app.py
# Flask arranca en http://0.0.0.0:7000
```

**Terminal 2 — Frontend React:**
```bash
cd frontend
npm run dev
# Vite en http://localhost:5173
```

Abre el navegador en **`http://localhost:5173`**

> Vite redirige automáticamente las llamadas a `/api/*` y `/descargar/*` hacia Flask en el puerto 7000 gracias al proxy configurado en `vite.config.js`.

---

## Scripts de arranque rápido

### Linux / macOS

```bash
chmod +x start.sh
./start.sh
```

### Windows

Doble clic en `start.bat` o desde cmd:
```
start.bat
```

Ambos scripts instalan dependencias si faltan, y arrancan backend y frontend automáticamente.

---

## Simulador (sin hardware)

El simulador genera datos meteorológicos realistas y los envía al servidor Flask igual que haría el ESP.

```bash
python backend/simulator.py [--host HOST] [--port PORT] [--interval SEG] [--count N]
```

| Opción | Default | Descripción |
|--------|---------|-------------|
| `--host` | `127.0.0.1` | IP del servidor Flask |
| `--port` | `7000` | Puerto del servidor Flask |
| `--interval` | `5` | Segundos entre envíos |
| `--count` | `0` | Nº de muestras (0 = infinito) |

```bash
# Poblar 500 muestras rápido para probar el filtro de fechas
python backend/simulator.py --interval 0.05 --count 500
```

---

## API endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/` | Dashboard HTML legacy |
| `GET` | `/descargar/<N>` | Dashboard HTML con los últimos N registros |
| `GET` | `/average/<N>` | Dashboard HTML con el promedio de N registros |
| `POST` | `/send_message` | Recibe datos del ESP en formato CSV (9, 11 u 14 valores) |
| `GET` | `/api/muestras/<N>` | Últimas N muestras en JSON |
| `POST` | `/api/filtrar` | Filtra por rango de fechas, devuelve JSON |
| `GET` | `/api/latest` | Último registro en JSON (auto-refresco cada 60 s) |
| `POST` | `/api/device_info` | El ESP envía info estática del chip al arrancar |
| `GET` | `/api/device_info` | Devuelve la info estática del dispositivo |

### `POST /send_message`

Cuerpo en texto plano. Acepta **9, 11 u 14 valores** separados por coma (retrocompatible con versiones anteriores del firmware):

```
temperature,pressure,temperature_bar,humidity,windSpeed,windDirection,
windSpeedFiltered,windDirectionFiltered,light[,dht_temp,dht_hum[,rssi,free_heap,uptime_s]]
```

Ejemplo (14 campos, firmware v3 completo):
```
25.31,101.14,23.01,69.33,0.00,0.00,0.00,0.00,0.48,25.00,15.00,-62,142256,120
```

### `POST /api/filtrar`

```json
{ "start_date": "2026-01-01 00:00:00", "end_date": "2026-01-31 23:59:59" }
```

### Respuesta JSON estándar (`/api/muestras`, `/api/filtrar`, `/api/latest`)

```json
{
  "timestamp":             ["2026-03-17 18:56:32", "..."],
  "temperature":           [25.31],
  "temperature_bar":       [23.01],
  "humidity":              [69.33],
  "pressure":              [101.14],
  "windSpeed":             [0.0],
  "windDirection":         [0.0],
  "windSpeedFiltered":     [0.0],
  "windDirectionFiltered": [0.0],
  "light":                 [0.48],
  "dht_temperature":       [25.0],
  "dht_humidity":          [15.0],
  "rssi":                  [-62],
  "free_heap":             [142256],
  "uptime_s":              [120]
}
```

### `GET /api/device_info`

```json
{
  "id": 1,
  "chip_model": "ESP32-D0WDQ6",
  "chip_revision": 101,
  "cpu_freq_mhz": 240,
  "flash_size_mb": 16,
  "sdk_version": "v5.5.2-729-g87912cd291",
  "mac_address": "88:13:BF:FD:A2:38",
  "ip_address": "192.168.1.13",
  "last_seen": "2026-03-17 18:56:30"
}
```

---

## Base de datos

La base de datos SQLite se crea automáticamente en `backend/home_weather_station.db`.

### Esquema

```sql
CREATE TABLE home_weather_station (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    temperature             REAL,
    temperature_barometer   REAL,
    humidity                REAL,
    pressure                REAL,
    windSpeed               REAL,
    windDirection           REAL,
    windSpeedFiltered       REAL,
    windDirectionFiltered   REAL,
    light                   REAL DEFAULT 0,
    dht_temperature         REAL,
    dht_humidity            REAL,
    rssi                    INTEGER,
    free_heap               INTEGER,
    uptime_s                INTEGER,
    timestamp               DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE device_info (
    id              INTEGER PRIMARY KEY,   -- siempre 1 (un solo dispositivo)
    chip_model      TEXT,
    chip_revision   INTEGER,
    cpu_freq_mhz    INTEGER,
    flash_size_mb   INTEGER,
    sdk_version     TEXT,
    mac_address     TEXT,
    ip_address      TEXT,
    last_seen       DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_timestamp ON home_weather_station(timestamp);
```

> `database.py` aplica migraciones automáticas al arrancar para añadir columnas nuevas a bases de datos existentes.

### Consultas útiles

```bash
sqlite3 backend/home_weather_station.db

-- Últimos 5 registros
SELECT timestamp, temperature, humidity, rssi, free_heap FROM home_weather_station ORDER BY timestamp DESC LIMIT 5;

-- Info del dispositivo
SELECT * FROM device_info;

-- Promedio de temperatura de hoy
SELECT AVG(temperature) FROM home_weather_station WHERE DATE(timestamp) = DATE('now');
```

---

## Despliegue en producción

### Solo backend (Raspberry Pi)

```bash
cd backend
gunicorn -w 2 -b 0.0.0.0:7000 app:app
```

### Arranque automático con systemd

```ini
[Unit]
Description=MeteoStation Backend
After=network.target

[Service]
User=pi
WorkingDirectory=/home/pi/app_meteo/backend
ExecStart=gunicorn -w 2 -b 0.0.0.0:7000 app:app
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable meteostation
sudo systemctl start meteostation
```

### Configuración de red (Flask en WSL, ESP en red local)

Con WSL2 `networkingMode=mirrored` (`C:\Users\<usuario>\.wslconfig`), WSL y Windows comparten la misma IP. El ESP puede conectar directamente a esa IP en el puerto 7000.

```ini
[wsl2]
networkingMode=mirrored
```

Tras editar: `wsl --shutdown` y reabrir WSL.
