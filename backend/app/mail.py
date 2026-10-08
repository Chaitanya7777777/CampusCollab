"""Small SMTP boundary; no durable retry queue or sensitive exception logging."""

import asyncio
import logging
from email.message import EmailMessage
from html import escape

import aiosmtplib


def message(settings, recipient: str, purpose: str, token: str) -> EmailMessage:
    if purpose == "signup":
        title = "Your CampusCollab signup code"
        description = (
            f"Enter this code on the signup form. Registration expires after "
            f"{settings.signup_code_ttl_seconds // 60} minutes from its start; "
            "resends do not extend it. "
            "If you already have an account, log in with your password instead."
        )
        mail = EmailMessage()
        mail["From"], mail["To"], mail["Subject"] = settings.smtp_from, recipient, title
        mail.set_content(
            f"{title}\n\nCode: {token}\n\n{description}\n\n"
            "Ignore this email if you did not request it.\n"
        )
        mail.add_alternative(
            f"<h1>{escape(title)}</h1><p>Code: <strong>{escape(token)}</strong></p>"
            f"<p>{escape(description)}</p><p>Ignore this email if you did not request it.</p>",
            subtype="html",
        )
        return mail
    verify = purpose == "verify"
    title = "Verify your CampusCollab email" if verify else "Reset your CampusCollab password"
    route = "verify-email" if verify else "reset-password"
    ttl = settings.verification_ttl_seconds if verify else settings.reset_ttl_seconds
    link = f"{settings.frontend_base_url.rstrip('/')}/{route}#token={token}"
    description = (
        f"This link expires in {ttl // 60} minutes. Opening it does not change your account."
    )
    ignore = "Ignore this email if you did not request it."
    mail = EmailMessage()
    mail["From"], mail["To"], mail["Subject"] = settings.smtp_from, recipient, title
    mail.set_content(f"{title}\n\n{description}\n\n{link}\n\n{ignore}\n")
    mail.add_alternative(
        f"<h1>{escape(title)}</h1><p>{escape(description)}</p>"
        f'<p><a href="{escape(link, quote=True)}">{escape(title)}</a></p>'
        f"<p>{escape(ignore)}</p>",
        subtype="html",
    )
    return mail


async def deliver(settings, mail: EmailMessage):
    # Total deadline plus per-operation timeout; require certificate validation.
    async with asyncio.timeout(settings.smtp_timeout_seconds):
        await aiosmtplib.send(
            mail,
            hostname=settings.smtp_host,
            local_hostname="campuscollab.local",
            port=settings.smtp_port,
            username=settings.smtp_username,
            password=settings.smtp_password.get_secret_value() if settings.smtp_password else None,
            use_tls=settings.smtp_tls == "tls",
            start_tls=settings.smtp_tls == "starttls",
            timeout=settings.smtp_timeout_seconds,
            validate_certs=True,
        )


async def send_safely(request, recipient: str, purpose: str, token: str) -> bool:
    try:
        await request.app.state.send_email(
            request.app.state.settings,
            message(request.app.state.settings, recipient, purpose, token),
        )
        return True
    except Exception:
        logging.getLogger("campuscollab").error("authentication_email_delivery_failed")
        return False
