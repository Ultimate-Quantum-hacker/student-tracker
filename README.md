# Student Tracker

Student Tracker is a Firebase-backed web app for managing classes, students, subjects, exams, and score analysis from a teacher dashboard, with an admin panel for privileged oversight and support workflows.

## Core Features

- Teacher dashboard for student, subject, exam, and score management
- Firebase Authentication with email/password login and signup
- Password reset from the login page
- Teacher email-verification gate before dashboard access
- In-app Account Settings with display-name updates and session metadata
- Admin panel with role-aware visibility, activity logs, and global search
- Firestore security rules aligned with role and ownership boundaries

## Current Auth and Account Lifecycle

The supported account lifecycle in Phase 2 is:

1. A new self-serve account signs up with email/password.
2. The app creates a user profile under `users/{uid}` with the default `teacher` role.
3. A verification email is sent during signup.
4. Unverified teacher accounts are routed to `verify-email.html` instead of the main dashboard.
5. Verified teacher accounts can enter `index.html` normally.
6. Login supports password reset from the same page.
7. Signed-in users can update their display name from Account Settings.

Privileged-role policy:

- New self-serve accounts cannot create `admin` or `developer` roles.
- `admin` promotion is limited to verified teacher accounts.
- `developer` onboarding is manual and cannot be performed from the admin panel.
- The policy is enforced in the admin UI, the service layer, and `firestore.rules`.

## Firebase Configuration

This repo currently uses runtime Firebase config via `js/firebase-config.js`, which sets `window.__FIREBASE_CONFIG__` for the default project:

- `student-tracker-app-670c2`

If you need to point the app at a different Firebase project, update `js/firebase-config.js` or inject `window.__FIREBASE_CONFIG__` before `js/firebase.js` loads.

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Serve the repository root on `http://localhost:3000` with your preferred static server.

3. Open one of the supported entry points:

- `login.html`
- `signup.html`
- `verify-email.html`
- `index.html`
- `admin.html`

## Testing

Focused test commands are available in `package.json`:

```bash
npm run test:auth-smoke
npm run test:critical-regressions
```

The Playwright auth smoke suite uses offline stubs for:

- Firebase CDN modules
- Google Fonts
- CDN-hosted export libraries

That keeps auth-flow validation stable even when network access is limited.

## Firestore Deployment

Firestore rules source lives in `firestore.rules`.
Firestore index configuration source lives in `firestore.indexes.json`.
The current checked-in composite-index set is intentionally empty because the stabilized Phase 3 query model does not yet require any custom multi-field indexes.

Deploy the active Firestore config with:

```bash
npm run deploy:firestore
```

Deploy only rules with:

```bash
npm run deploy:firestore-rules
```

Deploy only indexes with:

```bash
npm run deploy:firestore-indexes
```

Deployment config is tracked in:

- `firestore.indexes.json`
- `firebase.json`
- `.firebaserc`

## Frontend Architecture Conventions

- Keep `js/app.js`, `js/ui.js`, `js/state.js`, and `js/admin.js` focused on orchestration, lifecycle wiring, and cross-module coordination.
- Put bounded feature logic in focused modules such as `js/ui-dashboard.js`, `js/state-context.js`, and the `js/admin-*.js` helper modules instead of growing the main runtime files.
- Prefer small pure/helper modules for shared formatting, normalization, markup, and role-policy logic so they can be imported and regression-tested independently.
- Route Firestore reads and writes through `services/db.js`; runtime UI/admin/state modules should consume service-layer helpers instead of calling Firestore directly.
- Keep the charting layer on the app's native DOM/SVG/canvas renderer path; do not reintroduce React/Recharts into the active frontend.

## Key Files

- `js/auth.js` - auth helpers, profile resolution, verification, reset, and session utilities
- `js/auth-page.js` - login, signup, verify-email, reset, and redirect UX
- `js/app.js` - dashboard auth/session gating and redirects
- `js/ui.js` - main dashboard/UI orchestration and shared surface coordination
- `js/ui-dashboard.js` - dashboard and performance rendering helpers extracted from `js/ui.js`
- `js/state.js` - runtime state orchestration, data loading, and persistence coordination
- `js/state-context.js` - role normalization and current-class context helpers extracted from `js/state.js`
- `js/admin.js` - admin panel orchestration layered over focused admin helper modules
- `js/admin-*.js` - focused admin display, registry, activity, and markup helpers
- `js/admin-user-utils.js` - role-policy helpers for admin UI decisions
- `services/db.js` - service-layer Firestore access and privileged-role enforcement
- `firestore.rules` - Firestore security rules
- `firestore.indexes.json` - Firestore composite-index source of truth
- `tests/example.spec.js` - focused auth smoke coverage
- `tests/refactor-critical-regressions.spec.js` - higher-value regression coverage

## Roadmap Source of Truth

Roadmap tracking lives in:

- `INCONSISTENSIES_ROADMAP.md`

Phase 4 is now complete; use the roadmap file for current phase status and progress-log details.
