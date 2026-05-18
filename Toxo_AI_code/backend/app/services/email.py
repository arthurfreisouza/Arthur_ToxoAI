import resend

from app.core.config import settings

resend.api_key = settings.RESEND_API_KEY

_FROM = f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM}>"


def _build_verification_html(username: str, verify_url: str) -> str:
    return f"""\
<!doctype html>
<html>
  <body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; background: #f4f5f7; padding: 24px;">
    <table align="center" cellpadding="0" cellspacing="0" width="520" style="background: white; border-radius: 12px; padding: 32px;">
      <tr><td>
        <h2 style="margin: 0 0 16px; color: #1a1a1a;">Welcome to IA-Toxo, {username}</h2>
        <p style="color: #374151; line-height: 1.5;">
          Please confirm your email to activate your account.
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
          This link expires in {settings.VERIFICATION_TOKEN_EXPIRE_HOURS} hours. If you didn't sign up, ignore this email.
        </p>
      </td></tr>
    </table>
  </body>
</html>
"""


def send_verification_email(*, to: str, username: str, token: str) -> None:
    verify_url = f"{settings.FRONTEND_URL.rstrip('/')}/verify.html?token={token}"
    html = _build_verification_html(username=username, verify_url=verify_url)
    resend.Emails.send(
        {
            "from": _FROM,
            "to": [to],
            "subject": "Verify your IA-Toxo account",
            "html": html,
        }
    )
