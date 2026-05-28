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

    verify_url = f"{FRONTEND_URL}/api/auth/verify-email/{token}"
    name = display_name or to_email.split("@")[0]

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Confirma tu cuenta — Aquantia</title>
  <style>
    @keyframes dropFloat {{0%,100%{{transform:translateY(0)}} 50%{{transform:translateY(-6px)}}}}
    @keyframes circuitPulse {{0%,100%{{opacity:0.5}} 50%{{opacity:1}}}}
    @keyframes ripple {{0%{{r:6;opacity:0.8}} 100%{{r:22;opacity:0}}}}
    .drop-anim{{animation:dropFloat 3s ease-in-out infinite;transform-origin:center bottom}}
    .circuit-anim{{animation:circuitPulse 2s ease-in-out infinite}}
    .ripple1{{animation:ripple 2s ease-out infinite}}
    .ripple2{{animation:ripple 2s ease-out infinite 0.7s}}
  </style>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px;">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border:0.5px solid #dde5ef;border-radius:16px;overflow:hidden;">

  <!-- HEADER -->
  <tr>
    <td style="background:#0d4a7a;padding:36px 40px 28px;text-align:center;">
      <svg width="80" height="96" viewBox="0 0 80 96" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto 14px;">
        <circle class="ripple1" cx="40" cy="80" r="6" fill="none" stroke="#5ec8f0" stroke-width="1.5"/>
        <circle class="ripple2" cx="40" cy="80" r="6" fill="none" stroke="#5ec8f0" stroke-width="1"/>
        <g class="drop-anim">
          <path d="M40 6C40 6 10 38 10 58C10 75.67 23.43 90 40 90C56.57 90 70 75.67 70 58C70 38 40 6 40 6Z" fill="#1a6fa8" opacity="0.3"/>
          <path d="M40 10C40 10 12 40 12 59C12 75.67 24.8 89 40 89C55.2 89 68 75.67 68 59C68 40 40 10 40 10Z" fill="#2a8fc7"/>
          <g class="circuit-anim">
            <line x1="40" y1="24" x2="40" y2="44" stroke="white" stroke-width="1.2" opacity="0.85"/>
            <line x1="40" y1="44" x2="54" y2="56" stroke="white" stroke-width="1.2" opacity="0.85"/>
            <line x1="40" y1="44" x2="26" y2="60" stroke="white" stroke-width="1.2" opacity="0.85"/>
            <line x1="26" y1="60" x2="26" y2="70" stroke="white" stroke-width="1.2" opacity="0.6"/>
            <line x1="54" y1="56" x2="54" y2="66" stroke="white" stroke-width="1.2" opacity="0.6"/>
            <circle cx="40" cy="24" r="2.5" fill="white" opacity="0.95"/>
            <circle cx="40" cy="44" r="2.5" fill="white" opacity="0.95"/>
            <circle cx="54" cy="56" r="2.5" fill="white" opacity="0.95"/>
            <circle cx="26" cy="60" r="2.5" fill="white" opacity="0.95"/>
            <circle cx="26" cy="70" r="2" fill="white" opacity="0.7"/>
            <circle cx="54" cy="66" r="2" fill="white" opacity="0.7"/>
          </g>
          <ellipse cx="30" cy="38" rx="6" ry="10" fill="white" opacity="0.15" transform="rotate(-20 30 38)"/>
        </g>
      </svg>
      <div style="color:#fff;font-size:24px;font-weight:500;letter-spacing:0.5px;">aquant<span style="color:#5ec8f0;">IA</span>lab</div>
      <div style="color:#7fb8d8;font-size:12px;margin-top:6px;letter-spacing:0.4px;">Monitorización inteligente del agua</div>
    </td>
  </tr>

  <!-- HERO -->
  <tr>
    <td style="background:#e6f4fb;padding:28px 40px 24px;border-bottom:0.5px solid #b5d4f4;">
      <div style="display:inline-flex;align-items:center;gap:6px;background:#ffffff;border:0.5px solid #b5d4f4;border-radius:20px;padding:4px 12px;font-size:12px;color:#0c447c;margin-bottom:16px;">
        ✓ &nbsp;Cuenta creada correctamente
      </div>
      <h1 style="font-size:20px;font-weight:500;color:#0c447c;margin:0 0 8px;">¡Bienvenido a Aquantia, {name}!</h1>
      <p style="font-size:14px;color:#185fa5;margin:0;line-height:1.6;">Solo falta un paso: confirma tu dirección de email para activar tu acceso al dashboard.</p>
    </td>
  </tr>

  <!-- BODY -->
  <tr>
    <td style="padding:28px 40px;">

      <!-- Stats -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
        <tr>
          <td width="33%" style="background:#f5f8fc;border:0.5px solid #dde5ef;border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:20px;font-weight:500;color:#185fa5;">24/7</div>
            <div style="font-size:11px;color:#5a7290;margin-top:2px;">Monitorización</div>
          </td>
          <td width="4%"></td>
          <td width="33%" style="background:#f5f8fc;border:0.5px solid #dde5ef;border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:20px;font-weight:500;color:#185fa5;">20s</div>
            <div style="font-size:11px;color:#5a7290;margin-top:2px;">Telemetría en tiempo real</div>
          </td>
          <td width="4%"></td>
          <td width="33%" style="background:#f5f8fc;border:0.5px solid #dde5ef;border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:20px;font-weight:500;color:#185fa5;">4</div>
            <div style="font-size:11px;color:#5a7290;margin-top:2px;">Zonas de riego</div>
          </td>
        </tr>
      </table>

      <!-- Features title -->
      <p style="font-size:13px;font-weight:500;color:#5a7290;text-transform:uppercase;letter-spacing:0.8px;margin:0 0 16px;">Lo que puedes hacer</p>

      <!-- Features grid (2 columns via table) -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
        <tr>
          <td width="48%" style="background:#f5f8fc;border:0.5px solid #dde5ef;border-radius:8px;padding:14px 16px;vertical-align:top;">
            <div style="font-size:22px;color:#185fa5;margin-bottom:8px;">📊</div>
            <p style="font-size:13px;font-weight:500;color:#0d1f35;margin:0 0 4px;">Meteorología en tiempo real</p>
            <p style="font-size:12px;color:#5a7290;margin:0;line-height:1.5;">Temperatura, humedad, presión, viento y luz solar con gráficos históricos.</p>
          </td>
          <td width="4%"></td>
          <td width="48%" style="background:#f5f8fc;border:0.5px solid #dde5ef;border-radius:8px;padding:14px 16px;vertical-align:top;">
            <div style="font-size:22px;color:#185fa5;margin-bottom:8px;">💧</div>
            <p style="font-size:13px;font-weight:500;color:#0d1f35;margin:0 0 4px;">Control de riego</p>
            <p style="font-size:12px;color:#5a7290;margin:0;line-height:1.5;">Activa y programa electroválvulas por zonas. Estadísticas de consumo y ahorro.</p>
          </td>
        </tr>
        <tr><td colspan="3" style="padding-top:12px;"></td></tr>
        <tr>
          <td width="48%" style="background:#f5f8fc;border:0.5px solid #dde5ef;border-radius:8px;padding:14px 16px;vertical-align:top;">
            <div style="font-size:22px;color:#185fa5;margin-bottom:8px;">〰️</div>
            <p style="font-size:13px;font-weight:500;color:#0d1f35;margin:0 0 4px;">Detección de fugas</p>
            <p style="font-size:12px;color:#5a7290;margin:0;line-height:1.5;">Monitorización de presión y caudal. Alertas automáticas ante fugas u obstrucciones.</p>
          </td>
          <td width="4%"></td>
          <td width="48%" style="background:#f5f8fc;border:0.5px solid #dde5ef;border-radius:8px;padding:14px 16px;vertical-align:top;">
            <div style="font-size:22px;color:#185fa5;margin-bottom:8px;">🔔</div>
            <p style="font-size:13px;font-weight:500;color:#0d1f35;margin:0 0 4px;">Alertas inteligentes</p>
            <p style="font-size:12px;color:#5a7290;margin:0;line-height:1.5;">Notificaciones por severidad. Historial de eventos y confirmación de resolución.</p>
          </td>
        </tr>
        <tr><td colspan="3" style="padding-top:12px;"></td></tr>
        <tr>
          <td width="48%" style="background:#f5f8fc;border:0.5px solid #dde5ef;border-radius:8px;padding:14px 16px;vertical-align:top;">
            <div style="font-size:22px;color:#185fa5;margin-bottom:8px;">⚙️</div>
            <p style="font-size:13px;font-weight:500;color:#0d1f35;margin:0 0 4px;">Estado del dispositivo</p>
            <p style="font-size:12px;color:#5a7290;margin:0;line-height:1.5;">Señal WiFi, memoria libre, uptime y versión de firmware de cada ECU registrada.</p>
          </td>
          <td width="4%"></td>
          <td width="48%" style="background:#f5f8fc;border:0.5px solid #dde5ef;border-radius:8px;padding:14px 16px;vertical-align:top;">
            <div style="font-size:22px;color:#185fa5;margin-bottom:8px;">🌱</div>
            <p style="font-size:13px;font-weight:500;color:#0d1f35;margin:0 0 4px;">Humedad de suelo</p>
            <p style="font-size:12px;color:#5a7290;margin:0;line-height:1.5;">Sensor YL-69 para monitorizar la humedad del substrato y optimizar el riego.</p>
          </td>
        </tr>
      </table>

      <hr style="border:none;border-top:0.5px solid #dde5ef;margin:0 0 24px;"/>

      <!-- Steps title -->
      <p style="font-size:13px;font-weight:500;color:#5a7290;text-transform:uppercase;letter-spacing:0.8px;margin:0 0 16px;">Cómo empezar</p>

      <!-- Steps -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td style="vertical-align:top;width:26px;">
            <div style="width:26px;height:26px;border-radius:50%;background:#185fa5;color:#fff;font-size:12px;font-weight:500;text-align:center;line-height:26px;">1</div>
          </td>
          <td style="padding-left:14px;font-size:13px;color:#0d1f35;line-height:1.6;padding-bottom:14px;">
            <strong style="font-weight:500;">Verifica tu cuenta</strong> — haz clic en el botón de abajo para activar tu acceso.
          </td>
        </tr>
        <tr>
          <td style="vertical-align:top;width:26px;">
            <div style="width:26px;height:26px;border-radius:50%;background:#185fa5;color:#fff;font-size:12px;font-weight:500;text-align:center;line-height:26px;">2</div>
          </td>
          <td style="padding-left:14px;font-size:13px;color:#0d1f35;line-height:1.6;padding-bottom:14px;">
            <strong style="font-weight:500;">Vincula tu dispositivo</strong> — escanea el QR de la etiqueta o introduce el serial <code style="background:#f0f4f8;padding:1px 4px;border-radius:4px;font-size:12px;">AQ-XXXXXX</code> en "Mis dispositivos".
          </td>
        </tr>
        <tr>
          <td style="vertical-align:top;width:26px;">
            <div style="width:26px;height:26px;border-radius:50%;background:#185fa5;color:#fff;font-size:12px;font-weight:500;text-align:center;line-height:26px;">3</div>
          </td>
          <td style="padding-left:14px;font-size:13px;color:#0d1f35;line-height:1.6;">
            <strong style="font-weight:500;">Explora el dashboard</strong> — navega por Meteorología, Riego, Pipeline y Alertas desde el menú lateral.
          </td>
        </tr>
      </table>

      <!-- CTA -->
      <table cellpadding="0" cellspacing="0" style="margin:24px auto 8px;">
        <tr>
          <td style="background:#185fa5;border-radius:8px;">
            <a href="{verify_url}" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:500;color:#ffffff;text-decoration:none;">
              Verificar mi cuenta →
            </a>
          </td>
        </tr>
      </table>

      <p style="font-size:12px;color:#5a7290;text-align:center;margin:16px 0 4px;">Si el botón no funciona, copia este enlace en tu navegador:</p>
      <p style="font-size:11px;color:#185fa5;text-align:center;word-break:break-all;margin:0 0 20px;">{verify_url}</p>

      <hr style="border:none;border-top:0.5px solid #dde5ef;margin:0 0 16px;"/>
      <p style="font-size:12px;color:#5a7290;line-height:1.6;margin:0;">
        Este enlace caduca en <strong style="font-weight:500;">24 horas</strong>. Si no has creado esta cuenta, ignora este mensaje.
      </p>

    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="background:#0d3a5e;border-top:0.5px solid #0c447c;padding:28px 40px;text-align:center;">
      <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:12px;">
        <svg width="28" height="34" viewBox="0 0 80 96" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M40 10C40 10 12 40 12 59C12 75.67 24.8 89 40 89C55.2 89 68 75.67 68 59C68 40 40 10 40 10Z" fill="#5ec8f0" opacity="0.7"/>
          <line x1="40" y1="28" x2="40" y2="44" stroke="white" stroke-width="1.5" opacity="0.9"/>
          <line x1="40" y1="44" x2="52" y2="56" stroke="white" stroke-width="1.5" opacity="0.9"/>
          <line x1="40" y1="44" x2="28" y2="58" stroke="white" stroke-width="1.5" opacity="0.9"/>
          <circle cx="40" cy="28" r="2.5" fill="white" opacity="0.95"/>
          <circle cx="40" cy="44" r="2.5" fill="white" opacity="0.95"/>
          <circle cx="52" cy="56" r="2.5" fill="white" opacity="0.95"/>
          <circle cx="28" cy="58" r="2.5" fill="white" opacity="0.95"/>
        </svg>
        <span style="color:#fff;font-size:18px;font-weight:500;">aquant<span style="color:#5ec8f0;">IA</span>lab</span>
      </div>
      <p style="font-size:11px;color:#5ec8f0;letter-spacing:0.5px;margin:0 0 12px;">Agua inteligente para una agricultura sostenible</p>
      <p style="font-size:12px;color:#7fb8d8;margin:0 0 4px;line-height:1.6;">Has recibido este email porque acabas de crear una cuenta en Aquantia.</p>
      <p style="font-size:12px;color:#7fb8d8;margin:0;line-height:1.6;">
        <a href="https://aquantialab.com" style="color:#5ec8f0;text-decoration:none;">aquantialab.com</a>
        &nbsp;·&nbsp; Lanzarote, Canarias &nbsp;·&nbsp;
        <a href="mailto:{_SMTP_USER}" style="color:#5ec8f0;text-decoration:none;">{_SMTP_USER}</a>
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>"""

    text = (
        f"¡Bienvenido a Aquantia, {name}!\n\n"
        f"Verifica tu cuenta accediendo a este enlace (caduca en 24 h):\n{verify_url}\n\n"
        "Una vez verificada podrás vincular tu dispositivo y explorar el dashboard.\n\n"
        "Si no has creado esta cuenta, ignora este mensaje.\n\n"
        "© 2025 Aquantia · aquantialab.com · Lanzarote, Canarias"
    )

    _send_async(to_email, "Confirma tu cuenta en Aquantia", html, text)


def send_farewell_email(to_email: str, display_name: str) -> None:
    """Envía un email de despedida cuando el usuario elimina su cuenta."""
    if not _SMTP_HOST or not _SMTP_USER:
        logger.warning("[email] SMTP no configurado — omitiendo email de despedida")
        return

    name = display_name or to_email.split("@")[0]

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hasta pronto — Aquantia</title>
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
              <p style="margin:0 0 8px;font-size:24px;font-weight:700;color:#011f42;">Hasta pronto, {name}</p>
              <p style="margin:0 0 24px;font-size:15px;color:#3d506a;line-height:1.6;">
                Tu cuenta en Aquantia ha sido eliminada correctamente. Todos tus datos y dispositivos vinculados han sido borrados de nuestros sistemas.
              </p>
              <p style="margin:0 0 28px;font-size:15px;color:#3d506a;line-height:1.6;">
                Ha sido un placer acompañarte en la monitorización de tu finca. Si algún día decides volver, estaremos aquí.
              </p>

              <hr style="border:none;border-top:1px solid #e8edf2;margin:0 0 24px;" />
              <p style="margin:0;font-size:12px;color:#8a9aaa;line-height:1.6;">
                Si no has solicitado esta eliminación o crees que es un error, contáctanos en <a href="mailto:{_SMTP_USER}" style="color:#0c8ecc;">{_SMTP_USER}</a>.
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
        f"Hasta pronto, {name}.\n\n"
        "Tu cuenta en Aquantia ha sido eliminada correctamente. "
        "Todos tus datos y dispositivos vinculados han sido borrados de nuestros sistemas.\n\n"
        "Ha sido un placer acompañarte. Si algún día decides volver, estaremos aquí.\n\n"
        f"Si no has solicitado esta eliminación, contáctanos en {_SMTP_USER}.\n\n"
        "© 2025 Aquantia · aquantialab.com"
    )

    _send_async(to_email, "Hasta pronto — tu cuenta en Aquantia ha sido eliminada", html, text)
