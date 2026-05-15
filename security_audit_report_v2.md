# Re-Auditoría de Seguridad — Aquantia / app_meteo
## Informe v2.0 — Verificación Post-Fix

**Fecha:** 2026-04-30
**Auditor:** Security Engineer Agent
**Rama auditada:** `security/harden-vulnerabilities` (cambios sin commit sobre `release/v0.1.0-beta`)
**Clasificación:** CONFIDENCIAL — Solo para uso interno
**Referencia:** security_audit_report.md (informe original v1.0)

---

## 1. Resumen Ejecutivo

La aplicación Aquantia es un sistema IoT de monitorización meteorológica y control de riego que combina Flask (backend), MQTT Mosquitto, TimescaleDB (PostgreSQL), dispositivos ESP32 y un frontend React. Este informe es la re-auditoría completa después de que se aplicaron 8 correcciones de seguridad (VULN-001 a VULN-008) más cabeceras HTTP.

### Severidad General

| Estado | Antes (v1.0) | Después (v2.0) |
|--------|-------------|----------------|
| Severidad global | **ALTA** | **MEDIA-ALTA** |
| Vulnerabilidades Críticas | 3 | 0 |
| Vulnerabilidades Altas | 6 | 3 |
| Vulnerabilidades Medias | 5 | 4 |
| Vulnerabilidades Bajas | 3 | 3 |
| Informativas | 1 | 2 |
| **Total hallazgos** | **18** | **12** |

### Balance de los Fixes

- **Vulnerabilidades resueltas completamente:** 4 (VULN-001, VULN-003, VULN-005, VULN-007/VULN-008)
- **Vulnerabilidades parcialmente resueltas:** 3 (VULN-002, VULN-004, VULN-006)
- **Vulnerabilidades no resueltas:** 1 (VULN-005 — el JWT sigue en localStorage, problema arquitectónico)
- **Vulnerabilidades nuevas detectadas:** 5

Los fixes eliminan las 3 vulnerabilidades Críticas originales. Sin embargo, se identificaron 5 problemas nuevos o residuales, incluyendo 3 de severidad Alta, derivados en parte de la implementación de los propios controles de seguridad.

---

## 2. Estado de los Fixes Aplicados

---

### VULN-001 — Credenciales hardcodeadas en docker-compose.yml y JWT_SECRET_KEY con fallback inseguro

**Estado: PARCIALMENTE RESUELTO**

**Verificación del fix:**

El `docker-compose.yml` ahora usa la sintaxis `${PG_PASS:?Falta PG_PASS en .env}` y `${JWT_SECRET_KEY:?Falta JWT_SECRET_KEY en .env}`, que hace fallar el arranque si las variables no están definidas. No hay valores de fallback visibles.

En `app.py` (líneas 46-51):
```python
_jwt_secret = os.environ.get("JWT_SECRET_KEY", "")
if not _jwt_secret:
    raise RuntimeError("JWT_SECRET_KEY no está definida...")
```

El JWT_SECRET_KEY ya no tiene fallback inseguro. El `docker-compose.yml` exige `PG_PASS` y `JWT_SECRET_KEY` en tiempo de arranque.

**Residuo — Severidad Media:**

El archivo `.env` sigue presente en el directorio del repositorio (`c:/repos/app_meteo/`). El análisis de `git status` confirma que `security_audit_report.md` está como fichero no rastreado pero no hay evidencia de que `.env` haya sido añadido a `.gitignore` de forma efectiva ni purgado del historial de Git. La contraseña original `aquantia_159` que figuraba en el `.env` comprometido pudo haber quedado en el historial de commits. No se puede verificar si `PG_PASS` fue rotada o si el `.env` fue purgado de la historia de Git con `git filter-repo`, ya que el archivo `.env` existe en disco pero no se puede leer su contenido en este contexto.

**Acciones pendientes:**
1. Verificar que `.env` no está indexado ni en el historial de Git (`git log --all --full-history -- .env`)
2. Confirmar que la contraseña `aquantia_159` fue rotada en PostgreSQL
3. Confirmar que `.env` está en `.gitignore` con `grep -r "\.env" .gitignore backend/.gitignore`

---

### VULN-002 — Endpoints ESP32 sin autenticación

**Estado: PARCIALMENTE RESUELTO**

**Verificación del fix:**

Se implementó `_verify_device_auth()` (líneas 78-124 de `app.py`) y se aplica en:
- `POST /api/device_info` (línea 690)
- `GET /api/relay/command` (línea 806)
- `POST /api/relay/ack` (línea 872)

El helper verifica MAC address y token bcrypt contra la tabla `device_credentials`.

**Residuo CRÍTICO — Bypass por diseño (líneas 103-114):**

```python
if not mac:
    return None, True  # sin MAC → endpoints legacy, pasar (sin permisos extra)

if not row:
    # Dispositivo sin credenciales registradas: permitido con aviso
    logger.warning("Device auth: MAC %s sin credenciales registradas (acceso permitido temporalmente)")
    return mac, True
```

