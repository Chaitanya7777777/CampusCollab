"""Pending signup. Lock order: email advisory lock, then pending registration row.

Use the existing CSRF secret with distinct HMAC domains; keep it stable across workers.
No ordinary hash of a six-digit code is safe against offline enumeration.
"""

import hmac
import math
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, SecretStr, model_validator
from sqlalchemy import select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.auth import add_session, hasher, user_response
from app.db import get_db
from app.mail import send_safely
from app.models import PendingRegistration, Profile, User
from app.rate_limits import limit
from app.schemas import Input, RegisterInput, UserOut
from app.security import require_csrf, set_cookie

router = APIRouter(
    prefix="/auth/register", tags=["Registration"], dependencies=[Depends(require_csrf)]
)


class StartInput(RegisterInput):
    confirmPassword: SecretStr = Field(min_length=12, max_length=128)

    @model_validator(mode="after")
    def match(self):
        if self.password.get_secret_value() != self.confirmPassword.get_secret_value():
            raise ValueError("Passwords must match")
        return self


class RegistrationInput(Input):
    registrationId: UUID


class ConfirmInput(RegistrationInput):
    code: SecretStr = Field(min_length=6, max_length=6)

    @model_validator(mode="after")
    def digits(self):
        if any(c not in "0123456789" for c in self.code.get_secret_value()):
            raise ValueError("Enter six digits")
        return self


class PendingOut(BaseModel):
    registrationId: UUID
    maskedEmail: str
    expiresAt: datetime
    resendAt: datetime
    serverTime: datetime
    deliveryStatus: str


def digest(settings, id, code):
    return hmac.new(
        settings.csrf_secret.get_secret_value().encode(),
        f"signup-code-v1:{id}:{code}".encode(),
        "sha256",
    ).hexdigest()


async def email_lock(db, settings, email):
    key = hmac.new(
        settings.csrf_secret.get_secret_value().encode(),
        f"signup-lock-v1:{email}".encode(),
        "sha256",
    ).digest()[:8]
    await db.execute(
        text("SELECT pg_advisory_xact_lock(:key)"), {"key": int.from_bytes(key, "big", signed=True)}
    )


def new_code(settings, row):
    while True:
        code = f"{secrets.randbelow(1_000_000):06d}"
        value = digest(settings, row.id, code)
        if value != row.code_digest:
            row.code_digest = value
            return code


def pending_output(settings, row, sent):
    local, domain = row.email.split("@", 1)
    return PendingOut(
        registrationId=row.id,
        maskedEmail=f"{local[0]}***@{domain}",
        expiresAt=row.expires_at,
        resendAt=row.issued_at + timedelta(seconds=settings.signup_resend_cooldown_seconds),
        serverTime=datetime.now(UTC),
        deliveryStatus="sent" if sent else "unavailable",
    )


def valid(row, settings):
    if row is None or row.closed_at or row.consumed_at:
        raise HTTPException(400, "registration_closed")
    if row.expires_at <= datetime.now(UTC):
        raise HTTPException(400, "registration_expired")
    if row.failed_attempts >= settings.signup_code_attempts:
        raise HTTPException(400, "registration_exhausted")


async def locked_registration(request, db, id, action):
    email = await db.scalar(select(PendingRegistration.email).where(PendingRegistration.id == id))
    # Release the lookup connection before independent rate-limit accounting.
    # A bounded pool must not deadlock when concurrent requests each hold a
    # connection while waiting for another. State is re-read under locks below.
    await db.rollback()
    # Unknown identifiers still consume the common IP budget, without arbitrary email buckets.
    await limit(request, action, email)
    if email is None:
        raise HTTPException(400, "registration_closed")
    await email_lock(db, request.app.state.settings, email)
    return await db.scalar(
        select(PendingRegistration)
        .where(PendingRegistration.id == id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


@router.post("", response_model=PendingOut, status_code=202)
async def start(data: StartInput, request: Request, db: AsyncSession = Depends(get_db)):
    settings = request.app.state.settings
    email = str(data.email)
    await limit(request, "signup", email)
    password_hash = await run_in_threadpool(hasher.hash, data.password.get_secret_value())
    await email_lock(db, settings, email)
    now = datetime.now(UTC)
    await db.execute(
        update(PendingRegistration)
        .where(
            PendingRegistration.email == email,
            PendingRegistration.closed_at.is_(None),
            PendingRegistration.consumed_at.is_(None),
        )
        .values(closed_at=now)
    )
    row = PendingRegistration(
        id=uuid4(),
        email=email,
        name=data.name,
        password_hash=password_hash,
        code_digest="",
        failed_attempts=0,
        resend_count=0,
        created_at=now,
        issued_at=now,
        expires_at=now + timedelta(seconds=settings.signup_code_ttl_seconds),
    )
    code = new_code(settings, row)
    db.add(row)
    await db.commit()
    # Same flow for an existing address; account uniqueness is disclosed only after proof
    # of mailbox possession. Delivery failure is truthful and cannot create an account.
    sent = await send_safely(request, email, "signup", code)
    return pending_output(settings, row, sent)


@router.post("/resend", response_model=PendingOut)
async def resend(data: RegistrationInput, request: Request, db: AsyncSession = Depends(get_db)):
    settings = request.app.state.settings
    row = await locked_registration(request, db, data.registrationId, "signup-resend")
    valid(row, settings)
    now = datetime.now(UTC)
    wait = settings.signup_resend_cooldown_seconds - (now - row.issued_at).total_seconds()
    if wait > 0:
        raise HTTPException(429, "resend_cooldown", headers={"Retry-After": str(math.ceil(wait))})
    code = new_code(settings, row)
    row.issued_at, row.resend_count = now, row.resend_count + 1
    await db.commit()
    return pending_output(settings, row, await send_safely(request, row.email, "signup", code))


@router.post("/confirm", response_model=UserOut, status_code=201)
async def confirm(
    data: ConfirmInput, request: Request, response: Response, db: AsyncSession = Depends(get_db)
):
    settings = request.app.state.settings
    row = await locked_registration(request, db, data.registrationId, "signup-confirm")
    valid(row, settings)
    if not hmac.compare_digest(
        row.code_digest, digest(settings, row.id, data.code.get_secret_value())
    ):
        row.failed_attempts += 1
        exhausted = row.failed_attempts >= settings.signup_code_attempts
        await db.commit()  # Deliberate: an error response must not roll back guessing attempts.
        raise HTTPException(400, "registration_exhausted" if exhausted else "incorrect_code")
    if await db.scalar(select(User.id).where(User.email == row.email)):
        row.closed_at = datetime.now(UTC)
        await db.commit()
        raise HTTPException(409, "registration_unavailable")
    email = row.email
    user = User(
        email=row.email, password_hash=row.password_hash, email_verified_at=datetime.now(UTC)
    )
    try:
        db.add(user)
        await db.flush()
        db.add(Profile(user_id=user.id, name=row.name))
        token = add_session(db, user, settings.session_ttl_seconds)
        row.consumed_at = datetime.now(UTC)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        # Retain the database uniqueness boundary for writers outside this flow too.
        if await db.scalar(select(User.id).where(User.email == email)):
            raise HTTPException(409, "registration_unavailable") from None
        raise
    set_cookie(response, settings, settings.session_cookie, token, settings.session_ttl_seconds)
    return await user_response(db, user)
