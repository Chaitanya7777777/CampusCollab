import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select, update

from app.auth import hasher
from app.models import PendingRegistration, Profile, Session, User
from app.registration import digest
from tests.conftest import signup_code, start_registration, unsafe

pytestmark = pytest.mark.integration


async def counts(app):
    async with app.state.session_factory() as db:
        return [
            await db.scalar(select(func.count()).select_from(model))
            for model in (User, Profile, Session)
        ]


async def pending(client, app):
    response = await start_registration(client)
    assert response.status_code == 202
    return response.json(), signup_code(app)


async def confirm(client, row, code):
    return await unsafe(
        client,
        "POST",
        "/auth/register/confirm",
        json={"registrationId": row["registrationId"], "code": code},
    )


async def test_pending_no_account_then_verified_session_and_no_replay(
    client, database_app, monkeypatch
):
    # Deterministic generator only in this test proves leading zeros are preserved end to end.
    monkeypatch.setattr("app.registration.secrets.randbelow", lambda _: 7)
    row, code = await pending(client, database_app)
    assert len(code) == 6 and code.startswith("0")
    assert await counts(database_app) == [0, 0, 0]
    assert (await client.get("/api/v1/auth/me")).status_code == 401
    async with database_app.state.session_factory() as db:
        stored = await db.get(PendingRegistration, UUID(row["registrationId"]))
        assert stored.code_digest == digest(database_app.state.settings, stored.id, code)
        assert code not in stored.code_digest
        assert hasher.verify(stored.password_hash, "fictional-test-password-123")
    result = await confirm(client, row, code)
    assert result.status_code == 201
    assert result.json()["emailVerifiedAt"]
    assert "HttpOnly" in result.headers["set-cookie"]
    assert await counts(database_app) == [1, 1, 1]
    assert (await confirm(client, row, code)).status_code == 400
    assert await counts(database_app) == [1, 1, 1]
    assert (await client.get("/api/v1/auth/me")).status_code == 200
    await unsafe(client, "POST", "/auth/logout")
    assert (
        await unsafe(
            client,
            "POST",
            "/auth/login",
            json={
                "email": "student@example.com",
                "password": "fictional-test-password-123",
            },
        )
    ).status_code == 200


async def test_wrong_attempts_persist_and_exhaustion_requires_restart(client, database_app):
    row, code = await pending(client, database_app)
    wrong = "000000" if code != "000000" else "111111"
    for attempt in range(5):
        response = await confirm(client, row, wrong)
        assert response.status_code == 400
        async with database_app.state.session_factory() as db:
            assert (
                await db.get(PendingRegistration, UUID(row["registrationId"]))
            ).failed_attempts == attempt + 1
    assert response.json()["detail"] == "registration_exhausted"
    assert (await confirm(client, row, code)).json()["detail"] == "registration_exhausted"
    assert (
        await unsafe(
            client,
            "POST",
            "/auth/register/resend",
            json={
                "registrationId": row["registrationId"],
            },
        )
    ).status_code == 400
    assert await counts(database_app) == [0, 0, 0]
    fresh, new_code = await pending(client, database_app)
    assert (await confirm(client, fresh, new_code)).status_code == 201


async def test_resend_cooldown_superseded_code_budget_and_expiry(client, database_app):
    row, old_code = await pending(client, database_app)
    payload = {"registrationId": row["registrationId"]}
    response = await unsafe(client, "POST", "/auth/register/resend", json=payload)
    assert response.status_code == 429 and int(response.headers["Retry-After"]) > 0
    async with database_app.state.session_factory() as db:
        await db.execute(
            update(PendingRegistration).values(issued_at=datetime.now(UTC) - timedelta(seconds=61))
        )
        await db.commit()
    response = await unsafe(client, "POST", "/auth/register/resend", json=payload)
    assert response.status_code == 200 and response.json()["expiresAt"] == row["expiresAt"]
    new_code = signup_code(database_app)
    assert (await confirm(client, row, old_code)).json()["detail"] == "incorrect_code"
    async with database_app.state.session_factory() as db:
        stored = await db.get(PendingRegistration, UUID(row["registrationId"]))
        assert stored.resend_count == 1 and stored.failed_attempts == 1
        stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        await db.commit()
    assert (await confirm(client, row, new_code)).json()["detail"] == "registration_expired"
    assert await counts(database_app) == [0, 0, 0]


async def test_restarting_invalidates_old_registration_and_email_limits_span_ids(
    client, database_app
):
    old, old_code = await pending(client, database_app)
    new, code = await pending(client, database_app)
    assert old["registrationId"] != new["registrationId"]
    assert (await confirm(client, old, old_code)).json()["detail"] == "registration_closed"
    database_app.state.settings.rate_token_limit = 2
    wrong = "000000" if code != "000000" else "111111"
    assert (await confirm(client, new, wrong)).status_code == 400
    limited = await confirm(client, new, code)
    assert limited.status_code == 429 and int(limited.headers["Retry-After"]) > 0
    assert await counts(database_app) == [0, 0, 0]


async def test_delivery_failure_preserves_pending_and_resend_recovers(client, database_app):
    capture = database_app.state.send_email

    async def fail(*args):
        raise OSError("private provider detail")

    database_app.state.send_email = fail
    response = await start_registration(client)
    row = response.json()
    assert response.status_code == 202 and row["deliveryStatus"] == "unavailable"
    assert await counts(database_app) == [0, 0, 0]
    database_app.state.send_email = capture
    async with database_app.state.session_factory() as db:
        await db.execute(
            update(PendingRegistration).values(issued_at=datetime.now(UTC) - timedelta(seconds=61))
        )
        await db.commit()
    resent = await unsafe(
        client, "POST", "/auth/register/resend", json={"registrationId": row["registrationId"]}
    )
    assert resent.json()["deliveryStatus"] == "sent"
    assert (await confirm(client, row, signup_code(database_app))).status_code == 201


async def test_confirmation_independent_connections_and_email_uniqueness(client, database_app):
    row, code = await pending(client, database_app)

    async def attempt():
        async with AsyncClient(
            transport=ASGITransport(app=database_app),
            base_url="http://localhost:8000",
            headers={"Origin": "http://localhost:3000"},
        ) as other:
            return (await confirm(other, row, code)).status_code

    assert sorted(await asyncio.gather(attempt(), attempt())) == [201, 400]
    assert await counts(database_app) == [1, 1, 1]
    duplicate, duplicate_code = await pending(client, database_app)
    assert (await confirm(client, duplicate, duplicate_code)).status_code == 409
    assert await counts(database_app) == [1, 1, 1]


async def test_all_signup_routes_csrf_and_old_payload_cannot_bypass(client, database_app):
    old = {
        "name": "Fictional Student",
        "email": "student@example.com",
        "password": "fictional-test-password-123",
    }
    assert (await unsafe(client, "POST", "/auth/register", json=old)).status_code == 422
    assert await counts(database_app) == [0, 0, 0]
    row, code = await pending(client, database_app)
    for path, data in [
        ("", {**old, "confirmPassword": old["password"]}),
        ("/resend", {"registrationId": row["registrationId"]}),
        ("/confirm", {"registrationId": row["registrationId"], "code": code}),
    ]:
        assert (await client.post("/api/v1/auth/register" + path, json=data)).status_code == 403
    assert await counts(database_app) == [0, 0, 0]
