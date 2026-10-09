import asyncio
import json
import logging
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID

import httpx
import pytest
from pydantic import ValidationError
from sqlalchemy import func, select

from app import mail
from app.config import Settings
from app.models import PendingRegistration, Profile, Session, User
from tests.conftest import register, settings, start_registration, unsafe


def brevo_settings(**overrides):
    values = settings().model_dump()
    values.update(
        email_provider="brevo",
        brevo_api_key="test-only-provider-key",
        brevo_sender_email="sender@example.com",
        brevo_sender_name="CampusCollab",
        brevo_timeout_seconds=1,
    )
    values.update(overrides)
    return Settings(_env_file=None, **values)


@pytest.fixture
def mock_brevo(monkeypatch):
    """No Brevo network connection can be made by these tests."""
    clients = []

    def install(handler):
        def factory(config):
            client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
            clients.append(client)
            return client

        monkeypatch.setattr(mail, "brevo_client", factory)
        return clients

    return install


@pytest.mark.parametrize("purpose", ["signup", "reset", "verify"])
async def test_brevo_payload_authentication_acceptance_and_cleanup(mock_brevo, purpose):
    config = brevo_settings()
    email = mail.message(config, "recipient@example.com", purpose, "test-content-not-a-real-token")
    calls = []

    def handler(request):
        data = json.loads(request.content)
        # Only booleans in test failure output, never headers or email contents.
        checks = [
            request.method == "POST",
            str(request.url) == mail.BREVO_URL,
            request.headers.get("api-key") == config.brevo_api_key.get_secret_value(),
            request.headers.get("content-type") == "application/json",
            data["sender"] == {"email": "sender@example.com", "name": "CampusCollab"},
            data["to"] == [{"email": "recipient@example.com"}],
            data["subject"] == str(email["Subject"]),
            data["htmlContent"] == email.get_body(preferencelist=("html",)).get_content(),
            "textContent" not in data and "templateId" not in data,
        ]
        assert all(checks), "Brevo request contract mismatch"
        calls.append(True)
        return httpx.Response(201, json={"messageId": "test-message-id"})

    clients = mock_brevo(handler)
    await mail.deliver(config, email)
    assert len(calls) == 1 and clients[0].is_closed


@pytest.mark.parametrize(
    "changes",
    [
        {"email_provider": "unknown"},
        {"brevo_api_key": None},
        {"brevo_api_key": ""},
        {"brevo_api_key": "replace-with-your-private-brevo-api-key"},
        {"brevo_api_key": "invalid\nheader"},
        {"brevo_sender_email": None},
        {"brevo_sender_email": "not-an-email"},
        {"brevo_sender_name": "  "},
        {"brevo_sender_name": "bad\nname"},
        {"brevo_timeout_seconds": 0},
        {"frontend_base_url": "https://example.com/redirect"},
    ],
)
def test_invalid_brevo_configuration(changes):
    with pytest.raises(ValidationError):
        brevo_settings(**changes)


def test_production_brevo_uses_https_not_smtp_tls():
    config = brevo_settings(
        app_env="production",
        cookie_secure=True,
        allowed_origins=["https://campus.example.com"],
        frontend_base_url="https://campus.example.com",
    )
    assert config.smtp_tls == "none" and config.email_timeout_seconds == 1
    with pytest.raises(ValidationError):
        brevo_settings(**{**config.model_dump(), "email_provider": "smtp"})


@pytest.mark.parametrize(
    "status, body, reason",
    [
        (401, {}, "credentials_rejected"),
        (403, {}, "account_or_sender_restricted"),
        (400, {"code": "permission_denied"}, "account_or_sender_restricted"),
        (400, {"code": "not_enough_credits"}, "quota_exhausted"),
        (400, {}, "payload_or_sender_rejected"),
        (402, {}, "quota_exhausted"),
        (429, {}, "provider_rate_limited"),
        (503, {}, "provider_unavailable"),
        (302, {}, "unexpected_response"),
        (200, {"messageId": "test-message-id"}, "unexpected_response"),
        (201, {}, "malformed_response"),
        (201, {"messageId": 123}, "malformed_response"),
        (201, {"messageId": " "}, "malformed_response"),
        (201, [], "malformed_response"),
    ],
)
async def test_provider_errors_are_sanitized_without_retry_or_fallback(
    mock_brevo, monkeypatch, caplog, status, body, reason
):
    calls = []
    smtp_calls = []

    async def smtp(*args, **kwargs):
        smtp_calls.append(True)

    monkeypatch.setattr(mail.aiosmtplib, "send", smtp)

    def handler(request):
        calls.append(True)
        return httpx.Response(status, json=body, headers={"location": "https://elsewhere.invalid"})

    clients = mock_brevo(handler)
    config = brevo_settings()
    request = SimpleNamespace(
        app=SimpleNamespace(
            state=SimpleNamespace(
                settings=config,
                send_email=mail.deliver,
            )
        )
    )
    caplog.set_level(logging.DEBUG)
    # create_app's logger does not propagate, so capture its own records directly.
    logger = logging.getLogger("campuscollab")
    logger.addHandler(caplog.handler)
    try:
        accepted = await mail.send_safely(
            request, "recipient@example.com", "signup", "private-content"
        )
    finally:
        logger.removeHandler(caplog.handler)
    assert not accepted and len(calls) == 1 and not smtp_calls and clients[0].is_closed
    records = [r for r in caplog.records if r.name == "campuscollab"]
    assert records[-1].fields["reason"] == reason
    assert all(
        value not in caplog.text
        for value in (
            "private-content",
            "test-only-provider-key",
            "recipient@example.com",
            "api-key",
        )
    )