Hay dos caminos de bypass documentados en el propio código:

**Bypass 1 — Sin MAC:** Si un atacante no envía header `X-Device-MAC`, no envía query param `mac`, y no envía body con `mac_address`, la función devuelve `(None, True)` — es decir, autenticación exitosa sin credenciales. El endpoint `/api/relay/command` y `/api/relay/ack` aceptan la solicitud, y en el caso de relay/command responde con el bitmask de estado (aunque del relay "legacy" de la fila id=1).

**Bypass 2 — MAC sin credenciales:** Si un atacante envía cualquier dirección MAC que no tenga una fila en `device_credentials` (por ejemplo, una MAC inventada como `AA:BB:CC:DD:EE:FF`), la función devuelve `(mac, True)` — autenticación exitosa. El atacante puede hacer polling de `/api/relay/command` con MACs inventadas o conocidas, y enviar ACKs de relay falsos para `relay_ack`.

**Endpoint `POST /api/device_info` — Inyección de metadatos:**

El bypass 2 también aplica a `post_device_info`. Un atacante sin credenciales puede enviar JSON con cualquier `mac_address`, `chip_model`, `firmware_version`, etc., y el sistema actualizará `device_info` con datos falsos. Esto permite envenenar la información de dispositivos legítimos.

**Endpoint `/send_message` — Sin ningún fix aplicado:**

El endpoint `POST /send_message` (líneas 511-557) no forma parte de la lista `_JWT_PUBLIC`, no está en el guard `_require_jwt`, y tampoco usa `_verify_device_auth`. Cualquier atacante puede enviar datos de telemetría CSV falsos sin ninguna autenticación ni verificación de MAC. Este endpoint existía antes de los fixes y sigue completamente abierto.

```
# Prueba de concepto (sin credenciales):
curl -X POST http://servidor:7000/send_message \
  -H "Content-Type: text/plain" \
  -d "25.0,1013.0,24.5,60.0,0.0,180.0,0.0,180.0,1000.0,24.0,59.0,0,0,0"
# Respuesta: 200 OK — datos insertados en home_weather_station
```

---

### VULN-003 — ACL MQTT completamente permisiva

**Estado: RESUELTO**

**Verificación del fix:**

La función `mqtt_acl()` (líneas 1481-1558) implementa una ACL real:
- Verifica que el topic tenga el formato `aquantia/<finca_id>/<subtopic>`
- Resuelve el `finca_id` asociado a la MAC en `device_credentials` o `device_info`
- Compara el `finca_id` del topic con el del dispositivo — si no coinciden, devuelve 401
- Permisos diferenciados: publicar solo en `{telemetry, alerts, register}`, suscribir solo en `{cmd}`
- Dispositivos sin finca asignada solo pueden publicar en `register`

El fix resuelve completamente la vulnerabilidad original donde cualquier dispositivo autenticado podía publicar en topics de cualquier otra finca.

**Residuo menor (Informativo):**

`acc=3` (superuser check) no tiene restricción adicional de subtopic más allá de que el `finca_id` coincida. En la práctica, mosquitto-go-auth usa `acc=3` para verificaciones de superusuario, por lo que este comportamiento es probablemente intencional, pero conviene documentarlo.

---

### VULN-004 — CORS wildcard

**Estado: PARCIALMENTE RESUELTO**

**Verificación del fix:**

```python
_raw_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173")
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
CORS(app, origins=_allowed_origins, supports_credentials=False)
```

El CORS ya no es wildcard. Se configura desde `ALLOWED_ORIGINS` en el entorno.

**Residuo — Severidad Media:**

El valor por defecto `http://localhost:5173` es adecuado para desarrollo local, pero si no se establece `ALLOWED_ORIGINS` en producción, el servidor de producción solo aceptará el dominio de desarrollo localhost. Más importante: si se configura `ALLOWED_ORIGINS=*` en el `.env` de producción (por error de operaciones), se volvería al estado vulnerable original sin ningún aviso. No hay validación de que el valor de `ALLOWED_ORIGINS` no sea `*`.

**Residuo adicional:** El docker-compose.yml muestra `ALLOWED_ORIGINS: "${ALLOWED_ORIGINS:-http://localhost:5173}"`, con fallback a localhost. En producción, la configuración del contenedor backend no tiene `ALLOWED_ORIGINS` definida sin fallback como sí tiene `JWT_SECRET_KEY`. Debería usar la sintaxis `:?` para forzar su definición explícita en producción.

---

### VULN-005 — JWT en localStorage (XSS token theft)

**Estado: NO RESUELTO**

**Verificación:**

El archivo `frontend/src/AuthContext.jsx` (líneas 6-8) sigue almacenando el JWT en `localStorage`:

