import os

import resend

from auth import VERIFICATION_TOKEN_EXPIRE_HOURS

resend.api_key = os.environ.get("RESEND_API_KEY", "")

EMAIL_FROM = os.environ.get("EMAIL_FROM", "ToxoAI <onboarding@resend.dev>")

# Public URL of this API — used to build the verification link in the email.
# In production this should be the domain nginx proxies /api/ on (e.g. https://mychatbotproject.uk).
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000")

# Where to send the user after they click the verification link.
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:8080")


def send_verification_email(to_email: str, username: str, token: str) -> None:
    """Send an account-confirmation email via Resend.

    Raises if RESEND_API_KEY is not configured or the API call fails — registration
    should not silently succeed without the user being able to confirm their email.
    """
    if not resend.api_key:
        raise RuntimeError("RESEND_API_KEY is not configured")

    verify_link = f"{BACKEND_URL}/api/v1/auth/verify-email?token={token}"

    resend.Emails.send({
        "from": EMAIL_FROM,
        "to": to_email,
        "subject": "Confirm your ToxoAI account",
        "html": f"""
            <p>Hi {username},</p>
            <p>Thanks for signing up for ToxoAI. Click the link below to confirm your
            email address and activate your account:</p>
            <p><a href="{verify_link}">Confirm my email</a></p>
            <p>This link expires in {VERIFICATION_TOKEN_EXPIRE_HOURS} hours. If you
            didn't create this account, you can safely ignore this email.</p>
        """,
    })
