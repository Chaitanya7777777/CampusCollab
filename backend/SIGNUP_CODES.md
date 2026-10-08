# Signup with an email code

New accounts are created **after** email-code confirmation. Ordinary login remains email/password. Existing accounts and sessions are preserved; existing unverified accounts still use the `/verification/request` and `/verification/confirm` link flow. Password recovery is unchanged. No project seeds or ownership are changed by this milestone.

## Try it locally

From the repository root, PowerShell:

```powershell
docker compose up -d --wait postgres mailpit
cd backend
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m uvicorn app.main:create_app --factory --reload --no-access-log --no-proxy-headers
```

In a second terminal, from the repository root:

```powershell
cd frontend
# Preserve your other .env.local settings; these select the existing local API.
$env:NEXT_PUBLIC_APP_MODE = 'api'
$env:NEXT_PUBLIC_API_BASE_URL = 'http://localhost:8000/api/v1'
npm.cmd run dev
```

1. Open **http://localhost:3000/signup**. Enter name, email, password and matching confirmation. Click **Send verification code**.
2. Open **http://localhost:8025** in another tab. Find the message addressed to the email you entered, with subject **Your CampusCollab signup code**. Read its six-digit code, including leading zeros. Do not share it or attach the email to a report.
3. Return to signup, enter or paste the code, and click **Verify and create account** (Enter works too). You will reach `/profile` with a verified account.
4. Log out and log in with email/password. No code is requested at login.

