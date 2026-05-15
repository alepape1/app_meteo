#!/usr/bin/env python3
"""
migrate_sqlite_to_pg.py — Migra datos de SQLite a PostgreSQL (TimescaleDB)

Uso (ejecutar una sola vez en el servidor, con TimescaleDB ya levantado):
    python migrate_sqlite_to_pg.py

Variables de entorno opcionales (o edita los valores por defecto abajo):
    SQLITE_PATH  — ruta al .db de SQLite  (defecto: home_weather_station.db)
    PG_HOST      — host PostgreSQL         (defecto: localhost)
    PG_PORT      — puerto                  (defecto: 5432)
    PG_DB        — base de datos           (defecto: aquantia)
    PG_USER      — usuario                 (defecto: aquantia)
    PG_PASS      — contraseña              (defecto: cambia_esto)
"""

import os
import sqlite3
import psycopg2
import psycopg2.extras

SQLITE_PATH = os.environ.get("SQLITE_PATH", "home_weather_station.db")
PG_HOST = os.environ.get("PG_HOST", "localhost")
PG_PORT = int(os.environ.get("PG_PORT", 5432))
PG_DB   = os.environ.get("PG_DB",   "aquantia")
PG_USER = os.environ.get("PG_USER", "aquantia")
PG_PASS = os.environ.get("PG_PASS", "cambia_esto")

TABLES = [
    "home_weather_station",
    "device_info",
    "device_credentials",
    "alerts",
    "relay_state",
    "irrigation_resets",
    "app_settings",
]

BATCH_SIZE = 500


def migrate_table(src_cur, dst_conn, table):
    src_cur.execute(f"SELECT * FROM {table}")
    rows = src_cur.fetchall()
    if not rows:
        print(f"  {table}: vacía, omitiendo")
        return 0

    cols = [d[0] for d in src_cur.description]
    placeholders = ", ".join(["%s"] * len(cols))
    col_names    = ", ".join(cols)
    sql = (
        f"INSERT INTO {table} ({col_names}) VALUES ({placeholders})"
        f" ON CONFLICT DO NOTHING"
    )

    dst_cur = dst_conn.cursor()
    migrated = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = [tuple(r) for r in rows[i:i + BATCH_SIZE]]
        psycopg2.extras.execute_batch(dst_cur, sql, batch)
        dst_conn.commit()
        migrated += len(batch)
        print(f"  {table}: {migrated}/{len(rows)} filas...", end="\r")

    dst_cur.close()
    print(f"  {table}: {migrated} filas migradas        ")
    return migrated


def main():
    if not os.path.exists(SQLITE_PATH):
        print(f"ERROR: no se encuentra {SQLITE_PATH}")
        return 1

    print(f"\nMigrando {SQLITE_PATH} → {PG_USER}@{PG_HOST}:{PG_PORT}/{PG_DB}\n")

    src = sqlite3.connect(SQLITE_PATH)
    src.row_factory = sqlite3.Row
    src_cur = src.cursor()

    dst = psycopg2.connect(
        host=PG_HOST, port=PG_PORT,
        dbname=PG_DB, user=PG_USER, password=PG_PASS
    )

    # Primero crear el schema en PostgreSQL
    from database import create_tables, _CompatConn
    create_tables(_CompatConn(dst))

    total = 0
    for table in TABLES:
        src_cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
        )
        if not src_cur.fetchone():
            print(f"  {table}: no existe en SQLite, omitiendo")
            continue
        total += migrate_table(src_cur, dst, table)

    src.close()
    dst.close()

    print(f"\nMigración completada: {total} filas totales.")
    print("Ahora puedes levantar los contenedores con: docker compose up -d --build\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
