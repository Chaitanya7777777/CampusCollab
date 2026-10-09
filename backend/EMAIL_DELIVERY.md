# Email delivery: Mailpit and Brevo

All signup codes, password resets and existing-account verification emails use the same email service and templates. `EMAIL_PROVIDER` explicitly selects `smtp` (the default, including local Mailpit) or `brevo` (HTTPS). A provider failure never falls back to another provider.

The [prepared free-hosting configuration](../DEPLOYMENT.md) requires Brevo in production because Render Free blocks SMTP ports. SMTP/Mailpit remains available for development and tests. Production also requires the proxy, host, cookie and database settings in that guide; email settings alone are insufficient.

## Private configuration

Edit the ignored `backend/.env` in your editor, preserving its other settings. Never put credentials in frontend variables, source code, chat or shell history. The tracked [.env.example](.env.example) contains placeholders only.

For Brevo, fill in these values privately:

```dotenv
EMAIL_PROVIDER=brevo
BREVO_API_KEY=<your-private-brevo-api-key>
BREVO_SENDER_EMAIL=<your-verified-sender-email>
BREVO_SENDER_NAME=CampusCollab
BREVO_TIMEOUT_SECONDS=5
FRONTEND_BASE_URL=http://localhost:3000
```

The key and valid sender email are required when Brevo is selected; placeholder keys fail startup validation. The sender must be authorized in your Brevo account. SMTP settings are unused in Brevo mode. No credentials use `NEXT_PUBLIC` settings.

To use local Mailpit instead:

```dotenv
EMAIL_PROVIDER=smtp
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_TLS=none
SMTP_FROM=CampusCollab <noreply@campuscollab.local>
SMTP_TIMEOUT_SECONDS=5
```

Leave SMTP username/password unset for Mailpit. From the repository root, run `docker compose up -d --wait mailpit`. Its inbox is at **http://localhost:8025**. Mailpit captures messages locally; it does not forward them to Gmail or other external inboxes.

After changing configuration, stop your backend terminal with Ctrl+C and restart from the repository root:

```powershell
cd backend
.venv/Scripts/python.exe -m uvicorn app.main:create_app --factory --reload --no-access-log --no-proxy-headers
```

POSIX uses `.venv/bin/python`. Environment-file edits require a backend restart. No migration or frontend rebuild is needed for provider selection.

`FRONTEND_BASE_URL` determines reset/verification links, never the incoming Host header. With the local value, links open localhost and require your local frontend to be running on that computer. Production requires the actual HTTPS frontend origin, along with the existing HTTPS, CORS and secure-cookie configuration; see [authentication operations](AUTHENTICATION.md). Do not deploy localhost links.

## Transport and failure behavior

The implementation follows Brevo's [transactional email guide](https://developers.brevo.com/docs/send-a-transactional-email) and [endpoint reference](https://developers.brevo.com/reference/send-transac-email): a fixed HTTPS `POST /v3/smtp/email`, server-side `api-key` header, sender, recipient, subject and `htmlContent` from the existing escaped template. The guide specifies one content type per request; SMTP retains its multipart plain-text/HTML message.

HTTPX uses certificate validation, no redirects, no environment proxies and no automatic retries. Each send owns an async client that closes on success, error or cancellation. The configurable total/read/write timeout defaults to five seconds (range 1–10); connection timeout is at most two seconds. Response bodies are bounded and never logged. A `201` with a valid `messageId` means **provider acceptance**, not inbox delivery. The existing API value `deliveryStatus: sent` has this acceptance meaning.

Safe operational logs report only provider, a fixed failure category and HTTP status, excluding recipient, API key, body, code, token and raw provider errors:

| Category | What to check privately |
| --- | --- |
| `credentials_rejected` | API key validity and permissions (401). |
| `account_or_sender_restricted` | Account approval, transactional access and sender authorization (403 or permission error). |
| `payload_or_sender_rejected` | Sender setup and provider restrictions (400). |
| `quota_exhausted` | Available transactional credits/quota. |
| `provider_rate_limited` | Provider limits (429); wait before a controlled resend. |
| `provider_unavailable` | Provider service errors (5xx). |
| `timeout_acceptance_unknown` / `network_acceptance_unknown` | Connectivity; the email might already have been accepted. Inspect provider logs before resending. |
| `malformed_response` / `unexpected_response` | Unexpected provider response; acceptance cannot be confirmed. |

