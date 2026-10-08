# Seeded-project operations

The original nine local project records can be converted into ordinary projects owned by an existing verified account. Converted projects use normal discovery, applications, owner review, membership capacity, rejection and withdrawal. No special recruitment permissions are granted.

## Ownership requirement

Choose the email of an existing account you control. Sign up and confirm its email first if needed; do not enable fictional seed identities. The command never creates users, changes passwords or marks emails verified. It rejects missing, unverified and seeded accounts. This is a narrowly scoped administrative conversion, not a public ownership-transfer API.

From the repository root in PowerShell:

```powershell
docker compose up -d --wait postgres
cd backend
.venv/Scripts/python.exe -m alembic upgrade head
# Substitute your own existing verified account email.
.venv/Scripts/python.exe -m app.convert_projects --owner-email 'your-account@example.com' --dry-run
.venv/Scripts/python.exe -m app.convert_projects --owner-email 'your-account@example.com' --apply
```

POSIX uses `.venv/bin/python` with the same arguments. Both commands require the existing development environment and refuse any target except asyncpg, a loopback host, port 5432, database/role `campuscollab`, `APP_ENV=development`, and no connection-query overrides. The connected database/role is checked too. There is no hosted-target override. Preserve `.env`; never reset the development database.

The preview is read-only and lists every project ID/title/status, current and proposed owner, memberships, capacity, role positions/occupancy, recruitment changes and description changes. Apply rechecks everything against current data. Do not publish the preview if it contains private account information.

## Transaction and preservation rules

- Migration `0007_project_conversion` adds nullable `projects.converted_seed`. Applied migrations are unchanged. On conversion the original marker moves from `sample_seed` to `converted_seed`: internal maintenance provenance no longer affects API behavior. Public schemas forbid clients from setting either field.
- One transaction covers all nine stable project IDs. A shared seed advisory lock prevents concurrent seeding; project rows are locked in ID order before reading roles/memberships, following the normal application transaction lock order. Any validation/write failure rolls the entire conversion back.
- Only the original deterministic, explicitly marked, role-less seed-owner membership is replaced. If the chosen owner is already a member, that membership and its contribution role are retained and only the original seed-owner membership is removed. Other members and all applications are preserved. An unexpected former-owner membership or its application history stops conversion for manual review.
- Total and individual role occupancy must fit capacity. Role positions must fit alongside the owner. Published projects open only when their required fields/roles/skills are complete and both team and role places remain. Drafts and archives retain their status and remain closed.
- Titles, project IDs, role IDs, capacities and publication timestamps remain unchanged. Only descriptions still identical to the original seed copy become concise project proposals; edited descriptions survive.
- Repeat conversion with the same owner makes no further changes, including no recruitment reopening. Conversion to a different owner is refused. Disabled fictional users remain disabled and are no longer shown as project owners or team members.
- Normal session-derived authorization, verified-email submission, CSRF, applicant privacy, duplicate prevention, and transactional acceptance remain unchanged. Missing skills do not disqualify applicants. Query invalidation refreshes application/project/owner views after mutations; separate sessions refresh on navigation or focus.

## Seed reruns and removal boundaries

```powershell
.venv/Scripts/python.exe -m app.skills
.venv/Scripts/python.exe -m app.sample_projects seed
.venv/Scripts/python.exe -m app.sample_projects remove --dry-run
```

The legacy seed command inserts missing complete groups only; stable-ID collisions or incomplete unconverted groups fail safely. It skips converted projects before checking their old fictional-owner groups. It cannot replace ownership, close recruitment or overwrite converted roles, applications, members or edited descriptions. New unconverted groups still have disabled fictional owners and closed recruitment until explicit conversion.

Removal remains **preview only**; there is no deletion command. Its manifest excludes converted projects and their dependencies. It also excludes unconverted groups containing any application or non-seeded membership/role. Seed identities referenced outside eligible groups are excluded. No removal preview was run against development data as part of conversion implementation. Never delete by title, email domain or the presence of role-level provenance alone. Converted projects are ordinary user-owned data and must never be included in future seed cleanup.

Mock mode remains separate and unchanged.

## Manual two-account walkthrough

1. Preview/apply conversion to your verified owner account. Sign in and open My Projects: converted published projects lead to Manage Project.
2. In a separate browser profile/incognito window, sign in as another verified account. Discover a converted project and apply to an available contribution role.
3. As owner, open Manage Project > Applications, review the submission and confirm acceptance. Team membership and remaining openings update together.
4. Reload the applicant's My Applications: the accepted status and View Team link appear. Reapplication remains unavailable.
5. Use another project/application to exercise rejection or applicant withdrawal. Neither action consumes a place. A withdrawn application cannot be accepted.

## Verification

Focused PostgreSQL coverage lives in `tests/test_conversion.py`; existing application tests cover broader concurrency, rollback and permission regressions. `frontend/e2e-api/samples.spec.ts` now exercises normal converted-project cards, real owner review, acceptance, rejection, withdrawal, reload and account isolation on desktop/mobile. Its operator credentials are randomly generated for the disposable guarded test database, never development defaults.

Executed **2026-10-08**:

- Full guarded PostgreSQL backend suite: **86 passed, zero skips**. Final focused conversion/seed checks: **10 passed** after the safe public-marker and closed-recruitment message assertions.
- Frontend unit tests: **54 passed**. Full real API browser suite: **24 passed**; final converted-project desktop/mobile rerun: **2 passed**. Mock browser regressions: **29 passed**.
- Frontend lint/TypeScript, Ruff lint/format, pip dependency checks, API/mock production builds and whitespace checks passed. Desktop/mobile screenshots were inspected: no sample labels, actual owner profiles and normal applicant controls; an empty optional-campus badge was corrected.
- The initial browser run completed all cases but Windows sandbox process permissions stalled server teardown. Only its identified test-server trees were stopped; the runner then reported success. The focused rerun used normal process permissions and shut down cleanly. No tests were disabled.
- Development target was verified as the local Compose database and migrated to `0007_project_conversion`, without resetting data. Read-only inventory found nine published, closed projects, each with one member, capacity four and two one-position roles. Local conversion was subsequently previewed and applied after the user explicitly selected and verified their existing owner account. All nine projects now have that owner exactly once in their team, recruitment open, capacity four and two available role positions. Persisted state and normal project response construction were checked after the transaction. No credentials or verification state were modified by conversion. No development removal command was run.
