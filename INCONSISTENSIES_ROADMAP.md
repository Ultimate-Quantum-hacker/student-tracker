# Student Tracker Inconsistensies Roadmap

## Purpose

This document is the authoritative roadmap for resolving every major problem, inconsistency, architectural weakness, and delivery gap identified in the full Student Tracker audit.

The roadmap is only complete when:

- every user-facing inconsistency has been removed or intentionally redesigned
- every major technical debt item identified in the audit has been resolved
- the app has one canonical product model, one canonical data model, and one canonical permission model
- the app is deployable, testable, maintainable, and scalable without relying on legacy or contradictory paths

## How To Use This File

- Update the phase status table as work progresses.
- Do not mark a phase as complete until every exit criterion in that phase is satisfied.
- If a task is deferred, record the reason in the progress log rather than silently skipping it.
- Keep the audit coverage matrix current if roadmap scope changes.
- Use this as the single source of truth for roadmap tracking unless a newer file explicitly replaces it.

## Status Legend

- **Not Started**: No implementation work has begun.
- **In Progress**: Work is active but exit criteria are not yet met.
- **Blocked**: Work cannot continue until a dependency or decision is resolved.
- **Completed**: All exit criteria for the phase have been met and verified.

## Phase Tracker

| Phase | Name | Status | Primary Outcome |
| --- | --- | --- | --- |
| 1 | Product Consistency and Canonical Rules | In Progress | One product identity, one risk model, one permission model, and no contradictory UX rules |
| 2 | Auth, Identity, and Account Lifecycle Completion | In Progress | Authentication and user account management become complete and production-ready |
| 3 | Data Model Hardening and Migration Completion | In Progress | Immutable, migration-safe, id-based data model with no legacy dependency |
| 4 | Frontend Architecture and Service Layer Consolidation | Not Started | Modular codebase with clear boundaries and one authoritative data access layer |
| 5 | Teacher and Admin Workflow Completion | Not Started | Fully coherent day-to-day workflows with missing feature gaps closed |
| 6 | Offline, PWA, Environment, and Deployment Readiness | Not Started | Valid installable PWA, correct environment separation, and complete deployment setup |
| 7 | Scale, Performance, and Operational Maturity | Not Started | App performs acceptably at larger data volumes and admin operations scale cleanly |
| 8 | QA, Automation, and Release Governance | Not Started | Turnkey local setup, CI automation, reliable regression coverage, and release gates |

---

# Phase 1: Product Consistency and Canonical Rules

## Objective

Remove all product-level contradictions so the app behaves like a single coherent product instead of a mix of overlapping generations and partial policies.

## Problems This Phase Resolves

- Inconsistent product naming across pages and code
- Detached and inconsistent `risk.html` behavior
- Conflicting risk thresholds between the standalone risk view and `analytics.js`
- Role/permission ambiguity around export, import, backup, restore points, and admin capabilities
- Inconsistent user-facing copy, status messages, and role expectations
- Overly rigid student name validation that rejects real-world names

## Scope

- Define and adopt one canonical product name.
- Define one canonical risk classification model and one authoritative risk UI.
- Decide the final permission matrix for `teacher`, `admin`, and `developer`.
- Align UI gating, business rules, and security assumptions to that matrix.
- Normalize naming and text across pages, buttons, messages, and reports.
- Expand student naming support to handle realistic data entry cases.

## Deliverables

- [ ] Single approved product name used across `index.html`, `admin.html`, auth pages, reports, PWA metadata, docs, and UI copy
- [ ] Canonical permission matrix document covering every protected feature
- [ ] Canonical risk classification spec used everywhere in the app
- [x] Decision on `risk.html`: integrate into the main app or retire it completely
- [x] Updated validation rules for student names and other user-entered identity fields
- [ ] Standardized copy for toasts, empty states, role messages, and error states

## Exit Criteria

- No page or report uses an outdated or contradictory product name.
- There is only one supported risk model in the entire product.
- `risk.html` is either fully integrated into the same data/runtime model as the main app or removed from the supported surface area.
- Every privileged feature has a documented owner role and a matching implementation path.
- Teachers, admins, and developers see behavior that matches product decisions without hidden contradictions.
- Realistic student names such as hyphenated, apostrophe-containing, accented, and mixed-case names can be handled intentionally.

## Dependencies

- None. This phase establishes the product rules that later phases implement.

