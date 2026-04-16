"""
database.py — Capa de acceso a datos para Aquantia Backend
Usa PostgreSQL + extensión TimescaleDB para datos de series temporales.

Variables de entorno requeridas (o valores por defecto de desarrollo):
    PG_HOST      localhost
    PG_PORT      5432
    PG_DB        aquantia
    PG_USER      aquantia
    PG_PASS      aquantia

TimescaleDB convierte home_weather_station en una hypertable particionada
por tiempo, lo que acelera enormemente las consultas de rango y reduce el
tamaño en disco con compresión automática.
"""

import os
import re
import psycopg2
import psycopg2.extras
import psycopg2.pool
import logging

logger = logging.getLogger(__name__)

# ── Configuración de conexión ─────────────────────────────────────────────────

PG_HOST = os.environ.get("PG_HOST", "localhost")
PG_PORT = int(os.environ.get("PG_PORT", 5432))
PG_DB   = os.environ.get("PG_DB",   "aquantia")
PG_USER = os.environ.get("PG_USER", "aquantia")
PG_PASS = os.environ.get("PG_PASS", "aquantia")

_pool: psycopg2.pool.ThreadedConnectionPool = None


def init_pool():
    """Inicializa el pool de conexiones. Llamar una vez al arrancar la app."""
    global _pool
    _pool = psycopg2.pool.ThreadedConnectionPool(
        minconn=2, maxconn=20,
        host=PG_HOST, port=PG_PORT,
        dbname=PG_DB, user=PG_USER, password=PG_PASS
    )
    logger.info("Pool PostgreSQL inicializado (%s:%s/%s)", PG_HOST, PG_PORT, PG_DB)


# ── Capa de compatibilidad sqlite3 → psycopg2 ─────────────────────────────────
# Permite mantener el código de app.py casi sin cambios:
#   - db.execute(sql, params) y db.cursor() funcionan igual que con sqlite3
#   - Filas accesibles por nombre (row['col']) y por índice (row[0])
#   - Placeholder ? convertido automáticamente a %s

_SQL_FIXES = [
    # Placeholder SQLite → PostgreSQL
    (re.compile(r'\?'), '%s'),
]

_INSERT_OR_IGNORE = re.compile(
    r'\bINSERT\s+OR\s+IGNORE\s+INTO\b', re.IGNORECASE
)

_SQL_PARAM = r'(?:%s|\?)'

# Patrones de INSERT OR REPLACE necesitan tratamiento especial por tabla.
# Deben aceptar tanto placeholders SQLite (?) como PostgreSQL (%s).
_UPSERT_PATTERNS = {
    'app_settings': (
        re.compile(
            rf"INSERT\s+OR\s+REPLACE\s+INTO\s+app_settings\s*\(key,\s*value\)\s*VALUES\s*\({_SQL_PARAM},\s*{_SQL_PARAM}\)",
            re.IGNORECASE,
        ),
        "INSERT INTO app_settings(key, value) VALUES (%s, %s)"
        " ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"
    ),
    'device_credentials': (
        re.compile(
            rf"INSERT\s+OR\s+REPLACE\s+INTO\s+device_credentials"
            rf"\s*\(mac,\s*token_hash,\s*serial_number\)\s*VALUES\s*\({_SQL_PARAM},\s*{_SQL_PARAM},\s*{_SQL_PARAM}\)",
            re.IGNORECASE,
        ),
        "INSERT INTO device_credentials(mac, token_hash, serial_number) VALUES (%s, %s, %s)"
        " ON CONFLICT (mac) DO UPDATE SET token_hash = EXCLUDED.token_hash,"
        " serial_number = EXCLUDED.serial_number"
    ),
}


def _translate_sql(sql: str) -> str:
    """Convierte SQL estilo SQLite a PostgreSQL."""
    # Primero los upserts específicos (antes de tocar los placeholders)
    for _, (pat, repl) in _UPSERT_PATTERNS.items():
        if pat.search(sql):
            sql = pat.sub(repl, sql)
            # Aplicar ? -> %s y devolver
            for pattern, replacement in _SQL_FIXES:
                sql = pattern.sub(replacement, sql)
            return sql

    # INSERT OR IGNORE -> INSERT ... ON CONFLICT DO NOTHING
    if _INSERT_OR_IGNORE.search(sql):
        sql = _INSERT_OR_IGNORE.sub('INSERT INTO', sql)
        for pattern, replacement in _SQL_FIXES:
            sql = pattern.sub(replacement, sql)
        return sql.rstrip('; \n') + ' ON CONFLICT DO NOTHING'

    # INSERT OR REPLACE residual (sin patrón definido) -> INSERT INTO
    sql = re.sub(
        r'\bINSERT\s+OR\s+REPLACE\s+INTO\b', 'INSERT INTO',
        sql, flags=re.IGNORECASE
    )

    # Placeholder ? -> %s
    for pattern, replacement in _SQL_FIXES:
        sql = pattern.sub(replacement, sql)
    return sql


