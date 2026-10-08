# Account protection and email flows

This milestone adds PostgreSQL-backed authentication rate limits, password recovery and email-address verification. It does not verify a student's university or skills. Mock identities remain a separate local prototype and never receive email.

## Local setup

From the repository root (PowerShell):

```powershell
docker compose --profile test up -d --wait postgres postgres-test mailpit
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
cd backend
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m uvicorn app.main:create_app --factory --reload --no-access-log --no-proxy-headers
```

Preserve existing `.env` files. New settings have local defaults; see [.env.example](.env.example). POSIX uses `.venv/bin/python`. Start Next.js in API mode as described in [the frontend guide](../frontend/API_MODE.md). Open the app at `http://localhost:3000` and the local Mailpit inbox at **http://localhost:8025**. SMTP listens on localhost port **1025**. Both Mailpit ports bind only to loopback. Local reverse-DNS lookup is disabled to avoid Docker bridge lookup delays exceeding the SMTP timeout; see [Mailpit runtime options](https://mailpit.axllent.org/docs/configuration/runtime-options/). Its local inbox is ephemeral across container recreation. These emails contain account-access links: do not publish the inbox, screenshots, message exports or test reports containing links. Local Mailpit is not a production delivery provider.

Migration `0004_auth_recovery` adds `users.email_verified_at`, `auth_tokens`, and `auth_rate_buckets`. It preserves existing accounts, projects, applications, memberships and sessions. Existing accounts remain **unverified**, rather than being silently grandfathered in. Owners retain existing management permissions, including review, acceptance/rejection and archiving; applicants may still withdraw. Only **project publication and new applications** now require verified email. Profiles, discovery and drafts remain available.

## Configuration

| Variable | Default / meaning |
| --- | --- |
| `FRONTEND_BASE_URL` | `http://localhost:3000`; one validated origin, no redirects or paths; HTTPS in production |
| `RESET_TTL_SECONDS` | `1800` (30 minutes) |
| `VERIFICATION_TTL_SECONDS` | `86400` (24 hours) |
| `SMTP_HOST`, `SMTP_PORT` | `127.0.0.1`, `1025` for Mailpit |
| `SMTP_FROM` | `CampusCollab <noreply@campuscollab.local>`; replace with an authorized production sender |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | Optional private provider credentials; never put these in frontend variables |
| `SMTP_TLS` | `none` locally; `starttls` or `tls` required in production, with certificate validation |
| `SMTP_TIMEOUT_SECONDS` | `5`; total delivery deadline and per-operation timeout, configurable 1–10 seconds |
| `TRUSTED_PROXY_NETWORKS` | JSON list of explicit proxy IPs/CIDRs; default `[]`, wildcard networks rejected |
| `RATE_WINDOW_SECONDS` | `900` (15-minute fixed window starting at first request) |
| `RATE_IP_LIMIT` | `300` across protected authentication actions, allowing multiple students on campus Wi-Fi |
| `RATE_LOGIN_LIMIT` | `10` per normalized email per window |
| `RATE_SIGNUP_LIMIT` | `5` per normalized email per window |
| `RATE_EMAIL_LIMIT` | `3` per normalized email **per purpose** (reset requests / verification resends) |
| `RATE_TOKEN_LIMIT` | `10` per submitted token **per purpose** (reset / verification confirmation) |

These are small-pilot defaults, not a claim of comprehensive abuse prevention. Budgets are positive and configurable; none silently turn off in production. The isolated browser server explicitly raises only the shared IP budget to 2000 to accommodate the suite. Tune campus IP budgets against actual traffic.

