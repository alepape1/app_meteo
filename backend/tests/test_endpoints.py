"""
test_endpoints.py — Paso 2: tests de integración de endpoints HTTP
Requiere PostgreSQL en localhost:5432 (user=aquantia, pass=aquantia).
Usa DB separada 'aquantia_test' para no contaminar la DB de dev.
"""
import os
import sys

import psycopg2
import psycopg2.pool
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Import app first: it calls load_dotenv() which sets PG_PASS, PG_HOST, etc.
# before database.py module-level variables are initialized.
import app as flask_module  # noqa: E402
import database              # noqa: E402 — already in sys.modules with correct env

TEST_DB = "aquantia_test"
PG_CONN = dict(
    host=os.environ.get("PG_HOST", "localhost"),
    port=int(os.environ.get("PG_PORT", 5432)),
    user=os.environ.get("PG_USER", "aquantia"),
    password=os.environ.get("PG_PASS", "aquantia_dev"),
)


# ── Fixtures de infraestructura ───────────────────────────────────────────────

@pytest.fixture(scope="session")
def test_db_pool():
    """Crea aquantia_test si no existe y redirige database._pool hacia ella."""
    # 1. Crear la base de datos de test si no existe
    admin = psycopg2.connect(dbname="aquantia", **PG_CONN)
    admin.autocommit = True
    cur = admin.cursor()
    cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (TEST_DB,))
    if not cur.fetchone():
        cur.execute(f"CREATE DATABASE {TEST_DB}")
    cur.close()
    admin.close()

    # 2. Crear pool hacia la DB de test y reemplazar el pool global del módulo
    pool = psycopg2.pool.ThreadedConnectionPool(
        minconn=2, maxconn=10, dbname=TEST_DB, **PG_CONN
    )
    original_pool = database._pool
    database._pool = pool

    # 3. Crear schema en la DB de test
    conn = database.get_db_connection()
    database.create_tables(conn)
    conn.close()

    yield pool

    # Restaurar el pool original al terminar la sesión de tests
    database._pool = original_pool
    pool.closeall()


@pytest.fixture(scope="session")
def flask_app(test_db_pool):
    """App Flask en modo TESTING con JWT secret fijo."""
    flask_module.app.config.update({
        "TESTING": True,
        "JWT_SECRET_KEY": "test-secret-for-pytest-at-least-32-bytes",
        "JWT_ACCESS_TOKEN_EXPIRES": False,
    })
    yield flask_module.app


@pytest.fixture
def client(flask_app):
    """Cliente HTTP de test; crea un contexto de aplicación fresco por test."""
    with flask_app.test_client() as c:
        yield c


@pytest.fixture(autouse=True)
def clean_tables(test_db_pool):
    """Elimina datos de usuario tras cada test para garantizar aislamiento."""
    yield
    conn = database.get_db_connection()
    # El orden importa: respetar la FK user_devices → users
    conn.execute("DELETE FROM user_devices")
    conn.execute("DELETE FROM device_credentials")
    conn.execute("DELETE FROM users")
    conn.commit()
    conn.close()


# ── Helpers ────────────────────────────────────────────────────────────────────

def register_user(client, email="test@example.com", password="pass1234",
                  name="Tester"):
    return client.post("/api/auth/register", json={
        "email": email,
        "password": password,
        "display_name": name,
    })


def login_user(client, email="test@example.com", password="pass1234"):
    return client.post("/api/auth/login", json={
        "email": email,
        "password": password,
    })


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ── Registro de usuario ───────────────────────────────────────────────────────

class TestRegister:
    def test_register_success_returns_201(self, client):
        resp = register_user(client)
        assert resp.status_code == 201
        body = resp.get_json()
        assert "token" in body
        assert body["user"]["email"] == "test@example.com"
        assert body["user"]["role"] == "user"

    def test_register_returns_display_name(self, client):
        resp = register_user(client, name="Alice")
        assert resp.status_code == 201
        assert resp.get_json()["user"]["display_name"] == "Alice"

    def test_register_missing_email_returns_400(self, client):
        resp = client.post("/api/auth/register", json={"password": "pass1234"})
        assert resp.status_code == 400

    def test_register_missing_password_returns_400(self, client):
        resp = client.post("/api/auth/register", json={"email": "a@b.com"})
        assert resp.status_code == 400

    def test_register_short_password_returns_400(self, client):
        resp = client.post("/api/auth/register", json={
            "email": "a@b.com", "password": "short"
        })
        assert resp.status_code == 400

    def test_register_duplicate_email_returns_409(self, client):
        register_user(client)
        resp = register_user(client)
        assert resp.status_code == 409


# ── Login ─────────────────────────────────────────────────────────────────────

