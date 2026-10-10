# CampusCollab

**[Open CampusCollab](https://campus-collab-beryl.vercel.app)**

CampusCollab helps university students discover projects and hackathons, apply for specific contribution roles, and form teams. It connects project discovery with a structured recruitment workflow, from a student's profile to a confirmed team membership.

**Create profile → publish project → discover → apply → owner reviews → accept → join team**

The core workflow runs against a FastAPI and PostgreSQL backend. A separate mock mode provides a local prototype without requiring backend services.

Hosted on **Vercel Hobby**, **Render Free (Singapore)** and **Neon PostgreSQL (Singapore)**, with **Brevo HTTPS** email delivery. Free-tier cold starts can delay the first API request; wait and retry, checking saved state before repeating a submission.

## Why CampusCollab exists

Finding a project is only part of finding a team. Students also need to understand what help is needed, explain what they can contribute, and know whether a place is available.

CampusCollab makes those steps explicit: owners recruit for contribution roles, applicants submit relevant experience, and acceptance creates a team membership. Skill requirements guide the conversation; missing skills do not automatically disqualify a student.

## Key capabilities

- **Student profiles:** email-code signup before account creation, login/logout, email verification, password recovery, editable profiles and selection from a controlled skill catalog.
- **Project recruitment:** private drafts, publication, team capacity and repeatable roles with required skills and openings. Project types include Hackathon, Personal Project, Research, Startup and Open Source.
- **Discovery:** search, skill/type/role/campus filters, availability filters, sorting and server-side pagination in API mode.
- **Applications:** role-specific submissions, searchable application history, status filters and confirmed withdrawal. Owners review applications and accept or reject pending requests.
- **Team management:** My Projects, an owner dashboard, membership-derived team counts and role occupancy, recruitment controls and archived project history.

The public landing page introduces the product. Account and project screens adapt to desktop and mobile, with keyboard-accessible application and confirmation dialogs.

## Architecture

```mermaid
flowchart LR
    UI["Browser / Next.js"] -->|"Same-origin forwarding: cookie session + CSRF"| API["FastAPI"]
    API -->|"Async SQLAlchemy / asyncpg"| DB[(PostgreSQL)]
```

In API mode, PostgreSQL stores users, profiles, skills, sessions, projects, applications and memberships. TanStack Query caches server responses in the frontend; it is not the source of truth for team membership or permissions. The backend is a modular monolith with authentication, profile, skill, project and application modules.

Mock mode uses separate browser-local prototype data and fictional identities. It does not import records into real accounts or act as a fallback when the API fails.

| Area | Technologies |
| --- | --- |
| Frontend | Next.js App Router, React, strict TypeScript, Tailwind CSS, Radix UI primitives |
| Forms and server state | React Hook Form, Zod, TanStack Query |
| API | FastAPI, Pydantic schemas/settings, Uvicorn |
| Persistence | PostgreSQL 17, SQLAlchemy 2 async, asyncpg, Alembic |
| Authentication | Argon2id password hashing, opaque database-backed cookie sessions, CSRF protection |
| Verification | Pytest, HTTPX, Vitest, Playwright, Ruff, ESLint, TypeScript |

Frontend dependencies are recorded in the npm lockfile. Backend direct and transitive dependencies are pinned in `backend/requirements.txt`.

## Local setup

### Prerequisites

- Node.js **24.x** and npm, compatible with the installed Next.js and Vitest versions.
- Python **3.12 or newer**.
- Docker with Compose v2 or newer; on Windows, use Docker Desktop with Linux containers.
- Google Chrome for the configured browser tests.

The commands below use **Windows PowerShell** from a checkout of this repository. See the [backend setup guide](backend/README.md#local-setup) and [frontend API guide](frontend/API_MODE.md#local-startup) for POSIX equivalents and additional configuration.

### 1. Start PostgreSQL and prepare the backend

From the repository root:

```powershell
docker compose up -d --wait postgres mailpit
if (-not (Test-Path backend/.venv)) { python -m venv backend/.venv }
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
if (-not (Test-Path backend/.env)) {
    Copy-Item backend/.env.example backend/.env
}
```

The safe template contains local development connection settings and a placeholder `CSRF_SECRET`. This command replaces only that placeholder with a random secret, without printing it or changing an existing configured secret:

```powershell
@'
from pathlib import Path
import secrets
path = Path("backend/.env")
text = path.read_text(encoding="utf-8")
marker = "CSRF_SECRET=replace-with-a-random-secret-at-least-32-characters"
if marker in text:
    value = "CSRF_SECRET=" + secrets.token_urlsafe(48)
    path.write_text(text.replace(marker, value), encoding="utf-8")
'@ | backend/.venv/Scripts/python.exe -
```

Then migrate, seed the skill catalog and start the API:

```powershell
cd backend
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m app.skills
.venv/Scripts/python.exe -m uvicorn app.main:create_app --factory --reload --no-access-log --no-proxy-headers
```

Run backend commands from `backend/` so settings find `.env`. Local startup does not create tables; run Alembic explicitly. The production entry point applies migrations before serving. Skill seeding is explicit and idempotent and does not create accounts.

Development PostgreSQL uses `127.0.0.1:5432` and the named `postgres_data` volume. `docker compose stop` preserves its data. Compose credentials are local examples, not production credentials. Keep real environment files out of Git.

### 2. Start the frontend in API mode

In a second PowerShell terminal, from the repository root:

```powershell
cd frontend
npm.cmd ci
$env:NEXT_PUBLIC_APP_MODE = 'api'
$env:NEXT_PUBLIC_API_BASE_URL = 'http://localhost:8000/api/v1'
npm.cmd run dev
```

These settings apply to the current terminal. For persistent local settings, use [frontend/.env.example](frontend/.env.example) as a template for `.env.local` **only if the local file is absent**, then select `api`. Preserve other settings. `NEXT_PUBLIC_*` values are public configuration, never secrets; restart development or rebuild production after changing them.

- App: [http://localhost:3000](http://localhost:3000)
- Interactive API documentation: [http://localhost:8000/docs](http://localhost:8000/docs)
- Health endpoints: `/health/live` and `/health/ready` on port 8000.

Use `localhost` consistently in the browser. The default `ALLOWED_ORIGINS` includes `http://localhost:3000`; another frontend origin requires a matching backend configuration change.

### 3. Try the workflow

Register, confirm your email through local Mailpit at http://localhost:8025, and complete a profile. Publish a project with a recruitment role. Use a separate browser profile or an incognito session for a second account, verify its email, discover the project and apply. Return to the owner account and open **Manage Project > Applications** to review and accept the request. Refresh the applicant's **My Applications** to see the accepted status and team access; the roster and available openings update from memberships.

## Mock versus API mode

| | Mock mode | API mode |
| --- | --- | --- |
| Configuration | `NEXT_PUBLIC_APP_MODE=mock` (default) | `NEXT_PUBLIC_APP_MODE=api` |
| Identity | Fictional students; development-only Demo user selector | Registered users and validated server sessions |
| Storage | Browser-local prototype data; selected demo identity is tab-local | PostgreSQL; frontend query caching |
| Entry point | Open Demo leads to `/discover` | Signup/login lead to `/profile` |
| Backend required | No | Yes |

Both modes support the core project/application workflow. Mock login/signup pages do not simulate credential authentication. API mode hides the demo selector, never associates real users with fictional memberships, and shows recoverable errors instead of falling back to mock data. Mock permission checks are prototype behavior, not backend security.

## Testing

Run frontend checks from `frontend/`:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

`build` uses the selected mode. To check both production configurations, run it once with `NEXT_PUBLIC_APP_MODE=mock` and once with `api`. Stop development servers that share the build output directory before building.

For the mock browser suite, stop any existing Next.js server on port 3000 first so Playwright cannot reuse an API-mode instance, then run `npm.cmd run test:e2e`. The configuration starts a mock-mode server and uses Chrome for desktop, mobile and tablet checks.

Backend integration tests use a **dedicated database**, never the development database. From the repository root:

```powershell
docker compose --profile test up -d --wait postgres-test mailpit
$env:TEST_DATABASE_URL = 'postgresql+asyncpg://campuscollab_test:local_test_only@127.0.0.1:5433/campuscollab_test'
$env:ALLOW_TEST_DB_RESET = 'campuscollab_test'
cd backend
.venv/Scripts/python.exe -m pytest -q
.venv/Scripts/python.exe -m ruff check .
.venv/Scripts/python.exe -m ruff format --check .
.venv/Scripts/python.exe -m pip check
```

The test service uses port **5433** and temporary storage. Fixtures reset its schema only after validating the database, role, address and explicit reset consent. PostgreSQL integration tests are skipped if `TEST_DATABASE_URL` is missing; a skip is not database verification. There is no SQLite substitute.

After backend tests finish, run the real browser suite in the same terminal:

```powershell
cd ../frontend
npm.cmd run test:api
```

It starts isolated FastAPI and Next.js servers on ports **8100** and **3100**, resets only the guarded test database, and uses unique fictional accounts. Run backend integration and API browser tests sequentially: they share a database advisory lock to prevent overlapping resets. Run browser suites sequentially because they share output directories.

Coverage includes session/CSRF behavior, authorization and private data access, migrations, persistence, filtering, duplicate applications, concurrent final-place acceptance, withdrawal races, transaction rollback and complete browser workflows. Recorded results are available in the [dated backend verification record](backend/README.md#application-milestone-verification---2026-10-04); test counts are intentionally not used as a permanent status badge here.

## Important engineering decisions

- **Identity comes from the session.** Backend permission checks derive the actor from a validated session. Project ownership is distinct from contribution roles; calling a role "Backend Developer" grants no administrative permissions.
- **Cookie sessions have explicit request protection.** Passwords use Argon2id; opaque session tokens live in HttpOnly cookies, with only token hashes stored in PostgreSQL. Unsafe requests require an allowed Origin and a signed CSRF token. The frontend keeps that token in memory and does not automatically replay failed mutations.
- **Application access is scoped.** Applicants read their own history; owners review only their projects' applications. Ordinary members cannot read the inbox, and owner review responses exclude email, session data and unrelated applications.
- **Constraints protect relationships.** A unique applicant/project constraint applies across every application status. Composite foreign keys keep role references within the correct project. Rejected and withdrawn applicants cannot reapply in this version.
- **Acceptance is one transaction.** Mutations lock the project before the application, recheck role and total capacity together, then create one membership and record the decision atomically. Competing acceptances cannot both claim the final place. Pending applications reserve no places.
- **Memberships are the source of capacity.** Counts include the owner and are derived from membership records, not mutable counters. An accepted application is history, not proof of current membership. Alembic manages schema evolution without resetting existing development data.

## Current limitations and next steps

The core workflow is deployed, including email-code signup, password recovery and PostgreSQL-backed authentication rate limits. This student MVP still needs broader operational hardening, monitoring and abuse tuning; free hosting is not an availability guarantee.

Published-project editing, archive restoration, invitations, member removal and general ownership transfer are not implemented. Other sessions see changes on navigation, refetch or window focus; live push updates are deferred. Discovery uses bounded offset pagination and basic PostgreSQL substring search. Account emails use local Mailpit, configurable SMTP or Brevo HTTPS. Notifications, chat and AI features remain outside the current implementation.

## Account verification and recovery

Signup collects account details, sends a six-digit email code and creates the account, profile and session only after successful confirmation. Codes expire after ten minutes; incorrect attempts and resends are limited. Ordinary login uses email and password, without a login code.

Existing unverified accounts can confirm their email using the profile banner. Verified email is required to publish projects and submit new applications; profile editing, drafts and existing management remain available. Password recovery uses an expiring, single-use link and revokes all sessions after a successful reset.

**Mailpit captures local messages at http://localhost:8025; it does not deliver to Gmail or other external inboxes.** External delivery can use Brevo HTTPS or an SMTP provider with private credentials and an authorized sender. Provider acceptance is separate from inbox delivery; external delivery must be verified manually. Authentication requests have persistent PostgreSQL-backed rate limits; email delivery is bounded but has no durable retry queue. See [email-provider setup](backend/EMAIL_DELIVERY.md).

The maintainer reports that the deployed website works, including its hosted skill catalog and imported projects (2026-10-10). This is manual verification, separate from automated local tests, which use mocked Brevo requests or Mailpit and do not send external email. Detailed deployment and verification records are in the [deployment guide](DEPLOYMENT.md).

See the [signup walkthrough](backend/SIGNUP_CODES.md) and [authentication operations guide](backend/AUTHENTICATION.md) for code limits, CSRF, email configuration and cleanup commands.

## Detailed documentation

- [Deployment and operations: Vercel, Render and Neon](DEPLOYMENT.md)
- [Signup codes and local Mailpit walkthrough](backend/SIGNUP_CODES.md)
- [Mailpit and Brevo HTTPS email delivery](backend/EMAIL_DELIVERY.md)
- [Account security, recovery, verification and SMTP setup](backend/AUTHENTICATION.md)
- [Backend setup, API contracts, security and database tests](backend/README.md)
- [Frontend modes, session behavior and browser integration tests](frontend/API_MODE.md)
- [Local PostgreSQL services](compose.yaml)
- [Backend environment template](backend/.env.example) and [frontend environment template](frontend/.env.example)
- [Authorized curated-project import](backend/CURATED_IMPORT.md)
