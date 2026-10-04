# CampusCollab

A platform for students to discover projects, recruit for contribution roles, apply and form teams. The completed mock frontend includes project creation, private drafts, My Projects, owner application review and My Applications with withdrawal. FastAPI provides session authentication, profiles, catalog skills, projects, applications and transactional team formation, connected through an explicit API frontend mode. Mock mode retains the complete prototype.

## Frontend modes and real accounts

See [API mode setup, security behavior, tests and walkthrough](frontend/API_MODE.md). Set `NEXT_PUBLIC_APP_MODE=api` and `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1` to enable `/signup`, `/login`, session restoration/logout and the real `/profile`. The default `mock` mode preserves the entire demo workflow. API mode never imports prototype data and enables real project discovery/creation/management and hides unavailable application/review features. Public mode settings require a dev restart or production rebuild.

## Backend foundation

See [backend setup, contracts, tests and walkthrough](backend/README.md) for Windows PowerShell and POSIX commands. The backend uses FastAPI, Pydantic, SQLAlchemy async/asyncpg, Alembic, PostgreSQL, Argon2id and Pytest/HTTPX with pinned dependencies.

Root `compose.yaml` provides local-only PostgreSQL with persistent development storage and a separate ephemeral test database. Configure `backend/.env` from its safe example. From an activated backend virtual environment in `backend/`, run `python -m alembic upgrade head`, `python -m app.skills`, then `python -m uvicorn app.main:create_app --factory --reload --no-access-log`.

Implemented: registration/login/logout, hashed opaque database sessions, CSRF bootstrap/protection, current-user profile read/update, controlled skills, health endpoints, structured logs and integration tests. Mock mode retains fictional demo identities and browser persistence; API mode uses database sessions and never imports browser data. Project and application endpoints are implemented, including owner review and atomic acceptance.

## Run locally

Use Node.js 22.12+ and the existing npm lockfile.

```sh
cd frontend
npm ci
npm run dev
```

Open http://localhost:3000. On Windows PowerShell with script execution disabled, use `npm.cmd` instead of `npm`.

```sh
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm start
```

Playwright uses installed Google Chrome and starts or reuses a development server. For bundled Chromium, remove `channel` from `playwright.config.ts` and run `npx playwright install chromium`. Layout screenshots go to ignored `frontend/test-results/`.

## Mock workflow routes

| Route | Behavior |
| --- | --- |
| `/` | Public landing page with mode/session-aware entry actions. |
| `/discover` | Search, combined/removable filters, reset, sorting, counts and project links. Excludes drafts and archived projects. |
| `/projects/[projectId]` | Details, contribution roles, membership-derived capacity/openings, applicant status, owner Manage Project action. Accessible role-specific application dialog with validation and duplicate prevention. |
| `/projects/new` | Creation, repeatable roles/catalog skills, live preview, Save Draft, Publish, feedback and unsaved-navigation confirmation. |
| `/projects/[projectId]/edit` | Owner-only private draft editor; saves and publication preserve the project ID. |
| `/my-projects` | Owned / Joined tabs, title search, status, recruitment, capacity, role openings and owner-only pending counts. Drafts open the editor; owned published/archived projects open management. Joined excludes owned projects. |
| `/my-applications` | Current student's applications, project/role search, All/Pending/Accepted/Rejected/Withdrawn filters with global counts, newest/oldest sorting, desktop table/mobile cards, read-only submitted details and confirmed withdrawal. Linked from navigation and application success feedback. |
| `/projects/[projectId]/manage` | Owner-only Overview, Applications, Team and Settings. URL tabs: `?tab=applications`, `?tab=team`, `?tab=settings`. |
| `/profile` | Per-user profile editing, catalog skill selection/removal, validation, save/discard and consistent saved summaries. |

The owner inbox reads the **same application records** created by the application dialog. It defaults to pending and filters by status, role and applicant name. It distinguishes an empty inbox from filtered results. The scrollable review dialog includes the applicant profile, self-declared skills, required/shared/missing skills by catalog ID, motivation, experience, portfolio and decision status. Accept/reject require confirmation; processed applications are read-only. Team shows owner distinction, contribution roles, joined dates, capacity and role occupancy.