Mailpit **captures local SMTP messages only**. It does not deliver to Gmail, Outlook or other external inboxes, even when a real address is entered. External delivery requires an authorized production sender and configured SMTP provider (`SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, optional credentials, and TLS). Keep provider secrets in the backend environment, never in chat or frontend variables. Delivery is in-process and bounded by the existing SMTP timeout; there is no durable retry queue.

## HTTP contract

All routes are under `/api/v1/auth`, with the existing allowed `Origin`, credentialed cookies and `X-CSRF-Token`. Bootstrap signed-out CSRF using `GET /csrf` before POSTs. Bodies never accept a caller-selected user ID.

| POST route | Input | Result |
| --- | --- | --- |
| `/register` | `name`, normalized `email`, `password`, `confirmPassword` | 202 pending metadata; **no user, profile or session is created** |
| `/register/confirm` | `registrationId` (UUID), `code` (six ASCII digits as a string) | 201 public user + HttpOnly session cookie; verified account/profile/session and consumption commit together |
| `/register/resend` | `registrationId` | 200 updated pending metadata; new code invalidates the prior code |

Pending responses contain `registrationId`, `maskedEmail`, `expiresAt`, `resendAt`, `serverTime`, and `deliveryStatus: sent | unavailable`. A failed SMTP attempt returns `unavailable`, preserving the pending record for controlled resend; it never reports successful account creation. Existing and new addresses get the same start flow. An already registered email can only be rejected after a correct code proves mailbox possession; confirmation then returns generic 409 `registration_unavailable`, without creating another account or session. A new registration start supersedes earlier unfinished registrations for that email.

The former account-creating `/register` behavior is removed. Missing password confirmation is a schema error, not a legacy signup bypass. Refresh CSRF after successful confirmation changes the session cookie. The frontend uses the existing authentication provider to cancel and clear private queries, restore the new identity, notify other tabs, and navigate to `/profile`.

Safe 400 error codes: `incorrect_code`, `registration_expired`, `registration_exhausted`, `registration_closed`. Terminal states require starting again or logging in if already completed. 429 returns `Retry-After`; cooldown uses `resend_cooldown`, other budgets use `rate_limited`. Neither backend nor client automatically retries an unsafe request.

## Storage, policy and concurrency

Migration **0006_pending_signup** adds `pending_registrations`, leaving all existing records and applied migrations unchanged. It stores a random UUID, normalized email/name, Argon2 password hash, keyed HMAC-SHA256 code digest, creation/issuance/expiry times, failed-attempt and resend counters, and closed/consumed timestamps. No plaintext password or code is stored. Public responses exclude these hashes and counters.

`secrets.randbelow` generates six digits, padded with leading zeros. The digest includes a purpose prefix and registration ID, keyed by the existing server-only `CSRF_SECRET`. This prevents offline enumeration from a database-only leak; an ordinary salted or unsalted fast hash would not protect a six-digit space. Keep the secret stable and identical across workers. Rotation invalidates pending codes as well as CSRF signatures; users must start again. It does not invalidate existing opaque sessions or recovery-link hashes.

| Setting | Default |
| --- | --- |
| `SIGNUP_CODE_TTL_SECONDS` | 600 (10 minutes from registration start) |
| `SIGNUP_CODE_ATTEMPTS` | 5 incorrect attempts per registration |
| `SIGNUP_RESEND_COOLDOWN_SECONDS` | 60 seconds between issuance attempts |
| `RATE_SIGNUP_LIMIT` | 5 starts per normalized email per 15-minute rate window |
| `RATE_EMAIL_LIMIT` | 3 signup resend requests per email per window (including refused cooldown requests) |
| `RATE_TOKEN_LIMIT` | 10 signup confirmations per email per window, spanning registration IDs |
| `RATE_IP_LIMIT` | Existing shared 300-request limit per window across protected auth actions |

Resends do **not** reset incorrect attempts or extend the original expiry. Expired or exhausted flows can be restarted, but email/IP budgets continue across new IDs. Failed delivery still consumes the cooldown/send budget. Invalid six-digit guesses increment the pending counter in a committed transaction before returning an error. Schema-invalid inputs are rejected before hashing or accounting.

All registration transitions take a keyed email advisory transaction lock, then the pending-row lock. Confirmation rechecks closed/consumed/expired/exhausted state and the email unique constraint. One transaction creates user/profile/session and marks consumption. Replayed or concurrent confirmations cannot create another session. Failed database writes roll the whole creation back. Email is attempted only after pending state commits.

The browser retains only registration ID, expiry/resend times, clock offset and delivery status in per-tab `sessionStorage`. Passwords, codes and raw email addresses are never persisted there. Reload resumes the form with a generic destination label; the server remains authoritative. Storage failure falls back to memory. Change-email/start-again clears that metadata and all form credentials before a new start. Backend cleanup also removes expired pending registrations:

```powershell
cd backend
.venv/Scripts/python.exe -m app.cleanup_auth
```

This explicit cleanup is not scheduled automatically. It does not delete accounts, sessions or project data.

## Tests

Use the guarded dedicated PostgreSQL test database on port 5433, following [backend test setup](README.md#checks-and-dedicated-test-database). Never point destructive fixtures at development data. Run backend tests and real API browser tests sequentially; their existing database lock prevents overlapping resets.

```powershell
cd backend
.venv/Scripts/python.exe -m pytest -q -p no:cacheprovider
.venv/Scripts/python.exe -m ruff check .
.venv/Scripts/python.exe -m ruff format --check .
.venv/Scripts/python.exe -m pip check
cd ../frontend
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:api
```

`test_registration.py` covers pending-only creation, leading zeros, persisted attempts, replay/expiry/exhaustion/supersession, resend cooldown and budgets, SMTP failure, concurrent confirmation, uniqueness and CSRF. Existing integration tests still cover transaction rollback, password-only login, password reset and legacy unverified accounts. Browser helpers read Mailpit privately; traces/video/screenshots are disabled for code steps and codes are not included in assertions or attachments.

### Executed verification — 2026-10-07

- Docker development/test PostgreSQL and Mailpit were healthy. The local development target was verified before applying `0006_pending_signup`; existing user counts were unchanged. No development reset, project seed or ownership command ran.
- **80 backend tests passed, zero skips**, against guarded PostgreSQL. A final targeted rollback check also passed, including the assertion that failed account creation leaves registration unconsumed.
- **54 frontend unit tests, 24 real API browser tests and 29 mock browser tests passed.** The browser suite includes code signup, reload recovery, logout/password-only login, password recovery and the existing project/application flows.
- Ruff lint/formatting, pip checks, frontend lint and TypeScript checks passed. Both mock and API production builds passed in separate output folders.
- Port 3000 was occupied by the running development website. Mock tests used `MOCK_TEST_PORT=3200` and `MOCK_TEST_DIST_DIR=.next-mock-test`, without stopping that website. Temporary test/build output remains ignored. The previously started local FastAPI process was restarted, and readiness plus the new registration contract were verified on port 8000.

No unresolved local blocker. External inbox delivery still requires a production SMTP provider and authorized sender; only local Mailpit delivery was tested. No commit or push was performed.