Counters use atomic PostgreSQL upserts in a separate committed transaction. Failed authentication still counts. Identifiers are HMAC-SHA256 keys with a purpose prefix and the existing `CSRF_SECRET`; raw email addresses/IPs are not stored in buckets. Keep this secret stable and identical across workers. Rotating it invalidates CSRF tokens and pending signup codes and starts new rate-limit keys; existing opaque sessions and email token hashes are unaffected. Expired buckets reset on use; blocked requests do not extend the window or permanently lock accounts. Counters saturate at limit+1, and an exhausted IP budget prevents creating more arbitrary email/token buckets. Authentication POST bodies are capped at 8 KiB and schemas are validated before password hashing/accounting.

429 responses have `{"detail":"rate_limited"}` and `Retry-After` seconds (exposed through CORS). The frontend shows retry guidance and never replays a mutation automatically.

## Proxy boundary

Always run Uvicorn with **`--no-proxy-headers`** so its default loopback proxy handling cannot rewrite the immediate peer before the application checks it. The application ignores `Forwarded`, `X-Real-IP` and arbitrary `X-Forwarded-For`. It reads a bounded X-Forwarded-For chain only when the actual peer belongs to `TRUSTED_PROXY_NETWORKS`, walking from right to left to the first untrusted address. Malformed chains fall back to the peer.

For a future Render API/Vercel frontend deployment, separately configure HTTPS CORS origins, Secure cookies and the actual API ingress proxy trust boundary. Vercel hosting the frontend does **not** make client-supplied headers to FastAPI trustworthy. Do not copy `*` into Uvicorn proxy trust or trust broad private ranges without a secured ingress. Verify the provider's current proxy chain, header sanitization and direct-access restrictions before enabling explicit trusted networks. Without that configuration, requests behind a proxy share its IP budget. Deployment-specific proxy validation remains production work.