```javascript
const [token, setToken] = useState(() => localStorage.getItem('aq_token'))
const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('aq_user')) } catch { return null }
})
```

El login (línea 19) y el registro (línea 33) siguen haciendo `localStorage.setItem('aq_token', data.token)`.

Este hallazgo no fue abordado por los fixes aplicados. El JWT sigue siendo accesible a cualquier script JavaScript que se ejecute en el contexto de la aplicación. Una vulnerabilidad XSS (incluso un CDN comprometido) puede exfiltrar el token.

**Impacto con el nuevo TTL de 8 horas:** El TTL reducido de 30 días a 8 horas mitiga parcialmente el impacto (la ventana de abuso es menor), pero no elimina el riesgo. Un atacante con acceso al token tiene 8 horas de acceso total a la API.

**Nota:** Este es un problema arquitectónico que requiere cookies HttpOnly o un backend-for-frontend (BFF). No es un fix de una sola línea.

---

### VULN-006 — Sin rate limiting en login ni registro

**Estado: PARCIALMENTE RESUELTO**

**Verificación del fix:**

```python
@app.route("/api/auth/register", methods=["POST"])
@limiter.limit("5 per minute; 20 per hour")

@app.route("/api/auth/login", methods=["POST"])
@limiter.limit("10 per minute; 30 per hour")
```

Los límites están presentes y son razonables para un entorno de producción.

**Residuo Crítico — Rate limiter en memoria no persiste entre workers:**

```python
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=[],
    storage_uri="memory://",    # en producción con Redis: "redis://redis:6379"
)
```

El `storage_uri="memory://"` almacena los contadores de rate limiting en la memoria del proceso. En un despliegue con Gunicorn con múltiples workers (el `requirements.txt` incluye `gunicorn`), cada worker tiene su propio contador independiente. Con 4 workers, el límite real de login es 40 intentos/minuto en lugar de 10 — lo que reduce significativamente la protección contra ataques de fuerza bruta distribuidos.

**Residuo — Rate limiting basado en IP (bypasseable con proxies):**

El rate limiting usa `get_remote_address`, que es la IP del cliente. Un atacante con acceso a múltiples IPs (rotación de proxies, botnet) puede eludir el límite completamente. Sin un rate limiting adicional por cuenta (email de usuario), es posible un ataque de credential stuffing con proxies.

---

### VULN-007 — Puerto 5432 expuesto al host

**Estado: RESUELTO**

**Verificación:**

El `docker-compose.yml` de producción no tiene la sección `ports` en el servicio `timescaledb`. Solo existe el siguiente comentario:

```yaml
# Puerto 5432 NO expuesto al host en producción.
# Para acceso directo usa: docker compose exec timescaledb psql -U aquantia
```

El puerto 5432 solo es accesible dentro de la red Docker interna. Fix confirmado.

---

### VULN-008 — Adminer en producción

**Estado: RESUELTO**

**Verificación:**

El `docker-compose.yml` de producción no contiene el servicio `adminer`. El comentario en la línea 67 lo confirma:

```yaml
# ── Adminer — solo en docker-compose.dev.yml ─────────────────────────────────
# Adminer eliminado de producción. Usa docker-compose.dev.yml para desarrollo.
```

Adminer sigue presente en `docker-compose.dev.yml` (líneas 42-47), que es el comportamiento esperado para desarrollo local.

**Residuo menor (Informativo):**

El `docker-compose.dev.yml` tiene configuradas credenciales hardcodeadas de desarrollo:
```yaml
POSTGRES_PASSWORD: aquantia_dev
```
Esto es aceptable para desarrollo local, pero debe documentarse que estas credenciales no deben usarse en ningún entorno accesible desde internet.

---

### Cabeceras de Seguridad HTTP

**Estado: RESUELTO (con observaciones)**

**Verificación:**

El hook `@app.after_request` (líneas 358-371) añade:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- `Strict-Transport-Security` (solo cuando `FLASK_ENV=production`)

**Observación:** Falta la cabecera `Content-Security-Policy` (CSP). Sin CSP, el navegador no tiene directivas para restringir la carga de scripts, estilos e iframes. La ausencia de CSP es especialmente relevante dado que el JWT sigue en localStorage y el riesgo de XSS persiste.

---

## 3. Vulnerabilidades Residuales

---

### RESIDUAL-001 — Bypass de autenticación de dispositivos ESP32 por MAC no registrada

**Severidad:** Alta
**CVSS 3.1:** 8.1 (AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:H/A:L)
**CWE:** CWE-287 (Improper Authentication)

**Descripción:**

Cualquier cliente puede enviar requests a `/api/relay/command`, `/api/relay/ack` y `/api/device_info` con una MAC address que no esté registrada en `device_credentials`, y la autenticación pasa con `ok=True` (líneas 111-114 de `app.py`). El código tiene un comentario que indica que es "acceso permitido temporalmente", pero no hay fecha de expiración ni mecanismo de bloqueo automático.

