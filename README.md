# MeteoStation Dashboard

Dashboard web para una estación meteorológica casera basada en **ESP32** y **Raspberry Pi**.
El ESP32 recoge datos de los sensores y los envía por HTTP al servidor Flask, que los almacena en SQLite y los muestra en gráficos en tiempo real.

---

## Índice

- [Estructura del repositorio](#estructura-del-repositorio)
- [Tecnologías](#tecnologías)
- [Datos que recoge la estación](#datos-que-recoge-la-estación)
- [Instalación](#instalación)
- [Arrancar la aplicación](#arrancar-la-aplicación)
- [Simulador (sin hardware)](#simulador-sin-hardware)
- [API endpoints](#api-endpoints)
- [Formato de datos del ESP32](#formato-de-datos-del-esp32)
- [Despliegue en producción con Gunicorn](#despliegue-en-producción-con-gunicorn)
- [Base de datos](#base-de-datos)

---

## Estructura del repositorio

```
app_meteo/
├── new_version_meteo/          # Versión activa (v2)
│   ├── app.py                  # Servidor Flask
│   ├── database.py             # Conexión y creación de tablas SQLite
│   ├── requirements.txt        # Dependencias Python
│   ├── templates/
│   │   └── index.html          # Dashboard HTML
│   └── static/
│       ├── app.js              # Gráficos Chart.js + filtros + auto-refresco
│       └── style.css           # Estilos
├── simulator.py                # Simulador del ESP32 (desarrollo sin hardware)
├── .gitignore
└── README.md
```

> La carpeta raíz contiene la versión legacy (v1) conservada como referencia histórica.

---

## Tecnologías

| Capa | Tecnología |
|------|-----------|
| Backend | Python 3, Flask, SQLite3 |
| Servidor producción | Gunicorn |
| Frontend | Bootstrap 4, Chart.js, Moment.js, jQuery |
| Hardware | ESP32 + sensores (BME280, anemómetro) |
| Despliegue | Raspberry Pi (red local) |

---

## Datos que recoge la estación

| Campo | Unidad | Descripción |
|-------|--------|-------------|
| `temperature` | °C | Temperatura ambiente |
| `temperature_barometer` | °C | Temperatura del sensor barométrico |
| `humidity` | % | Humedad relativa |
| `pressure` | hPa | Presión atmosférica |
| `windSpeed` | m/s | Velocidad del viento (cruda) |
| `windDirection` | ° | Dirección del viento 0-360° (cruda) |
| `windSpeedFiltered` | m/s | Velocidad del viento (media móvil) |
| `windDirectionFiltered` | ° | Dirección del viento (media móvil) |

---

## Instalación

### Requisitos

- Python 3.9 o superior
- pip

### Pasos

```bash
# 1. Clonar el repositorio
git clone <url-del-repo>
cd app_meteo

# 2. (Opcional) Crear entorno virtual
python -m venv venv
source venv/bin/activate        # Linux / macOS
venv\Scripts\activate           # Windows

# 3. Instalar dependencias
pip install -r new_version_meteo/requirements.txt

# 4. (Solo para el simulador) Instalar requests
pip install requests
```

---

## Arrancar la aplicación

```bash
cd new_version_meteo
python app.py
```

La app arranca en `http://0.0.0.0:5000` y es accesible desde cualquier dispositivo de la red local.

Abre el navegador en:
- **Local:** `http://localhost:5000`
- **Red local (ej. Raspberry Pi):** `http://192.168.1.32:5000`

Al arrancar, la app crea automáticamente la base de datos `home_weather_station.db` si no existe.

---

## Simulador (sin hardware)

El simulador genera datos meteorológicos realistas y los envía al servidor Flask exactamente igual que haría el ESP32, sin necesitar el hardware.

Genera una variación suave de temperatura con ciclo diario, ráfagas de viento aleatorias con filtro de media móvil (ventana de 5 muestras), y variaciones realistas de humedad y presión.

### Uso básico

Abre **dos terminales**:

**Terminal 1 — App Flask:**
```bash
cd new_version_meteo
python app.py
```

**Terminal 2 — Simulador:**
```bash
python simulator.py
```

### Opciones del simulador

```
python simulator.py [--host HOST] [--port PORT] [--interval SEG] [--count N]
```

| Opción | Default | Descripción |
|--------|---------|-------------|
| `--host` | `127.0.0.1` | IP del servidor Flask |
| `--port` | `5000` | Puerto del servidor Flask |
| `--interval` | `5` | Segundos entre envíos |
| `--count` | `0` | Nº de muestras (0 = infinito) |

### Ejemplos

```bash
# Enviar datos cada 2 segundos (ver gráficos actualizarse rápido)
python simulator.py --interval 2

# Poblar 500 muestras históricas de golpe para probar filtros
python simulator.py --interval 0.05 --count 500

# Conectar a la Raspberry Pi en red local
python simulator.py --host 192.168.1.32 --interval 5

# Solo 50 muestras y parar
python simulator.py --count 50
```

### Salida del simulador

```
  Simulador MeteoStation
  Servidor : http://127.0.0.1:5000/send_message
  Intervalo: 5s
  Muestras : infinitas
  Ctrl+C para detener

  Estado      # |       Temp        Presion    Humedad            Viento
  -------------------------------------------------------------------------
  [OK ] #   1 | Temp: 20.13°C  Pres: 1013.20hPa  Hum: 60.0%  Viento:  3.00m/s 180.0°
  [OK ] #   2 | Temp: 19.87°C  Pres: 1013.05hPa  Hum: 58.7%  Viento:  2.80m/s 174.3°
```

---

## API endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/` | Dashboard principal (últimos 2 registros) |
| `GET` | `/descargar/<N>` | Dashboard con los últimos N registros |
| `GET` | `/average/<N>` | Dashboard con el promedio de los últimos N registros |
| `POST` | `/send_message` | Recibe datos del ESP32 en formato CSV |
| `POST` | `/api/filtrar` | Filtra registros por rango de fechas (JSON) |
| `GET` | `/api/latest` | Último registro en JSON (usado por el auto-refresco) |

### `POST /send_message`

Recibe el cuerpo de la petición como texto plano CSV con exactamente 8 valores:

```
20.5,1013.2,19.8,62.3,4.5,225.0,4.2,222.5
```

Respuesta `200 OK` si los datos son válidos, `400` si el formato es incorrecto.

### `POST /api/filtrar`

Body JSON:
```json
{
  "start_date": "2025-01-01 00:00:00",
  "end_date":   "2025-01-31 23:59:59"
}
```

Respuesta JSON con arrays de datos para cada variable.

### `GET /api/latest`

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

El ESP32 debe enviar una petición HTTP POST a `/send_message` con el cuerpo en texto plano:

```
temperatura,presion,temperatura_barometro,humedad,velocidad_viento,direccion_viento,velocidad_viento_filtrada,direccion_viento_filtrada
```

Ejemplo de código Arduino (ESP32):

```cpp
#include <WiFi.h>
#include <HTTPClient.h>

const char* serverUrl = "http://192.168.1.32:5000/send_message";

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

---

## Despliegue en producción con Gunicorn

Para dejar la app corriendo en segundo plano en la Raspberry Pi:

```bash
cd new_version_meteo

# Arrancar con gunicorn (4 workers)
gunicorn -w 4 -b 0.0.0.0:5000 app:app

# O en segundo plano con nohup
nohup gunicorn -w 2 -b 0.0.0.0:5000 app:app &
```

### Arranque automático con systemd

Crea el archivo `/etc/systemd/system/meteostation.service`:

```ini
[Unit]
Description=MeteoStation Dashboard
After=network.target

[Service]
User=pi
WorkingDirectory=/home/pi/app_meteo/new_version_meteo
ExecStart=gunicorn -w 2 -b 0.0.0.0:5000 app:app
Restart=always

[Install]
WantedBy=multi-user.target
```

Activa el servicio:

```bash
sudo systemctl daemon-reload
sudo systemctl enable meteostation
sudo systemctl start meteostation

# Ver estado
sudo systemctl status meteostation

# Ver logs
sudo journalctl -u meteostation -f
```

---

## Base de datos

La base de datos SQLite se crea automáticamente en `new_version_meteo/home_weather_station.db`.

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
sqlite3 new_version_meteo/home_weather_station.db

# Ver los últimos 5 registros
SELECT * FROM home_weather_station ORDER BY timestamp DESC LIMIT 5;

# Contar registros totales
SELECT COUNT(*) FROM home_weather_station;

# Promedio de temperatura de hoy
SELECT AVG(temperature) FROM home_weather_station
WHERE DATE(timestamp) = DATE('now');
```
