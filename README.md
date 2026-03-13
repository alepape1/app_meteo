# MeteoStation Dashboard

Dashboard web para una estación meteorológica casera basada en **ESP32** y **Raspberry Pi**.
El ESP32 recoge datos de los sensores y los envía por HTTP al servidor Flask, que los almacena en SQLite y los muestra en un dashboard React en tiempo real.

---

## Índice

- [Estructura del repositorio](#estructura-del-repositorio)
- [Tecnologías](#tecnologías)
- [Datos que recoge la estación](#datos-que-recoge-la-estación)
- [Instalación](#instalación)
- [Arrancar en desarrollo](#arrancar-en-desarrollo)
- [Simulador (sin hardware)](#simulador-sin-hardware)
- [API endpoints](#api-endpoints)
- [Formato de datos del ESP32](#formato-de-datos-del-esp32)
- [Despliegue en producción](#despliegue-en-producción)
- [Base de datos](#base-de-datos)

---

## Estructura del repositorio

```
app_meteo/
├── backend/          # Backend Flask (API + legacy HTML)
│   ├── app.py                  # Servidor Flask con todos los endpoints
│   ├── database.py             # Conexión SQLite y creación de tablas
│   ├── requirements.txt        # Dependencias Python
│   ├── templates/index.html    # Dashboard HTML legacy (no se usa con React)
│   └── static/                 # Assets del dashboard legacy
│
├── frontend/                  # Frontend React (activo)
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
│   └── vite.config.js          # Proxy /api → Flask :7000
│
├── backend/simulator.py                # Simulador del ESP32 (desarrollo sin hardware)
├── .gitignore
└── README.md
```

> La carpeta raíz contiene también la versión legacy (v1) conservada como histórico.

---

## Tecnologías

| Capa | Tecnología |
|------|-----------|
| Backend API | Python 3, Flask, flask-cors, SQLite3 |
| Servidor producción | Gunicorn |
| Frontend | React 18, Vite, Tailwind CSS 3, ApexCharts, Lucide React |
| Hardware | ESP32 + MCP9808 (temperatura) + SparkFun MicroPressure + DHT11 + anemómetro/veleta |
| Despliegue | Raspberry Pi (red local 192.168.1.32) |

---

## Datos que recoge la estación

| Campo | Unidad | Sensor | Descripción |
|-------|--------|--------|-------------|
| `temperature` | °C | MCP9808 | Temperatura ambiente principal |
| `temperature_barometer` | °C | DHT11 | Temperatura del sensor barométrico |
| `humidity` | % | DHT11 | Humedad relativa |
| `pressure` | hPa | SparkFun MicroPressure | Presión atmosférica |
| `windSpeed` | m/s | Anemómetro (ADC pin 37) | Velocidad del viento cruda |
| `windDirection` | ° | Veleta (ADC pin 36) | Dirección del viento cruda 0-360° |
| `windSpeedFiltered` | m/s | — | Velocidad filtrada (media móvil 10 muestras) |
| `windDirectionFiltered` | ° | — | Dirección filtrada (media móvil 10 muestras) |

---

## Instalación

### Requisitos

- Python 3.9 o superior
- Node.js 18 o superior
- pip, npm

### Backend

```bash
# 1. Clonar el repositorio
git clone https://github.com/alepape1/app_meteo.git
cd app_meteo

# 2. (Opcional) Entorno virtual
python -m venv venv
source venv/bin/activate        # Linux / macOS
venv\Scripts\activate           # Windows

# 3. Instalar dependencias Python
pip install -r backend/requirements.txt

# 4. (Solo para el simulador)
pip install requests
```

### Frontend

```bash
cd frontend
npm install
```

---

## Arrancar en desarrollo

Necesitas **tres terminales**:

**Terminal 1 — Backend Flask:**
```bash
cd backend
python app.py
```
Flask arranca en `http://0.0.0.0:7000`. Crea la base de datos automáticamente si no existe.

**Terminal 2 — Simulador (opcional, si no tienes el ESP32):**
```bash
cd ..   # volver a la raíz del repo
python backend/simulator.py --interval 5
```

**Terminal 3 — Frontend React:**
```bash
cd frontend
npm run dev
```

Abre el navegador en **`http://localhost:5173`**

> Vite redirige automáticamente las llamadas a `/api/*` hacia Flask en el puerto 5000 gracias al proxy configurado en `vite.config.js`. No hace falta configurar nada más.

---

## Simulador (sin hardware)

El simulador genera datos meteorológicos realistas y los envía al servidor Flask exactamente igual que haría el ESP32, sin necesitar el hardware físico.

Genera variación suave de temperatura con ciclo diario, ráfagas de viento aleatorias con filtro de media móvil (ventana de 5 muestras), y variaciones realistas de humedad y presión.

### Opciones

```
python backend/simulator.py [--host HOST] [--port PORT] [--interval SEG] [--count N]
```

| Opción | Default | Descripción |
|--------|---------|-------------|
| `--host` | `127.0.0.1` | IP del servidor Flask |
| `--port` | `5000` | Puerto del servidor Flask |
| `--interval` | `5` | Segundos entre envíos |
| `--count` | `0` | Nº de muestras (0 = infinito) |

### Ejemplos

```bash
# Datos cada 2 segundos (ver gráficos actualizarse en tiempo real)
python backend/simulator.py --interval 2

# Poblar 500 muestras históricas rápido para probar el filtro de fechas
python backend/simulator.py --interval 0.05 --count 500

# Conectar a la Raspberry Pi en red local
python backend/simulator.py --host 192.168.1.32 --interval 5
```

---

## API endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/` | Dashboard HTML legacy |
| `GET` | `/descargar/<N>` | Dashboard HTML con los últimos N registros |
| `GET` | `/average/<N>` | Dashboard HTML con el promedio de N registros |
| `POST` | `/send_message` | Recibe datos del ESP32 en formato CSV |
| `GET` | `/api/muestras/<N>` | Últimas N muestras en JSON (usado por React) |
| `POST` | `/api/filtrar` | Filtra por rango de fechas, devuelve JSON |
| `GET` | `/api/latest` | Último registro en JSON (auto-refresco cada 60s) |

### `POST /send_message`

Cuerpo en texto plano, exactamente 8 valores separados por coma:

```
20.5,1013.2,19.8,62.3,4.5,225.0,4.2,222.5
```

Devuelve `200 OK` si es válido, `400` si el formato es incorrecto.

### `GET /api/muestras/<N>`

Devuelve las últimas N muestras como JSON. Usado por el dashboard React en la carga inicial y cuando se cambia el número de muestras desde la sidebar.

### `POST /api/filtrar`

Body JSON:
```json
{
  "start_date": "2025-01-01 00:00:00",
  "end_date":   "2025-01-31 23:59:59"
}
```

Devuelve JSON con arrays de datos para cada variable del mismo formato que `/api/muestras`.

### `GET /api/latest`

Devuelve el registro más reciente. El dashboard lo llama automáticamente cada 60 segundos.

```json
{
  "timestamp":             ["2025-05-07 12:34:56"],
  "temperature":           [21.3],
  "temperature_bar":       [20.8],
  "humidity":              [58.2],
  "pressure":              [1014.5],
  "windSpeed":             [3.7],
  "windDirection":         [210.0],
  "windSpeedFiltered":     [3.5],
  "windDirectionFiltered": [208.4]
}
```

---

## Formato de datos del ESP32

El ESP32 envía una petición HTTP POST a `/send_message` con el cuerpo en texto plano:

```
temperature, pressure, temperature_barometer, humidity, windSpeed, windDirection, windSpeedFiltered, windDirectionFiltered
```

Ejemplo de código Arduino:

```cpp
#include <WiFi.h>
#include <HTTPClient.h>

const char* serverUrl = "http://192.168.1.32:7000/send_message";

void enviarDatos(float temp, float pres, float tempBar,
                 float hum, float ws, float wd, float wsf, float wdf) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "text/plain");

    String payload = String(temp, 2) + "," + String(pres, 2) + "," +
                     String(tempBar, 2) + "," + String(hum, 2) + "," +
                     String(ws, 2) + "," + String(wd, 2) + "," +
                     String(wsf, 2) + "," + String(wdf, 2);

    int httpCode = http.POST(payload);
    http.end();
}
```

> **Nota:** El firmware actual envía la presión en KPa (`barometer.readPressure(KPA)`).
> El servidor la almacena tal cual. Para que el dashboard muestre hPa correctos,
> hay que cambiar a `barometer.readPressure(PA) / 100.0` en el firmware.

---

## Despliegue en producción

### Solo el backend (Raspberry Pi sin React)

```bash
cd backend
gunicorn -w 2 -b 0.0.0.0:7000 app:app

# En segundo plano
nohup gunicorn -w 2 -b 0.0.0.0:7000 app:app &
```

### Backend + Frontend juntos (build estático servido por Flask)

```bash
# 1. Compilar el frontend
cd frontend
npm run build

# 2. Copiar el build a Flask
cp -r dist/* ../backend/static/react/

# 3. Arrancar Flask (sirve la build como ficheros estáticos)
cd ../backend
gunicorn -w 2 -b 0.0.0.0:7000 app:app
```

> En esta configuración se accede al dashboard en `http://192.168.1.32:7000`.

### Arranque automático con systemd (Raspberry Pi)

Crea `/etc/systemd/system/meteostation.service`:

```ini
[Unit]
Description=MeteoStation Dashboard
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
sudo systemctl daemon-reload
sudo systemctl enable meteostation
sudo systemctl start meteostation

# Estado y logs
sudo systemctl status meteostation
sudo journalctl -u meteostation -f
```

---

## Base de datos

La base de datos SQLite se crea automáticamente en `backend/home_weather_station.db` al arrancar Flask por primera vez.

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
    timestamp               DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_timestamp ON home_weather_station(timestamp);
```

### Consultas útiles

```bash
# Abrir la DB
sqlite3 backend/home_weather_station.db

# Últimos 5 registros
SELECT * FROM home_weather_station ORDER BY timestamp DESC LIMIT 5;

# Total de registros
SELECT COUNT(*) FROM home_weather_station;

# Promedio de temperatura de hoy
SELECT AVG(temperature) FROM home_weather_station
WHERE DATE(timestamp) = DATE('now');

# Registros de un rango de fechas
SELECT * FROM home_weather_station
WHERE timestamp BETWEEN '2025-05-01 00:00:00' AND '2025-05-07 23:59:59'
ORDER BY timestamp ASC;
```