@pytest.mark.parametrize("failure", ["read", "connect", "network", "invalid_json", "oversized"])
async def test_network_and_malformed_response_cleanup(mock_brevo, failure):
    calls = []

    def handler(request):
        calls.append(True)
        if failure in ("read", "connect", "network"):
            error = {
                "read": httpx.ReadTimeout,
                "connect": httpx.ConnectTimeout,
                "network": httpx.ConnectError,
            }[failure]
            raise error("private upstream exception text", request=request)
        return httpx.Response(201, content=b"x" * (65537 if failure == "oversized" else 3))

    clients = mock_brevo(handler)
    config = brevo_settings()
    with pytest.raises(mail.EmailDeliveryError) as caught:
        await mail.deliver(
            config, mail.message(config, "recipient@example.com", "reset", "private")
        )
    assert str(caught.value) in (
        "timeout_acceptance_unknown",
        "network_acceptance_unknown",
        "malformed_response",
    )
    assert len(calls) == 1 and clients[0].is_closed


async def test_total_deadline_and_client_policy(mock_brevo):
    config = brevo_settings()
    async with mail.brevo_client(config) as client:
        assert client.timeout.connect == 1 and client.timeout.read == 1
        assert not client.follow_redirects and not client.trust_env
    assert client.is_closed

    async def slow(request):
        await asyncio.sleep(5)
        return httpx.Response(201, json={"messageId": "test"})

    clients = mock_brevo(slow)
    with pytest.raises(mail.EmailDeliveryError, match="timeout_acceptance_unknown"):
        await mail.deliver(
            config, mail.message(config, "recipient@example.com", "verify", "private")
        )
    assert clients[0].is_closed


async def test_smtp_selection_preserves_mailpit_and_never_calls_brevo(monkeypatch):
    calls = []

    async def smtp(message, **kwargs):
        calls.append((kwargs["hostname"], kwargs["port"], kwargs["validate_certs"]))

    def forbidden(*args):
        pytest.fail("SMTP selection must not create a Brevo client")

    monkeypatch.setattr(mail.aiosmtplib, "send", smtp)
    monkeypatch.setattr(mail, "brevo_client", forbidden)
    config = settings()
    await mail.deliver(config, mail.message(config, "recipient@example.com", "signup", "private"))
    assert calls == [("127.0.0.1", 1025, True)]


@pytest.mark.integration
async def test_brevo_recovery_failure_keeps_public_response_generic(
    client, database_app, mock_brevo, caplog
):
    assert (await register(client)).status_code == 201
    database_app.state.settings = brevo_settings(
        database_url=database_app.state.settings.database_url
    )
    database_app.state.send_email = mail.deliver
    calls = []

    def fail(request):
        calls.append(True)
        return httpx.Response(429, json={"message": "private quota information"})

    mock_brevo(fail)
    logger = logging.getLogger("campuscollab")
    logger.addHandler(caplog.handler)
    responses = []
    try:
        for email in ("student@example.com", "unknown@example.com"):
            response = await unsafe(
                client, "POST", "/auth/password-reset/request", json={"email": email}
            )
            responses.append((response.status_code, response.json()))
        events = [(r.getMessage(), getattr(r, "fields", {})) for r in caplog.records]
        failed = [f for e, f in events if e == "authentication_email_delivery_failed"]
        skipped = [f for e, f in events if e == "authentication_email_not_sent"]
        assert failed[-1]["reason"] == "provider_rate_limited"
        assert failed[-1]["request_id"] and failed[-1]["purpose"] == "reset"
        assert skipped[-1]["reason"] == "not_eligible" and skipped[-1]["request_id"]
        assert not any("@" in json.dumps(f) for _, f in events)
    finally:
        logger.removeHandler(caplog.handler)
    assert responses[0] == responses[1] and responses[0][0] == 200 and len(calls) == 1


@pytest.mark.integration
async def test_brevo_signup_failure_resend_preserves_limits_and_atomic_creation(
    client, database_app, mock_brevo
):
    config = brevo_settings(database_url=database_app.state.settings.database_url)
    database_app.state.settings = config
    database_app.state.send_email = mail.deliver
    calls = []
    code = None

    def handler(request):
        import re

        nonlocal code
        calls.append(True)
        payload = json.loads(request.content)
        code = re.search(r"<strong>([0-9]{6})</strong>", payload["htmlContent"]).group(1)
        if len(calls) == 1:
            return httpx.Response(403, json={"message": "private provider details"})
        return httpx.Response(201, json={"messageId": "test"})

    mock_brevo(handler)
    started = await start_registration(client)
    assert started.status_code == 202 and started.json()["deliveryStatus"] == "unavailable"
    id = started.json()["registrationId"]
    payload = {"registrationId": id}
    assert (await unsafe(client, "POST", "/auth/register/resend", json=payload)).status_code == 429
    wrong = "000000" if code != "000000" else "111111"
    assert (
        await unsafe(client, "POST", "/auth/register/confirm", json={**payload, "code": wrong})
    ).status_code == 400
    async with database_app.state.session_factory() as db:
        for model in (User, Profile, Session):
            assert await db.scalar(select(func.count()).select_from(model)) == 0
        row = await db.get(PendingRegistration, UUID(id))
        assert row.failed_attempts == 1
        row.issued_at = datetime.now(UTC) - timedelta(seconds=61)
        await db.commit()
    resent = await unsafe(client, "POST", "/auth/register/resend", json=payload)
    assert resent.json()["deliveryStatus"] == "sent" and len(calls) == 2
    async with database_app.state.session_factory() as db:
        row = await db.get(PendingRegistration, UUID(id))
        assert row.failed_attempts == 1 and row.resend_count == 1
    confirmed = await unsafe(
        client, "POST", "/auth/register/confirm", json={**payload, "code": code}
    )
    assert confirmed.status_code == 201 and confirmed.json()["emailVerifiedAt"]
