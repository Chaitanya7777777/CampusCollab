# Frontend API mode

`NEXT_PUBLIC_APP_MODE=mock` (default) preserves the complete fictional project/team prototype. `NEXT_PUBLIC_APP_MODE=api` selects real FastAPI sessions, profiles, catalog skills, projects, applications and team formation. Modes do not import or merge each other's identities, applications or memberships. These public variables are bundled by Next.js: restart development after changing them, and rebuild production output.

## Local startup

From the repository root, start PostgreSQL with `docker compose up -d --wait postgres`. Follow [backend setup](../backend/README.md) to create the virtual environment and configure `backend/.env` if needed; preserve existing files and generate a secret if starting fresh.

In terminal 1 (PowerShell):

```powershell
cd backend
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m app.skills
.venv/Scripts/python.exe -m uvicorn app.main:create_app --factory --reload --no-access-log
```

In terminal 2:

```powershell
cd frontend
npm.cmd ci
$env:NEXT_PUBLIC_APP_MODE = 'api'
$env:NEXT_PUBLIC_API_BASE_URL = 'http://localhost:8000/api/v1'
npm.cmd run dev
```

POSIX: use `.venv/bin/python` for backend commands and `NEXT_PUBLIC_APP_MODE=api NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1 npm run dev` in `frontend/`. Alternatively copy the safe `frontend/.env.example` to `.env.local` only if absent, and change its mode to `api`. No secrets belong in public frontend variables. Use `http://localhost:3000` consistently; the backend's default allowed origins include that exact origin. Different ports require an explicit matching backend `ALLOWED_ORIGINS` entry. Do not mix localhost and 127.0.0.1 browser hostnames.

Mock mode: set `NEXT_PUBLIC_APP_MODE=mock` and restart Next.js. Its existing browser data and development-only demo selector remain available, with no backend needed.

## Public entry points

Open `/` for the public landing page; it no longer redirects automatically. API-mode visitors see Log in/Create account only after session restoration, or Open CampusCollab to `/profile` when signed in. Authenticated visitors may continue browsing the landing page; `/login` and `/signup` retain their redirect to `/profile`. Account restoration errors offer Retry without a mock fallback. Mock-mode public pages offer Open Demo to `/discover` without simulating credential authentication. Static project illustrations are not live results.

Login/signup retain backend validation and add independent password visibility controls, correct autocomplete, and keyboard submission. No backend security or database behavior changed.

## Behavior and implementation

- `/signup` creates an account and establishes a session; `/login` signs in; both open `/profile`. Mock mode explains that these screens require API mode.
- Startup `/auth/me` restores identity. A 401 means signed out; unavailable/malformed responses show a retryable error. API mode never falls back to mock data. Protected profile content stays hidden during restoration.
- Logout calls backend revocation before clearing private caches and redirecting. Failed logout remains visible and recoverable.
- The client sends `credentials: include`, bootstraps CSRF, and keeps the returned token only in memory. It refreshes after cookie changes. Only the exact backend `403` detail `Invalid or expired CSRF token` triggers a token refresh and an explicit retry prompt. No mutation is automatically replayed; other 403s, network failures and server errors are not retried.
- Auth changes cancel/clear TanStack Query data. Profile keys include user IDs, forms remount when identity changes, and stale response generations are rejected. BroadcastChannel synchronizes same-origin tabs; window focus rechecks identity (also when BroadcastChannel is unavailable). Rechecking discards unsaved forms so they cannot migrate to a different account. No passwords or authentication tokens are stored in browser storage.
- The shared profile editor supports null optional values and zero skills. Only changed fields enter PATCH; clearing a nullable field sends null, while clearing skills sends `[]`. Email is read-only. A successful save updates the shell's name/avatar and persists across reload/login.
- API mode enables Discover, Create Project, Edit Draft, Project Details, My Projects and owner Overview/Team/Settings using PostgreSQL data only. My Applications, role-specific submission, owner review, acceptance/rejection, and withdrawal are enabled. Real profiles show no fictional projects, memberships or team counts.

`src/lib/api-client.ts` owns transport/security/error handling and response validation. `api-contract.ts` models the actual backend schemas. `api-auth.tsx` owns session state; `api-profile.tsx` provides user-scoped queries and adapts nullable fields to the reusable profile form. Backend permissions remain authoritative; client route guards are only UI behavior.

## Isolated browser integration tests

The test runner starts its own API at localhost:8100 and Next.js API mode at localhost:3100. It uses `.next-api` output and unique fictional accounts, separate test cookie names and an in-memory CSRF secret. Existing services on those ports cause failure rather than reuse. It resets **only the guarded PostgreSQL test database**; development is never targeted. Browser tests and backend reset fixtures hold the same PostgreSQL advisory lock, so competing suites fail closed instead of resetting each other's database. Run suites sequentially.

PowerShell, from root:

