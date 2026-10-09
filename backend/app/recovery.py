"""User -> token lock order, including issuance and consumption across workers."""

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field, SecretStr, field_validator
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.auth import hasher
from app.db import get_db
from app.mail import send_safely
from app.models import AuthToken, Session, User
from app.rate_limits import limit
from app.schemas import Input
from app.security import TOKEN, new_token, require_csrf, token_hash

router = APIRouter(prefix="/auth", tags=["Authentication"], dependencies=[Depends(require_csrf)])
GENERIC = (
    "If an eligible account exists, we will attempt to send an email. "
    "Check your inbox or try again later."
)


class EmailInput(Input):
    email: EmailStr = Field(max_length=254)

    @field_validator("email", mode="before")
    @classmethod
    def normalize(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


class TokenInput(Input):
    token: SecretStr = Field(max_length=128)


class MessageOut(BaseModel):
    message: str


class ResetInput(TokenInput):
    password: SecretStr = Field(min_length=12, max_length=128)


async def issue(db, user_id, purpose, ttl):
    user = await db.scalar(
        select(User)
        .where(User.id == user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if not user or user.sample_seed or (purpose == "verify" and user.email_verified_at):
        await db.rollback()
        return None
    await db.execute(
        update(AuthToken)
        .where(
            AuthToken.user_id == user_id,
            AuthToken.purpose == purpose,
            AuthToken.consumed_at.is_(None),
        )
        .values(consumed_at=func.now())
    )
    token = new_token()
    db.add(
        AuthToken(
            user_id=user_id,
            purpose=purpose,
            token_hash=token_hash(token),
            expires_at=datetime.now(UTC) + timedelta(seconds=ttl),
        )
    )
    await db.commit()
    return token


async def request_email(request, db, email, purpose):
    settings = request.app.state.settings
    fields = {
        "purpose": purpose,
        "request_id": getattr(request.state, "request_id", None),
    }
    logger = logging.getLogger("campuscollab")
    # Same bounded response floor for unknown accounts and provider failures. This is not a
    # guarantee of constant timing under database/network congestion.
    loop = asyncio.get_running_loop()
    started = loop.time()
    try:
        await limit(request, "reset-request" if purpose == "reset" else "verify-request", email)
    except HTTPException as error:
        if error.status_code == 429:
            logger.info(
                "authentication_email_not_sent",
                extra={
                    "fields": {
                        **fields,
                        "reason": "rate_limited",
                    }
                },
            )
        raise
    user_id = await db.scalar(
        select(User.id).where(User.email == email, User.sample_seed.is_(None))
    )
    if user_id:
        ttl = (
            settings.reset_ttl_seconds if purpose == "reset" else settings.verification_ttl_seconds
        )
        try:
            token = await issue(db, user_id, purpose, ttl)
            if token:
                await send_safely(request, email, purpose, token)
            else:
                logger.info(
                    "authentication_email_not_sent",
                    extra={
                        "fields": {
                            **fields,
                            "reason": "not_eligible",
                        }
                    },
                )
        except Exception:
            await db.rollback()
            logger.error("authentication_email_issuance_failed", extra={"fields": fields})
    else:
        logger.info(
            "authentication_email_not_sent",
            extra={
                "fields": {
                    **fields,
                    "reason": "not_eligible",
                }
            },
        )
    await asyncio.sleep(max(0, settings.email_timeout_seconds - (loop.time() - started)))
    return {"message": GENERIC}


@router.post("/password-reset/request", response_model=MessageOut)
async def reset_request(data: EmailInput, request: Request, db: AsyncSession = Depends(get_db)):
    return await request_email(request, db, str(data.email), "reset")


@router.post("/verification/request", response_model=MessageOut)
async def verification_request(
    data: EmailInput, request: Request, db: AsyncSession = Depends(get_db)
):
    return await request_email(request, db, str(data.email), "verify")


async def consume(db, raw, purpose, password=None):
    if not TOKEN.fullmatch(raw):
        raise HTTPException(400, "invalid_or_expired_link")
    digest = token_hash(raw)
    user_id = await db.scalar(
        select(AuthToken.user_id).where(
            AuthToken.token_hash == digest, AuthToken.purpose == purpose
        )
    )
    if not user_id:
        raise HTTPException(400, "invalid_or_expired_link")
    user = await db.scalar(
        select(User)
        .where(User.id == user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    token = await db.scalar(
        select(AuthToken)
        .where(AuthToken.token_hash == digest, AuthToken.purpose == purpose)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    now = datetime.now(UTC)
    if not user or user.sample_seed or not token or token.consumed_at or token.expires_at <= now:
        raise HTTPException(400, "invalid_or_expired_link")
    if purpose == "reset":
        user.password_hash = await run_in_threadpool(hasher.hash, password)
        await db.execute(
            update(Session)
            .where(Session.user_id == user.id, Session.revoked_at.is_(None))
            .values(revoked_at=now)
        )
    else:
        user.email_verified_at = user.email_verified_at or now
    token.consumed_at = now
    await db.commit()


@router.post("/password-reset/confirm", response_model=MessageOut)
async def reset_confirm(data: ResetInput, request: Request, db: AsyncSession = Depends(get_db)):
    await limit(request, "reset", data.token.get_secret_value())
    await consume(db, data.token.get_secret_value(), "reset", data.password.get_secret_value())
    return {"message": "Password changed. All sessions have been revoked. Log in again."}


@router.post("/verification/confirm", response_model=MessageOut)
async def verification_confirm(
    data: TokenInput, request: Request, db: AsyncSession = Depends(get_db)
):
    await limit(request, "verify", data.token.get_secret_value())
    await consume(db, data.token.get_secret_value(), "verify")
    return {
        "message": "Email verified. This confirms your email address, not your college or skills."
    }