class _CompatRow:
    """Fila compatible con sqlite3.Row: acceso por nombre y por índice."""
    __slots__ = ("_d", "_vals")

    def __init__(self, d: dict):
        self._d    = d
        self._vals = list(d.values()) if d else []

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._vals[key]
        if key in self._d:
            return self._d[key]
        # PostgreSQL devuelve nombres en minúsculas; buscar sin distinción de mayúsculas
        lower = key.lower()
        for k in self._d:
            if k.lower() == lower:
                return self._d[k]
        return self._d[key]  # lanza KeyError con el nombre original

    def __contains__(self, key):
        if key in self._d:
            return True
        lower = key.lower()
        return any(k.lower() == lower for k in self._d)

    def get(self, key, default=None):
        if key in self._d:
            return self._d[key]
        lower = key.lower()
        for k in self._d:
            if k.lower() == lower:
                return self._d[k]
        return default

    def keys(self):
        return self._d.keys()

    def __bool__(self):
        return bool(self._d)

    def __repr__(self):
        return f"_CompatRow({self._d!r})"


class _CompatCursor:
    """Cursor compatible con sqlite3: ejecuta SQL traducido, devuelve _CompatRow."""

    def __init__(self, conn):
        self._cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    def execute(self, sql, params=None):
        self._cur.execute(_translate_sql(sql), params or ())
        return self

    def fetchall(self):
        rows = self._cur.fetchall()
        return [_CompatRow(dict(r)) for r in rows] if rows else []

    def fetchone(self):
        row = self._cur.fetchone()
        return _CompatRow(dict(row)) if row else None

    def close(self):
        self._cur.close()

    def __iter__(self):
        for row in self._cur:
            yield _CompatRow(dict(row))

    @property
    def rowcount(self):
        return self._cur.rowcount


class _CompatConn:
    """Conexión compatible con sqlite3: envuelve una conexión psycopg2 del pool."""

    def __init__(self, raw_conn):
        self._conn = raw_conn

    def execute(self, sql, params=None):
        """Atajo como sqlite3 connection.execute() — crea cursor, ejecuta y lo devuelve."""
        cur = _CompatCursor(self._conn)
        cur.execute(sql, params)
        return cur

    def cursor(self):
        return _CompatCursor(self._conn)

    def commit(self):
        self._conn.commit()

    def close(self):
        """Devuelve la conexión al pool en lugar de cerrarla."""
        if _pool and self._conn:
            _pool.putconn(self._conn)


# ── API pública ───────────────────────────────────────────────────────────────

def get_db_connection() -> _CompatConn:
    """Obtiene una conexión del pool. Debe devolverse llamando a conn.close()."""
    raw = _pool.getconn()
    raw.autocommit = False
    return _CompatConn(raw)


# ── Schema ────────────────────────────────────────────────────────────────────