Routes include loading, error and useful empty states. Pending mutations prevent repeat submissions; failed saves remain recoverable. Radix dialogs provide focus trapping, Escape dismissal, focus restoration and bounded internal scrolling. Layouts adapt to desktop, tablet and mobile.

## Demo identities and walkthrough

In mock mode, the **Demo user** selector appears only under `npm run dev`. It reuses fictional Maya Rao, Aarav Sharma and Sneha Patel. Selection lives in tab-local `sessionStorage` under `campuscollab.demo-user`. Outside development, the selector is omitted and Maya is the default. Duplicating a browser tab may initially copy session storage; choose another user there as needed.

Identity switching discards old query caches and remounts forms/private panels. Unsaved values are discarded on identity switching. Query keys include the actor. Mutations derive the actor inside the mock data layer; ownership/applicant IDs cannot be supplied by forms. Pending mutations disable the selector and reject if their actor changes before writing.

Manual walkthrough:

1. As **Maya**, choose **Create Project**. Enter title, type, description, capacity **2**, and one role with **1** opening and a catalog skill. Publish and view it. The owner is the first member.
2. Switch to **Aarav**, or open that project in a second tab and switch there. Apply for its role with valid motivation/experience. It shows **pending**, including after reload.
3. As **Maya**, open **My Projects → Applicants**, or **Manage Project → Applications**. Review Aarav and confirm **Accept Teammate**.
4. Switch to **Aarav** or inspect his other tab. The project shows **Application accepted** and membership. It appears in **My Projects → Joined projects**.
5. Capacity is **2 of 2**, the role has **0** openings, and pending count is **0**. Reload preserves the result; storage events update other tabs without manual reload.

Withdrawal walkthrough (use a separate pending application):

1. As **Maya**, apply to **Smart Traffic Management** for an open role.
2. Follow **My Applications** in the success dialog, or use desktop/mobile navigation. Open **View Application** to inspect the submitted content.
3. Choose **Withdraw**, read the no-reapplication confirmation, and confirm. The status becomes **Withdrawn**, with a separate withdrawal timestamp. Reload preserves the change.
4. Switch to **Aarav**, this seed project's owner. Open **Manage Project → Applications → Withdrawn** and review Maya's request. It is read-only, is absent from Pending, and cannot be accepted. Open owner panels in another tab update automatically.

## Product and permission rules

- Capacity includes the owner and derives from memberships. No mutable member/opening counters are stored. Contribution roles confer no administrative permissions.
- Drafts require a title and valid supplied values, but may be incomplete. Publishing separately requires type, description, capacity of at least 2, and a complete role with a catalog skill. Role openings total at most capacity minus one; fewer allocated places are allowed. Limits: 100 members, 30 roles, 15 skills per role.
- Creation, roles and owner membership are one serialized write. Draft recruitment is closed; drafts are owner-only through the API. Publication sets published status, timestamp and open recruitment.
- Only owners can read project-wide applications, review applicant details, accept/reject, change recruitment or archive. Direct API calls enforce permissions independently of UI. Applicant profiles do not expose their other applications. Public project responses include only the current actor's application.
- One application per student per project, including processed/withdrawn records. Membership, closed recruitment, archiving or a full role prevents applying. Missing skills do not prohibit application or acceptance.
- Acceptance re-reads project, application, role and memberships inside the lock. It verifies ownership, published/open recruitment, pending status, project/role association, no existing membership and both capacity limits. One write adds the contribution membership and accepted status/decision time. Repeat decisions return an already-processed error and refresh the UI.
- Rejection requires an owner, published project and pending application. Closing preserves pending records and permits rejection, but blocks new applications and acceptance.
- Only the applicant can withdraw their own pending application, including when recruitment is closed or the project is archived. The serialized mutation re-reads current state, derives identity internally, records `withdrawnAt`, and writes once. Withdrawal does not create/remove memberships or occupy slots; it still blocks reapplication. Accepted, rejected and already-withdrawn requests refuse withdrawal. Acceptance and withdrawal competing for the same pending application allow only one terminal transition under the existing lock guarantees.
- Applicant list/detail reads are actor-scoped. Counts cover all their applications, independent of filters; the filtered count is separate. Submitted content remains read-only. **View Team** depends on actual membership and an accessible project page, not acceptance history. Accepted applications without membership explain that distinction. Archived history remains readable; missing/private project records use safe fallback labels and omit inaccessible links. No private draft labels are exposed.
- Archiving closes recruitment and removes discovery visibility atomically. Applications, roles and memberships remain; dashboards are readable but management mutations are disabled.

