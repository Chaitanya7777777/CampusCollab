"""Explicit maintenance: python -m app.cleanup_auth (no account/session deletion)."""

import asyncio

from sqlalchemy import delete, func

from app.config import Settings
from app.db import database
from app.models import AuthToken, PendingRegistration, RateBucket


async def main():
    engine, factory = database(Settings())
    try:
        async with factory() as db:
            await db.execute(delete(AuthToken).where(AuthToken.expires_at <= func.now()))
            await db.execute(delete(RateBucket).where(RateBucket.expires_at <= func.now()))
            await db.execute(
                delete(PendingRegistration).where(PendingRegistration.expires_at <= func.now())
            )
            await db.commit()
        print("Expired authentication tokens, pending registrations and rate buckets removed.")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
