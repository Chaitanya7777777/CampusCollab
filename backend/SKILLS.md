# Shared skills

Verified students can add a skill while editing a profile or project recruitment role. Search first, then explicitly click **Add "name"**. The skill is selected immediately and becomes available in the shared catalog. Saving the enclosing form persists its selection; discarding only removes the unsaved selection. Removing a selection never deletes a catalog entry. Catalog creation is independent of profile/project transactions.

## API and normalization

- `GET /api/v1/skills` returns the public catalog as `{id, name}` records.
- `GET /api/v1/skills/resolve?name=...` returns the authoritative equivalent record or JSON `null`; invalid input returns 422. Frontend lookup must succeed before offering creation.
- `POST /api/v1/skills` accepts only `{"name":"C++"}`. It requires a signed-in, email-verified user, the existing Origin/CSRF checks and production proxy authentication. Returns the same normal skill representation: **201** when created, **200** for an existing normalized equivalent. Extra fields are rejected. Existing names are never renamed by duplicate requests.

`app/skill_names.py` is authoritative: reject control/format/surrogate characters; normalize Unicode NFC; trim and collapse whitespace; require 1-80 Unicode code points in the cleaned display name. The uniqueness key is NFC of its Unicode casefold. Case is preserved for display, not automatically title-cased. Python, python and padded Python resolve to one ID. C, C++, C#, .NET and Node.js remain distinct. React and React.js are not aliases. Names render as text.

The API selector resolves exact matches on the server, including Unicode edge cases. Mock mode uses the equivalent normalization with a Python Unicode 16 casefold exception table; its catalog additions persist only in browser prototype storage, separate from API accounts/data. Neither typing nor Enter creates a skill or submits the enclosing form.

New API IDs are opaque `skill-<UUID hex>` slugs with UUID database keys, so punctuation does not cause slug collisions. Existing IDs remain unchanged and continue working in profile selections, role requirements and discovery filters. A database unique normalized-name constraint and `INSERT ... ON CONFLICT` make concurrent equivalent creations return the same ID. There is no public catalog rename/delete endpoint or administrative skill UI.

## Rate limit

`RATE_SKILL_CREATE_LIMIT=10` permits ten create-or-get requests per account per `RATE_WINDOW_SECONDS=900` fixed window. Existing PostgreSQL counters and HMAC keys are reused; accounting commits independently even if a later write fails. Requests resolving an existing skill through POST also consume budget; normal GET lookup does not. Limits apply only after schema/authentication/verification checks. HTTP 429 retains `rate_limited` and `Retry-After`; the frontend displays retry guidance and never automatically replays the mutation. Configure these backend settings for a different pilot budget. Shared IPs do not share this per-account budget.

## Migration and seed compatibility

New migration **0008_skill_names** locks the catalog, computes normalized keys and detects collisions before changing schema. It preserves existing IDs, names, profile links and role links. Collision failure rolls back the migration and production startup reports only conflicting record UUIDs, not raw input. Review the listed records and their references manually; there is deliberately no automatic merge/delete. Invalid legacy names also require operator review before migration. This data migration requires a live database and cannot be emitted with `alembic upgrade --sql`.

The previous backend can still read the additive schema. A database trigger permits its exact unchanged seed upserts, but blocks new legacy inserts without a normalized key and catalog renames. Updated `python -m app.skills` inserts missing seed records and never renames, deletes or replaces existing or user-created records. Do not run an older new-skill writer. Back up and review deployment targets before any authorized hosted migration; this milestone was tested only on the guarded local test database.

## Deployment order

Do not push a frontend that depends on these endpoints before the backend is ready. Before a future authorized push, pause Vercel automatic builds using its **Ignored Build Step** (`exit 0` skips deployment), and disable Render automatic deploys if necessary to control sequencing. Neither setting is changed by this implementation.

