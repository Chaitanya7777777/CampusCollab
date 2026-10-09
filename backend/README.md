# CampusCollab backend

For the prepared Render Free/Neon/Vercel configuration, use the [deployment guide](../DEPLOYMENT.md). Production now requires authenticated frontend forwarding, explicit hosts/origin, verified database TLS and Brevo HTTPS. Local settings and the guarded test database remain separate.

Email delivery supports local SMTP/Mailpit and Brevo HTTPS. See [EMAIL_DELIVERY.md](EMAIL_DELIVERY.md) for private configuration, restart commands and safe delivery diagnostics.

New signup uses email codes before account creation. See [SIGNUP_CODES.md](SIGNUP_CODES.md) for endpoints, local Mailpit steps, limits and migration details.

Existing seeded projects can be converted to ordinary projects owned by an existing verified account. See [conversion and maintenance](SAMPLE_PROJECTS.md) for the transactional preview/apply command and protected cleanup boundaries. Fictional seed identities remain disabled.

Verified against real local PostgreSQL on **2026-10-02**: both Compose services healthy; development migration head **0001_identity**; two explicit seed runs produced identical **28 skills and stable IDs**. The complete suite passed **24 tests (15 Python-only + 9 PostgreSQL integration), 0 skips**, plus Ruff lint/format and pip dependency checks. Guards remained unchanged. A Windows pytest cache-write issue required a fresh temporary cache via `-o cache_dir=<temporary-directory>`; no backend implementation changes were needed.

The live HTTP walkthrough passed: liveness/readiness, CSRF bootstrap, registration/current identity, profile and skill persistence, logout/401, login with saved profile, final logout/401, and missing-CSRF rejection/403. Existing `.env` and development data were preserved. One unique fictional verification account remains; both databases remain running, and only the temporary verification API server was stopped. Frontend authentication/profile integration is now implemented in API mode; production hardening remains deferred.

FastAPI serves the frontend's explicit API mode for authentication, profiles, skills, projects, applications and team formation. Mock mode remains separate; no browser storage or fictional accounts are imported. The current migration head is `0007_project_conversion`; the dated verification records describe earlier milestones as well as the latest application milestone. See [frontend integration setup and browser tests](../frontend/API_MODE.md).

## Frontend integration verification

API-mode frontend integration passed **6 real-browser tests** across desktop/mobile against this FastAPI application and the isolated PostgreSQL test database. The backend suite also passed **24 tests including all 9 database integration tests**, with zero skips, after adding the shared test-database lock. Ruff lint/format and pip checks passed. The frontend passed 49 unit tests, 27 mock browser regressions, TypeScript/lint and production builds in both modes. See [mode configuration and browser test commands](../frontend/API_MODE.md). Development data was not reset or imported.

## Local setup

Install Python 3.12+ (locally checked with 3.14.6) and Docker with Compose v2. Check `python --version`, `docker --version`, and `docker compose version`. On Windows, start Docker Desktop with Linux containers. `requirements.txt` pins direct and transitive dependencies; `requirements.in` records direct dependencies.

PowerShell, from the repository root:

```powershell
docker compose up -d --wait postgres mailpit
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
backend/.venv/Scripts/python.exe -c "import secrets; print(secrets.token_urlsafe(48))"
# Set CSRF_SECRET in backend/.env to the generated value.
cd backend
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m app.skills
.venv/Scripts/python.exe -m uvicorn app.main:create_app --factory --reload --no-access-log --no-proxy-headers
```

POSIX, from the repository root:

```sh
docker compose up -d --wait postgres mailpit
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
test -f backend/.env || cp backend/.env.example backend/.env
backend/.venv/bin/python -c 'import secrets; print(secrets.token_urlsafe(48))'
# Set CSRF_SECRET in backend/.env to the generated value.
cd backend
.venv/bin/python -m alembic upgrade head
.venv/bin/python -m app.skills
.venv/bin/python -m uvicorn app.main:create_app --factory --reload --no-access-log --no-proxy-headers
```

