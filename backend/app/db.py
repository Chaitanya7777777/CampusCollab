from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import Settings
from app.database_url import connection_options


class Base(DeclarativeBase):
    pass


def database(settings: Settings, *, migration: bool = False):
    value = (
        settings.migration_database_url
        if migration and settings.migration_database_url
        else settings.database_url
    )
    url, args = connection_options(value.get_secret_value(), settings.database_tls)
    engine = create_async_engine(
        url,
        pool_pre_ping=True,
        pool_size=settings.database_pool_size,
        max_overflow=0,
        pool_timeout=10,
        pool_recycle=300,
        connect_args=args,
        hide_parameters=True,
    )
    return engine, async_sessionmaker(engine, expire_on_commit=False)


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.session_factory() as session:
        yield session
        # Services commit explicitly before returning; close rolls back unfinished work.
