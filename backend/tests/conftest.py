import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from dotenv import dotenv_values
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.config import Settings
from app.main import create_app
from app.skills import seed_skills
from tests.support import exclusive_test_database, guard_test_database

TEST_SECRET = "test-only-csrf-secret-not-for-production-00000"


def settings(url="postgresql+asyncpg://unused:unused@127.0.0.1:5433/campuscollab_test"):
    return Settings(_env_file=None, app_env="test", database_url=url, csrf_secret=TEST_SECRET)


@pytest.fixture
async def database_app():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("PostgreSQL integration blocked: set TEST_DATABASE_URL and ALLOW_TEST_DB_RESET")
    development_url = os.environ.get("DATABASE_URL") or dotenv_values(
        Path(__file__).parents[1] / ".env"
    ).get("DATABASE_URL")
    guard_test_database(url, os.environ.get("ALLOW_TEST_DB_RESET"), development_url)
    app = create_app(settings(url))
    engine = app.state.engine
    try:
        async with exclusive_test_database(engine):
            async with engine.begin() as connection:
                identity = (
                    await connection.execute(text("SELECT current_database(), current_user"))
                ).one()
                assert tuple(identity) == ("campuscollab_test", "campuscollab_test")
                await connection.execute(text("DROP SCHEMA public CASCADE"))
                await connection.execute(text("CREATE SCHEMA public"))
                config = Config(str(Path(__file__).parents[1] / "alembic.ini"))

                def upgrade(sync_connection):
                    config.attributes["connection"] = sync_connection
                    command.upgrade(config, "head")

                await connection.run_sync(upgrade)
            async with app.state.session_factory() as db:
                await seed_skills(db)
            yield app
    finally:
        await engine.dispose()


@pytest.fixture
async def client(database_app):
    async with AsyncClient(
        transport=ASGITransport(app=database_app),
        base_url="http://localhost:8000",
        headers={"Origin": "http://localhost:3000"},
    ) as client:
        yield client


async def unsafe(client, method, path, **kwargs):
    csrf = await client.get("/api/v1/auth/csrf")
    assert csrf.status_code == 200
    return await client.request(
        method, "/api/v1" + path, headers={"X-CSRF-Token": csrf.json()["csrfToken"]}, **kwargs
    )


async def register(client, email="student@example.com"):
    return await unsafe(
        client,
        "POST",
        "/auth/register",
        json={
            "name": "Fictional Student",
            "email": email,
            "password": "fictional-test-password-123",
        },
    )
