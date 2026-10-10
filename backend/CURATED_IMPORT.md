# Curated project import

This explicit administrative command creates the nine prepared normal project
proposals for an existing verified deployed account. It does not copy a local
database or create users. Run from `backend/` only after authorizing the intended
hosted project/branch and filling the ignored `.env.hosted` privately.

```powershell
.venv/Scripts/python.exe -m app.import_projects --owner-email YOUR_DEPLOYED_EMAIL --preview
.venv/Scripts/python.exe -m app.import_projects --owner-email YOUR_DEPLOYED_EMAIL --apply
```

Review all nine titles, owner, role requirements and capacities before applying.
The command checks current migrations but never runs them. Missing catalog skills
block the transaction; seed skills separately when authorized.

Definitions reuse `sample_projects.EXAMPLES` for titles, types and roles and
`convert_projects.DESCRIPTIONS` for the prepared normal-project descriptions.
Each project has capacity four, two one-position contribution roles and one real
owner membership. Creation/publication timestamps are current, not fictional past
activity. Skills resolve by catalog slug. The same API input validation and skill
assignment helper are used. No application eligibility or ownership checks change.

Stable IDs and the existing converted provenance marker protect repeat runs.
An advisory transaction lock serializes imports with old seed operations. All new
projects commit together; existing records are skipped, never repaired, reopened
or reassigned. Identifier conflicts are reported as `skip_conflict`; matching
converted records owned by the selected account are `skip_existing`.
Preview values describe proposed initial creation, not current state of skipped
records. Existing applications/memberships always remain untouched.

The old seed skips converted records, and sample removal previews exclude them.
The original seed/conversion CLIs remain local-only. This command is not an API
endpoint, needs no schema changes and requires no deployed code change for normal
applications to work. Do not run tests against hosted databases.

Manual verification: sign in as another verified account, apply to a listed role,
then sign in as the owner and open Manage Project → Applications. Accept to check
team/opening updates; use separate requests to check rejection and withdrawal.
Database inspection alone does not verify the browser workflow.

Verification on 2026-10-10: 21 focused local import, sample-safety and application
tests passed with no skips after starting the dedicated PostgreSQL test service
(the initial run failed at setup because that service was unavailable). Ruff lint
and formatting passed. The authorized hosted import created nine projects; its
second run skipped all nine. Read-only checks confirmed 18 roles, nine owner
memberships, unchanged IDs/skill links and normal published/open state. No hosted
test applications or emails were sent, and no hosted browser workflow was tested.

Separately, the maintainer reports on 2026-10-10 that the deployed website works,
including the hosted catalog and imported projects. This does not turn the local
automated results into hosted browser-test coverage or assert specific review
actions were exercised.