Run backend commands from `backend/` so settings find `.env`. API schemas: `http://localhost:8000/docs`. The placeholder secret intentionally fails configuration validation. Real environment files and virtual environments are ignored. Compose credentials are local examples, not production credentials. PostgreSQL binds only to `127.0.0.1:5432`, has a health check and persists in the named `postgres_data` volume. `docker compose stop` preserves data; do not remove the volume unless deliberately resetting it.

Alembic owns schema changes; startup never creates tables. The explicit skill seed is transactional and idempotent. It creates 28 catalog skills, never accounts. Entity keys are UUIDs; `user_skills` has a composite primary key. API skill IDs retain frontend slugs (`react`, `c--`, `node-js`, etc.). Each maps to UUID5 using `NAMESPACE_URL` and `https://campuscollab.local/skills/{slug}`. Re-seeding updates names without replacing IDs.

## API and security contract

| Method/path | Behavior |
| --- | --- |
| GET `/health/live` | Process health, no DB connection. |
| GET `/health/ready` | DB query, generic 503 on failure. |
| GET `/api/v1/auth/csrf` | Allowed Origin required; bootstrap cookie and JSON `csrfToken`. |
| POST `/api/v1/auth/register` | Name/email/password/confirmation; pending registration and email code only; 202. |
| POST `/api/v1/auth/register/confirm` | Registration ID/code; atomic verified user, profile and session; 201. |
| POST `/api/v1/auth/register/resend` | Registration ID; controlled code resend; 200 metadata. |
| POST `/api/v1/auth/login` | Email/password; new session; generic incorrect-credentials 401. |
| POST `/api/v1/auth/logout` | Revokes this session and clears cookies; repeat-safe 204 with valid CSRF. |
| GET `/api/v1/auth/me` | Session-derived user ID, name, email, createdAt. |
| GET/PATCH `/api/v1/profiles/me` | Current user's profile; no caller-selected user ID. |
| GET `/api/v1/skills` | Public `{id, name}` catalog. |

Email is trimmed and lowercased in full, with a database unique constraint. Concurrent duplicates return 409 without partial records. Passwords are 12–128 characters at registration and hashed with Argon2id. Sessions use random 256-bit opaque tokens; only SHA-256 token hashes are stored. Expiry and revocation are checked against the database. Multiple sessions are supported; logout only revokes the current one. Tokens never appear in JSON or localStorage.

Every unsafe request, including registration/login/logout, requires an allowed `Origin` and `X-CSRF-Token`. Frontend flow:

1. Fetch `/api/v1/auth/csrf` with `credentials: "include"`; keep the returned token in memory. Browsers send Origin for cross-origin fetches; CLI clients must send it explicitly, including on bootstrap.
2. Send JSON mutations with `credentials: "include"` and the token in `X-CSRF-Token`.
3. Bootstrap again after registration confirmation/login changes the session cookie, or logout clears cookies. Refresh expired tokens before retrying. Repeat logout uses a fresh bootstrap token.