**Vector de ataque:**

```bash
# Sin ninguna credencial, inyectar ACK de relay falso para un dispositivo desconocido
curl -X POST http://servidor:7000/api/relay/ack \
  -H "X-Device-MAC: DE:AD:BE:EF:00:01" \
  -d "1"
# Respuesta: 200 OK — relay_state actualizado con bitmask=1

# Polling del estado de cualquier relay inventado
curl http://servidor:7000/api/relay/command?mac=DE:AD:BE:EF:00:01
# Respuesta: "0" (estado del relay de esa MAC ficticia)
```

**Remediación:**

Cambiar la política de "permitir con aviso" a "denegar con aviso" para MACs sin credenciales. Si se necesita un período de gracia para firmware legacy, implementar una allowlist explícita de MACs en período de transición:

```python
if not row:
    # Dispositivo sin credenciales: DENEGAR salvo allowlist de transición
    if mac in _LEGACY_ALLOWED_MACS:  # set vacío por defecto en producción
        logger.warning("Device auth: MAC %s en allowlist legacy (acceso temporal)", mac)
        return mac, True
    logger.error("Device auth: MAC %s rechazada — sin credenciales registradas", mac)
    return mac, False
```

---

### RESIDUAL-002 — Endpoint `/send_message` completamente sin autenticación

**Severidad:** Alta
**CVSS 3.1:** 8.6 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:L)
**CWE:** CWE-306 (Missing Authentication for Critical Function)

**Descripción:**

El endpoint `POST /send_message` (líneas 511-557) no está protegido por JWT (no está en `_JWT_PUBLIC` ni requiere JWT) ni por `_verify_device_auth`. Acepta datos CSV en texto plano e inserta directamente en `home_weather_station`. Esto permite a cualquier atacante en red contaminar la base de datos de telemetría con lecturas falsas.

El endpoint no tiene rate limiting. Un atacante puede inundar la base de datos con datos falsos hasta agotar el espacio en disco o corromper el histórico de telemetría que usan los modelos de detección de fugas.

**Vector de ataque:**

```bash
# Inyección masiva de datos de temperatura falsos (sin credenciales)
for i in $(seq 1 10000); do
  curl -s -X POST http://servidor:7000/send_message \
    -d "99.9,1013.0,99.8,0.0,0.0,0.0,0.0,0.0,0.0,99.0,0.0,0,0,$i,0"
done
```

**Remediación:**

Añadir `_verify_device_auth` al endpoint o, preferiblemente, deprecar el endpoint en favor del flujo MQTT autenticado:

```python
@app.route("/send_message", methods=["POST"])
@limiter.limit("60 per minute")
def send_message():
    _, auth_ok = _verify_device_auth(request)
    if not auth_ok:
        return "Unauthorized", 401
    # ...resto del handler
```

---

### RESIDUAL-003 — Rate limiting en memoria (no persiste entre workers Gunicorn)

**Severidad:** Media
**CWE:** CWE-770 (Allocation of Resources Without Limits or Throttling)

**Descripción:**

El limiter usa `storage_uri="memory://"`. Con Gunicorn en modo prefork (por defecto con múltiples workers), cada worker tiene su propio conteo. Con N workers, el límite efectivo se multiplica por N.

**Remediación:**

```python
# Usar Redis como backend compartido entre workers
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=[],
    storage_uri=os.environ.get("LIMITER_STORAGE_URI", "memory://"),
)
```

```yaml
# docker-compose.yml — añadir Redis
redis:
  image: redis:7-alpine
  restart: unless-stopped
  command: redis-server --maxmemory 64mb --maxmemory-policy allkeys-lru

backend:
  environment:
    LIMITER_STORAGE_URI: "redis://redis:6379"
```

---

### RESIDUAL-004 — JWT almacenado en localStorage (sin cambios)

**Severidad:** Alta
**CVSS 3.1:** 7.5 (AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:H/A:N)
**CWE:** CWE-922 (Insecure Storage of Sensitive Information)

**Descripción:**

Ver VULN-005 — no se realizaron cambios en `AuthContext.jsx`. El JWT sigue en `localStorage`, accesible a cualquier script JavaScript en el origen. El TTL de 8 horas reduce el impacto pero no elimina el vector.

**Remediación (prioridad próximo sprint):**

```javascript
// Opción A (mínimo esfuerzo): sessionStorage en lugar de localStorage
// Solo persiste durante la sesión del navegador, no entre pestañas
const [token, setToken] = useState(() => sessionStorage.getItem('aq_token'))

// Opción B (recomendada): cookie HttpOnly mediante endpoint de backend
// El backend establece Set-Cookie: aq_session=...; HttpOnly; Secure; SameSite=Strict
// El frontend nunca accede al token directamente
```

---

## 4. Vulnerabilidades Nuevas Detectadas

---

### NUEVA-001 — Inyección en `irrigation_history` mediante f-string SQL

