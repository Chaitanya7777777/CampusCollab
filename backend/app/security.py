import hashlib
import hmac
import re
import secrets
import time

from fastapi import HTTPException, Request, Response

from app.config import Settings

TOKEN = re.compile(r"^[A-Za-z0-9_-]{43}$")


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_token() -> str:
    return secrets.token_urlsafe(32)


def set_cookie(response: Response, settings: Settings, name: str, value: str, age: int):
    response.set_cookie(
        name,
        value,
        max_age=age,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/",
    )


def clear_cookie(response: Response, settings: Settings, name: str):
    response.delete_cookie(
        name,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
    )


def require_origin(request: Request):
    if request.headers.get("origin") not in request.app.state.settings.allowed_origins:
        raise HTTPException(403, "Untrusted or missing request origin")


def signature(settings: Settings, nonce: str, stamp: str, cookie: str, session: str) -> str:
    message = f"{nonce}.{stamp}.{token_hash(cookie)}.{token_hash(session)}"
    return hmac.new(
        settings.csrf_secret.get_secret_value().encode(), message.encode(), "sha256"
    ).hexdigest()


def csrf_bootstrap(request: Request, response: Response) -> str:
    require_origin(request)
    settings = request.app.state.settings
    cookie = request.cookies.get(settings.csrf_cookie, "")
    if not TOKEN.fullmatch(cookie):
        cookie = new_token()
    set_cookie(response, settings, settings.csrf_cookie, cookie, settings.csrf_ttl_seconds)
    nonce, stamp = new_token(), str(int(time.time()))
    signed = signature(
        settings, nonce, stamp, cookie, request.cookies.get(settings.session_cookie, "")
    )
    response.headers["Cache-Control"] = "no-store"
    return f"{nonce}.{stamp}.{signed}"


def require_csrf(request: Request):
    require_origin(request)
    settings = request.app.state.settings
    cookie = request.cookies.get(settings.csrf_cookie, "")
    supplied = request.headers.get("x-csrf-token", "")
    if len(supplied) > 200 or not TOKEN.fullmatch(cookie):
        raise HTTPException(403, "Invalid or expired CSRF token")
    try:
        nonce, stamp, digest = supplied.split(".")
        age = int(time.time()) - int(stamp)
        if not TOKEN.fullmatch(nonce) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise ValueError
        if age < 0 or age > settings.csrf_ttl_seconds:
            raise ValueError
    except ValueError:
        raise HTTPException(403, "Invalid or expired CSRF token") from None
    expected = signature(
        settings, nonce, stamp, cookie, request.cookies.get(settings.session_cookie, "")
    )
    if not hmac.compare_digest(digest, expected):
        raise HTTPException(403, "Invalid or expired CSRF token")