**Demo identity and mock authorization are prototype behavior, not real authentication or backend security.** Browser users can inspect/edit local storage. A backend must independently enforce identity, permissions, privacy, unique `(student_id, project_id)` constraints and transactional capacity checks. All mock people/contact details are fictional and do not represent Chaitanya. Skills are self-declared; no identity, college or skill verification is claimed.

## Architecture and persistence

The frontend reuses Next.js App Router, strict TypeScript, installed Tailwind CSS 4, TanStack Query, React Hook Form, Zod, Radix Dialog and Lucide. Fonts are bundled. No CDN scripts or alternate frontend data architecture. The API-mode provider is separate from this preserved mock data flow.

- `frontend/src/lib/models.ts`: typed records and separate incomplete drafts.
- `seed.ts`: single immutable fictional dataset, cloned before use.
- `validation.ts`: shared schemas and separate publishing transition.
- `mock-storage.ts`: validation, stable-ID merging and migration.
- `mock-api.ts`: asynchronous queries, actor-derived permissions and serialized mutations.
- `queries.ts` / `components/providers.tsx`: actor-scoped queries, invalidation and cross-tab synchronization.

Presentation components use hooks rather than accessing storage. FastAPI can replace this API boundary later. Reusable components cover shell/navigation, project cards, chips, badges, capacity, role cards, profile summary and application/review/confirmation dialogs.

The key stays **`campuscollab.prototype.v1`** to preserve installations; the payload is now **version 3**:

- Version 1 profile and applications migrate in memory to per-user profiles and shared applications. Previously submitted pending applications appear in the correct owner's inbox.
- Version 2 projects, drafts, roles, memberships, profiles and applications are preserved. Version 3 adds decision/archive metadata, withdrawn status support and narrowly scoped seed recruitment/archive overrides.
- My Applications adds optional `withdrawnAt` to the existing version 3 application schema without resetting storage or copying applications. Older records load unchanged; missing legacy withdrawal times show **Time not recorded**. Owner decisions keep `decidedAt`; applicant withdrawal uses its own timestamp. Application history can survive unavailable related records, but surviving role IDs must still match the recorded project. Existing project, membership and capacity validation remains in place.
- Reading does not rewrite storage. The next successful mutation writes version 3 once. Unknown versions, malformed records, duplicate IDs and invalid relationships show an error and preserve the original value. Schema mismatch never resets user data.
- Created records merge by stable IDs with immutable seed records. Seed overrides contain only recruitment/archive fields; seed content/memberships are not copied or overwritten. Legacy joined dates show **Not recorded** rather than invented dates.
- A failed write leaves membership and application status unchanged. Web Locks serialize read/validate/write transactions across tabs where supported. The synchronous fallback serializes only within one tab; cross-tab races cannot be guaranteed safe without Web Locks. A backend transaction is required for real multi-user guarantees.
- Storage events invalidate cached views across tabs. Open review panels use refreshed records, become read-only when another tab decides and disappear on identity change. Mutations refresh inbox, counts, details, discovery, team, My Projects and applicant eligibility.

Storage is accessed asynchronously after hydration, never during server rendering. Data persists on the same browser/origin, not across devices. Storage failures report errors rather than false success. To deliberately reset a demo, back up and remove only `campuscollab.prototype.v1` in developer tools, then reload.

## Design and deferred scope

