import asyncio
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import hasher
from app.mail import message
from app.models import AuthToken, RateBucket, Session, User
from app.rate_limits import account
from app.recovery import consume, issue
from app.security import new_token
from tests.conftest import legacy_register as register
from tests.conftest import settings, start_registration, unsafe, verified_register
from tests.test_projects import create

pytestmark = pytest.mark.integration


def latest(app, purpose="verify", email="student@example.com"):
    subject = "Verify" if purpose == "verify" else "Reset"
    mail = next(
        m
        for m in reversed(app.state.outbox)
        if m["To"] == email and m["Subject"].startswith(subject)
    )
    return re.search(
        r"#token=([A-Za-z0-9_-]{43})", mail.get_body(preferencelist=("plain",)).get_content()
    ).group(1)


async def test_limits_persist_failed_auth_shared_ip_and_spoofing(client, database_app):
    database_app.state.settings.rate_login_limit = 2
    for _ in range(2):
        assert (
            await unsafe(
                client,
                "POST",
                "/auth/login",
                json={"email": "missing@example.com", "password": "incorrect"},
            )
        ).status_code == 401
    result = await unsafe(
        client,
        "POST",
        "/auth/login",
        json={"email": "MISSING@EXAMPLE.COM", "password": "incorrect"},
    )
    assert result.status_code == 429 and int(result.headers["Retry-After"]) > 0
    assert result.json()["detail"] == "rate_limited"
    assert (
        await unsafe(
            client,
            "POST",
            "/auth/login",
            json={"email": "another@example.com", "password": "incorrect"},
        )
    ).status_code == 401
    database_app.state.settings.rate_ip_limit = 5
    client.headers["X-Forwarded-For"] = "203.0.113.15"
    assert (await start_registration(client)).status_code == 202
    client.headers["X-Forwarded-For"] = "203.0.113.99"
    assert (await start_registration(client, "different@example.com")).status_code == 429
    async with database_app.state.session_factory() as db:
        buckets = list(await db.scalars(select(RateBucket)))
        assert all(len(b.key) == 64 and "@" not in b.key for b in buckets)


async def test_atomic_counters_across_independent_connections(database_app):
    async def attempt():
        try:
            await account(database_app.state.session_factory, "test-key", [("same", 7)], 60)
            return 200
        except HTTPException as exc:
            return exc.status_code

    results = await asyncio.gather(*(attempt() for _ in range(20)))
    assert results.count(200) == 7 and results.count(429) == 13
    async with database_app.state.session_factory() as db:
        assert await db.scalar(select(RateBucket.count)) == 8
        await db.execute(
            update(RateBucket).values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
        )
        await db.commit()
    assert await attempt() == 200


async def test_generic_recovery_with_mail_failure_for_existing_account(client, database_app):
    await register(client)

    async def fail(*args):
        raise OSError("do not expose SMTP details")

    database_app.state.send_email = fail
    assert (await client.get("/api/v1/auth/me")).status_code == 200
    results = [
        await unsafe(client, "POST", "/auth/password-reset/request", json={"email": email})
        for email in ("student@example.com", "missing@example.com")
    ]
    assert results[0].status_code == results[1].status_code == 200
    assert results[0].json() == results[1].json()


async def test_password_reset_revokes_all_sessions_without_verifying(client, database_app):
    await register(client)
    old = client.cookies.get("cc_session")
    await unsafe(
        client,
        "POST",
        "/auth/login",
        json={"email": "student@example.com", "password": "fictional-test-password-123"},
    )
    await unsafe(
        client, "POST", "/auth/password-reset/request", json={"email": "student@example.com"}
    )
    token = latest(database_app, "reset")
    assert (await client.get("/api/v1/auth/password-reset/confirm")).status_code == 405
    response = await unsafe(
        client,
        "POST",
        "/auth/password-reset/confirm",
        json={"token": token, "password": "new-fictional-password-123"},
    )
    assert response.status_code == 200
    assert (await client.get("/api/v1/auth/me")).status_code == 401
    client.cookies.set("cc_session", old, domain="localhost.local", path="/")
    assert (await client.get("/api/v1/auth/me")).status_code == 401
    async with database_app.state.session_factory() as db:
        user = await db.scalar(select(User))
        assert user.email_verified_at is None
        assert hasher.verify(user.password_hash, "new-fictional-password-123")
        assert (
            await db.scalar(
                select(func.count()).select_from(Session).where(Session.revoked_at.is_(None))
            )
            == 0
        )
    assert (
        await unsafe(
            client,
            "POST",
            "/auth/login",
            json={"email": "student@example.com", "password": "fictional-test-password-123"},
        )
    ).status_code == 401
    assert (
        await unsafe(
            client,
            "POST",
            "/auth/login",
            json={"email": "student@example.com", "password": "new-fictional-password-123"},
        )
    ).status_code == 200


