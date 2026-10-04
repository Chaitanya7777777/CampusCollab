from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import Settings


class Base(DeclarativeBase):
    pass


def database(settings: Settings):
    engine = create_async_engine(
        settings.database_url.get_secret_value(),
        pool_pre_ping=True,
        connect_args={"timeout": 5, "command_timeout": 10},
        hide_parameters=True,
    )
    return engine, async_sessionmaker(engine, expire_on_commit=False)


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.session_factory() as session:
        yield session
        # Services commit explicitly before returning; close rolls back unfinished work.
