# CampusCollab

A frontend prototype for students to discover projects, recruit for contribution roles, apply and form teams. Includes project creation, private drafts, My Projects, owner application review and My Applications with withdrawal.

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

## Routes

| Route | Behavior |
| --- | --- |
| `/` | Redirects to discovery. |
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

The **Demo user** selector appears only under `npm run dev`. It reuses fictional Maya Rao, Aarav Sharma and Sneha Patel. Selection lives in tab-local `sessionStorage` under `campuscollab.demo-user`. Outside development, the selector is omitted and Maya is the default. Duplicating a browser tab may initially copy session storage; choose another user there as needed.

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

**Demo identity and mock authorization are prototype behavior, not real authentication or backend security.** Browser users can inspect/edit local storage. A backend must independently enforce identity, permissions, privacy, unique `(student_id, project_id)` constraints and transactional capacity checks. All people/contact details are fictional and do not represent Chaitanya. Skills are self-declared; no identity, college or skill verification is claimed.

## Architecture and persistence

Reuses Next.js App Router, strict TypeScript, installed Tailwind CSS 4, TanStack Query, React Hook Form, Zod, Radix Dialog and Lucide. Fonts are bundled. No CDN scripts, backend or second data architecture.

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

Deferred: published-project editing, archive restoration, member removal, invitations, ownership transfer, public student profiles, real sign-in/onboarding and backend authorization/persistence. Unavailable destinations are omitted from navigation. No email delivery, chat, task boards, AI, Redis or AWS infrastructure. The small mock collection is in memory without pagination; deadlines are sample metadata, not a scheduler. Browser checks use Chrome emulation, not physical devices or Safari. The backend must implement applicant-scoped list/detail reads and transactional withdrawal/acceptance rather than trusting these prototype controls.

## Validation

Vitest covers existing filtering/profile/application behavior; draft reload/edit/publication; owner-only access; actor isolation; publishing/capacity rules; automatic membership; v1/v2 migrations; forbidden inbox/mutations; duplicate/competing decisions; full teams/roles; rejected/withdrawn states; closed recruitment; archiving and failed-write atomicity.

Playwright covers existing screens plus creation, validation, unsaved confirmation, per-tab identity isolation, save recovery, My Projects, owner filters/review, keyboard confirmations, accepted status/membership, joined projects, cross-tab stale panels, private-panel isolation and archived controls. Desktop/mobile screenshots verify overflow and bounded dialogs; tablet checks preserve existing layouts.

My Applications adds checks for list/detail identity isolation, search/status counts/sorting, withdrawal/reload, unauthorized and terminal-state attempts, competing acceptance/withdrawal, closed/archived withdrawal, accepted history without membership, unavailable/private references and atomic failed writes. Browser checks cover submission-to-list navigation, desktop/mobile rendering, keyboard dialogs, cross-tab owner updates, identity isolation and recoverable withdrawal failures.

Latest completed run: lint passed without warnings; strict TypeScript passed; production build passed; **44 Vitest tests passed** and **27 Playwright tests passed**. The full regression suite covers previous milestones and the new applicant workflow on desktop/mobile, plus existing tablet layout checks. My Applications table/cards and scrollable details were visually inspected on desktop and mobile; viewport overflow and keyboard confirmation checks passed.