async def test_expired_reused_wrong_purpose_and_latest_tokens(client, database_app):
    await register(client)
    first = latest(database_app)
    await unsafe(
        client, "POST", "/auth/verification/request", json={"email": "student@example.com"}
    )
    second = latest(database_app)
    for token in (first, new_token()):
        assert (
            await unsafe(client, "POST", "/auth/verification/confirm", json={"token": token})
        ).status_code == 400
    assert (
        await unsafe(
            client,
            "POST",
            "/auth/password-reset/confirm",
            json={"token": second, "password": "new-fictional-password-123"},
        )
    ).status_code == 400
    assert (
        await unsafe(client, "POST", "/auth/verification/confirm", json={"token": second})
    ).status_code == 200
    assert (
        await unsafe(client, "POST", "/auth/verification/confirm", json={"token": second})
    ).status_code == 400
    await unsafe(
        client, "POST", "/auth/password-reset/request", json={"email": "student@example.com"}
    )
    async with database_app.state.session_factory() as db:
        await db.execute(
            update(AuthToken).values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
        )
        await db.commit()
    assert (
        await unsafe(
            client,
            "POST",
            "/auth/password-reset/confirm",
            json={"token": latest(database_app, "reset"), "password": "new-fictional-password-123"},
        )
    ).status_code == 400


@pytest.mark.parametrize("purpose", ["verify", "reset"])
async def test_concurrent_consumption_and_issuance(client, database_app, purpose):
    response = await register(client)
    from uuid import UUID

    user_id = UUID(response.json()["id"])

    async def issue_one():
        async with database_app.state.session_factory() as db:
            return await issue(db, user_id, purpose, 600)

    tokens = await asyncio.gather(issue_one(), issue_one())
    async with database_app.state.session_factory() as db:
        active = list(
            await db.scalars(
                select(AuthToken).where(
                    AuthToken.purpose == purpose, AuthToken.consumed_at.is_(None)
                )
            )
        )
        assert len(active) == 1
    from app.security import token_hash

    token = next(t for t in tokens if token_hash(t) == active[0].token_hash)

    async def consume_one():
        async with database_app.state.session_factory() as db:
            try:
                await consume(db, token, purpose, "new-fictional-password-123")
                return 200
            except HTTPException as exc:
                return exc.status_code

    assert sorted(await asyncio.gather(consume_one(), consume_one())) == [200, 400]


async def test_verification_permissions_csrf_and_identity(client, database_app):
    await register(client)
    token = latest(database_app)
    assert (await create(client, publish=True)).status_code == 403
    assert (await create(client, publish=False)).status_code == 201
    assert (
        await client.post("/api/v1/auth/verification/confirm", json={"token": token})
    ).status_code == 403
    owner = (await verified_register(client, "owner@example.com")).json()["id"]
    project = (await create(client, publish=True)).json()["id"]
    await unsafe(client, "POST", "/auth/verification/confirm", json={"token": token})
    assert (await client.get("/api/v1/auth/me")).json()["id"] == owner
    await register(client, "unverified@example.com")
    detail = (await client.get(f"/api/v1/projects/{project}")).json()
    from tests.test_applications import submission

    assert (
        await unsafe(
            client,
            "POST",
            f"/projects/{project}/applications",
            json=submission(detail["roles"][0]["id"]),
        )
    ).status_code == 403
    assert (await client.get("/api/v1/profiles/me")).json()["emailVerifiedAt"] is None
    assert (
        await unsafe(client, "PATCH", "/profiles/me", json={"campus": "New Campus"})
    ).status_code == 200


