import ssl
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from starlette.requests import Request

from app.database_url import connection_options
from app.main import create_app
from app.rate_limits import client_ip
from tests.conftest import settings
from tests.test_brevo import brevo_settings


def production(**changes):
    values = dict(
        app_env="production",
        cookie_secure=True,
        database_tls=True,
        api_proxy_secret="test-only-proxy-credential-00000000000",
        allowed_hosts=["campus.onrender.com"],
        allowed_origins=["https://campus.vercel.app"],
        frontend_base_url="https://campus.vercel.app",
        database_url="postgresql://user:password@ep-test.neon.tech/app?sslmode=require",
    )
    values.update(changes)
    return brevo_settings(**values)


@pytest.mark.parametrize(
    "changes",
    [
        {"api_proxy_secret": None},
        {"api_proxy_secret": "replace-with-secret"},
        {"allowed_hosts": ["*"]},
        {"allowed_hosts": ["localhost"]},
        {"frontend_base_url": "https://localhost"},
        {"cookie_secure": False},
        {"allowed_origins": ["https://other.vercel.app"]},
        {"database_tls": False},
        {"database_url": "postgresql://u:p@ep-test-pooler.neon.tech/db"},
        {"trusted_proxy_networks": ["127.0.0.1/32"]},
        {"cookie_samesite": "none"},
        {"migration_database_url": "postgresql://u:p@other.neon.tech/other"},
    ],
)
def test_production_rejects_unsafe_configuration(changes):
    with pytest.raises(ValidationError):
        production(**changes)


def test_direct_neon_url_has_verified_tls_and_no_libpq_options():
    s = production()
    url, args = connection_options(s.database_url.get_secret_value(), s.database_tls)
    assert url.drivername == "postgresql+asyncpg" and not url.query
    assert args["ssl"].verify_mode == ssl.CERT_REQUIRED and args["ssl"].check_hostname
    _, local = connection_options(settings().database_url.get_secret_value(), False)
    assert "ssl" not in local


@pytest.mark.parametrize(
    "query",
    ["sslmode=disable", "sslmode=prefer", "ssl=false", "channel_binding=require", "host=evil"],
)
def test_unsupported_or_insecure_database_options(query):
    with pytest.raises(ValueError):
        connection_options(f"postgresql://user:password@ep-test.neon.tech/app?{query}", True)


async def test_direct_backend_rejects_spoofed_ip_but_health_remains_public():
    s = settings().model_copy(update={"api_proxy_secret": production().api_proxy_secret})
    app = create_app(s)
    async with AsyncClient(transport=ASGITransport(app), base_url="http://testserver") as client:
        r = await client.get(
            "/api/v1/auth/csrf",
            headers={
                "Origin": "http://localhost:3000",
                "X-Forwarded-For": "8.8.8.8",
                "X-CampusCollab-Client-IP": "8.8.8.8",
            },
        )
        assert r.status_code == 403 and r.headers["cache-control"] == "no-store"
        assert (await client.get("/health/live")).status_code == 200
        headers = {
            "Origin": "http://localhost:3000",
            "X-CampusCollab-Proxy": s.api_proxy_secret.get_secret_value(),
            "X-CampusCollab-Client-IP": "203.0.113.2",
        }
        assert (await client.get("/api/v1/auth/csrf", headers=headers)).status_code == 200
        headers["X-CampusCollab-Client-IP"] = "garbage"
        assert (await client.get("/api/v1/auth/csrf", headers=headers)).status_code == 403
    await app.state.engine.dispose()


def test_authenticated_ip_ignores_forwarded_headers():
    request = Request(
        {
            "type": "http",
            "headers": [(b"x-forwarded-for", b"8.8.8.8")],
            "client": ("127.0.0.1", 123),
            "app": SimpleNamespace(state=SimpleNamespace(settings=production())),
        }
    )
    request.state.verified_client_ip = "203.0.113.9"
    assert client_ip(request) == "203.0.113.9"


def test_startup_never_serves_after_failed_migration(monkeypatch):
    from app import production_start

    monkeypatch.setattr(production_start, "Settings", production)

    def fail(*args):
        raise RuntimeError("database migration failed")

    monkeypatch.setattr(production_start.command, "upgrade", fail)
    monkeypatch.setattr(
        production_start.uvicorn, "run", lambda *a, **k: pytest.fail("server must not start")
    )
    with pytest.raises(SystemExit, match="1"):
        production_start.main()