---

# Phase 2: Auth, Identity, and Account Lifecycle Completion

## Objective

Complete the authentication and account lifecycle so users can securely sign up, recover access, verify identity, and manage their account without relying on developer intervention.

## Problems This Phase Resolves

- Missing password reset flow
- Missing email verification flow
- Missing profile/account settings
- Incomplete onboarding and account lifecycle management
- Inconsistent auth polish between signup, login, and post-login account state

## Scope

- Add password reset.
- Add email verification if the final product policy requires it.
- Add profile/settings management for name and account metadata.
- Improve auth-state messaging and error handling.
- Define whether admin/developer account creation is invite-based, promoted internally, or managed manually.

## Deliverables

- [x] Password reset flow end to end
- [x] Email verification flow and verified/unverified state handling if adopted
- [x] Account/profile settings page or modal
- [x] Auth-state-aware UX for verified status, reset actions, and session issues
- [x] Clear privileged-role onboarding policy and implementation
- [x] Updated auth documentation and test coverage

## Exit Criteria

- A locked-out user can recover access without manual database intervention.
- The account lifecycle from signup to steady-state usage is complete and intentional.
- Profile changes are first-class features rather than ad hoc data updates.
- Auth-related errors are understandable and consistent.
- Privileged-role creation and promotion rules are documented and enforced.

## Dependencies

- Phase 1 permission model decisions

---

# Phase 3: Data Model Hardening and Migration Completion

## Objective

Eliminate fragile storage patterns and finish the long-term migration path so the app runs on a stable, id-based, future-proof data model.

## Problems This Phase Resolves

- Scores keyed by mutable subject names and exam titles instead of immutable ids
- Legacy root collection compatibility burden
- Migration complexity and failure risk
- Unclear automation of trash cleanup retention
- Shallow or informal lifecycle management for logs and cleanup operations
- Missing explicit schema versioning and migration governance

## Scope

- Move score storage to immutable ids.
- Add schema versioning and migration markers.
- Complete migration away from legacy root collection dependency.
- Automate trash cleanup and verify retention behavior.
- Revisit activity log retention, archival, and operational history policy.
- Add any required Firestore indexes/config needed by the stabilized model.

## Deliverables

- [x] Id-based score model replacing name-keyed score storage
- [ ] Safe migration plan and migration tooling for existing data
- [ ] Verified legacy-to-current data migration path
- [ ] Schema versioning strategy and persisted version markers
- [ ] Automated trash cleanup mechanism with tests and operational verification
- [ ] Activity log retention strategy with implementation and tests
- [ ] Firestore indexes and migration documentation checked into the repo

## Exit Criteria

- No active production path depends on mutable labels as storage keys.
- Renaming a subject or exam does not require rewriting student records in fragile ways.
- Legacy root collections are no longer required for normal operation.
- Trash retention is actually enforced by a reliable mechanism, not just UI messaging.
- Data migrations are repeatable, verified, and observable.
- Firestore configuration required by the data model is stored in the repo.

## Dependencies

- Phase 1 canonical rules for supported features and retention expectations

---

# Phase 4: Frontend Architecture and Service Layer Consolidation

## Objective

Refactor the codebase into clear modules with stable boundaries so future feature work is safer, faster, and easier to test.

## Problems This Phase Resolves

- `js/ui.js`, `js/state.js`, and `js/admin.js` are too large and multi-purpose
- Mixed architectural eras and stale legacy files
- Admin code bypasses a fully centralized data access layer in places
- Mixed frontend implementation style, including React/Recharts usage inside a largely vanilla app
- Difficult maintainability and high regression risk from central file edits

## Scope

- Split the largest runtime files by feature and responsibility.
- Establish module boundaries for rendering, events, state orchestration, domain logic, and data access.
- Move admin Firestore access behind the same service-layer conventions used elsewhere.
- Standardize the charting/rendering approach.
- Remove obsolete files, legacy entry points, and stale manual test artifacts.

## Deliverables

- [ ] Feature-based module structure for dashboard, results, trash, reports, analytics, admin views, and shared utilities
- [ ] Reduced responsibilities in `ui.js`, `state.js`, and `admin.js`
- [ ] Centralized admin data reads/writes through the service layer
- [ ] Documented architectural conventions for new modules
- [ ] Standardized charting strategy with one chosen frontend approach
- [ ] Removal or archival of stale legacy files and obsolete artifacts

