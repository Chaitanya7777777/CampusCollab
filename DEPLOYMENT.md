# Deployment and operations

Live website: **[CampusCollab](https://campus-collab-beryl.vercel.app)**.

Hosting: **Vercel Hobby** (Next.js), **Render Free, Singapore** (FastAPI), **Neon PostgreSQL, Singapore**, and **Brevo HTTPS** email delivery. The maintainer reports successful deployed-site use, including the hosted catalog and imported projects, on 2026-10-10. This report is separate from automated local checks and is not a claim that every hosted workflow or failure scenario was tested.

Local accounts, credentials, sessions, applications and team activity are not transferred. An explicitly authorized catalog seed and curated-project import populated hosted records; see the [import operations guide](backend/CURATED_IMPORT.md). Mock mode remains separate. These instructions also document how to reproduce the deployment; nothing provisions resources automatically.

## Request and trust boundary

The browser uses `/api/v1` on its Vercel origin. The Node route handler forwards only supported API prefixes and methods to the fixed `API_BACKEND_ORIGIN`; it strips caller proxy/authorization headers, rejects redirects, and preserves bodies, queries, CSRF headers, status and separate Set-Cookie headers. Private responses are never cached. Cookies remain host-only, HttpOnly, Secure, Path=/, SameSite=lax on the frontend origin. No third-party cookies are required.

Vercel's [documented ingress](https://vercel.com/docs/headers/request-headers) overwrites `X-Forwarded-For`. Only when running on Vercel does the route accept that single validated IP. It sends a separate client-IP header authenticated by `API_PROXY_SECRET`. FastAPI rejects all `/api/v1` calls lacking that private credential, including direct calls to the public Render URL. The health endpoints remain public. User identity still comes from the session; the proxy credential does not grant application permissions. FastAPI's Origin and CSRF checks remain mandatory.

Use Vercel directly, with no additional reverse proxy in front. Do not enable wildcard proxy trust or Uvicorn proxy headers. `TRUSTED_PROXY_NETWORKS=[]` is required in production. If the private credential leaks, rotate it on both services: it protects IP attribution, not user authentication. Shared campus IPs still share the generous IP budget; tighter per-email limits remain. This is not a DDoS protection system. In explicit local proxy mode, caller forwarding headers are ignored and clients share loopback IP.

## Provider setup and order

1. Create a **Neon Free** project/database in a region close to Render. Use a new empty database, not a development export. Keep the generated credentials private. Select its **direct** connection endpoint (hostname without `-pooler`).
2. Reserve/create the Render service and Vercel project to determine stable `your-api.onrender.com` and `your-project.vercel.app` names. Set their environment variables before allowing an operational deployment. Initial setup can leave a service undeployed or failing configuration validation while URLs are being assigned. Do not relax validation to break this dependency. Use the stable production Vercel URL, not per-commit preview URLs.
3. Configure Render and deploy the backend when authorized. Its start command migrates the database before serving. Then explicitly seed the skill catalog using the local administrative procedure below.
4. Configure Vercel and deploy the frontend when authorized. Set the proxy secret identically on both providers. Production preview deployments must not inherit live database/proxy credentials; preview URLs are intentionally rejected. Use mock mode or an isolated environment for previews.
5. Run the manual smoke test below. A health check alone does not verify cookies, email delivery, or the team workflow.

No custom domains, GitHub Actions, paid shell, pre-deploy command, queue or worker is needed. Provider setup is manual. Pushes to the connected branch may trigger provider auto-deploys when enabled; committing operational scripts does not execute them.

## Render settings

| Setting | Value |
| --- | --- |
| Service | Web Service, **Free**, Python |
| Root directory | `backend` |
| Python | `3.14.6` (`PYTHON_VERSION`; also recorded in `.python-version`) |
| Build command | `pip install -r requirements.txt` |
| Start command | `python -m app.production_start` |
| Health check | `/health/ready` |

The entry point binds `0.0.0.0:$PORT` (fallback 10000), one worker, no reload, no access log, no proxy-header trust. Dependencies are pinned. `/health/live` checks only the process; readiness checks PostgreSQL without exposing its address.

## Vercel settings

Import the existing repository using the Next.js preset and **Root Directory `frontend`**. Use Node.js **24.x**, install `npm ci`, build `npm run build`, and the framework's default output/runtime. There is no custom `next start` command on Vercel; locally a production build uses `npm run start`. Enable the current default Fluid Compute. The forwarding function has a 30-second maximum, with a 20-second upstream deadline and a 25-second browser deadline. It never retries mutations. An initial request to a sleeping Render instance can fail while waking it; wait and retry manually. For ambiguous saves/applications, refresh and check the recorded state before repeating.

## Environment variables

Use provider dashboards for secrets. Do not put actual credentials in these examples, Git, chat, logs, shell history or `NEXT_PUBLIC_*` variables. Preserve existing local `.env` files.

| Provider | Variable | Value |
| --- | --- | --- |
| Vercel | `NEXT_PUBLIC_APP_MODE` | `api` |
| Vercel | `NEXT_PUBLIC_API_BASE_URL` | `/api/v1` (public path only) |
| Vercel | `APP_ORIGIN` | `https://your-project.vercel.app` |
| Vercel | `API_BACKEND_ORIGIN` | `https://your-api.onrender.com` (server-only) |
| Both | `API_PROXY_SECRET` | Same independently generated random secret, at least 32 characters |
| Render | `PYTHON_VERSION` | `3.14.6` |
| Render | `APP_ENV` | `production` |
| Render | `DATABASE_URL` | `postgresql://USER:PASSWORD@DIRECT-NEON-HOST/DATABASE?sslmode=require` |
| Render | `MIGRATION_DATABASE_URL` | Optional separate **direct** URL for the same database; otherwise DATABASE_URL |
| Render | `DATABASE_TLS` | `true` |
| Render | `DATABASE_POOL_SIZE` | `3` |
| Render | `CSRF_SECRET` | Independently generated secret, at least 32 characters; keep stable across restarts |
| Render | `FRONTEND_BASE_URL` | `https://your-project.vercel.app` |
| Render | `ALLOWED_ORIGINS` | `["https://your-project.vercel.app"]` |
| Render | `ALLOWED_HOSTS` | `["your-api.onrender.com"]` |
| Render | `COOKIE_SECURE` | `true` |
| Render | `COOKIE_SAMESITE` | `lax` |
| Render | `TRUSTED_PROXY_NETWORKS` | `[]` |
| Render | `EMAIL_PROVIDER` | `brevo` |
| Render | `BREVO_API_KEY` | Private Brevo key |
| Render | `BREVO_SENDER_EMAIL` | Your authorized sender |
| Render | `BREVO_SENDER_NAME` | `CampusCollab` |
| Render | `BREVO_TIMEOUT_SECONDS` | `5` |

Do **not** set `API_PROXY_LOCAL` on Vercel. `VERCEL=1` is supplied by Vercel, not a local trust bypass. Production rejects localhost/default hosts, insecure database connections, missing proxy authentication, mismatched origins and insecure cookies. Session/signup/rate-limit defaults remain in [authentication documentation](backend/AUTHENTICATION.md); the existing CSRF secret also protects signup code digests and hashed rate-limit identifiers. Do not rotate it casually.

Generate each new secret without printing it. From the root, the following writes a newly generated value into an ignored file **only if that file does not already exist**:

```powershell
backend/.venv/Scripts/python.exe -c "import secrets; from pathlib import Path; p=Path('backend/.env.generated-proxy'); p.open('x').write(secrets.token_urlsafe(48))"
backend/.venv/Scripts/python.exe -c "import secrets; from pathlib import Path; p=Path('backend/.env.generated-csrf'); p.open('x').write(secrets.token_urlsafe(48))"
```

Open these privately in your editor and paste into the dashboards. Do not display them with terminal commands. POSIX uses `.venv/bin/python`. Never reuse the example/test secrets.

## Database TLS, migrations and seeding

The application normalizes `postgres://`, `postgresql://` and `postgresql+asyncpg://` URLs to SQLAlchemy's asyncpg driver. `sslmode=require` or `verify-full` is removed from the query and implemented as a Python SSL context with certificate **and hostname** verification. This strengthens `require`; TLS is never disabled remotely. Remove libpq-only options such as `channel_binding=require` from Neon copy/paste URLs; unsupported query parameters fail validation rather than reaching asyncpg. Percent-encode credential characters when constructing URLs; prefer the provider-generated URI.

Use direct connections for this one-worker MVP, with a bounded pool of three, no overflow, ten-second pool/connect deadlines, twenty-second statement timeout, pre-ping and five-minute recycling. These handle stale idle connections without reconnect loops or mutation retries. Deploy overlap can temporarily use two pools. Neon's pooler supports many clients but has transaction-pooling/session-state considerations; this small service does not need it. The migration advisory lock specifically requires a direct connection. See [Neon connection guidance](https://neon.com/docs/get-started/connect-neon), [Neon pooling](https://neon.com/docs/connect/connection-pooling), and [SQLAlchemy asyncpg](https://docs.sqlalchemy.org/en/20/dialects/postgresql.html#module-sqlalchemy.dialects.postgresql.asyncpg).

`app.production_start` runs `alembic upgrade head` before binding the port. Online Alembic commands take the same PostgreSQL session advisory lock, released when the connection closes even on failure. Lock waits are bounded by the driver timeout; failure stops that deployment. It never drops, resets, downgrades or seeds data. No paid Render pre-deploy hook is used.

Startup failures emit a JSON `production_startup_failed` event with `stage`
(`configuration_validation`, `database_connection`, `migration`, or `server_launch`),
`exception_class`, `category`, a safe `explanation`, and relevant `settings` names.
Configuration summaries omit values, inputs and exception context. Database errors
are categorized using exception types/SQLSTATE (for example TLS certificate, DNS,
authentication, permission or timeout), never raw driver text or connection URLs.
The migration stage includes advisory-lock acquisition. Unknown errors remain
generic rather than risking disclosure. No failure bypasses validation or starts
the server after a failed migration.

If Render reports only the old bare event, it is still running the earlier entry
point. After these diagnostics are committed and deployed with authorization,
inspect the new JSON event to identify the next action; do not infer a database
credential problem from the old message alone. Do not share environment values.

For explicit migration/skill-seeding administration, create a separate ignored environment file, for example `backend/.env.hosted`, with the Render settings and direct Neon credentials using your editor. Keep local `backend/.env` unchanged. Run from `backend/`:

```powershell
.venv/Scripts/python.exe -c "from dotenv import load_dotenv; load_dotenv('.env.hosted', override=True); from alembic.config import Config; from alembic import command; command.upgrade(Config('alembic.ini'), 'head')"
.venv/Scripts/python.exe -c "from dotenv import load_dotenv; load_dotenv('.env.hosted', override=True); import runpy; runpy.run_module('app.skills', run_name='__main__')"
```

Review the target privately before running these against hosted data. Skill seeding is explicit, transactional and idempotent. Do not run project/sample conversion commands or import browser storage. Never set TEST_DATABASE_URL to Neon: integration guards require the dedicated local test database.

Render may keep the previous instance serving while startup migrations execute. Future migrations must follow expand/contract compatibility: additive schema first, compatible code next, destructive changes only in a separately planned maintenance release. The lock serializes migration runners, not application traffic. A service rollback does **not** undo schema changes; assess compatibility and backup/export options before a schema release. No automatic downgrade or destructive rollback is provided.

## Smoke test after an authorized deployment

1. Check Render readiness, then load the stable Vercel URL. Browser API requests should use only that origin. Direct Render API calls without the proxy credential should return 403.
2. Sign up with a controlled address, receive a Brevo code, confirm, edit profile/skills, reload, log out and log back in. Inspect cookie attributes privately. Do not include tokens or cookies in shared screenshots.
3. Request a password reset; its link must open the Vercel URL. Change the password, confirm old sessions are rejected, and log in again. Provider acceptance is not proof of inbox delivery: verify receipt and check Brevo transactional events.
4. Publish a project. In a separate browser profile, create/verify another account, discover it and apply. As owner, review and accept; reload the applicant history and team roster to check membership/capacity. Also test rejection/withdrawal and owner-only access.
5. Scroll Discover, switch tabs, return; scroll/filter state and unsaved profile/project inputs should remain. Logout in another tab must still remove private content.
6. Repeat after Render/Neon have idled. Expect retryable cold-start failures; never repeatedly click a mutation assuming the previous call did nothing.

## Free-plan limitations and verification boundary

Checked against official documentation on 2026-10-09:

- [Vercel Hobby](https://vercel.com/docs/plans/hobby) is for personal, non-commercial use; stay within its usage limits. [Function duration](https://vercel.com/docs/functions/configuring-functions/duration) allows this 30-second function with Fluid Compute. Do not upgrade or enable paid overages for this plan.
- [Render Free](https://render.com/docs/free) sleeps after 15 minutes of inactivity and can take about a minute to resume. Free services have monthly compute/build/bandwidth quotas, no durable disk or shell access, and SMTP ports are blocked. This implementation uses HTTPS Brevo and Neon persistence. Free services can be suspended on quota exhaustion; they are not an availability guarantee.
- [Neon's current Free-plan announcement](https://neon.com/blog/neon-free-plan-1-gb-per-project) lists 1 GB storage and 100 CU-hours per project/month. Idle compute can suspend; verify the current dashboard quotas and network-transfer limits before rollout. Do not enable a paid plan to exceed them.
- Brevo delivery remains subject to your account's approval, sender authorization and free quota. No durable email retry queue exists.

Authorized hosted database checks confirmed migration `0007_project_conversion`, a 28-skill catalog, and nine imported projects with 18 roles and nine actual owner memberships. Repeated seed/import runs preserved counts and IDs. No hosted test applications or emails were sent by those checks. The maintainer separately reports the deployed website works; the detailed multi-account smoke test above remains a checklist, not an assertion of completed coverage. Platform logs, quotas and access controls still need ongoing review.

## Local verification commands

Use the dedicated test service and explicit reset consent from [backend testing](backend/README.md#checks-and-dedicated-test-database), never the development or Neon URL. Finish each database-using suite before starting the next:

```powershell
# Repository root; local services only
docker compose --profile test up -d --wait postgres-test mailpit
$env:TEST_DATABASE_URL = 'postgresql+asyncpg://campuscollab_test:local_test_only@127.0.0.1:5433/campuscollab_test'
$env:ALLOW_TEST_DB_RESET = 'campuscollab_test'
cd backend
.venv/Scripts/python.exe -m pytest -q
.venv/Scripts/python.exe -m ruff check .
.venv/Scripts/python.exe -m ruff format --check .
.venv/Scripts/python.exe -m pip check
cd ../frontend
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd exec playwright -- test --config playwright.proxy.config.ts
npm.cmd run test:api
```

The proxy browser config generates an ephemeral server credential, uses loopback-only forwarding and forces Mailpit. No automated test sends Brevo email. It reuses the tab-switch regression. Standard API tests retain the direct local connection. Do not run suites concurrently against the same test database or share artifact directories between simultaneous browser suites.

### Local verification snapshot — 2026-10-10

- Backend: **145 passed, no skips**, including guarded PostgreSQL integration and concurrent authentication/application tests. Ruff lint/format and `pip check` passed.
- Frontend: lint, TypeScript and **64 unit tests** passed. Production builds passed in API mode with placeholder Vercel/Render configuration and in mock mode.
- Browser: **26 API workflow tests**, **29 mock tests**, and **4 same-origin forwarding tests** passed. Forwarding coverage includes cookies, CSRF, logout, recovery, account isolation and desktop/mobile tab-switch scroll/form preservation. Playwright recorded no failed tests. PowerShell labeled redirected Node color warnings as native-command errors on the latter two runs; their Playwright result files independently report `passed`.
- The smaller database pool exposed connection starvation during concurrent signup confirmation. Releasing the preliminary lookup transaction before independent rate-limit accounting fixed it; authoritative state is still re-read under locks. All concurrency regressions passed afterward.
- A final pytest run encountered a Windows cache-directory permission error. Re-running with `-o cache_dir=.pytest_cache_deployment_final` passed; no test or database guard was relaxed.
- Local documentation links and Git whitespace checks passed. Private environment files remain ignored and unchanged. No real email was sent and no development database was reset.

These checks verify local forwarding and configuration behavior, not Vercel ingress, Render cold starts, Neon connectivity or hosted email delivery. Those require the authorized deployment smoke test above.