1. Deploy the backend commit first. Existing `python -m app.production_start` takes the migration advisory lock, runs the new migration and starts only on success. If collision checks fail, resolve the records through a separately reviewed maintenance plan; do not skip the constraint or change applied migrations.
2. Confirm backend readiness and the new catalog/resolve routes through the authenticated proxy boundary. Configure `RATE_SKILL_CREATE_LIMIT` if overriding the default. No new secret is needed.
3. Restore Vercel's normal build policy and deploy the frontend at the compatible commit. Its public API base remains `/api/v1`. No forwarding allowlist change is required: the existing skills route permits GET/POST and retains cookies, CSRF, fixed upstream and no-store responses.
4. Verify profile creation/selection/save/reload, then create a role skill, save/reopen a draft and publish. In a separate verified account, search the shared skill. Confirm discovery can filter the published project by it.

A frontend rollback remains compatible with the expanded backend. Do not automatically downgrade the database: it may contain newly created skills and selections. See [deployment operations](../DEPLOYMENT.md). Provider controls: [Vercel ignored builds](https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel), [Render deployments](https://render.com/docs/deploys).

## Local verification

Use the dedicated localhost:5433 database and explicit reset consent documented in [backend tests](README.md#checks-and-dedicated-test-database). Run database suites sequentially; never point tests at development or Neon.

```powershell
# From backend/, with the guarded test variables already set
.venv/Scripts/python.exe -m pytest -q
.venv/Scripts/python.exe -m ruff check .
.venv/Scripts/python.exe -m ruff format --check .
# From frontend/
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:api
npm.cmd exec playwright -- test --config playwright.proxy.config.ts
npm.cmd run test:e2e
```

Browser tests use local Mailpit, not external email. API desktop/mobile checks cover creation errors, unsaved fields/focus, profile persistence and role publication; mock checks cover discard/catalog persistence. Existing focus/scroll, session isolation and application workflows remain regression coverage.

The catalog is currently returned as one list; catalog pagination, moderation and alias management are not part of this milestone. Verified email is an account requirement, not proof that a skill is certified.

## Verification snapshot - 2026-10-14

- Backend: **182 passed, zero skips**, including guarded PostgreSQL migrations, reference preservation, safe collision rollback, legacy-write rejection, concurrent equivalent creation, profile/role saves, discovery filtering, permissions, CSRF and rate limits. Ruff lint/format and dependency checks passed.
- Frontend: ESLint, TypeScript and **74 unit tests** passed. API-mode and mock-mode production builds passed; API build used placeholder hosting configuration, not hosted connectivity.
- API browser suite: 26 scenarios passed in the full run; two existing auth assertions became ambiguous because skill selection now has an accessible status message. After targeting the profile-save status specifically, both affected desktop/mobile scenarios passed on rerun (all 28 scenarios covered).
- Same-origin proxy browser suite: **6 passed**, including final 80-character skill wrapping, retryable creation/catalog failures, unsaved form/focus retention, profile persistence, role publication and the existing tab-switch regression.
- Mock browser suite: **31 passed**; after the final chip-wrapping adjustment, **11 focused skill/profile/application/layout checks** passed again across desktop/mobile/tablet. Reviewed desktop and mobile profile screenshots. No database/browser checks were skipped.
- Initial sandboxed browser runs could not clean up their Windows child processes and were interrupted after diagnostics. Final browser runs completed outside that restriction. Redirected Node color warnings can make PowerShell report a native-command error; Playwright summaries and the final result file independently reported passing scenarios and no failed tests.
- Private environment files stayed ignored. Only the guarded local test database was migrated/reset; development and Neon data were untouched. Automated email remained local Mailpit or mocked provider calls. No commit, push, hosting change or deployment was performed.

The maintainer separately confirmed local skill creation before the release review. This is manual local verification, not hosted verification; the backend-first deployment checks remain outstanding.

Release review on 2026-10-14 reran the 18 skill-focused backend tests (all passed, no skips), Ruff lint/format, dependency checks, frontend lint/TypeScript and all 74 unit tests. The full backend, browser and two production-build results above were reused for unchanged application code. The two-test API rerun and eleven-test mock rerun were focused selections, not new full-suite runs. Only documentation changed during this review. The maintainer confirmed Vercel automatic deployments are paused; Render may auto-deploy on push if enabled. Verify Render migration/readiness before deploying the same commit on Vercel.
