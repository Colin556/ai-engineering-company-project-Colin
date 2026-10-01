"""Transactional email delivery through Resend (https://resend.com/docs/api-reference).

The API key is read from the RESEND_API_KEY environment variable only. Sending
runs as a FastAPI background task, so failures are logged, never raised.
"""

from __future__ import annotations

import html
import json
import logging
import urllib.error
import urllib.request

from core import EMAIL_FROM, PASSWORD_RESET_TOKEN_EXPIRE_MINUTES, RESEND_API_KEY

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"
REQUEST_TIMEOUT_SECONDS = 10


def _send_email(to: str, subject: str, html_body: str, text_body: str) -> None:
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY is not set; email '%s' was not sent.", subject)
        return

    request = urllib.request.Request(
        RESEND_API_URL,
        data=json.dumps(
            {
                "from": EMAIL_FROM,
                "to": [to],
                "subject": subject,
                "html": html_body,
                "text": text_body,
            }
        ).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
            # Resend rejects requests that carry the default Python-urllib agent.
            "User-Agent": "brasaland-api/0.1",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS):
            pass
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        logger.error(
            "Resend rejected email '%s' (HTTP %s): %s", subject, exc.code, detail
        )
    except (urllib.error.URLError, TimeoutError) as exc:
        logger.error("Could not reach Resend for email '%s': %s", subject, exc)


def send_password_reset_email(to: str, reset_url: str) -> None:
    minutes = PASSWORD_RESET_TOKEN_EXPIRE_MINUTES
    safe_url = html.escape(reset_url, quote=True)
    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reset your password</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#1c1917;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #d6d3d1;border-radius:8px;">
<tr><td style="padding:24px;">
<p style="margin:0 0 16px;font-size:14px;font-weight:bold;color:#78716c;">Brasaland Backoffice</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">Reset your password</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:1.5;">We received a request to reset your password. Tap the button below to choose a new one. This link expires in {minutes} minutes and can only be used once.</p>
<p style="margin:0 0 24px;text-align:center;">
<a href="{safe_url}" style="display:inline-block;padding:14px 28px;background:#1c1917;color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;font-weight:bold;">Reset password</a>
</p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#57534e;">If the button does not work, copy this link into your browser:</p>
<p style="margin:0 0 24px;font-size:13px;line-height:1.5;word-break:break-all;"><a href="{safe_url}" style="color:#1c1917;">{safe_url}</a></p>
<p style="margin:0;font-size:14px;line-height:1.5;color:#57534e;">If you did not request this, you can ignore this email; your password will not change.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""
    text_body = (
        "Reset your Brasaland Backoffice password\n\n"
        f"Open this link to choose a new password (expires in {minutes} minutes, single use):\n"
        f"{reset_url}\n\n"
        "If you did not request this, you can ignore this email."
    )
    _send_email(to, "Reset your Brasaland password", html_body, text_body)