## Exit Criteria

- The main runtime files no longer act as catch-all containers for unrelated concerns.
- Data access is centralized and consistent across both main and admin surfaces.
- New feature work can be done by modifying a bounded feature area instead of touching giant shared files.
- There is no unsupported legacy code path left in the active app surface.
- The chart layer is technically consistent with the rest of the frontend architecture.

## Dependencies

- Phase 3 data model decisions should be stable before major architectural breakup is finalized.

---

# Phase 5: Teacher and Admin Workflow Completion

## Objective

Close the remaining workflow gaps so the app supports complete, intentional, production-ready daily usage for both teacher and admin roles.

## Problems This Phase Resolves

- Teacher export/backup/import permissions may not match real product expectations
- Import flows are functional but not robust enough for production-grade data onboarding
- Risk/intervention workflows are incomplete or partly disconnected
- Admin workflow boundaries are not yet expressed as a finished product system
- Activity history depth and operational tooling may be insufficient
- Some daily workflows still feel like assembled features rather than one integrated product

## Scope

- Finalize export/import/backup access based on Phase 1 permission decisions.
- Improve bulk import quality with validation, preview, and error reporting.
- Extend intervention/risk tooling beyond minimal notes-only support if required by product goals.
- Clarify and implement the final admin operational capability set.
- Improve registry, search, and history workflows where needed.
- Close remaining workflow-level inconsistencies between teacher and admin experiences.

## Deliverables

- [ ] Finalized role-based export/import/backup capability set
- [ ] Robust CSV or spreadsheet import with validation summary, duplicate handling, and failure reporting
- [ ] Unified risk/intervention workflow inside the supported app surface
- [ ] Clear admin action model with documented write/read boundaries
- [ ] Improved operational views for logs, search, registry, and relevant history depth
- [ ] Updated help text and UX cues for all major daily workflows

## Exit Criteria

- Teachers can complete their core tasks without missing obvious operational tools.
- Admins have a coherent supported workflow that matches the documented product role.
- Import/export/backup behavior is predictable and appropriate to the chosen permission model.
- Risk and intervention handling is part of the main product rather than split across disconnected surfaces.
- Workflow friction caused by contradictory or unfinished features has been removed.

## Dependencies

- Phase 1 permission and risk decisions
- Phase 3 data model stabilization
- Phase 4 architectural refactor for maintainable implementation

---

# Phase 6: Offline, PWA, Environment, and Deployment Readiness

## Objective

Make the app operationally correct as a deployable product: valid PWA assets, complete environment setup, safe configuration handling, and documented deployment/runtime expectations.

## Problems This Phase Resolves

- Missing PWA icons referenced by the manifest and service worker
- Partial service worker scope and incomplete offline story
- Hardcoded Firebase project configuration in runtime files
- Hardcoded live project references in helper scripts
- Missing hosting/deployment completeness in Firebase config
- Missing repo-level environment separation and safer non-production workflows
- Stale package metadata and incomplete project setup instructions

## Scope

- Add and validate all referenced PWA assets.
- Decide the supported offline scope and implement it intentionally.
- Move environment-specific configuration to a safer, maintainable strategy.
- Rework scripts that currently target live production resources by default.
- Complete Firebase/deployment configuration stored in the repo.
- Refresh `README.md`, package metadata, and setup docs.

## Deliverables

- [ ] Real PWA icon set referenced correctly by `manifest.json` and the service worker
- [ ] Documented offline support policy for supported pages and behaviors
- [ ] Service worker updated to match supported offline scope
- [ ] Environment/configuration strategy for local, staging, and production use
- [ ] Safer rules-probe and operational scripts that do not default to live production writes
- [ ] Complete deployment configuration in the repo, including hosting and indexes as needed
- [ ] Updated `README.md`, `package.json`, and setup/deployment documentation

## Exit Criteria

- The app installs cleanly as a PWA with valid assets.
- Offline behavior is intentional, documented, and tested.
- Runtime configuration is not coupled to one hardcoded environment strategy.
- Operational scripts do not encourage unsafe production-side testing by default.
- A new contributor can understand how to run, test, and deploy the app from repo docs.

## Dependencies

- Phase 1 decisions on supported surfaces
- Phase 4 architecture cleanup for cleaner configuration handling

---