async def test_reset_rollback_is_atomic(client, database_app, monkeypatch):
    await register(client)
    await unsafe(
        client, "POST", "/auth/password-reset/request", json={"email": "student@example.com"}
    )
    token = latest(database_app, "reset")
    async with database_app.state.session_factory() as db:
        before = (await db.scalar(select(User))).password_hash
    original = AsyncSession.commit

    async def fail(self):
        await self.flush()
        raise SQLAlchemyError("simulated write failure")

    monkeypatch.setattr(AsyncSession, "commit", fail)
    async with database_app.state.session_factory() as db:
        with pytest.raises(SQLAlchemyError):
            await consume(db, token, "reset", "new-fictional-password-123")
    monkeypatch.setattr(AsyncSession, "commit", original)
    async with database_app.state.session_factory() as db:
        assert (await db.scalar(select(User))).password_hash == before
        assert await db.scalar(select(Session.revoked_at)) is None
        assert (
            await db.scalar(select(AuthToken.consumed_at).where(AuthToken.purpose == "reset"))
            is None
        )


async def test_issuance_failure_rolls_back_and_keeps_public_response_generic(
    client, database_app, monkeypatch
):
    await register(client)
    from app import recovery

    async def fail_issue(db, *args):
        await db.execute(update(AuthToken).values(consumed_at=func.now()))
        raise SQLAlchemyError("simulated token write failure")

    monkeypatch.setattr(recovery, "issue", fail_issue)
    existing = await unsafe(
        client, "POST", "/auth/password-reset/request", json={"email": "student@example.com"}
    )
    absent = await unsafe(
        client, "POST", "/auth/password-reset/request", json={"email": "absent@example.com"}
    )
    assert existing.status_code == absent.status_code == 200
    assert existing.json() == absent.json()
    async with database_app.state.session_factory() as db:
        assert await db.scalar(select(AuthToken.consumed_at)) is None


async def test_migrate_existing_users_remain_unverified(client, database_app):
    await verified_register(client)
    project = (await create(client, publish=True)).json()["id"]
    async with database_app.state.engine.begin() as conn:
        config = Config(str(Path(__file__).parents[1] / "alembic.ini"))

        def migrate(connection):
            config.attributes["connection"] = connection
            command.downgrade(config, "0003_applications")
            command.upgrade(config, "head")

        await conn.run_sync(migrate)
    assert (await client.get("/api/v1/auth/me")).json()["emailVerifiedAt"] is None
    assert (await client.get(f"/api/v1/projects/{project}")).status_code == 200
    assert (await create(client, publish=True)).status_code == 403
    assert (
        await unsafe(
            client, "PATCH", f"/projects/{project}/recruitment", json={"recruitment": "closed"}
        )
    ).status_code == 200


async def test_body_and_schema_limits_before_counter_creation(client, database_app):
    response = await unsafe(client, "POST", "/auth/register", content="x" * 9000)
    assert response.status_code == 413
    assert (
        await unsafe(
            client, "POST", "/auth/login", json={"email": "x" * 1000, "password": "x" * 1000}
        )
    ).status_code == 422
    async with database_app.state.session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(RateBucket)) == 0


def test_templates_configured_origin_and_escaping():
    config = settings()
    for purpose in ("verify", "reset"):
        mail = message(config, "fictional@example.com", purpose, new_token())
        plain = mail.get_body(preferencelist=("plain",)).get_content()
        assert "http://localhost:3000/" in plain and "#token=" in plain
        assert "expires" in plain and "Ignore this email" in plain
        assert mail.get_body(preferencelist=("html",)) is not None


@pytest.mark.parametrize(
    "path,payload",
    [
        ("/auth/login", {"email": "fictional@example.com", "password": "incorrect"}),
        (
            "/auth/register",
            {
                "email": "fictional@example.com",
                "name": "Fictional Student",
                "password": "fictional-password-123",
                "confirmPassword": "fictional-password-123",
            },
        ),
        ("/auth/password-reset/request", {"email": "fictional@example.com"}),
        ("/auth/verification/request", {"email": "fictional@example.com"}),
        (
            "/auth/password-reset/confirm",
            {"token": "not-a-link", "password": "fictional-password-123"},
        ),
        ("/auth/verification/confirm", {"token": "not-a-link"}),
    ],
)
async def test_every_auth_action_requires_csrf_and_has_its_own_limit(
    client, database_app, path, payload
):
    config = database_app.state.settings
    config.rate_login_limit = config.rate_signup_limit = config.rate_email_limit = (
        config.rate_token_limit
    ) = 1
    assert (await client.post("/api/v1" + path, json=payload)).status_code == 403
    assert (await unsafe(client, "POST", path, json=payload)).status_code != 429
    limited = await unsafe(client, "POST", path, json=payload)
    assert limited.status_code == 429 and int(limited.headers["Retry-After"]) > 0
