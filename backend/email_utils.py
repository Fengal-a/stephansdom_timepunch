import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

SMTP_USER     = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
APP_URL       = os.environ.get("APP_URL", "https://domstempel.at")


def _send(to: str, subject: str, html: str):
    if not SMTP_USER or not SMTP_PASSWORD:
        return
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"TimePunch <{SMTP_USER}>"
    msg["To"]      = to
    msg.attach(MIMEText(html, "html"))
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
        s.login(SMTP_USER, SMTP_PASSWORD)
        s.sendmail(SMTP_USER, to, msg.as_string())


def _link_button(url: str, label: str) -> str:
    return (
        f'<a href="{url}" style="display:inline-block;background:#F5620F;color:#fff;'
        f'padding:12px 28px;text-decoration:none;border-radius:4px;font-weight:700;">'
        f'{label}</a>'
    )


def send_invite_email(to: str, name: str, token: str):
    link = f"{APP_URL}/reset-password?token={token}"
    html = f"""
    <div style="font-family:monospace;max-width:480px;margin:0 auto;padding:32px;background:#161616;color:#EDEDED;border-radius:6px;">
      <h2 style="color:#F5620F;margin:0 0 20px;">Willkommen bei TimePunch</h2>
      <p>Hallo {name},</p>
      <p>Ihr Konto wurde erstellt. Bitte setzen Sie Ihr Passwort, um sich anzumelden:</p>
      <div style="margin:24px 0;">{_link_button(link, "Passwort setzen")}</div>
      <p style="color:#6B6B6B;font-size:12px;">Dieser Link ist 48 Stunden gültig.<br>Falls Sie diese E-Mail nicht erwartet haben, kontaktieren Sie Ihren Administrator.</p>
    </div>
    """
    _send(to, "Willkommen bei TimePunch – Passwort setzen", html)


def send_reset_email(to: str, name: str, token: str):
    link = f"{APP_URL}/reset-password?token={token}"
    html = f"""
    <div style="font-family:monospace;max-width:480px;margin:0 auto;padding:32px;background:#161616;color:#EDEDED;border-radius:6px;">
      <h2 style="color:#F5620F;margin:0 0 20px;">Passwort zurücksetzen</h2>
      <p>Hallo {name},</p>
      <p>Sie haben eine Anfrage zum Zurücksetzen Ihres Passworts gestellt:</p>
      <div style="margin:24px 0;">{_link_button(link, "Passwort zurücksetzen")}</div>
      <p style="color:#6B6B6B;font-size:12px;">Dieser Link ist 1 Stunde gültig.<br>Falls Sie diese Anfrage nicht gestellt haben, können Sie diese E-Mail ignorieren.</p>
    </div>
    """
    _send(to, "TimePunch – Passwort zurücksetzen", html)
