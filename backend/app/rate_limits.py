"""Independent committed accounting: failed downstream operations still consume budget."""

import hmac
import math
from datetime import timedelta
from ipaddress import ip_address, ip_network

from fastapi import HTTPException, Request
from sqlalchemy import case, func, select
from sqlalchemy.dialects.postgresql import insert

from app.models import RateBucket


def client_ip(request: Request) -> str:
    # Run Uvicorn with --no-proxy-headers; inspect the actual immediate peer here.
    peer = request.client.host if request.client else "unknown"
    networks = [ip_network(n) for n in request.app.state.settings.trusted_proxy_networks]
    try:
        address = ip_address(peer)
        if not any(address in network for network in networks):
            return str(address)
        # Repeated header fields form one ordered chain. Never select only an
        # attacker-supplied first field when a trusted proxy appends another.
        forwarded = ",".join(request.headers.getlist("x-forwarded-for"))
        if len(forwarded) > 1024:
            return str(address)
        for item in reversed(forwarded.split(",")):
            address = ip_address(item.strip())
            if not any(address in network for network in networks):
                return str(address)
    except ValueError:
        return peer
    return str(address)


async def account(factory, secret: str, identifiers: list[tuple[str, int]], window: int):
    retry = 0
    async with factory() as db:
        now = await db.scalar(select(func.clock_timestamp()))
        for identifier, limit in identifiers:
            key = hmac.new(
                secret.encode(), ("auth-rate-v1:" + identifier).encode(), "sha256"
            ).hexdigest()
            expired = RateBucket.expires_at <= now
            result = await db.execute(
                insert(RateBucket)
                .values(key=key, count=1, expires_at=now + timedelta(seconds=window))
                .on_conflict_do_update(
                    index_elements=[RateBucket.key],
                    set_={
                        "count": case(
                            (expired, 1), else_=func.least(RateBucket.count + 1, limit + 1)
                        ),
                        "expires_at": case(
                            (expired, now + timedelta(seconds=window)), else_=RateBucket.expires_at
                        ),
                    },
                )
                .returning(RateBucket.count, RateBucket.expires_at)
            )
            count, expiry = result.one()
            if count > limit:
                retry = max(retry, max(1, math.ceil((expiry - now).total_seconds())))
                # Stop creating email/token buckets after the IP budget is exhausted.
                break
        await db.commit()
    if retry:
        raise HTTPException(429, "rate_limited", headers={"Retry-After": str(retry)})


async def limit(request: Request, action: str, identifier: str | None = None):
    settings = request.app.state.settings
    budgets = {
        "login": settings.rate_login_limit,
        "signup": settings.rate_signup_limit,
        "signup-confirm": settings.rate_token_limit,
        "signup-resend": settings.rate_email_limit,
        "reset-request": settings.rate_email_limit,
        "verify-request": settings.rate_email_limit,
        "reset": settings.rate_token_limit,
        "verify": settings.rate_token_limit,
    }
    ids = [("ip:" + client_ip(request), settings.rate_ip_limit)]
    if identifier:
        ids.append((action + ":" + identifier, budgets[action]))
    await account(
        request.app.state.session_factory,
        settings.csrf_secret.get_secret_value(),
        ids,
        settings.rate_window_seconds,
    )