In Brevo, open **Transactional → Logs** and inspect the message's events, such as sent, delivered or bounced; see [Brevo's reporting guide](https://help.brevo.com/hc/en-us/articles/208858829-Review-your-transactional-email-reports). Acceptance alone does not establish delivery, inbox placement or that someone read the message. Never share logs containing recipients or email content publicly.

### Tracing a recovery request safely

Startup logs emit `email_provider_configured` with only the provider and credential-presence flags. Settings load `.env` relative to the backend process working directory; OS environment variables take precedence. Run from `backend/` and restart after private environment edits. An unsaved editor buffer is not configuration. The default provider is SMTP, so empty Brevo logs alone do not indicate an HTTPS failure.

The response's `X-Request-ID` correlates with server-only events (no email addresses, tokens or bodies):

- `authentication_email_not_sent`: intentionally skipped because no eligible account/token exists, or the request was rate limited.
- `authentication_email_attempted`: the configured transport was invoked.
- `authentication_email_delivery_failed`: a sanitized provider/transport category; acceptance is unconfirmed.
- `authentication_email_accepted`: transport acceptance only, not confirmed inbox delivery.
- `authentication_email_issuance_failed`: token persistence failed before delivery.

Public recovery responses remain generic for unknown accounts and delivery failures. Rate limits retain their existing 429 response. Diagnostics are not returned to browsers; restrict server-log access to operators. Do not clear rate-limit buckets or issue a replacement token merely to diagnose a request.

Diagnostics validation on 2026-10-09: the full 124-test backend suite passed with no skips against the guarded PostgreSQL test database, including mocked Brevo calls and correlated generic-recovery failure/skip checks. Ruff lint/format, dependency checks and whitespace checks passed. The initial database run was blocked by the stopped test service; starting that service resolved it without touching development data. No real Brevo request was made.

Signup delivery failure returns recoverable `unavailable` metadata and creates no account. Controlled resend retains the cooldown, original expiry and failed-guess budget. Password-reset and legacy verification requests retain generic responses for known/unknown accounts, including delivery errors. Their response timing floor uses the selected provider timeout. Email sends follow database commits, with no durable queue or automatic retry. Account creation still requires successful code confirmation; all existing CSRF, rate limits, token single-use and session revocation rules remain unchanged.

## Manual checks after configuring credentials

No real Brevo email is sent by the automated tests or by installing this integration.

1. Start the API-mode frontend and backend. On `/signup`, use an address you control and select **Send verification code**. With Brevo selected, check that external inbox and Brevo's transactional logs; with SMTP/Mailpit, use the local inbox instead.
2. Enter the latest six-digit code, preserving leading zeros, then select **Verify and create account**. The profile opens only after confirmation. If sending fails, resolve the provider issue and use resend after the displayed cooldown; do not repeatedly restart signup.
3. Log out, log in with the password, then use **Forgot password?**. Its response is intentionally generic. Open the latest reset email on the machine running the configured frontend, set a new password, and log in again. Existing sessions should require login again.
4. For an existing unverified account, the profile's resend action uses the same provider. Follow the email link and explicitly confirm verification.

Provider credentials, approval, quota, sender restrictions and actual external delivery must be checked manually. The implementation does not claim that your account can send until that check succeeds.

## Automated verification

`tests/test_brevo.py` uses HTTPX MockTransport for every Brevo request, covering payload/auth, acceptance, invalid configuration, sanitized failures, timeouts, cleanup and no fallback. PostgreSQL tests cover signup failure/resend recovery and generic password-recovery responses. Existing authentication tests exercise single-use tokens, session revocation, CSRF and concurrency. Browser test settings explicitly force local SMTP/Mailpit, regardless of the developer's selected provider.

Run the backend suite with the guarded test database as documented in [backend setup](README.md#checks-and-dedicated-test-database). Never reset the development database, and finish backend tests before browser tests use the same dedicated database.

### Executed checks — 2026-10-08

- Full backend suite: **124 passed, zero skips**, including **70 PostgreSQL integration tests** and 38 new provider-related cases. Command: `python -m pytest -q -o cache_dir=.pytest_cache_brevo_full`, with the documented dedicated test URL and reset consent explicitly set.
- Ruff lint and formatting: passed; `python -m pip check`: no broken requirements.
- `npm run test:api -- signup-code.spec.ts recovery.spec.ts`: **6 passed, zero skips**, desktop/mobile against local Mailpit and the guarded test database. The first launch omitted the required test environment variables and was refused by the database guard; the correctly configured rerun passed without changing guards.
- Documentation file links and `git diff --check`: passed. `backend/.env` remains ignored and unchanged. No development data reset, migration, real Brevo request, commit or push occurred.
- Frontend application code was unchanged; production builds and unrelated browser suites were not repeated. Actual Brevo account authorization, quota and inbox delivery remain manual checks after private configuration.

## Maintainer-reported manual verification (2026-10-09)

The maintainer confirmed that signup codes arrived through Brevo and account confirmation succeeded, and that recovery emails arrived and password reset succeeded. These are manual inbox/workflow checks, separate from mocked-provider and Mailpit automated tests. They verify the tested local configuration, not a deployed production environment or guaranteed future inbox placement.

The earlier missing-email diagnosis was resolved by saving the private Brevo settings in `backend/.env` and restarting the backend. No settings-loader or database change was needed. The service now logs provider selection and credential-presence flags at startup; private values remain excluded.
