"""Owned by Playwright; guarded PostgreSQL only. Never uses the development DB."""

import asyncio
import os
import secrets
from pathlib import Path

import uvicorn
from alembic import command
from alembic.config import Config
from dotenv import dotenv_values
from sqlalchemy import text

from app.config import Settings
from app.main import create_app
from app.skills import seed_skills
from tests.support import exclusive_test_database, guard_test_database


async def main():
    url = os.environ.get("TEST_DATABASE_URL", "")
    development_url = os.environ.get("DATABASE_URL") or dotenv_values(".env").get("DATABASE_URL")
    guard_test_database(url, os.environ.get("ALLOW_TEST_DB_RESET"), development_url)
    settings = Settings(
        _env_file=None,
        app_env="test",
        database_url=url,
        csrf_secret=secrets.token_urlsafe(48),
        allowed_origins=["http://localhost:3100"],
        session_cookie="cc_browser_test_session",
        csrf_cookie="cc_browser_test_csrf",
    )
    app = create_app(settings)
    engine = app.state.engine
    try:
        async with exclusive_test_database(engine):
            async with engine.begin() as connection:
                identity = (
                    await connection.execute(text("SELECT current_database(), current_user"))
                ).one()
                if tuple(identity) != ("campuscollab_test", "campuscollab_test"):
                    raise RuntimeError("Refusing to reset a non-test database")
                await connection.execute(text("DROP SCHEMA public CASCADE"))
                await connection.execute(text("CREATE SCHEMA public"))
                config = Config(str(Path(__file__).parents[1] / "alembic.ini"))

                def migrate(sync_connection):
                    config.attributes["connection"] = sync_connection
                    command.upgrade(config, "head")

                await connection.run_sync(migrate)
            async with app.state.session_factory() as session:
                await seed_skills(session)
            await uvicorn.Server(
                uvicorn.Config(app, host="127.0.0.1", port=8100, access_log=False)
            ).serve()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