Design references are kept locally under `design/stitch/` and excluded from Git; they are not required to run or build the app. Screenshots, HTML and DESIGN.md guided implementation. Conflicting tokens were resolved against screenshots and the existing lavender/indigo design system, white cards, teal status accents and responsive sidebar/header.

State simulators, verification/recommendation claims, fabricated activity statistics and decorative dead controls are omitted. No notifications, bookmarks, sharing or timeline management.

Deferred: published-project editing, archive restoration, member removal, invitations, ownership transfer, public student profiles, application backend authorization/persistence and onboarding beyond the editable profile. The backend handles authentication, profiles, skills, and projects. Unavailable destinations are omitted from navigation. No email delivery, chat, task boards, AI, Redis or AWS infrastructure. The small mock collection is in memory without pagination; deadlines are sample metadata, not a scheduler. Browser checks use Chrome emulation, not physical devices or Safari. Future backend milestones must implement applicant-scoped reads and transactional withdrawal/acceptance rather than trusting prototype controls.

## Validation

Authentication/profile integration verified on **2026-10-02**:

| Check | Result |
| --- | --- |
| Frontend ESLint and strict TypeScript | Passed |
| Frontend Vitest (existing mock + API client/schema checks) | **49 passed** |
| Existing mock Playwright suite | **27 passed**, desktop/mobile/tablet |
| Real FastAPI/PostgreSQL API-mode Playwright suite | **6 passed**, desktop/mobile, no skips |
| Production builds | Passed separately in **mock** and **api** modes |
| Backend Pytest | **24 passed**, including **9 PostgreSQL integration tests**, no skips |
| Backend Ruff lint/format and pip dependency checks | Passed |

API browser checks cover signup, protected profile, reload/session restoration, save/discard, catalog skills, logout/re-login persistence, duplicate email, incorrect password, CSRF bootstrap and expired-token recovery, backend failure without mock fallback, and cross-tab account/private-form isolation. Desktop/mobile profile screenshots were visually inspected and overflow checks passed. Tests used the guarded test service only; development data and environment secrets were preserved. A shared PostgreSQL advisory lock now prevents browser tests and reset fixtures from using the test database concurrently.

The shared editor initially changed a mock validation message; its exact original mock schema was restored and the full mock suite passed. Windows test-server cleanup needed targeted termination of the recorded test-owned processes. A stopped test database was restarted before the final successful API browser run. No verification blockers remain. That earlier authentication milestone added no project endpoints; the subsequent project milestone is documented below.

PostgreSQL verification completed on **2026-10-02** using Docker CLI 29.8.1, Compose 5.5.1 and the Linux engine. Both PostgreSQL 17.11 services are healthy, bound to localhost on development port 5432 and test port 5433. Development migrated to **0001_identity**; the explicit seed ran twice with identical **28 skills and stable IDs**. Existing environment settings and development data were preserved.

The complete backend suite passed: **24 tests (15 Python-only + 9 PostgreSQL integration), 0 skipped**. Test guards were checked against the actual Compose configuration and were not relaxed. Ruff lint/format and pip dependency checks passed. The first run encountered a Windows pytest cache-write failure after test execution; rerunning with a fresh temporary cache (`-o cache_dir=<temporary-directory>`) completed successfully. No implementation or frontend contract changes were needed.

The live HTTP walkthrough passed on an available loopback port: liveness/readiness, CSRF bootstrap, registration and identity, profile/catalog-skill update and readback, logout/401, login again with unchanged saved profile, final logout/401, and missing-CSRF rejection/403. A unique fictional verification account remains in development; no unrelated data was deleted. Only the temporary FastAPI process was stopped; both database services remain running. Frontend authentication/profile integration is now implemented in API mode; production hardening and project/application backend work remain deferred.

Previously completed frontend validation remains unchanged: lint, strict TypeScript, production build, **44 Vitest tests** and **27 Playwright tests** passed. No frontend contracts changed, so the browser suite was not repeated during database verification.