# Phase 7: Scale, Performance, and Operational Maturity

## Objective

Upgrade the data access and rendering strategy so the app remains usable and affordable as data size and admin usage grow.

## Problems This Phase Resolves

- Admin global views rely too heavily on broad reads and client-side filtering
- Search and registry behavior may not scale well with larger datasets
- Activity log retention depth may be too shallow for real operational use
- Heavy screens may degrade with larger class sizes or exam volumes
- There is no explicit performance budget or capacity target

## Scope

- Rework admin/global queries to reduce full-dataset loading.
- Add query constraints, pagination, and scalable search/index strategies.
- Improve data hydration patterns for large views.
- Set performance targets for major teacher and admin screens.
- Revisit operational history depth and archival needs.

## Deliverables

- [ ] Server/query-driven pagination strategy for global admin tables and registries
- [ ] Reduced client-side full-scan dependence for global search and student registry views
- [ ] Performance budgets for key screens
- [ ] Benchmarks or profiling results for large classes and larger admin datasets
- [ ] Activity log depth/retention strategy aligned with operational needs
- [ ] Optimized render behavior for heavy data-entry and reporting surfaces

## Exit Criteria

- Admin pages no longer depend on loading broad datasets just to filter locally in normal use.
- Core screens remain responsive at the agreed target dataset sizes.
- Search, registry, and activity flows have an explicit scaling strategy.
- Performance regressions can be detected and discussed using real measurements.

## Dependencies

- Phase 3 stable data model
- Phase 4 service-layer consolidation
- Phase 6 deployment/config readiness for realistic testing

---

# Phase 8: QA, Automation, and Release Governance

## Objective

Turn the project into a reproducible, testable, releasable codebase with automated confidence checks and a defined release standard.

## Problems This Phase Resolves

- No turnkey local test workflow
- No default server startup path wired into tests
- Gaps in true end-to-end behavioral coverage
- Over-reliance on source-string regression assertions
- Weak mobile/offline/export regression coverage
- No CI release gate and incomplete release discipline

## Scope

- Add runnable npm scripts for app startup, test runs, smoke checks, and CI.
- Add a standard local and CI test harness.
- Expand Playwright coverage to key real user flows.
- Keep valuable refactor regression tests while shifting critical confidence to behavior-driven tests.
- Add coverage for offline behavior, exports, reports, role boundaries, and admin workflows.
- Define release gates and verification criteria.

## Deliverables

- [ ] `package.json` scripts for local development, smoke testing, and Playwright runs
- [ ] Standard test server startup for local and CI execution
- [ ] Expanded behavioral E2E coverage for teacher, admin, auth, report, and trash flows
- [ ] Coverage for offline/PWA and export/report workflows where feasible
- [ ] CI pipeline that runs the required checks before merge or release
- [ ] Release checklist and definition of release readiness
- [ ] Guidance for emulator-backed or environment-safe testing paths

## Exit Criteria

- A contributor can run the project and its tests from documented commands.
- Core product workflows are covered by behavioral automated tests.
- CI provides meaningful release confidence rather than only static checks.
- The team has an explicit release standard instead of relying on ad hoc validation.
- The roadmap can be marked complete without any unresolved audit item lacking a verification path.

## Dependencies

- All earlier phases feed into this phase, though test improvements should begin earlier where practical.

---

# Audit Coverage Matrix

This matrix maps every major issue from the audit to the phase that resolves it.

