"""Explicit SMTP/Brevo boundary; no retry, fallback or sensitive exception logging."""

import asyncio
import json
import logging
from email.headerregistry import Address
from email.message import EmailMessage
from html import escape

import aiosmtplib
import httpx

BREVO_URL = "https://api.brevo.com/v3/smtp/email"


class EmailDeliveryError(Exception):
    """Only fixed diagnostic categories escape the HTTP boundary, never its errors."""

    def __init__(self, reason: str, status: int | None = None):
        super().__init__(reason)
        self.reason = reason
        self.status = status


def message(settings, recipient: str, purpose: str, token: str) -> EmailMessage:
    sender = (
        str(
            Address(
                display_name=settings.brevo_sender_name, addr_spec=str(settings.brevo_sender_email)
            )
        )
        if settings.email_provider == "brevo"
        else settings.smtp_from
    )
    if purpose == "signup":
        title = "Your CampusCollab signup code"
        description = (
            f"Enter this code on the signup form. Registration expires after "
            f"{settings.signup_code_ttl_seconds // 60} minutes from its start; "
            "resends do not extend it. "
            "If you already have an account, log in with your password instead."
        )
        mail = EmailMessage()
        mail["From"], mail["To"], mail["Subject"] = sender, recipient, title
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
    mail["From"], mail["To"], mail["Subject"] = sender, recipient, title
    mail.set_content(f"{title}\n\n{description}\n\n{link}\n\n{ignore}\n")
    mail.add_alternative(
        f"<h1>{escape(title)}</h1><p>{escape(description)}</p>"
        f'<p><a href="{escape(link, quote=True)}">{escape(title)}</a></p>'
        f"<p>{escape(ignore)}</p>",
        subtype="html",
    )
    return mail


async def deliver(settings, mail: EmailMessage):
    if settings.email_provider == "brevo":
        await deliver_brevo(settings, mail)
        return
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


def brevo_client(settings):
    # Request-scoped client: always closed on success, failure and cancellation.
    # Fixed HTTPS endpoint, certificate validation, no proxy/env credentials,
    # redirects or transport retries. No external client is created for SMTP.
    return httpx.AsyncClient(
        timeout=httpx.Timeout(
            settings.brevo_timeout_seconds, connect=min(2, settings.brevo_timeout_seconds)
        ),
        follow_redirects=False,
        trust_env=False,
    )


async def deliver_brevo(settings, mail: EmailMessage):
    html = mail.get_body(preferencelist=("html",))
    payload = {
        "sender": {"email": str(settings.brevo_sender_email), "name": settings.brevo_sender_name},
        "to": [{"email": address.addr_spec} for address in mail["To"].addresses],
        "subject": str(mail["Subject"]),
        # Current Brevo guide specifies one content type per request.
        "htmlContent": html.get_content(),
    }
    try:
        async with asyncio.timeout(settings.brevo_timeout_seconds):
            async with brevo_client(settings) as client:
                async with client.stream(
                    "POST",
                    BREVO_URL,
                    headers={
                        "api-key": settings.brevo_api_key.get_secret_value(),
                        "Accept": "application/json",
                    },
                    json=payload,
                ) as response:
                    raw = bytearray()
                    async for chunk in response.aiter_bytes():
                        raw.extend(chunk)
                        if len(raw) > 65536:
                            raise EmailDeliveryError("malformed_response", response.status_code)
                    try:
                        body = json.loads(raw)
                    except (ValueError, UnicodeError):
                        body = None
                    status = response.status_code
                    if status != 201:
                        code = body.get("code") if isinstance(body, dict) else None
                        reason = {
                            400: "payload_or_sender_rejected",
                            401: "credentials_rejected",
                            402: "quota_exhausted",
                            403: "account_or_sender_restricted",
                            429: "provider_rate_limited",
                        }.get(
                            status,
                            "provider_unavailable" if status >= 500 else "unexpected_response",
                        )
                        if code == "not_enough_credits":
                            reason = "quota_exhausted"
                        elif code == "permission_denied":
                            reason = "account_or_sender_restricted"
                        raise EmailDeliveryError(reason, status)
                    id = body.get("messageId") if isinstance(body, dict) else None
                    if not isinstance(id, str) or not id.strip() or len(id) > 1024:
                        raise EmailDeliveryError("malformed_response", status)
    except (httpx.TimeoutException, TimeoutError):
        raise EmailDeliveryError("timeout_acceptance_unknown") from None
    except httpx.HTTPError:
        raise EmailDeliveryError("network_acceptance_unknown") from None


async def send_safely(request, recipient: str, purpose: str, token: str) -> bool:
    fields = {
        "provider": request.app.state.settings.email_provider,
        "purpose": purpose,
        "request_id": getattr(getattr(request, "state", None), "request_id", None),
    }
    try:
        logging.getLogger("campuscollab").info(
            "authentication_email_attempted", extra={"fields": fields}
        )
        await request.app.state.send_email(
            request.app.state.settings,
            message(request.app.state.settings, recipient, purpose, token),
        )
        logging.getLogger("campuscollab").info(
            "authentication_email_accepted",
            extra={"fields": fields},
        )
        return True  # Provider acceptance, not delivery to the recipient's inbox.
    except EmailDeliveryError as error:
        logging.getLogger("campuscollab").error(
            "authentication_email_delivery_failed",
            extra={"fields": {**fields, "reason": error.reason, "http_status": error.status}},
        )
        return False
    except Exception:
        logging.getLogger("campuscollab").error(
            "authentication_email_delivery_failed",
            extra={"fields": {**fields, "reason": "transport_or_message_failure"}},
        )
        return False