Tokens sign a nonce, timestamp, HttpOnly bootstrap cookie and current session cookie, following [OWASP signed double-submit guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#signed-double-submit-cookie-recommended). Origin checking and the signed token protect authentication endpoints too; SameSite alone is insufficient. Credentialed CORS uses explicit origins, never `*`.

Configure `SESSION_TTL_SECONDS` (default 7 days), `CSRF_TTL_SECONDS` (1 hour), `COOKIE_SECURE`, `COOKIE_SAMESITE`, `ALLOWED_ORIGINS` (JSON array), `CSRF_SECRET`, `DATABASE_URL`, and `APP_ENV`. Local HTTP uses Secure=false and SameSite=lax; use localhost consistently. Production configuration requires HTTPS origins, Secure cookies, `APP_ENV=production`, and an independently generated secret. Cross-site cookies require SameSite=none and Secure; browser third-party cookie restrictions may still apply. Cookies are host-only, HttpOnly, path `/`, with configured lifetimes. Production HTTPS infrastructure and abuse controls remain future work.

Profiles match frontend fields: name, campus, department, semester, bio, github, linkedin, website and skillIds. Email is read-only. New accounts have nullable optional fields and no selected skills, permitting incomplete onboarding. Supplied name is 2–80 characters, campus/department 2–100, semester a string 1–8, bio 20–300, links HTTP(S) up to 300. Omitted PATCH fields are preserved; explicit null clears nullable fields. Name and skillIds cannot be null; `[]` clears skills. Duplicates normalize and at most 15 unique catalog IDs are accepted. Unknown IDs reject the whole update. Profile and skill replacement commit together; a user row lock serializes concurrent edits.

## Manual signup and account walkthrough

Follow [Signup with an email code](SIGNUP_CODES.md#try-it-locally): enter details at `/signup`, read the code in local Mailpit, confirm, edit the profile, log out, and log in with email/password. Starting registration no longer creates an account or session. Existing unverified accounts retain the link-verification flow described in [AUTHENTICATION.md](AUTHENTICATION.md).

## Checks and dedicated test database

From the root:

```powershell
docker compose --profile test up -d --wait postgres-test mailpit
cd backend
$env:TEST_DATABASE_URL = 'postgresql+asyncpg://campuscollab_test:local_test_only@127.0.0.1:5433/campuscollab_test'
$env:ALLOW_TEST_DB_RESET = 'campuscollab_test'
.venv/Scripts/python.exe -m pytest -q
.venv/Scripts/python.exe -m ruff check .
.venv/Scripts/python.exe -m ruff format --check .
.venv/Scripts/python.exe -m pip check
```

POSIX: export the same variables with `export TEST_DATABASE_URL='...'` and `export ALLOW_TEST_DB_RESET=campuscollab_test`, and use `.venv/bin/python`. Test variables must be explicitly exported; `.env` does not authorize test resets.

The guard requires localhost port 5433, database AND role `campuscollab_test`, explicit reset consent, no connection-query overrides, and a URL distinct from the development URL in the environment or `.env` (including localhost aliases). It also checks the connected database/role before dropping the test public schema. Each integration test migrates an empty schema using Alembic and seeds skills. The test service uses ephemeral tmpfs, not the development volume. Do not run suites concurrently against the same test database. Reset fixtures and the API browser server share a PostgreSQL advisory lock and fail closed if the other suite is active. There is no SQLite fallback. Missing TEST_DATABASE_URL causes explicit skips; invalid configuration or an unavailable configured database fails.

Tests cover schema/model parity, seed idempotence, concurrent duplicate registration, password/session privacy, login/logout/expiry, CSRF, profile persistence, identity isolation, invalid-skill atomicity and transaction failures. Python-only checks run with `python -m pytest -m 'not integration'`. Dated results and environment notes are recorded in the verification sections of this guide.

## Files and request flow

`main.py` creates the app, CORS, safe errors and structured logs; `config.py` validates settings; `db.py` provides the async engine and per-request session. `models.py` and `migrations/` define storage; `schemas.py` defines public contracts. `security.py` handles cookies/CSRF. `auth.py`, `profiles.py` and `skills.py` keep thin routes with readable business functions, without a generic repository layer.

PATCH `/profiles/me` flows through schema validation and CSRF checks, then the session dependency hashes the cookie and finds a nonexpired/nonrevoked session. `update_profile` locks that user's row, checks catalog IDs, updates profile and join rows, and commits once. `ProfileOut` returns public fields only. Session closure rolls back unfinished transactions. No submitted user ID selects the target.

Structured logs contain request ID, route template, method, status and duration, excluding bodies, cookies, tokens and database exception details. The documented `--no-access-log` avoids Uvicorn raw URL/query logs.

Email verification, password recovery and PostgreSQL authentication limits are implemented; see [the authentication guide](AUTHENTICATION.md). Production operational hardening remains. No Redis, workers, WebSockets or AWS are added.


## Real projects (migration 0002_projects)

Run `python -m alembic upgrade head` from `backend/` using the existing virtual environment and `.env`. This upgrades the existing identity schema in place; accounts, profiles, sessions and skill selections remain intact. Never reset development storage. The skill seed stays explicit/idempotent; projects and demo accounts are never seeded or imported from browser storage.

All routes below are under `/api/v1` and require a validated session. POST/PATCH also require the existing allowed Origin and CSRF token.

| Method/path | Contract |
| --- | --- |
| GET `/projects` | Published discovery with server filtering, count, deterministic sorting and pagination. |
| POST `/projects` | Create a private draft plus its roles/skills and owner membership in one transaction. Optional `?publish=true` validates and publishes the initial form in that same transaction. |
| GET `/projects/drafts` | Only the current owner's saved drafts. |
| GET `/projects/mine` | `{owned, joined}` summaries; Joined excludes projects owned by the actor. |
| GET `/projects/{id}/draft` | Owner-only incomplete draft and form values. |
| PATCH `/projects/{id}/draft` | Replace the complete draft form and role/skill set atomically. |
| POST `/projects/{id}/publish` | Submit the complete form, validate publication, keep the ID, set publication time and open recruitment atomically. Repeated publication returns 409 without duplicating records. |
| GET `/projects/{id}` | Published details for signed-in users; archived details only for owner/current members. |
| GET `/projects/{id}/manage` | Owner-only overview and team roster, including archived read-only projects. |
| PATCH `/projects/{id}/recruitment` | `{recruitment: "open" or "closed"}`; published projects only. |
| POST `/projects/{id}/archive` | Published to archived, closes recruitment, preserves roles and memberships. |

Form fields mirror the frontend: `title`, `type`, `eventName`, `description`, nullable `capacity`, and `roles: [{id, title, responsibilities, skillIds, openings}]`. Role IDs are UUIDs generated by the editor; an existing ID belonging to another project is rejected. Skill IDs remain catalog slugs. Unknown fields (including owner IDs) are rejected. Draft title is required; blank type/description/role title and null capacity/openings can remain incomplete. Supplied numbers must be integers (capacity 2-100 including the owner; role openings 1-100). Publication requires type, description, capacity and at least one role, and every supplied role must have title, positive openings and selected catalog skills. Role totals cannot exceed capacity minus the owner. All catalog validation happens before role replacement and the complete write commits once.

`projects.owner_id` is the sole authority for ownership. An owner membership is created in the same transaction; membership uniqueness and the composite `(role_id, project_id)` foreign key prevent duplicate memberships and cross-project role references. Counts and vacancies are derived from memberships. No mutable member/opening counters exist. A missing/unauthorized private project returns 404. Invalid transitions return 409; invalid form/catalog data returns 422. Public member/owner summaries expose only ID, name, campus, department and bio, never email, password/session data or unrelated private records.

Update, publish, recruitment and archive take a `SELECT ... FOR UPDATE` project-row lock and recheck owner/status while holding it. Future application acceptance must follow the same order: project first, then application/role/member locks. All changes commit once; session closure rolls back failed writes. Archived management mutations are refused. Closing preserves roles/memberships. Application endpoints are documented below.

Discovery query parameters: `search`, `type`, `skill` (catalog slug), `role` (exact role title), `campus` (owner's current profile campus), `openingsOnly`, `sort` (`newest`, `oldest`, `title`, `openings`), `page` (1-based), `pageSize` (default 12, max 50). Search is a case-insensitive literal substring of project titles/descriptions, role titles and skill names/slugs. Combined skill/role filters apply to the same role. An open-role filter also requires remaining role and team space and open recruitment. Has-openings requires all three. Sorts end with project ID as a deterministic tie-breaker. Responses contain filtered `total`, `page`, `pageSize`, projects and filter catalogs. EXISTS/correlated counts avoid duplicated projects; roles, members, profiles and skills are bulk-loaded per result page, without N+1 queries. This is basic PostgreSQL substring search, not a recommendation system.

Project request flow: session/CSRF dependencies validate the request; `project_schemas.py` validates form types; `projects.py` locks the owner project, validates the catalog, writes projects/roles/skills/membership through the async session, commits, and builds a safe response. `models.py` and the new migration enforce relational constraints. Read-only discovery filters/counts/page selection happen in SQL.


## Project milestone verification - 2026-10-04

- Backend: **34 tests passed (15 Python-only + 19 PostgreSQL integration), zero skips**. The guarded dedicated test database was used exclusively for destructive fixtures, sequentially with browser tests. Coverage includes identity-schema upgrade with preserved profiles/selected skills/sessions, atomic owner membership/roles, incomplete drafts, publication, overposted ownership, catalog/capacity validation, private access, composite foreign keys, discovery same-role filtering/counts/sorts/pages, full team/role availability, closure/archive, concurrent publish/state transitions and failed-commit rollback.
- Ruff lint, Ruff formatting and pip dependency checks passed.
- Frontend lint, strict TypeScript and **49 unit tests** passed. **14 real API browser tests** and **29 mock browser tests** passed with zero skips. Both mock/API production builds passed. Chrome desktop/mobile screenshots of real creation and owner management were inspected; viewport overflow checks passed. Existing authentication, CSRF, profile persistence, session isolation and the complete mock application workflow remain passing.
- The real two-account browser workflow verifies draft save/reload/edit/publication with the same ID, discovery/details as another account, direct unauthorized API attempts, owner closure/archive and refreshed discovery visibility. Network-error and expired-session checks confirm no seed fallback or retained private form.
- Initial verification caught an ORM timestamp refresh error after publication; publication now explicitly updates its timestamp before committing. Browser test expectations were updated for enabled My Projects, draft URL transition timing, and mobile-visible roster content. Final reruns passed without weakening security or test-database safeguards.
- Local development was upgraded additively to **0002_projects (head)**; no development database reset or browser-data import occurred. Existing environment settings were preserved. No environment blockers remain.

Remaining limitations: Published editing, archive restoration, invitations, member removal and ownership transfer remain unavailable. Other clients see project updates after reload/navigation or refocus; no push/live project synchronization is implemented. Discovery uses bounded offset pagination and basic PostgreSQL substring search; larger-scale indexing/search can be added later. No commit or push was performed.


## Real applications and team formation (0003_applications)

Run the existing `python -m alembic upgrade head` command before starting this version. Migration `0003_applications` adds one table to `0002_projects`; earlier migrations and user/project records are preserved. It adds UUID keys, unique `(project_id, applicant_id)` across all statuses, a composite role/project foreign key, status constraint, and indexes for applicant history, project/status/time and roles. No browser data is imported.

All endpoints below require a session under `/api/v1`; POST requests also require the existing allowed Origin and in-memory CSRF token.

| Method/path | Behavior |
| --- | --- |
| POST `/projects/{projectId}/applications` | `{roleId, motivation, experience, portfolio?}`; creates a pending application, 201. |
| GET `/applications` | Current applicant's paginated history only. |
| GET `/applications/{id}` | Own submitted content and safe project/role labels, status/timestamps, current membership and accessible project link. |
| POST `/applications/{id}/withdraw` | Applicant's pending record only; allowed after closure/archive. |
| GET `/projects/{projectId}/applications` | Owner-only paginated inbox, defaults to pending. |
| GET `/projects/{projectId}/applications/{id}` | Owner-only review: necessary profile fields, self-declared skills, required/shared/missing skills and submitted content. No email or other private applications. |
| POST `/projects/{projectId}/applications/{id}/accept` | Atomic membership insertion and accepted decision. |
| POST `/projects/{projectId}/applications/{id}/reject` | Published project, owner and pending record; allowed when recruitment is closed. |

Submission trims motivation (50-2,000 characters), experience (20-2,000), and optional HTTP(S) portfolio URL (up to 300). Unknown fields including caller-selected identity are rejected. The session determines the applicant. Published/open recruitment, role and overall vacancy, no existing membership and no previous application are required. Missing skills are allowed. Pending records never reserve places; rejected/withdrawn records still prevent reapplication.

Applicant lists accept `search` (project title or role), `status=all|pending|accepted|rejected|withdrawn`, `sort=newest|oldest`, `page` (at least 1), and `pageSize` (1-50, default 12). Owner inboxes support the same bounds/status/sort, `search` by applicant name and optional `roleId`; default status is pending. SQL does all filtering/pagination. Ordering uses submission time plus UUID, reversed for newest. `counts` covers **all** applications in the authorized user/project scope, independent of search/status/role/page. `total` is the filtered count before pagination. `applications` is only the requested page. Owner Overview loads at most 12 recent pending records; its pending badge is the complete count.

Every application write locks the project first, then the application where applicable. The initial application-to-project lookup reads only an immutable ID; status and permission checks happen after locking. Project recruitment/archive changes take that same project lock. Acceptance rechecks publication, recruitment, pending status, target role, existing membership and membership-derived capacities, then inserts one membership and sets `accepted`/`decidedAt` in one commit. Failure rolls both back. Concurrent final-slot acceptances serialize; one returns 200 and one 409. Withdrawal races yield one terminal state. Closure/archive races either follow a completed acceptance or block it; they cannot bypass its checks. Repeated decisions return a clear 409 without another membership.

Withdrawal sets `withdrawnAt` and leaves `decidedAt` null. Rejection/acceptance set only `decidedAt`. Archived history remains readable by its applicant and project owner; inaccessible project details are omitted from links. Accepted status alone never grants team access. Unauthorized private reads return 404; ordinary members cannot read the inbox. Invalid fields return 422; stale/full/closed transitions return 409. Existing session/CSRF contracts remain unchanged.

Routes in `applications.py` call small shared read/transition functions; `application_schemas.py` owns submitted fields and applicant response contracts. `projects.py` adds only actor-scoped eligibility/application and owner pending counts. No separate owner copy, mutable capacity counters, or insecure caller-selected user ID exists.


## Application milestone verification - 2026-10-04

- **48 backend tests passed: 15 Python-only and 33 real PostgreSQL integration tests, zero skips.** Coverage includes upgrading the existing project schema without losing records, submission/validation/privacy, concurrent duplicates, atomic acceptance and rollback, role/team capacity, independent-connection final-place races, acceptance versus withdrawal/closure/archive, terminal states, closed/archived withdrawal, safe archived history, missing skills, filtering/counts/sorting/bounded pages, authentication and CSRF.
- Ruff lint and formatting checks and `pip check` passed.
- Frontend lint, strict TypeScript and **50 unit tests** passed, including application conflict messages and no automatic acceptance replay after network failure.
- The final real API browser suite passed **16 tests, zero skips**, on desktop/mobile. It covers the existing auth/profile/project flow plus acceptance, rejection, withdrawal, persistence after reload, memberships/openings/Joined projects, server-filter typing and global counts, keyboard confirmations, viewport bounds and private review removal after cross-tab logout. Review screenshots were visually inspected; empty optional profile labels were cleaned up.
- All **29 mock browser checks** passed across desktop/mobile/tablet: 28 passed in the initial run; one review test was interrupted by development Fast Refresh during a source edit and passed on an isolated rerun with unchanged code. The initial real recruitment test used the visible Review text instead of its accessible name; corrected locators passed, followed by the clean full 16-test API run.
- Production builds passed in **both mock and API modes**. The development database is at **0003_applications (head)** after an additive migration; no development database reset or browser-storage import occurred. Test fixtures used only the guarded dedicated database and ran sequentially with the API browser server.

No environment blockers remain. The local real application/team workflow is implemented; production hardening and the deferred features listed above remain. No commit or push was performed.

## Authentication protection milestone

Migration `0004_auth_recovery` adds email verification state, hashed recovery/verification tokens and PostgreSQL rate buckets without changing applied migrations or verifying existing accounts automatically. New publication/application submissions require verification; existing management actions remain available. Read [AUTHENTICATION.md](AUTHENTICATION.md) for the new endpoints, SMTP/Mailpit setup, limits, expiry, proxy trust, cleanup and testing. Run Uvicorn with `--no-proxy-headers` so application-level trust checks see the real peer.
