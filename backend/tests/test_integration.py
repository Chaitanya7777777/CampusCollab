import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select, text, update

from app.auth import hasher
from app.db import Base
from app.models import Profile, Session, Skill, User
from app.security import token_hash
from app.skills import seed_skills
from tests.conftest import register, unsafe

pytestmark = pytest.mark.integration
PASSWORD = "fictional-test-password-123"


async def test_empty_database_migration_matches_models_and_seed_is_idempotent(database_app):
    async with database_app.state.engine.connect() as connection:
        assert (
            await connection.scalar(text("SELECT version_num FROM alembic_version"))
            == "0003_applications"
        )
        differences = await connection.run_sync(
            lambda conn: compare_metadata(MigrationContext.configure(conn), Base.metadata)
        )
        assert differences == []
    async with database_app.state.session_factory() as db:
        before = list(await db.scalars(select(Skill.id).order_by(Skill.slug)))
        await seed_skills(db)
        assert list(await db.scalars(select(Skill.id).order_by(Skill.slug))) == before
        assert len(before) == 28


async def test_registration_normalization_sessions_and_response_privacy(client, database_app):
    response = await register(client, " STUDENT@Example.com ")
    assert response.status_code == 201
    assert response.json()["email"] == "student@example.com"
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=lax" in response.headers["set-cookie"]
    cookie = client.cookies.get("cc_session")
    async with database_app.state.session_factory() as db:
        user = await db.scalar(select(User))
        session = await db.scalar(select(Session))
        assert hasher.verify(user.password_hash, PASSWORD)
        assert session.token_hash == token_hash(cookie) and session.token_hash != cookie
        assert await db.scalar(select(func.count()).select_from(Profile)) == 1
    for path in ("/auth/me", "/profiles/me"):
        result = await client.get("/api/v1" + path)
        assert result.status_code == 200
        assert not {"password", "password_hash", "token_hash", "session"} & result.json().keys()
        assert cookie not in result.text and user.password_hash not in result.text
    assert (await register(client)).status_code == 409


async def test_concurrent_duplicate_registration_is_atomic(database_app):
    async def attempt():
        async with AsyncClient(
            transport=ASGITransport(app=database_app),
            base_url="http://localhost:8000",
            headers={"Origin": "http://localhost:3000"},
        ) as c:
            return await register(c)

    results = await asyncio.gather(attempt(), attempt())
    assert sorted(result.status_code for result in results) == [201, 409]
    async with database_app.state.session_factory() as db:
        for model in (User, Profile, Session):
            assert await db.scalar(select(func.count()).select_from(model)) == 1


async def test_login_generic_failures_logout_only_current_session_and_expiry(client, database_app):
    await register(client)
    first_token = client.cookies.get("cc_session")
    errors = []
    for email in ("student@example.com", "absent@example.com"):
        result = await unsafe(
            client, "POST", "/auth/login", json={"email": email, "password": "wrong"}
        )
        assert result.status_code == 401
        errors.append(result.json())
    assert errors[0] == errors[1]
    result = await unsafe(
        client, "POST", "/auth/login", json={"email": "student@example.com", "password": PASSWORD}
    )
    assert result.status_code == 200
    second_token = client.cookies.get("cc_session")
    assert first_token != second_token
    assert (await unsafe(client, "POST", "/auth/logout")).status_code == 204
    assert client.cookies.get("cc_session") is None
    assert (await client.get("/api/v1/auth/me")).status_code == 401
    assert (await unsafe(client, "POST", "/auth/logout")).status_code == 204
    client.cookies.set("cc_session", second_token)
    assert (await client.get("/api/v1/auth/me")).status_code == 401
    client.cookies.set("cc_session", first_token)
    assert (await client.get("/api/v1/auth/me")).status_code == 200
    async with database_app.state.session_factory() as db:
        await db.execute(
            update(Session)
            .where(Session.token_hash == token_hash(first_token))
            .values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
        )
        await db.commit()
    assert (await client.get("/api/v1/auth/me")).status_code == 401


async def test_profile_persistence_unknown_skills_atomicity_and_null_semantics(client):
    await register(client)
    response = await unsafe(
        client,
        "PATCH",
        "/profiles/me",
        json={
            "name": "Updated Student",
            "campus": "Fictional University",
            "department": "Computing",
            "semester": "3",
            "bio": "Building student projects together.",
            "github": "https://github.com/example",
            "skillIds": ["react", "python", "react"],
        },
    )
    assert response.status_code == 200
    assert response.json()["skillIds"] == ["python", "react"]
    before = (await client.get("/api/v1/profiles/me")).json()
    invalid = await unsafe(
        client, "PATCH", "/profiles/me", json={"name": "Should Roll Back", "skillIds": ["missing"]}
    )
    assert invalid.status_code == 422
    assert (await client.get("/api/v1/profiles/me")).json() == before
    cleared = await unsafe(client, "PATCH", "/profiles/me", json={"github": None, "skillIds": []})
    assert cleared.status_code == 200
    assert cleared.json()["github"] is None and cleared.json()["skillIds"] == []
    assert cleared.json()["campus"] == before["campus"]
    assert (await client.get("/api/v1/auth/me")).json()["name"] == "Updated Student"


async def test_identity_is_session_derived_and_profiles_are_isolated(client):
    first = (await register(client)).json()
    await unsafe(client, "PATCH", "/profiles/me", json={"campus": "First University"})
    second = await register(client, "second@example.com")
    assert second.status_code == 201
    assert second.json()["id"] != first["id"]
    assert (await client.get("/api/v1/profiles/me")).json()["campus"] is None
    assert (
        await unsafe(client, "PATCH", "/profiles/me", json={"id": first["id"], "name": "Imposter"})
    ).status_code == 422


async def test_authentication_endpoints_require_valid_csrf(client):
    data = {"name": "Student", "email": "student@example.com", "password": PASSWORD}
    assert (await client.post("/api/v1/auth/register", json=data)).status_code == 403
    assert (await register(client)).status_code == 201
    assert (await client.post("/api/v1/auth/login", json=data)).status_code == 403
    assert (await client.post("/api/v1/auth/logout")).status_code == 403
    assert (await client.patch("/api/v1/profiles/me", json={"name": "Changed"})).status_code == 403
    assert (await client.get("/health/ready")).json() == {"status": "ready"}


async def test_failed_database_write_rolls_back_profile_and_skills(client, database_app):
    assert (await register(client)).status_code == 201
    await unsafe(client, "PATCH", "/profiles/me", json={"skillIds": ["react"]})
    before = (await client.get("/api/v1/profiles/me")).json()
    async with database_app.state.engine.begin() as connection:
        await connection.execute(
            text(
                "ALTER TABLE profiles ADD CONSTRAINT test_failure CHECK (name <> 'Forced Failure')"
            )
        )
    response = await unsafe(
        client, "PATCH", "/profiles/me", json={"name": "Forced Failure", "skillIds": ["python"]}
    )
    assert response.status_code == 503
    assert "test_failure" not in response.text
    assert (await client.get("/api/v1/profiles/me")).json() == before


async def test_failed_registration_rolls_back_all_records(client, database_app):
    async with database_app.state.engine.begin() as connection:
        await connection.execute(
            text(
                "ALTER TABLE profiles ADD CONSTRAINT test_failure "
                "CHECK (name <> 'Fictional Student')"
            )
        )
    response = await register(client)
    assert response.status_code == 503
    assert client.cookies.get("cc_session") is None
    async with database_app.state.session_factory() as db:
        for model in (User, Profile, Session):
            assert await db.scalar(select(func.count()).select_from(model)) == 0
