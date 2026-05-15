#!/usr/bin/env python3
"""
Crea el usuario demo y opcionalmente vincula un dispositivo.
Uso:
    python create_demo_user.py
    python create_demo_user.py --serial AQ-FCB467F37748
"""
import argparse
import os
import sys
import bcrypt
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

PG_HOST = os.environ.get("PG_HOST", "localhost")
PG_PORT = int(os.environ.get("PG_PORT", 5432))
PG_DB   = os.environ.get("PG_DB",   "aquantia")
PG_USER = os.environ.get("PG_USER", "aquantia")
PG_PASS = os.environ.get("PG_PASS", "aquantia")

DEMO_EMAIL    = "demo@aquantialab.com"
DEMO_PASSWORD = "aquantia2024"
DEMO_NAME     = "Demo"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--serial", help="Serial del dispositivo a vincular (ej: AQ-FCB467F37748)")
    args = parser.parse_args()

    conn = psycopg2.connect(
        host=PG_HOST, port=PG_PORT,
        dbname=PG_DB, user=PG_USER, password=PG_PASS,
        cursor_factory=psycopg2.extras.RealDictCursor
    )
    cur = conn.cursor()

    # Crear usuario demo
    pw_hash = bcrypt.hashpw(DEMO_PASSWORD.encode(), bcrypt.gensalt()).decode()
    cur.execute("""
        INSERT INTO users(email, password_hash, display_name, role)
        VALUES (%s, %s, %s, 'admin')
        ON CONFLICT (email) DO UPDATE
            SET password_hash = EXCLUDED.password_hash,
                display_name  = EXCLUDED.display_name
        RETURNING id
    """, (DEMO_EMAIL, pw_hash, DEMO_NAME))
    user_id = cur.fetchone()["id"]
    print(f"✓ Usuario demo: {DEMO_EMAIL}  /  contraseña: {DEMO_PASSWORD}  (id={user_id})")

    # Vincular dispositivo si se pasa --serial
    if args.serial:
        serial = args.serial.strip().upper()
        cur.execute("SELECT mac FROM device_credentials WHERE serial_number=%s", (serial,))
        row = cur.fetchone()
        if not row:
            print(f"✗ Serial {serial} no encontrado en device_credentials")
            conn.rollback()
            sys.exit(1)
        mac = row["mac"]
        cur.execute("""
            INSERT INTO user_devices(user_id, mac_address, nickname)
            VALUES (%s, %s, %s)
            ON CONFLICT (user_id, mac_address) DO NOTHING
        """, (user_id, mac, serial))
        cur.execute("""
            UPDATE device_credentials
            SET claimed_by_finca_id = %s, claimed_at = NOW()
            WHERE serial_number = %s
        """, (serial, serial))
        print(f"✓ Dispositivo {serial} ({mac}) vinculado al usuario demo")

    conn.commit()
    cur.close()
    conn.close()
    print("Listo.")

if __name__ == "__main__":
    main()