| Audit Finding | Resolution Phase(s) |
| --- | --- |
| Inconsistent product naming across pages and reports | Phase 1 |
| Detached `risk.html` surface | Phase 1, Phase 5 |
| Conflicting risk thresholds/models | Phase 1 |
| Unclear permission model for export/import/backup/reset | Phase 1, Phase 5 |
| Rigid student name validation | Phase 1 |
| Missing password reset | Phase 2 |
| Missing email verification | Phase 2 |
| Missing account/profile settings | Phase 2 |
| Incomplete privileged account lifecycle policy | Phase 2 |
| Mutable name-keyed score storage | Phase 3 |
| Legacy root collection dependency | Phase 3 |
| Migration fragility | Phase 3 |
| Trash retention not clearly automated | Phase 3 |
| Weak schema-version governance | Phase 3 |
| Incomplete Firestore index/config capture | Phase 3, Phase 6 |
| Monolithic `ui.js` | Phase 4 |
| Monolithic `state.js` | Phase 4 |
| Monolithic `admin.js` | Phase 4 |
| Admin data access not fully centralized | Phase 4 |
| Mixed frontend paradigms | Phase 4 |
| Legacy/stale files and artifacts | Phase 4 |
| Teacher workflow gaps around operational tools | Phase 5 |
| Import flow robustness gaps | Phase 5 |
| Risk/intervention flow incompleteness | Phase 5 |
| Admin workflow incoherence or ambiguity | Phase 5 |
| Limited operational history tooling | Phase 5, Phase 7 |
| Missing PWA icons/assets | Phase 6 |
| Partial offline/PWA scope | Phase 6 |
| Hardcoded Firebase runtime configuration | Phase 6 |
| Scripts targeting live project resources by default | Phase 6 |
| Incomplete deployment/hosting configuration | Phase 6 |
| Stale `README.md` and package metadata | Phase 6 |
| Admin global reads may not scale | Phase 7 |
| Client-side filtering/search scale limitations | Phase 7 |
| Heavy-screen render/performance risk | Phase 7 |
| Activity log depth may be insufficient | Phase 7 |
| No performance budget or measurement discipline | Phase 7 |
| No turnkey test workflow | Phase 8 |
| No CI-ready automated release gate | Phase 8 |
| Limited behavioral E2E coverage | Phase 8 |
| Over-reliance on source-assertion tests | Phase 8 |
| Weak offline/mobile/export regression coverage | Phase 8 |

---

# Definition of Complete Roadmap Success

The roadmap is complete only when all of the following are true:

- [ ] The app has one canonical name and one canonical product vocabulary.
- [ ] The app has one canonical risk model and one supported risk workflow.
- [ ] The role model is fully documented and implemented consistently across UI, state, services, and rules.
- [ ] Authentication includes recovery and account lifecycle management.
- [ ] The data model is id-based, migration-safe, and free from fragile label-keyed storage.
- [ ] Legacy data paths are retired or fully isolated as non-operational compatibility code.
- [ ] The largest runtime files are modularized into bounded feature areas.
- [ ] The service layer is authoritative for both main and admin data access.
- [ ] Teacher and admin workflows are complete and intentional.
- [ ] PWA assets, offline scope, and deployment configuration are production-ready.
- [ ] The app performs acceptably at target data volumes.
- [ ] The repository is runnable, testable, documented, and protected by CI.

---

# Recommended Execution Order

Work should proceed in this order unless a specific dependency forces a small overlap:

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
6. Phase 6
7. Phase 7
8. Phase 8

## Parallelization Notes

Some work can overlap safely once the governing decisions are stable:

- Phase 2 can begin during the latter half of Phase 1 once the permission model is fixed.
- Phase 4 preparation can begin during Phase 3 design, but final module splits should wait until the new data model is settled.
- Phase 8 test improvements should start early, but final release governance belongs at the end.

---

# Progress Log

Use this section to track major roadmap updates.

## Log Template

- **Date:** YYYY-MM-DD
- **Phase:** Phase X
- **Update:** Short description of what changed
- **Impact:** What moved forward, what is blocked, or what was completed

## Entries

- **Date:** 2026-04-04
- **Phase:** Phase 1
- **Update:** Standardized the main dashboard branding and reset terminology, aligned UI/state/service-layer student-name validation, updated manifest and export artifact names to the canonical Student Performance Tracker identity, and retired the legacy `risk.html` surface by redirecting it into the in-app performance analysis workflow.
- **Impact:** Phase 1 is now actively in progress with the main supported UI surfaces using one risk workflow and one student-name validation path. Remaining Phase 1 work is mostly documentation and final verification of the canonical permission/product rules across every touched surface.

- **Date:** 2026-04-04
- **Phase:** Phase 2
- **Update:** Began Phase 2 by auditing the auth/account lifecycle and implementing the password reset flow from the login page through the Firebase auth layer, including user-safe reset messaging and auth-page feedback state handling.
- **Impact:** Phase 2 is now in progress and locked-out users can start recovery directly from the supported login surface. Remaining work includes email verification policy/implementation, account settings UI, and broader auth-state UX polish.

