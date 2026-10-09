"""Normalize PostgreSQL URLs without passing libpq-only options to asyncpg."""

import ssl

from sqlalchemy.engine import make_url


def connection_options(raw: str, tls: bool):
    try:
        url = make_url(raw)
    except Exception:
        raise ValueError("Invalid PostgreSQL connection configuration") from None
    if url.drivername not in ("postgres", "postgresql", "postgresql+asyncpg"):
        raise ValueError("Use a PostgreSQL connection URL")
    if not url.host or not url.database or not url.username:
        raise ValueError("Database host, database and user are required")
    query = dict(url.query)
    mode = query.pop("sslmode", None)
    if mode is not None and mode not in ("require", "verify-full"):
        raise ValueError("Only certificate-verified database TLS is supported")
    if query:
        raise ValueError(
            "Remove unsupported database URL query options; TLS is configured by the app"
        )
    args = {"timeout": 10, "command_timeout": 20}
    if tls or mode:
        args["ssl"] = ssl.create_default_context()
    return url.set(drivername="postgresql+asyncpg", query={}), args
