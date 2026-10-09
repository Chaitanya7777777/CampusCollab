"""Allowlisted startup diagnostics: never serialize exception text or inputs."""

import json
import logging
import re
import socket
import ssl

from pydantic import ValidationError
from pydantic_settings import SettingsError

from app.config import Settings

# Exact, application-owned validator messages only. Never echo provider messages.
CONFIG_RULES = {
    "Value error, TRUSTED_PROXY_NETWORKS must contain valid network ranges": [
        "TRUSTED_PROXY_NETWORKS"
    ],
    "Value error, FRONTEND_BASE_URL must be one explicit HTTP(S) origin": ["FRONTEND_BASE_URL"],
    "Value error, Production requires HTTPS frontend links and TLS for SMTP delivery": [
        "FRONTEND_BASE_URL",
        "SMTP_TLS",
    ],
    "Value error, Set BREVO_API_KEY privately when EMAIL_PROVIDER=brevo": ["BREVO_API_KEY"],
    "Value error, BREVO_SENDER_EMAIL is required when EMAIL_PROVIDER=brevo": ["BREVO_SENDER_EMAIL"],
    "Value error, BREVO_SENDER_NAME must be a nonempty, single-line name": ["BREVO_SENDER_NAME"],
    "Value error, Invalid SMTP sender": ["SMTP_FROM"],
    "Value error, Wildcard proxy trust is prohibited": ["TRUSTED_PROXY_NETWORKS"],
    "Value error, Set a random CSRF_SECRET of at least 32 characters": ["CSRF_SECRET"],
    "Value error, Migration connection must target the application database": [
        "DATABASE_URL",
        "MIGRATION_DATABASE_URL",
    ],
    "Value error, Set a random private API_PROXY_SECRET": ["API_PROXY_SECRET"],
    "Value error, ALLOWED_HOSTS must contain explicit hostnames": ["ALLOWED_HOSTS"],
    "Value error, Production hosting requires Brevo HTTPS delivery": ["EMAIL_PROVIDER"],
    "Value error, Production requires authenticated proxy forwarding, not network trust": [
        "API_PROXY_SECRET",
        "TRUSTED_PROXY_NETWORKS",
    ],
    "Value error, Production requires one explicit public frontend origin": [
        "ALLOWED_ORIGINS",
        "FRONTEND_BASE_URL",
    ],
    "Value error, Set public production ALLOWED_HOSTS": ["ALLOWED_HOSTS"],
    "Value error, Production requires verified database TLS and SameSite=lax": [
        "DATABASE_TLS",
        "COOKIE_SAMESITE",
    ],
    "Value error, Use a remote direct database endpoint in production": [
        "DATABASE_URL",
        "MIGRATION_DATABASE_URL",
    ],
    "Value error, Explicit allowed origins are required": ["ALLOWED_ORIGINS"],
    "Value error, Origins must be explicit scheme://host[:port] values": ["ALLOWED_ORIGINS"],
    "Value error, Production origins must use HTTPS": ["ALLOWED_ORIGINS"],
    "Value error, Production and SameSite=None require Secure cookies": ["COOKIE_SECURE"],
    "Value error, Session and CSRF cookie names must differ": ["SESSION_COOKIE", "CSRF_COOKIE"],
    "Value error, Invalid PostgreSQL connection configuration": [
        "DATABASE_URL",
        "MIGRATION_DATABASE_URL",
    ],
    "Value error, Use a PostgreSQL connection URL": ["DATABASE_URL", "MIGRATION_DATABASE_URL"],
    "Value error, Database host, database and user are required": [
        "DATABASE_URL",
        "MIGRATION_DATABASE_URL",
    ],
    "Value error, Only certificate-verified database TLS is supported": [
        "DATABASE_URL",
        "MIGRATION_DATABASE_URL",
    ],
    "Value error, Remove unsupported database URL query options; TLS is configured by the app": [
        "DATABASE_URL",
        "MIGRATION_DATABASE_URL",
    ],
}


class StartupSettingError(ValueError):
    def __init__(self, field):
        self.field = field


def configuration_fields(exc):
    fields = set()
    if isinstance(exc, StartupSettingError):
        fields.add(exc.field)
    elif isinstance(exc, ValidationError):
        for error in exc.errors(include_input=False, include_context=False, include_url=False):
            loc = error["loc"]
            if loc and loc[0] in Settings.model_fields:
                fields.add(loc[0].upper())
            else:
                fields.update(CONFIG_RULES.get(error["msg"], []))
    elif isinstance(exc, SettingsError):
        # Settings sources name the field, but their exception chain may contain secrets.
        match = re.search(r'field "([a-z_]+)"', str(exc))
        if match and match[1] in Settings.model_fields:
            fields.add(match[1].upper())
    return sorted(fields)


def category(exc, stage):
    if stage == "configuration_validation":
        return "invalid_configuration", "Check the named settings and production requirements."
    seen = set()
    current = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if isinstance(current, ssl.SSLCertVerificationError):
            return "tls_certificate", "Database certificate or hostname verification failed."
        if isinstance(current, ssl.SSLError):
            return (
                "tls_handshake",
                "Database TLS negotiation failed; certificate checks remain enabled.",
            )
        if isinstance(current, socket.gaierror):
            return "dns", "Database hostname could not be resolved."
        if isinstance(current, TimeoutError):
            return "timeout", "Connection, query or migration-lock deadline exceeded."
        code = getattr(current, "sqlstate", None)
        if isinstance(code, str):
            if code.startswith("28"):
                return "database_authentication", "Database authentication was rejected."
            if code == "3D000":
                return "database_missing", "Configured database does not exist."
            if code == "42501":
                return "database_permission", "Database role lacks permission for the operation."
            if code.startswith("08"):
                return "database_connection", "Database connection failed or was interrupted."
            if code in ("53300", "53400"):
                return "database_capacity", "Database connection or resource limit reached."
            if code in ("55P03", "57014"):
                return "database_timeout_or_lock", "Database query or lock could not complete."
        if isinstance(current, ConnectionError):
            return "database_connection", "Database connection failed or was interrupted."
        current = getattr(current, "orig", None) or current.__cause__ or current.__context__
    return (
        "startup_operation_failed",
        "Inspect the named stage; raw exception details are withheld.",
    )


def report(exc, stage):
    kind, explanation = category(exc, stage)
    if stage == "configuration_validation" and isinstance(exc, ValidationError):
        # Only exact application-owned messages are safe to include; Pydantic and
        # driver messages can embed rejected values even when inputs are omitted.
        reasons = sorted(
            {
                error["msg"].removeprefix("Value error, ")
                for error in exc.errors(
                    include_input=False, include_context=False, include_url=False
                )
                if error["msg"] in CONFIG_RULES
            }
        )
        if reasons:
            explanation = "; ".join(reasons)
    # Class names are metadata, never exception repr/str or traceback.
    name = type(exc).__name__
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,100}", name):
        name = "Exception"
    payload = {
        "event": "production_startup_failed",
        "stage": stage,
        "exception_class": name,
        "category": kind,
        "explanation": explanation,
        "settings": configuration_fields(exc) if stage == "configuration_validation" else [],
    }
    logger = logging.getLogger("campuscollab.startup")
    if not logger.handlers:
        logger.addHandler(logging.StreamHandler())
    logger.propagate = False
    logger.error(json.dumps(payload))