References checked for this implementation: [Uvicorn settings](https://www.uvicorn.org/settings/), [Vercel request headers](https://vercel.com/docs/headers/request-headers), [Render edge protection](https://render.com/articles/how-render-handles-ddos-attacks).

## API and token contract

All endpoints below are under `/api/v1/auth`, accept JSON, and require the existing allowed `Origin` plus `X-CSRF-Token`. Signed-out callers bootstrap with `GET /csrf` and `credentials: include`, just like login. `/auth/me` and `/profiles/me` now return nullable `emailVerifiedAt`. New signup uses the [pending email-code flow](SIGNUP_CODES.md): `/register` returns pending metadata and `deliveryStatus`, not an account/session. Only `/register/confirm` creates a verified account. These link endpoints remain available to existing unverified accounts and for password recovery.

| POST route | Input | Result |
| --- | --- | --- |
| `/password-reset/request` | `email` | Same generic 200/message for unknown/known addresses, including SMTP errors |
| `/password-reset/confirm` | `token`, `password` | Consume reset token, change Argon2 hash, revoke **all** sessions atomically; login required |
| `/verification/request` | `email` | Generic response for unknown, unverified and already-verified accounts; rate limited |
| `/verification/confirm` | `token` | Consume verification token and set email verification timestamp; never establishes a session |

Reset passwords follow registration's 12–128 character rule. Invalid, expired, consumed or wrong-purpose links return 400 `invalid_or_expired_link`; excessive input returns schema/size errors. Publish/apply return 403 `email_verification_required` for unverified users. These errors are separate from the existing exact expired-CSRF error and do not trigger automatic retry.

Links use `FRONTEND_BASE_URL` and a `#token=...` fragment. The browser reads the token into memory and immediately removes the fragment; reload requires reopening the email. GET requests never consume a link. Verification needs an explicit confirmation button, and resetting needs a submitted password. Token pages send `Referrer-Policy: no-referrer`, have no third-party tracking, and never store tokens in browser storage. A verification link for another account does not switch the current session. Password reset does not verify email.

Tokens are random 256-bit values; PostgreSQL stores only SHA-256 hashes, purpose, user, creation/expiry/consumption timestamps. Issuance locks the user and invalidates earlier tokens of that purpose. Consumption locks the user then token, rechecks expiry/consumption, and commits all changes together. Login also locks the user before password verification/session creation so a reset cannot race an old-password login into a surviving session. Single-use rules hold across independent connections/workers.

Link-email sends occur after token commits; signup codes are sent after pending-registration commits, before any account exists. There is **no durable retry queue**. Public request responses are generic even on delivery failure; a response floor equal to the SMTP timeout reduces account-specific timing differences but cannot promise constant timing under congestion. Operational logs record a fixed delivery-failure event without recipient, token or exception details. Templates contain plain text and escaped HTML, purpose, expiry and an ignore-if-unrequested note. See [aiosmtplib TLS/timeout API](https://aiosmtplib.readthedocs.io/en/v5.1.3/reference.html) and [Mailpit Docker documentation](https://mailpit.axllent.org/docs/install/docker/).

## Cleanup and manual walkthrough

From `backend/`, run `.venv/Scripts/python.exe -m app.cleanup_auth` to delete expired email tokens, pending registrations and rate buckets. This explicit command does not delete users or development project data. Arrange operational scheduling later; none is installed here.

1. Start signup in API mode with **Send verification code**. Read the six-digit code in local Mailpit and select **Verify and create account**. The verified profile opens only after confirmation. See [the code walkthrough](SIGNUP_CODES.md#try-it-locally).
2. Existing unverified accounts still see a profile banner and can use **Resend verification email**, follow the latest link, and select **Confirm email**. Existing users are never automatically verified.
3. Open a separate browser session, choose **Forgot password?**, and request a reset. Open the latest reset email, enter/confirm a new password and submit.
4. Reload the old session: protected pages require login. Log in with the new password. Profile/project/application data remains intact. Email verification state is unchanged by reset.

Use only fictional accounts in Mailpit. Do not forward tokens, passwords or provider secrets to support/chat. Production still requires SMTP credentials, an authorized sender/domain, provider delivery configuration, secure hosting/proxy validation, monitoring and abuse tuning. No real production email delivery has been claimed or tested.

## Tests

Use the dedicated database and guards in [README](README.md#checks-and-dedicated-test-database); never reset the development database. Backend tests capture mail through the service interface to test failures and token races without leaking message bodies. Real Playwright workflows use SMTP/Mailpit and unique fictional addresses. Run backend integration tests before the API browser suite, never concurrently against the same test database. API browser tracing, screenshots and video are disabled for token workflows; message bodies/URLs are not attached to reports.

## Executed validation — 2026-10-06

- Full backend suite: **69 passed, no skips**, with the guarded PostgreSQL test database. This includes existing authentication/project/application regressions, atomic counters, concurrent issuance/consumption, reset rollback/session revocation, legacy-user migration and publication/application verification enforcement.
- Ruff lint, Ruff formatting and `pip check` passed. An old Windows pytest cache was unwritable; the successful suite used `python -m pytest -q -o cache_dir=.pytest_cache_auth`. The alternate cache is ignored, and no database safeguards were weakened.
- Frontend: lint/typecheck and **52 unit tests** passed; **20 API browser tests**, **29 mock browser tests**, and **4 focused recovery checks** passed with no skips. Both production modes built successfully. Token-free desktop/mobile recovery screenshots were inspected, with overflow and Referrer-Policy assertions passing.
- Development migration reached `0004_auth_recovery` without a reset. Development/test PostgreSQL and local Mailpit were healthy. Browser workflows used SMTP to Mailpit, unique fictional accounts and the separate guarded test database.
- Initial browser checks exposed a duplicate React key in the new banner, a navigation timing assumption in a test, and Mailpit reverse-DNS delays. These were corrected and affected checks rerun. Public email requests also preserve generic responses when token issuance rolls back.

No remaining local verification blocker. Production SMTP credentials/sender authorization, HTTPS/ingress proxy validation, operational scheduling/monitoring and pilot limit tuning remain required. In-process mail has no durable retry queue. No commit or push was performed.
