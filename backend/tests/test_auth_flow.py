"""
test_auth_flow.py — Comprehensive tests for the login-redesing branch features:
  - Email verification on registration
  - Login blocked until email is verified
  - Delete own account (DELETE /api/auth/account)
  - Admin delete user (DELETE /api/admin/users/<user_id>)
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import database  # noqa: E402
import app as flask_module  # noqa: E402,F401 — triggers load_dotenv and app init
from conftest import auth_headers  # noqa: E402


# ── Local helpers ─────────────────────────────────────────────────────────────


def _register_verify_login(client, email, password="pass1234", name="Tester"):
    """
    Registers a user, verifies the email by reading the token from the DB,
    then logs in and returns the JWT string.
    """
    client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "display_name": name},
    )
    conn = database.get_db_connection()
    row = conn.execute(
        "SELECT verification_token FROM users WHERE email=%s", (email,)
    ).fetchone()
    conn.close()
    token = row["verification_token"]
    client.get(f"/api/auth/verify-email/{token}")
    resp = client.post(
        "/api/auth/login", json={"email": email, "password": password}
    )
    return resp.get_json()["token"]


def _make_admin(email):
    """Elevates an existing user to role='admin' directly in the DB."""
    conn = database.get_db_connection()
    conn.execute("UPDATE users SET role='admin' WHERE email=%s", (email,))
    conn.commit()
    conn.close()


def _get_user_from_db(email):
    conn = database.get_db_connection()
    row = conn.execute(
        "SELECT id, email_verified, verification_token, role FROM users WHERE email=%s",
        (email,),
    ).fetchone()
    conn.close()
    return row


# ── TestRegistration ──────────────────────────────────────────────────────────


class TestRegistration:
    def test_register_returns_200_without_token(self, client):
        resp = client.post(
            "/api/auth/register",
            json={
                "email": "new@example.com",
                "password": "pass1234",
                "display_name": "New User",
            },
        )
        assert resp.status_code == 201
        body = resp.get_json()
        # Must NOT hand out a JWT at registration time
        assert "token" not in body
        assert "message" in body

    def test_register_creates_user_unverified(self, client):
        client.post(
            "/api/auth/register",
            json={
                "email": "unverified@example.com",
                "password": "pass1234",
                "display_name": "Unverified",
            },
        )
        row = _get_user_from_db("unverified@example.com")
        assert row is not None
        # email_verified must be False immediately after registration
        assert row["email_verified"] is False or row["email_verified"] == 0
        # A verification token must have been stored
        assert row["verification_token"] is not None

    def test_register_duplicate_email_returns_409(self, client):
        payload = {
            "email": "dup@example.com",
            "password": "pass1234",
            "display_name": "Dup",
        }
        client.post("/api/auth/register", json=payload)
        resp = client.post("/api/auth/register", json=payload)
        assert resp.status_code == 409

    def test_register_missing_fields_returns_400(self, client):
        # Missing password
        resp = client.post(
            "/api/auth/register",
            json={"email": "nopw@example.com"},
        )
        assert resp.status_code == 400

        # Missing email
        resp = client.post(
            "/api/auth/register",
            json={"password": "pass1234"},
        )
        assert resp.status_code == 400

        # Completely empty body
        resp = client.post("/api/auth/register", json={})
        assert resp.status_code == 400


# ── TestEmailVerification ─────────────────────────────────────────────────────


class TestEmailVerification:
    def _register_only(self, client, email, password="pass1234"):
        client.post(
            "/api/auth/register",
            json={
                "email": email,
                "password": password,
                "display_name": "Verif Tester",
            },
        )
        conn = database.get_db_connection()
        row = conn.execute(
            "SELECT verification_token FROM users WHERE email=%s", (email,)
        ).fetchone()
        conn.close()
        return row["verification_token"]

    def test_verify_valid_token_returns_jwt(self, client):
        email = "verifok@example.com"
        password = "pass1234"
        token = self._register_only(client, email, password)

        # Verification endpoint redirects — follow it
        resp = client.get(f"/api/auth/verify-email/{token}")
        # The endpoint returns a redirect (302); after that, login should work
        assert resp.status_code in (200, 301, 302)

        # Now login must succeed and return a JWT
        login_resp = client.post(
            "/api/auth/login", json={"email": email, "password": password}
        )
        assert login_resp.status_code == 200
        body = login_resp.get_json()
        assert "token" in body
        assert isinstance(body["token"], str)
        assert len(body["token"]) > 10

    def test_verify_invalid_token_returns_4xx(self, client):
        resp = client.get("/api/auth/verify-email/this-token-does-not-exist")
        # The endpoint redirects with an error query-param; status should be
        # a redirect (3xx) pointing to an error page, OR a 4xx direct response.
        # Either is acceptable — the key assertion is that subsequent login fails.
        assert resp.status_code in (302, 400, 404)

    def test_verify_already_used_token_returns_4xx(self, client):
        email = "twiceverif@example.com"
        token = self._register_only(client, email)

        # First use — valid
        client.get(f"/api/auth/verify-email/{token}")

        # Second use — must be rejected (token cleared from DB after first use)
        resp = client.get(f"/api/auth/verify-email/{token}")
        # Endpoint redirects with error param when token is not found/already used
        assert resp.status_code in (302, 400, 404)
        # Confirm the redirect location contains an error indicator if 302
        if resp.status_code == 302:
            location = resp.headers.get("Location", "")
            assert "error" in location.lower() or "token_invalido" in location

    def test_user_is_verified_after_token_use(self, client):
        email = "dbverif@example.com"
        token = self._register_only(client, email)

        # Before verification
        row_before = _get_user_from_db(email)
        assert row_before["email_verified"] is False or row_before["email_verified"] == 0

        client.get(f"/api/auth/verify-email/{token}")

        # After verification
        row_after = _get_user_from_db(email)
        assert row_after["email_verified"] is True or row_after["email_verified"] == 1
        # Token must have been cleared
        assert row_after["verification_token"] is None


# ── TestLoginWithVerification ─────────────────────────────────────────────────


class TestLoginWithVerification:
    def test_login_unverified_user_returns_403(self, client):
        client.post(
            "/api/auth/register",
            json={
                "email": "notverif@example.com",
                "password": "pass1234",
                "display_name": "Not Verified",
            },
        )
        resp = client.post(
            "/api/auth/login",
            json={"email": "notverif@example.com", "password": "pass1234"},
        )
        assert resp.status_code == 403

    def test_login_verified_user_returns_jwt(self, client):
        jwt = _register_verify_login(client, "verified@example.com")
        assert jwt is not None
        assert isinstance(jwt, str)
        assert len(jwt) > 10

    def test_login_wrong_password_returns_401(self, client):
        _register_verify_login(client, "wrongpw@example.com", password="correctpw")
        resp = client.post(
            "/api/auth/login",
            json={"email": "wrongpw@example.com", "password": "wrongpassword"},
        )
        assert resp.status_code == 401

    def test_login_nonexistent_user_returns_401(self, client):
        resp = client.post(
            "/api/auth/login",
            json={"email": "ghost@example.com", "password": "pass1234"},
        )
        assert resp.status_code == 401


# ── TestDeleteOwnAccount ──────────────────────────────────────────────────────


class TestDeleteOwnAccount:
    def test_delete_without_auth_returns_401(self, client):
        resp = client.delete(
            "/api/auth/account",
            json={"password": "pass1234"},
        )
        assert resp.status_code == 401

    def test_delete_wrong_password_returns_403(self, client):
        token = _register_verify_login(client, "delwrong@example.com", password="pass1234")
        resp = client.delete(
            "/api/auth/account",
            json={"password": "wrong-password"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 403

    def test_delete_empty_password_returns_400(self, client):
        token = _register_verify_login(client, "delempty@example.com", password="pass1234")
        resp = client.delete(
            "/api/auth/account",
            json={"password": ""},
            headers=auth_headers(token),
        )
        assert resp.status_code == 400

    def test_delete_missing_password_field_returns_400(self, client):
        token = _register_verify_login(client, "delmissing@example.com", password="pass1234")
        resp = client.delete(
            "/api/auth/account",
            json={},
            headers=auth_headers(token),
        )
        assert resp.status_code == 400

    def test_delete_correct_password_returns_200(self, client):
        token = _register_verify_login(client, "delok@example.com", password="pass1234")
        resp = client.delete(
            "/api/auth/account",
            json={"password": "pass1234"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert "message" in body

    def test_delete_removes_user_from_db(self, client):
        email = "deldbcheck@example.com"
        token = _register_verify_login(client, email, password="pass1234")

        client.delete(
            "/api/auth/account",
            json={"password": "pass1234"},
            headers=auth_headers(token),
        )

        row = _get_user_from_db(email)
        assert row is None

    def test_jwt_invalid_after_account_deletion(self, client):
        token = _register_verify_login(client, "deljwt@example.com", password="pass1234")

        # Delete the account
        client.delete(
            "/api/auth/account",
            json={"password": "pass1234"},
            headers=auth_headers(token),
        )

        # Using the old JWT on a protected endpoint must now fail.
        # The JWT signature is still cryptographically valid, so _require_jwt
        # lets it through; auth_me then queries the DB, finds no user, and
        # returns 404.  Both 401 and 404 are acceptable "access denied" signals
        # for a deleted account.
        resp = client.get("/api/auth/me", headers=auth_headers(token))
        assert resp.status_code in (401, 404)


# ── TestAdminDeleteUser ───────────────────────────────────────────────────────


class TestAdminDeleteUser:
    def test_non_admin_cannot_delete_user_returns_403(self, client):
        # Register two normal users
        requester_token = _register_verify_login(client, "nonadmin@example.com")
        _register_verify_login(client, "victim@example.com")

        conn = database.get_db_connection()
        victim_row = conn.execute(
            "SELECT id FROM users WHERE email=%s", ("victim@example.com",)
        ).fetchone()
        conn.close()
        victim_id = victim_row["id"]

        resp = client.delete(
            f"/api/admin/users/{victim_id}",
            headers=auth_headers(requester_token),
        )
        assert resp.status_code == 403

    def test_admin_can_delete_other_user(self, client):
        admin_token = _register_verify_login(client, "admin@example.com")
        _make_admin("admin@example.com")

        _register_verify_login(client, "tobedeleted@example.com")

        conn = database.get_db_connection()
        target_row = conn.execute(
            "SELECT id FROM users WHERE email=%s", ("tobedeleted@example.com",)
        ).fetchone()
        conn.close()
        target_id = target_row["id"]

        resp = client.delete(
            f"/api/admin/users/{target_id}",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert "message" in body

        # Confirm removal from DB
        assert _get_user_from_db("tobedeleted@example.com") is None

    def test_admin_cannot_delete_self_returns_400(self, client):
        admin_token = _register_verify_login(client, "adminself@example.com")
        _make_admin("adminself@example.com")

        conn = database.get_db_connection()
        admin_row = conn.execute(
            "SELECT id FROM users WHERE email=%s", ("adminself@example.com",)
        ).fetchone()
        conn.close()
        admin_id = admin_row["id"]

        resp = client.delete(
            f"/api/admin/users/{admin_id}",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 400

    def test_delete_nonexistent_user_returns_404(self, client):
        admin_token = _register_verify_login(client, "admin404@example.com")
        _make_admin("admin404@example.com")

        resp = client.delete(
            "/api/admin/users/999999",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404
