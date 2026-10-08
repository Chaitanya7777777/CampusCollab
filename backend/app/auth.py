from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.db import get_db
from app.models import Profile, Session, User
from app.rate_limits import limit
from app.schemas import CsrfOut, LoginInput, UserOut
from app.security import (
    TOKEN,
    clear_cookie,
    csrf_bootstrap,
    new_token,
    require_csrf,
    set_cookie,
    token_hash,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])
hasher = PasswordHasher()
# Same-cost verification for unknown users; this is not an account or credential.
DUMMY_HASH = hasher.hash("unused-dummy-password-for-timing")


@dataclass
class Principal:
    user: User
    session: Session


async def current_user(request: Request, db: AsyncSession = Depends(get_db)) -> Principal:
    token = request.cookies.get(request.app.state.settings.session_cookie, "")
    if not TOKEN.fullmatch(token):
        raise HTTPException(401, "Authentication required")
    result = (
        await db.execute(
            select(User, Session)
            .join(Session, Session.user_id == User.id)
            .where(
                User.sample_seed.is_(None),
                Session.token_hash == token_hash(token),
                Session.revoked_at.is_(None),
                Session.expires_at > func.now(),
            )
        )
    ).first()
    if result is None:
        raise HTTPException(401, "Authentication required")
    return Principal(result[0], result[1])


async def user_response(db: AsyncSession, user: User) -> UserOut:
    name = await db.scalar(select(Profile.name).where(Profile.user_id == user.id))
    return UserOut(
        id=user.id,
        name=name,
        email=user.email,
        createdAt=user.created_at,
        emailVerifiedAt=user.email_verified_at,
    )


def add_session(db: AsyncSession, user: User, ttl: int) -> str:
    token = new_token()
    db.add(
        Session(
            user_id=user.id,
            token_hash=token_hash(token),
            expires_at=datetime.now(UTC) + timedelta(seconds=ttl),
        )
    )
    return token


def verify_password(encoded: str, password: str) -> bool:
    try:
        return hasher.verify(encoded, password)
    except VerificationError:
        return False


async def login_user(db: AsyncSession, data: LoginInput, ttl: int):
    user = await db.scalar(
        select(User)
        .where(User.email == str(data.email), User.sample_seed.is_(None))
        .with_for_update()
    )
    valid = await run_in_threadpool(
        verify_password,
        user.password_hash if user else DUMMY_HASH,
        data.password.get_secret_value(),
    )
    if not user or not valid:
        raise HTTPException(401, "Invalid email or password")
    token = add_session(db, user, ttl)
    await db.commit()
    return user, token


@router.get("/csrf", response_model=CsrfOut)
async def csrf(request: Request, response: Response):
    return CsrfOut(csrfToken=csrf_bootstrap(request, response))


@router.post("/login", response_model=UserOut, dependencies=[Depends(require_csrf)])
async def login(
    data: LoginInput, request: Request, response: Response, db: AsyncSession = Depends(get_db)
):
    settings = request.app.state.settings
    await limit(request, "login", str(data.email))
    user, token = await login_user(db, data, settings.session_ttl_seconds)
    set_cookie(response, settings, settings.session_cookie, token, settings.session_ttl_seconds)
    return await user_response(db, user)


@router.post("/logout", status_code=204, dependencies=[Depends(require_csrf)])
async def logout(request: Request, db: AsyncSession = Depends(get_db)):
    settings = request.app.state.settings
    token = request.cookies.get(settings.session_cookie, "")
    if TOKEN.fullmatch(token):
        await db.execute(
            update(Session)
            .where(
                Session.token_hash == token_hash(token),
                Session.revoked_at.is_(None),
            )
            .values(revoked_at=func.now())
        )
        await db.commit()
    response = Response(status_code=204)
    clear_cookie(response, settings, settings.session_cookie)
    clear_cookie(response, settings, settings.csrf_cookie)
    return response


@router.get("/me", response_model=UserOut)
async def me(principal: Principal = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await user_response(db, principal.user)