- **Date:** 2026-04-04
- **Phase:** Phase 2
- **Update:** Added an in-app Account Settings dashboard surface wired to the richer auth session/profile layer, including profile name save handling, session metadata display, sidebar navigation integration, and owner-name synchronization for classes owned by the signed-in user.
- **Impact:** Signed-in users can now manage their display name inside the product without developer intervention, and profile changes propagate to the active account/session UI plus owned-class labels. Remaining Phase 2 work is centered on email verification policy/implementation, broader auth-state UX polish, privileged-role onboarding rules, and documentation/test coverage.

- **Date:** 2026-04-04
- **Phase:** Phase 2
- **Update:** Implemented the adopted teacher-strict, admin-manual email verification flow across signup, login, and dashboard entry, including automatic verification-email send on signup, a dedicated verification gate page, resend and refresh actions, and dashboard blocking for unverified teacher sessions.
- **Impact:** Self-serve teacher accounts must now verify their email before entering the main app, while privileged roles remain outside that gate pending the separate onboarding policy decision. Remaining Phase 2 work is broader auth-state UX polish, privileged-role onboarding rules, and documentation/test coverage.

- **Date:** 2026-04-04
- **Phase:** Phase 2
- **Update:** Polished the auth-state UX across dashboard entry, login, and the verification gate by adding explicit redirect and session notices, a shared auth-notice handoff module, visible email verification status in Account Settings, and focused Playwright auth smoke coverage that runs with offline stubs for external CDN dependencies.
- **Impact:** Auth redirects now explain why the user moved between surfaces, verified session state is visible inside the in-app account summary, password reset remains intact, and the polished login, signup, verify-email, and dashboard entry flows have passing focused smoke validation. Remaining Phase 2 work is privileged-role onboarding rules plus broader documentation and test expansion.

- **Date:** 2026-04-05
- **Phase:** Phase 2
- **Update:** Implemented the privileged-role onboarding policy across the auth/profile, admin panel, service, and Firestore security layers by persisting `emailVerified` on user profiles, restricting admin promotion to verified teacher accounts, keeping developer onboarding manual-only, adding audited role-update metadata, aligning the admin UI copy/disabled states with the policy, and extending the critical regression suite with focused privileged-role coverage plus offline dependency stubs.
- **Impact:** Privileged-role creation and promotion behavior is now consistently enforced at the UI, service, and security boundaries, admin users receive clear policy feedback before blocked writes, and the new focused Chromium regression passes for the verified-admin-promotion/manual-developer path. Remaining Phase 2 work is broader auth documentation and any additional test expansion beyond this policy slice.

- **Date:** 2026-04-05
- **Phase:** Phase 2
- **Update:** Replaced the placeholder project documentation with current auth/account-lifecycle guidance in `README.md`, refreshed `FIREBASE_SETUP.md` to match the runtime Firebase config and locked-down Firestore rules workflow, added npm scripts for auth smoke/regression/rules deployment, and expanded `tests/example.spec.js` with offline-stubbed coverage for password reset feedback, signed-in unverified-user routing, verify-email screen context, and auth helper verification gating.
- **Impact:** Phase 2 documentation now matches the implemented teacher signup/login/verification/account-settings lifecycle, the local test/deploy workflow is documented at the package and markdown layers, and the focused Chromium auth smoke suite passes `8/8` with broader lifecycle coverage. Remaining Phase 2 work is now limited to any optional follow-up verification or future roadmap phases.

- **Date:** 2026-04-05
- **Phase:** Phase 3
- **Update:** Canonicalized subject and exam score writes around immutable ids across `js/ui.js`, `js/students.js`, `js/state.js`, and `services/db.js`, preserved id-bearing subject/exam records through Firestore reads and writes, and added focused Playwright regressions covering UI score entry, runtime migration, analytics compatibility, and service-layer persistence.
- **Impact:** Phase 3 is now in progress with the app's active score-entry and persistence paths writing id-keyed score maps instead of mutable labels, and the focused Chromium validation slice passes with `npx playwright test tests/refactor-critical-regressions.spec.js --project=chromium --workers=1 --grep "teacher write flows retain writable class-scoped context|teacher score entry UI emits subject id keyed payloads|applyRawData migrates legacy score maps to subject and exam ids|service student write paths normalize label keyed scores to ids before persistence|scoring classification boundaries remain unchanged" --reporter=line`. Remaining Phase 3 work is migration tooling/verification, schema-version governance, trash-cleanup automation, activity-log retention policy, and Firestore index/documentation capture.
