"""Envío de emails transaccionales via SMTP (servidor Gestia / aquantialab.com)."""

import logging
import os
import smtplib
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

_SMTP_HOST = os.environ.get("SMTP_HOST", "")
_SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
_SMTP_USER = os.environ.get("SMTP_USER", "")
_SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
_SMTP_FROM = os.environ.get("SMTP_FROM", _SMTP_USER)
_SMTP_USE_SSL = os.environ.get("SMTP_USE_SSL", "0") == "1"  # 465 → True, 587 → False (STARTTLS)

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")


def _send_smtp(to: str, subject: str, html: str, text: str) -> None:
    """Envía un email. Lanza excepción si falla — el caller decide cómo manejarlo."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = _SMTP_FROM
    msg["To"] = to
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    if _SMTP_USE_SSL:
        with smtplib.SMTP_SSL(_SMTP_HOST, _SMTP_PORT, timeout=10) as server:
            server.login(_SMTP_USER, _SMTP_PASSWORD)
            server.sendmail(_SMTP_FROM, [to], msg.as_bytes())
    else:
        with smtplib.SMTP(_SMTP_HOST, _SMTP_PORT, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.login(_SMTP_USER, _SMTP_PASSWORD)
            server.sendmail(_SMTP_FROM, [to], msg.as_bytes())


def _send_async(to: str, subject: str, html: str, text: str) -> None:
    """Lanza el envío en un hilo para no bloquear la respuesta HTTP."""
    def _worker():
        try:
            _send_smtp(to, subject, html, text)
            logger.info("[email] Enviado a %s: %s", to, subject)
        except Exception as exc:
            logger.error("[email] Error al enviar a %s: %s", to, exc)

    threading.Thread(target=_worker, daemon=True).start()


def send_verification_email(to_email: str, display_name: str, token: str) -> None:
    """Envía el email de verificación de cuenta al usuario recién registrado."""
    if not _SMTP_HOST or not _SMTP_USER:
        logger.warning("[email] SMTP no configurado — omitiendo envío de verificación")
        return

    verify_url = f"{FRONTEND_URL}/verify-email?token={token}"
    name = display_name or to_email.split("@")[0]

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirma tu cuenta — Aquantia</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#011f42 0%,#0c8ecc 100%);padding:40px 48px 32px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-.3px;">Aquantia</p>
              <p style="margin:6px 0 0;font-size:13px;color:#5ab4e0;letter-spacing:.5px;text-transform:uppercase;">Monitorización inteligente del agua</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 48px 32px;">
              <p style="margin:0 0 8px;font-size:24px;font-weight:700;color:#011f42;">¡Bienvenido, {name}!</p>
              <p style="margin:0 0 28px;font-size:15px;color:#3d506a;line-height:1.6;">
                Tu cuenta en Aquantia se ha creado correctamente. Solo falta un paso: confirma tu dirección de correo haciendo clic en el botón de abajo.
              </p>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td style="background:#0c8ecc;border-radius:10px;">
                    <a href="{verify_url}" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:.2px;">
                      Verificar mi cuenta →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 6px;font-size:13px;color:#8a9aaa;">Si el botón no funciona, copia este enlace en tu navegador:</p>
              <p style="margin:0 0 28px;font-size:12px;color:#0c8ecc;word-break:break-all;">{verify_url}</p>

              <hr style="border:none;border-top:1px solid #e8edf2;margin:0 0 24px;" />
              <p style="margin:0;font-size:12px;color:#8a9aaa;line-height:1.6;">
                Este enlace caduca en <strong>24 horas</strong>. Si no has creado esta cuenta, ignora este mensaje.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 48px;border-top:1px solid #e8edf2;">
              <p style="margin:0;font-size:11px;color:#a5b8cb;text-align:center;">
                © 2025 Aquantia · aquantialab.com · Este correo es generado automáticamente, no lo respondas.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    text = (
        f"¡Bienvenido a Aquantia, {name}!\n\n"
        f"Verifica tu cuenta accediendo a este enlace (caduca en 24 h):\n{verify_url}\n\n"
        "Si no has creado esta cuenta, ignora este mensaje.\n\n"
        "© 2025 Aquantia · aquantialab.com"
    )

    _send_async(to_email, "Confirma tu cuenta en Aquantia", html, text)