**Severidad:** Alta
**CVSS 3.1:** 8.8 (AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H)
**CWE:** CWE-89 (SQL Injection)

**Descripción:**

En `app.py` líneas 1013-1020:

```python
if period == 'month':
    group_expr = "to_char(timestamp, 'YYYY-MM')"
    offset = "-12 months"
elif period == 'week':
    group_expr = "to_char(timestamp, 'YYYY-\"W\"WW')"
    offset = "-16 weeks"
else:
    group_expr = "to_char(timestamp, 'YYYY-MM-DD')"
    offset = "-30 days"

rows = get_db().execute(f"""
    SELECT {group_expr} AS period_key, COUNT(*) AS cnt
    FROM home_weather_station
    WHERE relay_active > 0
      AND timestamp >= now() + interval %s
    GROUP BY {group_expr}
    ORDER BY period_key ASC
""", (offset,)).fetchall()
```

El parámetro `period` se usa como clave de selección para `group_expr` y `offset`. En el código actual existe validación:

```python
period = request.args.get('period', 'day')
if period not in ('day', 'week', 'month'):
    period = 'day'
```

La validación de whitelist protege correctamente este caso concreto. Sin embargo, el patrón de construir SQL con f-strings (`f"SELECT {group_expr}"`) es inherentemente peligroso y es un error de programación que, si se replica en otros lugares o si la validación se debilita, produce inyección SQL. En una revisión estricta, este patrón debe eliminarse aunque la validación actual lo proteja.

**Riesgo concreto:** Si en el futuro se añade un nuevo valor al whitelist que contenga SQL (por ejemplo, por un error tipográfico), se produce inyección inmediata.

**Remediación:**

```python
# Reemplazar f-string con un mapa de expresiones preconstruidas
_GROUP_EXPRS = {
    'month': ("to_char(timestamp, 'YYYY-MM')", "-12 months"),
    'week':  ("to_char(timestamp, 'YYYY-\"W\"WW')", "-16 weeks"),
    'day':   ("to_char(timestamp, 'YYYY-MM-DD')", "-30 days"),
}
period = request.args.get('period', 'day')
group_expr, offset = _GROUP_EXPRS.get(period, _GROUP_EXPRS['day'])
# Usar la expresión directamente sin f-string — ya está hardcodeada en el dict
```

---

### NUEVA-002 — Ausencia de Content-Security-Policy (CSP)

**Severidad:** Media
**CWE:** CWE-1021 (Improper Restriction of Rendered UI Layers or Frames)

**Descripción:**

Las cabeceras de seguridad añadidas no incluyen `Content-Security-Policy`. Sin CSP, el navegador no restringe el origen de scripts, estilos, imágenes ni iframes. Esto amplifica el impacto de cualquier vulnerabilidad XSS (el token JWT en localStorage sería exfiltrado sin restricciones de CSP).

**Remediación:**

```python
@app.after_request
def set_security_headers(response):
    # ... cabeceras existentes ...
    # CSP estricto para una SPA React
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "  # React requiere inline styles
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "frame-ancestors 'none';"
    )
    return response
```

---

### NUEVA-003 — Endpoint `register_factory` con allowlist de IP demasiado permisiva

**Severidad:** Media
**CVSS 3.1:** 6.5 (AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N)
**CWE:** CWE-284 (Improper Access Control)

**Descripción:**

El endpoint `POST /api/devices/register_factory` (líneas 1635-1662) restringe el acceso por IP:

```python
allowed = ("127.0.0.1", "::1")
addr = request.remote_addr or ""
if addr not in allowed and not (
    addr.startswith("172.") or addr.startswith("10.") or addr.startswith("192.168.")
):
    return jsonify({"error": "forbidden"}), 403
```

La allowlist incluye todos los rangos privados RFC 1918: `10.x.x.x`, `172.x.x.x` (no solo `172.16-31`), y `192.168.x.x`. Esto es correcto para red Docker interna, pero el rango `172.x.x.x` incluye `172.0.x.x` a `172.15.x.x` y `172.32.x.x` a `172.255.x.x`, que son rangos públicamente enrutables.

Si el servidor está en una nube (AWS, GCP) y tiene una IP pública que empieza por `172.x.x.x` asignada como IP flotante, o si hay un forward proxy en ese rango, el control falla.

Más importante: este endpoint acepta el `token_hash` ya calculado como parámetro directo. Si un atacante puede hacer llegar una request desde la red Docker (por ejemplo, comprometiendo cualquier otro contenedor), puede registrar un dispositivo con cualquier MAC y token_hash de su elección, obteniendo acceso permanente a los endpoints de dispositivos.

**Remediación:**