Vitest covers existing filtering/profile/application behavior; draft reload/edit/publication; owner-only access; actor isolation; publishing/capacity rules; automatic membership; v1/v2 migrations; forbidden inbox/mutations; duplicate/competing decisions; full teams/roles; rejected/withdrawn states; closed recruitment; archiving and failed-write atomicity.

Playwright covers existing screens plus creation, validation, unsaved confirmation, per-tab identity isolation, save recovery, My Projects, owner filters/review, keyboard confirmations, accepted status/membership, joined projects, cross-tab stale panels, private-panel isolation and archived controls. Desktop/mobile screenshots verify overflow and bounded dialogs; tablet checks preserve existing layouts.

My Applications adds checks for list/detail identity isolation, search/status counts/sorting, withdrawal/reload, unauthorized and terminal-state attempts, competing acceptance/withdrawal, closed/archived withdrawal, accepted history without membership, unavailable/private references and atomic failed writes. Browser checks cover submission-to-list navigation, desktop/mobile rendering, keyboard dialogs, cross-tab owner updates, identity isolation and recoverable withdrawal failures.

Previous mock milestone: lint, strict TypeScript and production build passed; **44 Vitest tests passed** and **27 Playwright tests passed**. The full regression suite covers previous milestones and the new applicant workflow on desktop/mobile, plus existing tablet layout checks. My Applications table/cards and scrollable details were visually inspected on desktop and mobile; viewport overflow and keyboard confirmation checks passed.

## Public landing and authentication design

`/` is now a public landing page in both modes, including for authenticated visitors. In API mode, Log in/Create account appear after session restoration; signed-in visitors get Open CampusCollab to `/profile`. Session failures show retryable account actions without hiding the public content. In mock mode, Open Demo leads to `/discover`; `/login` and `/signup` explain prototype behavior rather than accepting credentials.

The landing uses static, explicitly labeled illustrative projects, working section anchors, feature cards and an API availability note. It never reads fictional student/project records. Authentication uses the existing API client, validation, CSRF and session management with responsive split-panel layouts and non-submitting password visibility controls. Design references were read from `design/stitch/landing_page/` (the export directory name), `login/`, and `signup/`. No simulator controls, invented statistics, social login or unsupported claims were added.

Landing/authentication presentation verification (2026-10-02): lint and strict TypeScript passed; **49 unit tests**, **29 mock Playwright tests**, and **10 real FastAPI/PostgreSQL Playwright tests** passed, with no skips. Production builds passed with both `NEXT_PUBLIC_APP_MODE=mock` and `api`. Browser checks cover public anchors/entry points, session-restoration placeholders, signed-in landing access and auth-route redirects, validation, keyboard signup/login, password toggles, backend-error recovery, and existing signup/logout/profile/CSRF/account-isolation behavior. Desktop/mobile landing and authentication screenshots were inspected; overflow checks passed, including reduced-motion landing coverage. Initial test-selector/root-redirect expectations and a concurrent screenshot-output collision were corrected; sequential reruns passed. No backend code or development data changed; no environment blockers remain.


## Real project backend and API-mode screens

API mode now enables Discover, Create Project, Edit Draft, Project Details, My Projects, and owner Overview/Team/Settings. Applications, applicant review, withdrawal and team formation are now enabled; the full mock mode remains selectable. Published projects use real users and PostgreSQL memberships only, never browser seed data. Empty databases show an empty discovery state.

Apply migration **0002_projects** with `python -m alembic upgrade head` in the backend virtual environment. It extends **0001_identity** without changing that migration or resetting existing data. See [project endpoints, validation, permissions and transaction design](backend/README.md#real-projects-migration-0002_projects) and [two-account walkthrough](frontend/API_MODE.md#real-project-walkthrough). Existing local API-mode startup stays the same; restart/rebuild Next.js when changing public mode settings.

The project service creates the owner membership with the project, uses project-row locks for state transitions, derives occupancy from memberships and enforces owner-only drafts/management. Discovery search/filters/counts/sorting/pagination execute in PostgreSQL. Role and skill filters match the same role. Archived projects stay readable to owners/current members only and cannot mutate. Published-project editing, invitations and member removal remain future milestones.


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
