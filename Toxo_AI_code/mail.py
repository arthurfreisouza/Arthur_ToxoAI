import logging
import os

import resend

resend.api_key = os.environ.get("RESEND_API_KEY", "")

_FROM_NAME = os.getenv("EMAIL_FROM_NAME", "IA-Toxo")
_FROM_EMAIL = os.getenv("EMAIL_FROM", "")
_EXPIRE_HOURS = int(os.getenv("VERIFICATION_TOKEN_EXPIRE_HOURS", "24"))
_FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:8080")

logger = logging.getLogger(__name__)


def _build_verification_html(username: str, verify_url: str) -> str:
    return f"""\
<!doctype html>
<html>
  <body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; background: #f4f5f7; padding: 24px;">
    <table align="center" cellpadding="0" cellspacing="0" width="520"
           style="background: white; border-radius: 12px; padding: 32px;">
      <tr><td>
        <h2 style="margin: 0 0 16px; color: #1a1a1a;">Welcome to IA-Toxo, {username}</h2>
        <p style="color: #374151; line-height: 1.5;">
          Please confirm your email address to activate your account.
        </p>
        <p style="margin: 28px 0;">
          <a href="{verify_url}"
             style="background: linear-gradient(135deg, #667eea, #764ba2); color: white;
                    padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Verify my email
          </a>
        </p>
        <p style="color: #6b7280; font-size: 13px;">
          Or paste this URL in your browser:<br>
          <a href="{verify_url}" style="color: #667eea; word-break: break-all;">{verify_url}</a>
        </p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">
          This link expires in {_EXPIRE_HOURS} hours. If you didn't sign up, ignore this email.
        </p>
      </td></tr>
    </table>
  </body>
</html>
"""


def send_verification_email(*, to: str, username: str, token: str) -> None:
    verify_url = f"{_FRONTEND_URL.rstrip('/')}/verify.html?token={token}"
    html = _build_verification_html(username=username, verify_url=verify_url)
    try:
        resend.Emails.send({
            "from": f"{_FROM_NAME} <{_FROM_EMAIL}>",
            "to": [to],
            "subject": "Verify your IA-Toxo account",
            "html": html,
        })
    except Exception:
        logger.exception("Verification email dispatch failed for %s", to)