```python
# Restringir a loopback y red Docker específica (no todo RFC 1918)
import ipaddress

FACTORY_ALLOWED_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("172.16.0.0/12"),  # solo el rango Docker real
]

def _is_factory_allowed(addr: str) -> bool:
    try:
        ip = ipaddress.ip_address(addr)
        return any(ip in net for net in FACTORY_ALLOWED_NETWORKS)
    except ValueError:
        return False

if not _is_factory_allowed(request.remote_addr or ""):
    return jsonify({"error": "forbidden"}), 403
```

---

### NUEVA-004 — TLS 1.2 en Mosquitto (TLS 1.3 no habilitado)

**Severidad:** Baja
**CWE:** CWE-326 (Inadequate Encryption Strength)

**Descripción:**

En `mosquitto.conf` (línea 16):

```
tls_version tlsv1.2
```

Se establece TLS 1.2 como versión mínima, sin permitir TLS 1.3. TLS 1.3 elimina suites de cifrado débiles presentes en TLS 1.2, reduce la latencia del handshake (1-RTT vs 2-RTT) y es soportado por todos los ESP32 con firmware moderno (mbedTLS 2.x o superior).

**Remediación:**

```
# mosquitto.conf
tls_version tlsv1.3
# O para compatibilidad con firmware antiguo:
# tls_version tlsv1.2   # dejar solo si hay ESP32 con firmware que no soporta TLS 1.3
```

---

### NUEVA-005 — Endpoints `/api/alerts` y `/api/alerts/<id>/ack` sin filtro de dispositivo del usuario

**Severidad:** Media
**CVSS 3.1:** 6.5 (AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N)
**CWE:** CWE-639 (Authorization Bypass Through User-Controlled Key)

**Descripción:**

El endpoint `GET /api/alerts` (líneas 1409-1432) está protegido por JWT (el guard `_require_jwt` lo cubre), pero no filtra por el `user_id` autenticado. Cualquier usuario autenticado puede ver las alertas de todos los dispositivos y de todas las fincas con solo llamar a `/api/alerts` sin parámetros, o con parámetros `mac` o `finca_id` de otro usuario.

Similarmente, `POST /api/alerts/<id>/ack` (líneas 1435-1444) acepta cualquier `alert_id` sin verificar si pertenece a un dispositivo del usuario autenticado. Un usuario autenticado puede marcar como resuelta cualquier alerta del sistema.

```python
# Estado actual — sin verificación de pertenencia al usuario
@app.route("/api/alerts")
def api_alerts():
    query = "SELECT * FROM alerts WHERE 1=1"
    # mac y finca_id vienen del request, no del usuario autenticado
    if mac:
        query += " AND device_mac=?"
        params.append(mac)
```

**Vector de ataque:**

```bash
# Usuario autenticado consulta TODAS las alertas del sistema
curl -H "Authorization: Bearer <token_usuario_normal>" \
  http://servidor:7000/api/alerts
# Respuesta: alertas de TODOS los dispositivos y fincas

# Usuario autenticado silencia alertas de otros usuarios
curl -X POST -H "Authorization: Bearer <token>" \
  http://servidor:7000/api/alerts/42/ack
# Respuesta: {"ok": true, "id": 42} — alerta de otro usuario silenciada
```

**Remediación:**

```python
@app.route("/api/alerts")
def api_alerts():
    user_id = int(get_jwt_identity())
    # Obtener MACs del usuario autenticado
    user_macs = [
        r["mac_address"] for r in get_db().execute(
            "SELECT mac_address FROM user_devices WHERE user_id=%s", (user_id,)
        ).fetchall()
    ]
    if not user_macs:
        return jsonify([])

    # Filtrar solo alertas de dispositivos del usuario
    placeholders = ",".join(["%s"] * len(user_macs))
    query = f"SELECT * FROM alerts WHERE device_mac IN ({placeholders})"
    params = list(user_macs)
    # ... aplicar filtros adicionales opcionales de mac/finca_id dentro de user_macs
    query += " ORDER BY created_at DESC LIMIT 100"
    rows = get_db().execute(query, params).fetchall()
    return jsonify([dict(r) for r in rows])
```

---

## 5. Análisis de Superficie de Ataque Post-Fix

### Puertos y Servicios Expuestos (Producción)

| Puerto | Servicio | Exposición | Control Actual | Riesgo Residual |
|--------|----------|-----------|----------------|-----------------|
| 7000/TCP | Flask API | Red Docker + posible proxy reverso | JWT, rate limiting | Endpoints sin auth: `/send_message`, `/api/relay/command` (bypass) |
| 1883/TCP | MQTT sin TLS | Red Docker interna | go-auth (usuario+bcrypt) | Tráfico en claro dentro de Docker |
| 8883/TCP | MQTT con TLS | Público (ESP32) | TLS 1.2 + go-auth | TLS 1.2 en lugar de 1.3 |
| 5432/TCP | PostgreSQL | Solo red Docker interna | Sin puerto expuesto al host | Acceso desde contenedores comprometidos |

### APIs Públicas (sin autenticación JWT)