def create_tables(conn: _CompatConn):
    """Crea todas las tablas si no existen y activa la hypertable de TimescaleDB."""
    raw = conn._conn
    cur = raw.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS home_weather_station (
        id                     BIGSERIAL       NOT NULL,
        temperature            REAL,
        temperature_barometer  REAL,
        humidity               REAL,
        pressure               REAL,
        windSpeed              REAL,
        windDirection          REAL,
        windSpeedFiltered      REAL,
        windDirectionFiltered  REAL,
        light                  REAL    DEFAULT 0,
        dht_temperature        REAL,
        dht_humidity           REAL,
        rssi                   INTEGER,
        free_heap              INTEGER,
        uptime_s               INTEGER,
        relay_active           INTEGER DEFAULT 0,
        pipeline_pressure      REAL    DEFAULT NULL,
        pipeline_flow          REAL    DEFAULT NULL,
        soil_moisture          REAL    DEFAULT NULL,
        device_mac             TEXT    DEFAULT NULL,
        timestamp              TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, timestamp)
    );
    """)

    # Índices estándar (TimescaleDB añade los suyos propios sobre timestamp)
    cur.execute("""
    CREATE INDEX IF NOT EXISTS idx_timestamp
        ON home_weather_station(timestamp DESC);
    """)
    cur.execute("""
    CREATE INDEX IF NOT EXISTS idx_device_mac
        ON home_weather_station(device_mac);
    """)

    # Commit antes de intentar hypertable: si falla, las tablas ya existen
    raw.commit()

    # ── TimescaleDB hypertable ────────────────────────────────────────────────
    # Particionado automático por tiempo (chunks de 7 días).
    # Si TimescaleDB no está instalado, continúa como tabla PostgreSQL normal.
    try:
        cur.execute("""
        SELECT create_hypertable(
            'home_weather_station', 'timestamp',
            if_not_exists => TRUE,
            migrate_data   => TRUE
        );
        """)
        raw.commit()
        logger.info("TimescaleDB hypertable activa en home_weather_station")
    except Exception as e:
        logger.warning("TimescaleDB no disponible — usando tabla PostgreSQL normal: %s", e)
        raw.rollback()
        cur = raw.cursor()

    # ── Resto de tablas ───────────────────────────────────────────────────────

    cur.execute("""
    CREATE TABLE IF NOT EXISTS device_info (
        id             SERIAL PRIMARY KEY,
        finca_id       TEXT,
        chip_model     TEXT,
        chip_revision  INTEGER,
        cpu_freq_mhz   INTEGER,
        flash_size_mb  INTEGER,
        sdk_version    TEXT,
        mac_address    TEXT UNIQUE,
        ip_address     TEXT,
        relay_count       INTEGER DEFAULT 1,
        serial_number     TEXT    DEFAULT NULL,
        firmware_version  TEXT    DEFAULT NULL,
        claimed_at        TIMESTAMPTZ DEFAULT NULL,
        last_seen         TIMESTAMPTZ DEFAULT NOW()
    );
    """)
    cur.execute("""
    CREATE UNIQUE INDEX IF NOT EXISTS idx_device_info_mac
        ON device_info(mac_address);
    """)
    cur.execute("""
    CREATE INDEX IF NOT EXISTS idx_device_info_finca
        ON device_info(finca_id);
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS app_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """)
    for key, value in [
        ('flow_lpm',              '5.0'),
        ('baseline_daily_l',      '15.0'),
        ('station_name',          'Aquantia'),
        ('station_location',      'Lanzarote'),
        ('pipeline_scenario',     'normal'),
        ('min_firmware_version',  '0.1.0-beta.2'),
    ]:
        cur.execute(
            "INSERT INTO app_settings(key, value) VALUES (%s, %s)"
            " ON CONFLICT (key) DO NOTHING",
            (key, value)
        )

    cur.execute("""
    CREATE TABLE IF NOT EXISTS alerts (
        id         BIGSERIAL PRIMARY KEY,
        finca_id   TEXT,
        device_mac TEXT,
        alert_type TEXT        NOT NULL DEFAULT 'unknown',
        severity   TEXT        NOT NULL DEFAULT 'info',
        message    TEXT,
        acked      INTEGER     NOT NULL DEFAULT 0,
        acked_at   TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_alerts_finca   ON alerts(finca_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at);")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS irrigation_resets (
        id       BIGSERIAL PRIMARY KEY,
        reset_at TIMESTAMPTZ DEFAULT NOW()
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS relay_state (
        id          SERIAL  PRIMARY KEY,
        desired     INTEGER NOT NULL DEFAULT 0,
        actual      INTEGER NOT NULL DEFAULT 0,
        device_mac  TEXT    DEFAULT NULL,
        relay_index INTEGER DEFAULT 0,
        UNIQUE (device_mac, relay_index)
    );
    """)
    cur.execute("""
    INSERT INTO relay_state(id, desired, actual) VALUES (1, 0, 0)
    ON CONFLICT (id) DO NOTHING;
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS device_credentials (
        mac                 TEXT PRIMARY KEY,
        token_hash          TEXT NOT NULL,
        serial_number       TEXT UNIQUE NOT NULL,
        claimed_by_finca_id TEXT        DEFAULT NULL,
        claimed_at          TIMESTAMPTZ DEFAULT NULL,
        created_at          TIMESTAMPTZ DEFAULT NOW()
    );
    """)
    cur.execute("""
    CREATE INDEX IF NOT EXISTS idx_devcred_serial
        ON device_credentials(serial_number);
    """)

    # ── Usuarios ──────────────────────────────────────────────────────────────
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id            BIGSERIAL PRIMARY KEY,
        email         TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name  TEXT,
        role          TEXT NOT NULL DEFAULT 'user',
        is_active     BOOLEAN NOT NULL DEFAULT TRUE,
        created_at    TIMESTAMPTZ DEFAULT NOW()
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS user_devices (
        id          BIGSERIAL PRIMARY KEY,
        user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mac_address TEXT NOT NULL,
        nickname    TEXT,
        claimed_at  TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (user_id, mac_address)
    );
    """)
    cur.execute("""
    CREATE INDEX IF NOT EXISTS idx_user_devices_user
        ON user_devices(user_id);
    """)

    # ── Migraciones sobre tablas existentes ──────────────────────────────────
    # ALTER TABLE IF NOT EXISTS COLUMN es idempotente en PostgreSQL.
    migrations = [
        "ALTER TABLE device_info ADD COLUMN IF NOT EXISTS firmware_version TEXT DEFAULT NULL",
    ]
    for sql in migrations:
        try:
            cur.execute(sql)
        except Exception as e:
            logger.warning("Migración ignorada (%s): %s", sql[:60], e)
            raw.rollback()
            cur = raw.cursor()

    raw.commit()
    cur.close()
    logger.info("Schema PostgreSQL listo")
