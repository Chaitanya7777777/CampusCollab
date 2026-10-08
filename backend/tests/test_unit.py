import time
from contextlib import asynccontextmanager
from io import StringIO
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi import Depends
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from app.main import create_app
from app.schemas import ProfilePatch, RegisterInput
from app.security import require_csrf
from app.skills import catalog
from tests.conftest import settings
from tests.support import guard_test_database


def test_forwarded_addresses_need_explicit_immediate_proxy_trust():
    from types import SimpleNamespace

    from starlette.requests import Request

    from app.rate_limits import client_ip

    config = settings()
    request = Request(
        {
            "type": "http",
            "client": ("127.0.0.1", 1234),
            "headers": [(b"x-forwarded-for", b"192.0.2.1, 203.0.113.7")],
            "app": SimpleNamespace(state=SimpleNamespace(settings=config)),
        }
    )
    assert client_ip(request) == "127.0.0.1"
    config.trusted_proxy_networks = ["127.0.0.1/32"]
    assert client_ip(request) == "203.0.113.7"
    repeated = Request(
        {
            **request.scope,
            "headers": [
                (b"x-forwarded-for", b"192.0.2.1"),
                (b"x-forwarded-for", b"203.0.113.7"),
            ],
        }
    )
    assert client_ip(repeated) == "203.0.113.7"
    with pytest.raises(ValidationError):
        type(config)(**{**config.model_dump(), "trusted_proxy_networks": ["0.0.0.0/0"]})


def test_frontend_email_link_origin_cannot_include_redirects_or_credentials():
    for origin in (
        "https://user:password@example.com",
        "https://example.com/path",
        "https://example.com#token=x",
        "javascript:alert(1)",
    ):
        with pytest.raises(ValidationError):
            type(settings())(**{**settings().model_dump(), "frontend_base_url": origin})


def test_patch_omission_null_and_duplicates():
    assert ProfilePatch().model_dump(exclude_unset=True) == {}
    assert ProfilePatch(campus=None, skillIds=[]).model_dump(exclude_unset=True) == {
        "campus": None,
        "skillIds": [],
    }
    assert ProfilePatch(skillIds=["react", "react"]).skillIds == ["react"]
    for data in (
        {"name": None},
        {"skillIds": None},
        {"semester": "9"},
        {"website": "javascript:alert(1)"},
        {"user_id": "other"},
    ):
        with pytest.raises(ValidationError):
            ProfilePatch(**data)


def test_registration_and_catalog():
    data = RegisterInput(
        name="  Fictional Student  ", email=" Student@EXAMPLE.com ", password="test-password-123"
    )
    assert data.email == "student@example.com"
    assert data.name == "Fictional Student"
    items = list(catalog())
    assert len(items) == len({item["id"] for item in items}) == 28
    assert next(item for item in items if item["name"] == "C++")["slug"] == "c--"
    assert items == list(catalog())


@pytest.mark.parametrize(
    "changes",
    [
        {"allowed_origins": ["*"]},
        {"csrf_secret": "short"},
        {"cookie_samesite": "none"},
        {"app_env": "production"},
        {"database_url": "sqlite:///db"},
    ],
)
def test_configuration_rejects_unsafe_values(changes):
    values = settings().model_dump()
    values.update(changes)
    with pytest.raises(ValidationError):
        type(settings())(_env_file=None, **values)


@pytest.mark.parametrize(
    "url,consent",
    [
        ("postgresql+asyncpg://campuscollab:pw@localhost:5432/campuscollab", "campuscollab_test"),
        ("postgresql+asyncpg://campuscollab_test:pw@localhost:5433/campuscollab_test", None),
        (
            "postgresql+asyncpg://campuscollab_test:pw@remote:5433/campuscollab_test",
            "campuscollab_test",
        ),
    ],
)
def test_database_guard(url, consent):
    with pytest.raises(ValueError):
        guard_test_database(url, consent)


def test_database_guard_rejects_development_alias():
    url = "postgresql+asyncpg://campuscollab_test:pw@localhost:5433/campuscollab_test"
    with pytest.raises(ValueError, match="differ"):
        guard_test_database(url, "campuscollab_test", url.replace("localhost", "127.0.0.1"))


async def test_csrf_bootstrap_origin_tampering_expiry_and_session_binding(monkeypatch):
    app = create_app(settings())

    @app.post("/probe", dependencies=[Depends(require_csrf)])
    async def probe():
        return {"ok": True}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://localhost:8000") as c:
        assert (await c.get("/health/live")).status_code == 200
        assert (await c.get("/api/v1/auth/me")).status_code == 401
        assert (await c.get("/api/v1/profiles/me")).status_code == 401
        assert (await c.get("/api/v1/auth/csrf")).status_code == 403
        c.headers["Origin"] = "http://localhost:3000"
        bootstrap = await c.get("/api/v1/auth/csrf")
        assert "HttpOnly" in bootstrap.headers["set-cookie"]
        token = bootstrap.json()["csrfToken"]
        assert (await c.post("/probe")).status_code == 403
        c.headers["X-CSRF-Token"] = token
        assert (await c.post("/probe")).status_code == 200
        c.headers["X-CSRF-Token"] = token + "x"
        assert (await c.post("/probe")).status_code == 403
        c.headers["X-CSRF-Token"] = token
        c.cookies.set("cc_session", "a" * 43)
        assert (await c.post("/probe")).status_code == 403
        c.cookies.clear()
        token = (await c.get("/api/v1/auth/csrf")).json()["csrfToken"]
        c.headers["X-CSRF-Token"] = token
        now = time.time()
        monkeypatch.setattr("app.security.time.time", lambda: now + 3601)
        assert (await c.post("/probe")).status_code == 403
        c.headers["Origin"] = "https://evil.example"
        assert (await c.post("/probe")).status_code == 403
    await app.state.engine.dispose()


async def test_validation_does_not_echo_password_and_cors():
    app = create_app(settings())
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://localhost:8000",
        headers={"Origin": "http://localhost:3000"},
    ) as c:
        csrf = (await c.get("/api/v1/auth/csrf")).json()["csrfToken"]
        response = await c.post(
            "/api/v1/auth/register",
            headers={"X-CSRF-Token": csrf},
            json={"name": "Student", "email": "student@example.com", "password": "secret"},
        )
        assert response.status_code == 422
        assert "secret" not in response.text
        assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
        assert response.headers["access-control-allow-credentials"] == "true"
    await app.state.engine.dispose()


async def test_readiness_failure_is_safe_and_liveness_independent(monkeypatch):
    app = create_app(settings())

    @asynccontextmanager
    async def unavailable(self):
        raise RuntimeError("private connection details must not escape")
        yield

    monkeypatch.setattr(type(app.state.engine), "connect", unavailable)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://localhost:8000") as c:
        response = await c.get("/health/ready")
        assert response.status_code == 503
        assert response.json() == {"status": "unavailable"}
        assert (await c.get("/health/live")).status_code == 200
    await app.state.engine.dispose()


def test_migration_generates_postgresql_ddl_without_database(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", settings().database_url.get_secret_value())
    monkeypatch.setenv("CSRF_SECRET", settings().csrf_secret.get_secret_value())
    output = StringIO()
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"), output_buffer=output)
    command.upgrade(config, "head", sql=True)
    sql = output.getvalue()
    for table in ("users", "profiles", "sessions", "skills", "user_skills"):
        assert f"CREATE TABLE {table}" in sql
    assert "TIMESTAMP WITH TIME ZONE" in sql
    assert "PRIMARY KEY (user_id, skill_id)" in sql
    assert "uq_users_email" in sql