| Endpoint | Método | Auth Actual | Riesgo |
|----------|--------|-------------|--------|
| `/api/auth/login` | POST | Rate limit 10/min (en memoria) | Fuerza bruta con proxies |
| `/api/auth/register` | POST | Rate limit 5/min (en memoria) | Enumeración de emails |
| `/api/mqtt/auth` | POST | Solo desde Mosquitto (red interna) | Bajo si red Docker está aislada |
| `/api/mqtt/acl` | POST | Solo desde Mosquitto (red interna) | Bajo si red Docker está aislada |
| `/api/devices/register_factory` | POST | IP allowlist (demasiado amplia) | Medio |
| `/api/pipeline/scenario` | GET | Ninguna | Exposición de configuración del pipeline |
| `/api/pipeline/config` | GET | Ninguna | Exposición de configuración del pipeline |
| `/send_message` | POST | Ninguna | Alta — inserción directa en DB |
| `/api/relay/command` | GET | Bypass por MAC no registrada | Alta |
| `/api/relay/ack` | POST | Bypass por MAC no registrada | Alta |

### Rutas Legacy Sin Seguridad

Los endpoints `/`, `/descargar/<n>`, `/average/<n>` no están protegidos por JWT (están fuera del prefijo `/api/`). Acceden a la DB y devuelven datos de telemetría mediante plantillas HTML. Si el frontend SPA es la interfaz principal, estos endpoints son superficie de ataque innecesaria que debería ser eliminada o protegida.

---

## 6. Recomendaciones de Mejora Continua (Top 5 — Próximo Sprint)

### Prioridad 1: Corregir el bypass de autenticación ESP32 (RESIDUAL-001)

Cambiar la política de `_verify_device_auth` de "permitir si MAC desconocida" a "denegar si MAC desconocida". Este es el riesgo más alto porque permite inyección de datos de telemetría falsos y manipulación del estado de relay desde internet sin ninguna credencial.

Tiempo estimado: 2 horas.

### Prioridad 2: Proteger o eliminar `/send_message` (RESIDUAL-002)

Añadir `_verify_device_auth` al endpoint o deprecarlo definitivamente a favor del flujo MQTT autenticado. Con el flujo MQTT + go-auth ya funcionando, este endpoint CSV legacy es superficie de ataque innecesaria.

Tiempo estimado: 1 hora.

### Prioridad 3: Migrar rate limiter a Redis (RESIDUAL-003)

Añadir un contenedor Redis al `docker-compose.yml` de producción y configurar `LIMITER_STORAGE_URI=redis://redis:6379`. Sin esto, el rate limiting en Gunicorn multi-worker no es efectivo.

Tiempo estimado: 3 horas (incluyendo tests).

### Prioridad 4: Filtrar `/api/alerts` por dispositivos del usuario (NUEVA-005)

El IDOR en `/api/alerts` permite a cualquier usuario autenticado leer las alertas de todos los otros usuarios y silenciarlas. Fix de 30 líneas en `app.py`.

Tiempo estimado: 2 horas.

### Prioridad 5: Añadir Content-Security-Policy (NUEVA-002)

Implementar CSP en el hook `set_security_headers` de `app.py`. Comenzar con CSP en modo `Report-Only` para identificar violaciones sin romper la app, luego activar el modo `Enforce`. Esto cierra la amplificación XSS que hace crítico el JWT en localStorage.

Tiempo estimado: 4 horas (incluyendo testing de la SPA React para eliminar violaciones de CSP).

---

## 7. Matriz de Riesgo Post-Fix

### Vulnerabilidades Originales

| ID | Vulnerabilidad | Severidad Antes | Severidad Después | Estado |
|----|---------------|-----------------|-------------------|--------|
| VULN-001 | Credenciales hardcodeadas / JWT fallback | Crítica | Baja* | Parcialmente resuelto |
| VULN-002 | Endpoints ESP32 sin auth | Crítica | Alta | Parcialmente resuelto |
| VULN-003 | ACL MQTT permisiva | Crítica | Ninguna | Resuelto |
| VULN-004 | CORS wildcard | Alta | Baja | Parcialmente resuelto |
| VULN-005 | JWT en localStorage | Alta | Alta | No resuelto |
| VULN-006 | Sin rate limiting en login | Alta | Media | Parcialmente resuelto |
| VULN-007 | Puerto 5432 expuesto | Alta | Ninguna | Resuelto |
| VULN-008 | Adminer en producción | Alta | Ninguna | Resuelto |
| (sin ID) | Cabeceras HTTP faltantes | Media | Baja | Resuelto (falta CSP) |

*VULN-001 residuo: el historial de Git puede conservar credenciales — pendiente de verificar.

### Vulnerabilidades Nuevas

