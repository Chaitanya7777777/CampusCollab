from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.engine import make_url


@asynccontextmanager
async def exclusive_test_database(engine):
    """Browser server holds this lock for its lifetime; reset fixtures fail closed."""
    async with engine.connect() as connection:
        acquired = await connection.scalar(text("SELECT pg_try_advisory_lock(734820191)"))
        if not acquired:
            raise RuntimeError("Test database is already in use by another suite")
        try:
            yield
        finally:
            await connection.execute(text("SELECT pg_advisory_unlock(734820191)"))


def guard_test_database(url: str, confirmation: str | None, development_url: str | None = None):
    """Fail closed before any connection or DDL; no implicit development fallback."""
    parsed = make_url(url)
    if (
        parsed.drivername != "postgresql+asyncpg"
        or parsed.host not in ("127.0.0.1", "localhost")
        or parsed.port != 5433
        or parsed.database != "campuscollab_test"
        or parsed.username != "campuscollab_test"
        or parsed.query
        or confirmation != "campuscollab_test"
    ):
        raise ValueError(
            "Tests require the dedicated localhost:5433 test database and reset consent"
        )
    if development_url:
        dev = make_url(development_url)
        same_host = dev.host == parsed.host or dev.host in ("localhost", "127.0.0.1")
        if same_host and (dev.port, dev.database) == (parsed.port, parsed.database):
            raise ValueError("Test database must differ from DATABASE_URL")
    return parsed
