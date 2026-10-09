import asyncio

from alembic import context
from sqlalchemy import text

from app import models  # noqa: F401
from app.config import Settings
from app.db import Base, database

config = context.config


def migrate(connection):
    context.configure(connection=connection, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()


async def online():
    stage = config.attributes.get("startup_stage", lambda value: None)
    stage("configuration_validation")
    engine, _ = database(Settings(), migration=True)
    try:
        stage("database_connection")
        async with engine.connect() as connection:
            stage("migration")
            # Session-level lock on a direct connection survives Alembic commits.
            # command_timeout bounds lock acquisition; failure aborts startup.
            await connection.execute(text("SELECT pg_advisory_lock(734820192)"))
            await connection.commit()
            try:
                await connection.run_sync(migrate)
            finally:
                await connection.rollback()
                await connection.execute(text("SELECT pg_advisory_unlock(734820192)"))
                await connection.commit()
    finally:
        await engine.dispose()


if context.is_offline_mode():
    context.configure(
        url=Settings().database_url.get_secret_value(),
        target_metadata=Base.metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()
elif config.attributes.get("connection") is not None:
    migrate(config.attributes["connection"])
else:
    asyncio.run(online())
