import json
import logging
import socket
import ssl

import pytest
from pydantic import ValidationError
from pydantic_settings import SettingsError
from sqlalchemy.exc import OperationalError

from app import production_start
from app.config import Settings
from app.startup_diagnostics import report
from tests.test_deployment import production

SECRET = "private-sentinel-password-token-url"


@pytest.fixture
def records(caplog):
    logger = logging.getLogger("campuscollab.startup")
    handler = caplog.handler
    logger.addHandler(handler)
    yield caplog
    logger.removeHandler(handler)


def output(records):
    assert SECRET not in records.text
    record = records.records[-1]
    assert record.exc_info is None
    return json.loads(record.getMessage())


@pytest.mark.parametrize(
    "field,value,expected",
    [
        ("database_pool_size", SECRET, "DATABASE_POOL_SIZE"),
        ("cookie_secure", False, "COOKIE_SECURE"),
        ("frontend_base_url", SECRET, "FRONTEND_BASE_URL"),
        ("brevo_api_key", None, "BREVO_API_KEY"),
        ("trusted_proxy_networks", [SECRET], "TRUSTED_PROXY_NETWORKS"),
    ],
)
def test_configuration_fields_without_values(records, field, value, expected):
    with pytest.raises(ValidationError) as caught:
        production(**{field: value})
    report(caught.value, "configuration_validation")
    data = output(records)
    assert expected in data["settings"]
    assert data["exception_class"] == "ValidationError"


def test_missing_and_json_settings(records, monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(ValidationError) as caught:
        Settings(_env_file=None, csrf_secret="test-only-secret-000000000000000000")
    report(caught.value, "configuration_validation")
    assert "DATABASE_URL" in output(records)["settings"]
    report(
        SettingsError('error parsing value for field "allowed_origins" ' + SECRET),
        "configuration_validation",
    )
    assert output(records)["settings"] == ["ALLOWED_ORIGINS"]


@pytest.mark.parametrize(
    "exc,category",
    [
        (ssl.SSLCertVerificationError(SECRET), "tls_certificate"),
        (socket.gaierror(SECRET), "dns"),
        (TimeoutError(SECRET), "timeout"),
        (ConnectionRefusedError(SECRET), "database_connection"),
        (RuntimeError(SECRET), "startup_operation_failed"),
    ],
)
def test_wrapped_database_errors_are_redacted(records, exc, category):
    wrapped = OperationalError(SECRET, {"password": SECRET}, exc)
    report(wrapped, "database_connection")
    data = output(records)
    assert data["category"] == category
    assert data["stage"] == "database_connection"
    assert data["exception_class"] == "OperationalError"


def test_sqlstate_authentication_redacted(records):
    exc = RuntimeError(SECRET)
    exc.sqlstate = "28P01"
    report(exc, "database_connection")
    assert output(records)["category"] == "database_authentication"


@pytest.mark.parametrize("stage", ["database_connection", "migration", "server_launch"])
def test_startup_stage_and_fail_before_serving(monkeypatch, records, stage):
    monkeypatch.setattr(production_start, "Settings", production)
    launched = []

    def upgrade(config, revision):
        assert revision == "head"
        if stage != "server_launch":
            config.attributes["startup_stage"](stage)
            raise RuntimeError(SECRET)

    def launch(*args, **kwargs):
        launched.append(True)
        raise OSError(SECRET)

    from app import main

    monkeypatch.setattr(main, "create_app", lambda settings: object())
    monkeypatch.setattr(production_start.command, "upgrade", upgrade)
    monkeypatch.setattr(production_start.uvicorn, "run", launch)
    with pytest.raises(SystemExit, match="1"):
        production_start.main()
    assert output(records)["stage"] == stage
    assert bool(launched) == (stage == "server_launch")


def test_invalid_port_never_migrates(monkeypatch, records):
    monkeypatch.setattr(production_start, "Settings", production)
    monkeypatch.setenv("PORT", SECRET)
    monkeypatch.setattr(
        production_start.command, "upgrade", lambda *args: pytest.fail("must not migrate")
    )
    with pytest.raises(SystemExit, match="1"):
        production_start.main()
    assert output(records)["settings"] == ["PORT"]
