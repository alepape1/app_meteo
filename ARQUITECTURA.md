# Arquitectura y Estructura del Sistema Aquantia

## 1. Diagrama general de componentes

```mermaid
graph TD
  subgraph Dispositivos
    ESP32[ESP32 (METEO/IRRIGATION)]
  end
  subgraph Backend
    Flask[Flask API]
    MQTTClient[MQTT Client (paho-mqtt)]
    DB[(TimescaleDB/PostgreSQL)]
  end
  subgraph Infraestructura
    Mosquitto[Broker MQTT (Mosquitto)]
    Nginx[Nginx (Proxy/TLS)]
  end
  subgraph Usuario
    Browser[Navegador (React/Vite)]
  end

  ESP32 -- MQTT/TLS 8883 --> Mosquitto
  Mosquitto -- MQTT 1883 --> MQTTClient
  MQTTClient -- ORM --> DB
  Flask -- REST --> Browser
  Nginx -- Proxy /api/* --> Flask
  Browser -- HTTPS 443 --> Nginx
```

---

## 2. Flujo de datos y eventos principales

```mermaid
sequenceDiagram
    participant ESP32
    participant Mosquitto
    participant Backend
    participant DB
    participant Frontend

    ESP32->>Mosquitto: CONNECT (TLS 8883)
    ESP32->>Mosquitto: PUBLISH aquantia/<mac>/register
    Mosquitto->>Backend: register (MQTT subscribe)
    Backend->>DB: Guarda info dispositivo
    loop Cada 20s
        ESP32->>Mosquitto: PUBLISH aquantia/<mac>/telemetry
        Mosquitto->>Backend: telemetry (MQTT subscribe)
        Backend->>DB: Inserta telemetría
    end
    Frontend->>Backend: fetch /api/muestras
    Backend->>DB: Consulta lecturas
    Backend->>Frontend: Devuelve datos JSON
    Frontend->>Usuario: Renderiza gráficos
    Usuario->>Frontend: Activa relay
    Frontend->>Backend: POST /api/relay
    Backend->>Mosquitto: PUBLISH aquantia/<mac>/cmd
    Mosquitto->>ESP32: cmd (MQTT subscribe)
    ESP32->>Actúa: Cambia estado relay
```

---

## 3. Provisioning y vinculación de dispositivos

```mermaid
sequenceDiagram
    participant FlashTool as Flash Tool
    participant Backend
    participant ESP32
    participant Usuario
    participant Frontend

    FlashTool->>Backend: POST /api/devices/register_factory
    FlashTool->>ESP32: Escribe token y serial en NVS
    Usuario->>ESP32: Enciende dispositivo
    ESP32->>Mosquitto: CONNECT (con token)
    Usuario->>Frontend: Escanea QR / claim
    Frontend->>Backend: POST /api/devices/claim
    Backend->>DB: Vincula dispositivo a usuario
    Frontend->>Usuario: Dispositivo aparece en dashboard
```

---

## 4. Despliegue y desarrollo

- **Local:**
    - `docker compose up -d` levanta TimescaleDB, Mosquitto, Backend y Adminer.
    - Frontend: `npm run dev` (Vite en 5173, proxy a Flask 7000).
- **Producción:**
    - El frontend se compila localmente y se sube el `dist/` al repo.
    - En el servidor: `./deploy.sh` hace `git pull` y `docker compose up -d --build`.
    - Nginx sirve el frontend y hace proxy a Flask.

---

## 5. Resumen de tecnologías

| Capa           | Tecnología principal                        |
|----------------|--------------------------------------------|
| Backend API    | Python 3.12, Flask, flask-cors, JWT        |
| Base de datos  | TimescaleDB (PostgreSQL 16)                |
| Broker MQTT    | Mosquitto 2 + go-auth                      |
| Cliente MQTT   | paho-mqtt                                  |
| Frontend       | React 18, Vite, Tailwind, ApexCharts       |
| Contenedores   | Docker + Docker Compose                    |
| Proxy / TLS    | Nginx (HestiaCP) + Let's Encrypt           |
| Firmware       | ESP32 (C++/Arduino, perfiles METEO/IRRIG)  |

---

> Para detalles de endpoints, tablas y payloads, ver README principal.