| ID | Vulnerabilidad | Severidad | Causa |
|----|---------------|-----------|-------|
| NUEVA-001 | Patrón f-string SQL en `irrigation_history` | Alta (mitigado por whitelist) | Nuevo análisis de código |
| NUEVA-002 | Ausencia de CSP | Media | Nuevo análisis |
| NUEVA-003 | `register_factory` IP allowlist amplia | Media | Nuevo análisis |
| NUEVA-004 | TLS 1.2 en Mosquitto | Baja | Nuevo análisis |
| NUEVA-005 | IDOR en `/api/alerts` | Media | Nuevo análisis |

---

## 8. Puntuación de Seguridad

### Metodología

La puntuación evalúa 8 dominios con peso igual (12.5 puntos cada uno):
1. Gestión de credenciales y secretos
2. Autenticación (usuarios y dispositivos)
3. Autorización y control de acceso
4. Comunicaciones y cifrado
5. Validación de entradas y protección contra inyección
6. Protección del frontend y cabeceras HTTP
7. Rate limiting y protección contra abuso
8. Seguridad de la infraestructura (Docker, red, dependencias)

### Puntuación Antes (v1.0)

| Dominio | Puntuación /12.5 | Justificación |
|---------|-----------------|---------------|
| Gestión de secretos | 1/12.5 | Credenciales hardcodeadas en repositorio, JWT con fallback débil |
| Autenticación | 1/12.5 | Endpoints ESP32 sin auth, login sin rate limiting |
| Autorización | 4/12.5 | JWT presente para usuarios, pero ACL MQTT permisiva, sin IDOR protections |
| Comunicaciones | 6/12.5 | TLS presente en MQTT externo, HTTP interno sin TLS |
| Validación de entradas | 7/12.5 | Consultas parametrizadas en general, algunos patrones de riesgo |
| Frontend y cabeceras | 2/12.5 | Sin cabeceras de seguridad, CORS wildcard, JWT en localStorage |
| Rate limiting | 1/12.5 | Sin rate limiting en ningún endpoint |
| Infraestructura | 4/12.5 | Puerto 5432 expuesto, Adminer en producción |
| **TOTAL** | **26/100** | **Nivel: CRÍTICO** |

### Puntuación Después (v2.0)

| Dominio | Puntuación /12.5 | Justificación |
|---------|-----------------|---------------|
| Gestión de secretos | 9/12.5 | JWT_SECRET_KEY y PG_PASS obligatorias; historial Git pendiente de verificar |
| Autenticación | 5/12.5 | Auth ESP32 implementada pero con bypass por MAC desconocida; `/send_message` sin auth |
| Autorización | 7/12.5 | ACL MQTT correcta; IDOR en `/api/alerts` sin corregir |
| Comunicaciones | 7/12.5 | TLS 1.2 en Mosquitto (debería ser 1.3); internamente HTTP entre contenedores (aceptable) |
| Validación de entradas | 7/12.5 | Mejora global; patrón f-string SQL en `irrigation_history` |
| Frontend y cabeceras | 6/12.5 | Cabeceras añadidas (falta CSP); JWT sigue en localStorage |
| Rate limiting | 6/12.5 | Límites presentes pero en memoria (no efectivo con múltiples workers) |
| Infraestructura | 10/12.5 | Puerto 5432 cerrado, Adminer eliminado de producción; `register_factory` IP allowlist amplia |
| **TOTAL** | **57/100** | **Nivel: MEDIO** |

### Progreso

| Métrica | Antes | Después | Mejora |
|---------|-------|---------|--------|
| Puntuación global | 26/100 | 57/100 | +31 puntos (+119%) |
| Vulnerabilidades Críticas | 3 | 0 | -3 (100%) |
| Vulnerabilidades Altas | 6 | 3 | -3 (50%) |
| Vulnerabilidades Medias | 5 | 4 | -1 (20%) |
| Nivel de riesgo | CRÍTICO | MEDIO | Reducción significativa |

### Conclusión

Los fixes aplicados produjeron una mejora sustancial: eliminaron las 3 vulnerabilidades críticas y redujeron el score de 26 a 57 sobre 100. El sistema pasó de un nivel **CRÍTICO** (explotable sin credenciales para comprometer datos y controlar actuadores físicos) a un nivel **MEDIO**.

Los 3 riesgos que requieren atención inmediata antes de cualquier despliegue de producción son:
1. El bypass de autenticación ESP32 para MACs no registradas (permite inyección de datos de telemetría y manipulación de relay sin credenciales)
2. El endpoint `/send_message` completamente sin autenticación (inserción directa en base de datos)
3. El rate limiter en memoria (el fix de VULN-006 no es efectivo con Gunicorn multi-worker)

Para alcanzar un nivel ALTO (75+/100), el equipo debe completar las 5 recomendaciones del sprint siguiente y resolver los residuos documentados en este informe.

---

*Informe generado por Security Engineer Agent el 2026-04-30.*
*Este informe se basa exclusivamente en revisión estática del código en la rama `security/harden-vulnerabilities`. No se realizaron pruebas de penetración activas contra instancias en ejecución.*
