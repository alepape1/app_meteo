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
- [Despliegue en producción](#despliegue-en-producción)
- [Base de datos](#base-de-datos)

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
│   │   ├── App.jsx             # Layout principal y composición
│   │   ├── components/
│   │   │   ├── Sidebar.jsx     # Sidebar con selector de muestras y fechas
│   │   │   ├── StatCard.jsx    # Cards con valor actual, min y max
│   │   │   └── WeatherChart.jsx# Gráficos ApexCharts con eje datetime
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
| Hardware ESP32 | MCP9808 · HTU2x · SparkFun MicroPressure · APDS-9930/TSL2584 · anemómetro/veleta |
| Hardware ESP8266 | HTU2x · APDS-9930/TSL2584 · anemómetro (sin veleta ni pantalla) |
| Despliegue | Raspberry Pi / PC en red local |

---

## Datos que recoge la estación

| Campo | Unidad | Sensor | Descripción |
|-------|--------|--------|-------------|
| `temperature` | °C | MCP9808 (0x19) | Temperatura exterior principal |
| `temperature_bar` | °C | HTU2x (0x40) | Temperatura del sensor de humedad |
| `humidity` | % | HTU2x (0x40) | Humedad relativa |
| `pressure` | kPa | SparkFun MicroPressure | Presión atmosférica |
| `windSpeed` | m/s | Anemómetro (ADC) | Velocidad del viento cruda |
| `windDirection` | ° | Veleta (ADC, solo ESP32) | Dirección cruda 0–360° |
| `windSpeedFiltered` | m/s | — | Velocidad filtrada (media móvil 10) |
| `windDirectionFiltered` | ° | — | Dirección filtrada (promedio vectorial) |
| `light` | lux | APDS-9930/TSL2584 (0x39) | Luz ambiente |

> **Nota:** La presión se almacena en kPa (~101.3). El dashboard la muestra tal cual con la etiqueta "hPa" por compatibilidad — pendiente corregir en firmware.

---

## Instalación

### Requisitos

- Python 3.9 o superior
- Node.js 18 o superior

### Backend

```bash
git clone https://github.com/alepape1/app_meteo.git
cd app_meteo

# Crear .env desde la plantilla
cp backend/.env.example backend/.env

# Instalar dependencias
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

El simulador genera datos meteorológicos realistas (temperatura, humedad, presión, viento y luz) y los envía al servidor Flask igual que haría el ESP.

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
| `POST` | `/send_message` | Recibe datos del ESP en formato CSV (9 valores) |
| `GET` | `/api/muestras/<N>` | Últimas N muestras en JSON |
| `POST` | `/api/filtrar` | Filtra por rango de fechas, devuelve JSON |
| `GET` | `/api/latest` | Último registro en JSON (auto-refresco cada 60s) |

### `POST /send_message`

Cuerpo en texto plano, exactamente **9 valores** separados por coma:

```
temperature,pressure,temperature_bar,humidity,windSpeed,windDirection,windSpeedFiltered,windDirectionFiltered,light
```

Ejemplo:
```
23.25,101.35,22.06,81.34,0.00,0.00,0.00,0.00,1.39
```

### `POST /api/filtrar`

```json
{ "start_date": "2026-01-01 00:00:00", "end_date": "2026-01-31 23:59:59" }
```

### Respuesta JSON estándar

```json
{
  "timestamp":             ["2026-03-17 01:18:11", "..."],
  "temperature":           [23.25],
  "temperature_bar":       [22.06],
  "humidity":              [81.34],
  "pressure":              [101.35],
  "windSpeed":             [0.0],
  "windDirection":         [0.0],
  "windSpeedFiltered":     [0.0],
  "windDirectionFiltered": [0.0],
  "light":                 [1.39]
}
```

---

## Formato de datos del ESP

El ESP envía HTTP POST a `/send_message` con 9 valores CSV:

```cpp
String msg = String(temperatureMCP, 2)    + "," +
             String(pressure, 2)          + "," +
             String(temperatureDHT, 2)    + "," +
             String(humidity, 2)          + "," +
             String(windSpeed, 2)         + "," +
             String(currentWindDirDeg, 2) + "," +
             String(windSpeedFiltered, 2) + "," +
             String(finalAvgWindDir, 2)   + "," +
             String(lightLevel, 2);
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

Flask en WSL no es accesible directamente desde la red. Solución con port forwarding en PowerShell (admin):

```powershell
netsh interface portproxy add v4tov4 listenport=7000 listenaddress=0.0.0.0 connectport=7000 connectaddress=$(wsl hostname -I)
```

En `secrets.h` del firmware usar la **IP WiFi de Windows**, no la de WSL. La IP de WSL puede cambiar al reiniciar — ejecutar `hostname -I` en WSL para obtenerla.

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
    timestamp               DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_timestamp ON home_weather_station(timestamp);
```

> Si la tabla existía sin la columna `light` (antes de 2026-03-17), `database.py` la añade automáticamente con `ALTER TABLE` al arrancar.

### Consultas útiles

```bash
sqlite3 backend/home_weather_station.db

# Últimos 5 registros
SELECT * FROM home_weather_station ORDER BY timestamp DESC LIMIT 5;

# Total de registros
SELECT COUNT(*) FROM home_weather_station;

# Promedio de temperatura de hoy
SELECT AVG(temperature) FROM home_weather_station
WHERE DATE(timestamp) = DATE('now');
```