```powershell
docker compose --profile test up -d --wait postgres-test
$env:TEST_DATABASE_URL = 'postgresql+asyncpg://campuscollab_test:local_test_only@127.0.0.1:5433/campuscollab_test'
$env:ALLOW_TEST_DB_RESET = 'campuscollab_test'
cd frontend
npm.cmd run test:api
```

POSIX: export these two variables, then `cd frontend && npm run test:api`. Reuse the pinned backend virtual environment. Tests use installed Google Chrome like the existing suite. API traces are disabled to avoid saving credentials/tokens; explicit screenshots cover profile and public/authentication layouts under ignored test output. Password fields are masked before authentication screenshots. Run the mock and API browser suites sequentially because they share the test-results directory.

Other checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e` (mock suite), `npm run build`. Stop any existing server on port 3000 before the mock suite so Playwright cannot reuse an API-mode instance. Run production builds separately for each desired mode, with development servers sharing their output directory stopped. Dated results are recorded under Application milestone verification below.

## Manual walkthrough

1. Open `/signup`, enter a name, unique fictional email and matching 12–128 character password. Submit; `/profile` opens with empty optional fields and zero skills.
2. Set a university or bio, select catalog skills, and Save changes. Confirm the success message; reload and check the values.
3. Log out. Visiting `/profile` sends you to `/login` without showing the previous profile.
4. Log in with the same credentials. Confirm saved profile/skills and updated name remain.
5. Log out and register another account; it starts without the previous account's information. Project actions use only that real account and its permissions.

Deferred: email verification, password recovery, rate limiting and production operational hardening. The complete application workflow remains separately available in mock mode.

## Executed validation

On 2026-10-02: frontend lint/typecheck and 49 unit tests passed; 27 mock browser tests and 6 real API browser tests passed; both mode production builds passed. Backend: 24 tests passed including all 9 PostgreSQL integration tests, zero skips; Ruff lint/format and pip checks passed. Desktop/mobile profile screenshots were inspected and overflow checks passed. No remaining environment blocker. The real browser suite uses only the test database, and the development database was untouched.

Landing/auth design milestone (2026-10-02): lint/typecheck, 49 unit tests, 29 mock browser tests and 10 real API browser tests passed with no skips. Production builds passed in both modes. Desktop/mobile public and authentication layouts were visually inspected; tests verify no overflow, reduced-motion landing use, anchors, session-aware actions, keyboard submission and password visibility. Existing authentication/profile/CSRF/isolation flows remain passing. Backend implementation/security was unchanged; the previous 24-test backend verification remains the baseline.


## Real project walkthrough

First run the new database migration: `cd backend`, then `.venv/Scripts/python.exe -m alembic upgrade head` (POSIX: `.venv/bin/python -m alembic upgrade head`). Use the existing API-mode startup commands above; do not replace an existing `.env` or reset a volume.

1. Register/sign in as account A. Choose Create Project, enter a title and Save Draft. Continue Editing, reload, and confirm it is private and retained in My Projects.
2. Add type, description, capacity and at least one role with catalog skills and positive openings. Publish; the same project ID opens in details and discovery.
3. Use another browser profile/incognito context for account B. Find the title in Discover and open details. B can read the published project but cannot edit/manage it. B can apply to an open role; see the recruitment walkthrough below.
4. Return to A, open Manage Project, inspect Overview/Team, then Settings. Close recruitment. B's Has openings filter excludes it after refreshing; ordinary discovery still includes it.
5. Archive as A. Discovery removes it; A retains read-only management and My Projects history. Nonmember B cannot access archived details. Existing members, when available, retain archived access. Accepted applicants appear in Joined projects based on actual membership.

`project-contract.ts` validates API responses and adapts safe public summaries to existing presentation types without adding personal details. Shared `queries.ts` selects the API or mock data source with user-scoped keys. Writes use the existing credentialed/CSRF client, invalidate project queries, and reject stale session generations. Expired-session responses clear private UI. Discovery filtering/sorting/counts and 12-item pages come from the server. No local storage records are uploaded or used as fallback. Published editing and team invitations remain deferred.


## Project milestone verification - 2026-10-04

- Backend: **34 tests passed (15 Python-only + 19 PostgreSQL integration), zero skips**. The guarded dedicated test database was used exclusively for destructive fixtures, sequentially with browser tests. Coverage includes identity-schema upgrade with preserved profiles/selected skills/sessions, atomic owner membership/roles, incomplete drafts, publication, overposted ownership, catalog/capacity validation, private access, composite foreign keys, discovery same-role filtering/counts/sorts/pages, full team/role availability, closure/archive, concurrent publish/state transitions and failed-commit rollback.
- Ruff lint, Ruff formatting and pip dependency checks passed.
- Frontend lint, strict TypeScript and **49 unit tests** passed. **14 real API browser tests** and **29 mock browser tests** passed with zero skips. Both mock/API production builds passed. Chrome desktop/mobile screenshots of real creation and owner management were inspected; viewport overflow checks passed. Existing authentication, CSRF, profile persistence, session isolation and the complete mock application workflow remain passing.
- The real two-account browser workflow verifies draft save/reload/edit/publication with the same ID, discovery/details as another account, direct unauthorized API attempts, owner closure/archive and refreshed discovery visibility. Network-error and expired-session checks confirm no seed fallback or retained private form.
- Initial verification caught an ORM timestamp refresh error after publication; publication now explicitly updates its timestamp before committing. Browser test expectations were updated for enabled My Projects, draft URL transition timing, and mobile-visible roster content. Final reruns passed without weakening security or test-database safeguards.
- Local development was upgraded additively to **0002_projects (head)**; no development database reset or browser-data import occurred. Existing environment settings were preserved. No environment blockers remain.

Remaining limitations: Published editing, archive restoration, invitations, member removal and ownership transfer remain unavailable. Other clients see project updates after reload/navigation or refocus; no push/live project synchronization is implemented. Discovery uses bounded offset pagination and basic PostgreSQL substring search; larger-scale indexing/search can be added later. No commit or push was performed.


## Real recruitment walkthrough

API mode now enables the existing application dialog, My Applications, owner Applications tab, review/accept/reject, withdrawal, pending badges and real profile membership summary. Run migration `0003_applications` with the existing backend virtual environment (`cd backend`, then `.venv/Scripts/python.exe -m alembic upgrade head`; POSIX `.venv/bin/python`). Keep `NEXT_PUBLIC_APP_MODE=api` and the documented local API URL; mock mode remains explicitly selectable with no data merging.

1. Sign in as account A and create/publish a project with capacity and a recruitment role.
2. In a separate browser profile/incognito session, register account B. Open the project in Discover, apply for that specific role, then follow **My Applications**. The request is Pending; skills are guidance, not an eligibility gate.
3. As A, open **My Projects > Applicants** or **Manage Project > Applications**. Review B, then **Accept Teammate > Confirm acceptance**.
4. Reload/refocus B's session: My Applications shows Accepted and View Team; Joined projects and profile membership totals reflect the membership. Project member count increases and the role's remaining openings decrease.
5. Use another account to check rejection or withdrawal. Withdraw through My Applications and confirm that reapplication is unavailable. The owner sees Withdrawn under that filter and cannot accept it. Closed/archived projects still permit applicant withdrawal; archived owner decisions are disabled.

Applicant history and inbox use server-side 12-item pages, with bounded API page sizes. Status counts are global to the current user/project, while the displayed match count is independent of the current page. Reads and mutations never use mock applications in API mode. Project/applicant/inbox/roster/discovery/My Projects/profile-summary queries are invalidated after decisions. Session-scoped caches are cleared on account changes; navigation, explicit reload and window focus refresh other sessions. API synchronization does not use browser-storage events. Open stale reviews refresh after conflicts; mutations are never automatically replayed after an ambiguous network failure.

Remaining: email verification/password recovery, throttling and production operational hardening; published-project editing, archive restoration, invitations, member removal and ownership transfer. No notification/email delivery, chat, Redis, WebSockets or AI was added. Mock authorization remains prototype behavior, while API permissions are enforced by the session-derived backend actor.


## Application milestone verification - 2026-10-04

- **48 backend tests passed: 15 Python-only and 33 real PostgreSQL integration tests, zero skips.** Coverage includes upgrading the existing project schema without losing records, submission/validation/privacy, concurrent duplicates, atomic acceptance and rollback, role/team capacity, independent-connection final-place races, acceptance versus withdrawal/closure/archive, terminal states, closed/archived withdrawal, safe archived history, missing skills, filtering/counts/sorting/bounded pages, authentication and CSRF.
- Ruff lint and formatting checks and `pip check` passed.
- Frontend lint, strict TypeScript and **50 unit tests** passed, including application conflict messages and no automatic acceptance replay after network failure.
- The final real API browser suite passed **16 tests, zero skips**, on desktop/mobile. It covers the existing auth/profile/project flow plus acceptance, rejection, withdrawal, persistence after reload, memberships/openings/Joined projects, server-filter typing and global counts, keyboard confirmations, viewport bounds and private review removal after cross-tab logout. Review screenshots were visually inspected; empty optional profile labels were cleaned up.
- All **29 mock browser checks** passed across desktop/mobile/tablet: 28 passed in the initial run; one review test was interrupted by development Fast Refresh during a source edit and passed on an isolated rerun with unchanged code. The initial real recruitment test used the visible Review text instead of its accessible name; corrected locators passed, followed by the clean full 16-test API run.
- Production builds passed in **both mock and API modes**. The development database is at **0003_applications (head)** after an additive migration; no development database reset or browser-storage import occurred. Test fixtures used only the guarded dedicated database and ran sequentially with the API browser server.

No environment blockers remain. The local real application/team workflow is implemented; production hardening and the deferred features listed above remain. No commit or push was performed.