class TestLogin:
    def test_login_success_returns_200_with_token(self, client):
        register_user(client)
        resp = login_user(client)
        assert resp.status_code == 200
        body = resp.get_json()
        assert "token" in body
        assert body["user"]["email"] == "test@example.com"

    def test_login_wrong_password_returns_401(self, client):
        register_user(client)
        resp = client.post("/api/auth/login", json={
            "email": "test@example.com",
            "password": "wrongpassword"
        })
        assert resp.status_code == 401

    def test_login_unknown_email_returns_401(self, client):
        resp = client.post("/api/auth/login", json={
            "email": "nobody@example.com",
            "password": "pass1234"
        })
        assert resp.status_code == 401

    def test_login_missing_password_returns_400(self, client):
        resp = client.post("/api/auth/login", json={"email": "a@b.com"})
        assert resp.status_code == 400

    def test_login_missing_email_returns_400(self, client):
        resp = client.post("/api/auth/login", json={"password": "pass1234"})
        assert resp.status_code == 400


# ── JWT / rutas protegidas ────────────────────────────────────────────────────

class TestJWT:
    def test_protected_route_without_token_returns_401(self, client):
        resp = client.get("/api/devices/mine")
        assert resp.status_code == 401
        assert resp.get_json()["code"] == "missing_token"

    def test_protected_route_with_invalid_token_returns_401(self, client):
        resp = client.get("/api/devices/mine", headers={
            "Authorization": "Bearer this.is.not.a.valid.jwt"
        })
        assert resp.status_code == 401

    def test_protected_route_with_malformed_header_returns_401(self, client):
        resp = client.get("/api/devices/mine", headers={
            "Authorization": "NotBearer sometoken"
        })
        assert resp.status_code == 401

    def test_auth_me_with_valid_token_returns_user(self, client):
        register_user(client)
        token = login_user(client).get_json()["token"]
        resp = client.get("/api/auth/me", headers=auth_headers(token))
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["email"] == "test@example.com"

    def test_auth_me_without_token_returns_401(self, client):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401

    def test_api_settings_requires_auth(self, client):
        resp = client.get("/api/settings")
        assert resp.status_code == 401


# ── Dispositivos ──────────────────────────────────────────────────────────────

class TestDevices:

    def _token(self, client, email="dev@example.com", password="pass1234"):
        register_user(client, email=email, password=password)
        return login_user(client, email=email, password=password).get_json()["token"]

    def _insert_credential(self, mac, serial, token_hash="fakehash"):
        conn = database.get_db_connection()
        conn.execute(
            "INSERT INTO device_credentials(mac, token_hash, serial_number)"
            " VALUES (%s, %s, %s)",
            (mac, token_hash, serial),
        )
        conn.commit()
        conn.close()

    def test_list_devices_empty_for_new_user(self, client):
        token = self._token(client)
        resp = client.get("/api/devices/mine", headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.get_json() == []

    def test_claim_missing_serial_returns_400(self, client):
        token = self._token(client)
        resp = client.post(
            "/api/devices/claim",
            json={},
            headers=auth_headers(token),
        )
        assert resp.status_code == 400

    def test_claim_unknown_serial_returns_404(self, client):
        token = self._token(client)
        resp = client.post(
            "/api/devices/claim",
            json={"serial_number": "DOESNOTEXIST"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 404

    def test_claim_valid_device_returns_200_with_mac(self, client):
        token = self._token(client)
        mac = "AA:BB:CC:DD:EE:FF"
        serial = "SN-TEST-001"
        self._insert_credential(mac, serial)

        resp = client.post(
            "/api/devices/claim",
            json={"serial_number": serial, "finca_id": "finca01"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["mac"] == mac
        assert body["serial_number"] == serial
        assert body["finca_id"] == "finca01"

    def test_claimed_device_appears_in_devices_mine(self, client):
        token = self._token(client)
        mac = "AA:BB:CC:DD:EE:FF"
        serial = "SN-TEST-002"
        self._insert_credential(mac, serial)

        client.post(
            "/api/devices/claim",
            json={"serial_number": serial},
            headers=auth_headers(token),
        )

        resp = client.get("/api/devices/mine", headers=auth_headers(token))
        assert resp.status_code == 200
        devices = resp.get_json()
        assert len(devices) == 1
        assert devices[0]["mac_address"] == mac

    def test_claim_device_already_owned_by_other_user_returns_409(self, client):
        """Dispositivo reclamado por usuario A → usuario B obtiene 409."""
        mac = "BB:CC:DD:EE:FF:AA"
        serial = "SN-TEST-003"
        self._insert_credential(mac, serial)

        # Usuario 1 reclama
        token1 = self._token(client, email="user1@test.com")
        client.post(
            "/api/devices/claim",
            json={"serial_number": serial},
            headers=auth_headers(token1),
        )

        # Usuario 2 intenta reclamar el mismo dispositivo
        register_user(client, email="user2@test.com")
        token2 = login_user(client, email="user2@test.com").get_json()["token"]
        resp = client.post(
            "/api/devices/claim",
            json={"serial_number": serial},
            headers=auth_headers(token2),
        )
        assert resp.status_code == 409

    def test_claim_device_without_token_returns_401(self, client):
        resp = client.post(
            "/api/devices/claim",
            json={"serial_number": "SN-ANY"},
        )
        assert resp.status_code == 401
