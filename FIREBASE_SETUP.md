# Firebase Setup Guide

## Overview

Student Tracker uses Firebase Authentication and Firestore for account lifecycle, dashboard data, admin workflows, and security enforcement.

The repository is currently wired to the Firebase project:

- `student-tracker-app-670c2`

## Runtime Web Configuration

This app reads Firebase web config from `window.__FIREBASE_CONFIG__`.

By default, that object is set in:

- `js/firebase-config.js`

If you need to switch projects, update that file or inject a replacement config object before `js/firebase.js` loads.

The required keys are:

- `apiKey`
- `authDomain`
- `projectId`
- `storageBucket`
- `messagingSenderId`
- `appId`

## Firebase Project Setup

If you are setting up a fresh Firebase project:

1. Create a Firebase project in the Firebase Console.
2. Enable Email/Password authentication in Authentication.
3. Create a Firestore database.
4. Register a web app and copy the Firebase web config.
5. Put that config in `js/firebase-config.js`.
6. Deploy the repository's checked-in Firestore config before using the app with real data.

## Firestore Rules Source of Truth

Do not use permissive test-mode rules for this app.

The authoritative rules live in:

- `firestore.rules`
- `firestore.indexes.json`

Deployment config lives in:

- `firestore.indexes.json`
- `firebase.json`
- `.firebaserc`

Deploy the full Firestore config with:

```bash
npm run deploy:firestore
```

Deploy rules with:

```bash
npm run deploy:firestore-rules
```

Deploy only indexes with:

```bash
npm run deploy:firestore-indexes
```

Or directly:

```bash
npx firebase-tools deploy --only firestore --project student-tracker-app-670c2
```

Or deploy only indexes directly:

```bash
npx firebase-tools deploy --only firestore:indexes --project student-tracker-app-670c2
```

Current Phase 3 note:

- The checked-in `firestore.indexes.json` file is the repository source of truth for Firestore index config.
- The current stabilized query set does not require any custom composite indexes yet, so the tracked file intentionally contains empty `indexes` and `fieldOverrides` arrays.
- If a future query adds a compound `where(...)` plus `orderBy(...)` or similar multi-field index requirement, update `firestore.indexes.json` and deploy it with the scripts above.

## Auth and Account Lifecycle Expectations

The current auth flow is:

1. A user signs up with email/password.
2. The app creates or updates `users/{uid}`.
3. Self-serve accounts start as `teacher`.
4. Teacher accounts must verify email before dashboard access.
5. Unverified teachers are routed to `verify-email.html`.
6. Login supports password reset.
7. Account Settings supports display-name updates and session metadata display.

Privileged-role policy:

- `admin` promotion is allowed only for verified teacher accounts.
- `developer` onboarding is manual only.
- Privileged-role changes are enforced in UI, service logic, and Firestore rules.

## Relevant App Entry Points

- `login.html`
- `signup.html`
- `verify-email.html`
- `index.html`
- `admin.html`

## Local Verification Checklist

After configuring Firebase:

1. Load `signup.html` and create a teacher account.
2. Confirm a verification email is sent.
3. Confirm the account is routed to `verify-email.html` until verification completes.
4. Verify that a verified teacher can reach `index.html`.
5. Confirm password reset works from `login.html`.
6. Confirm Account Settings shows role, email, last updated, and email status.
7. Confirm admin role changes follow the privileged-role policy.

## Automated Test Coverage

Relevant Playwright commands:

```bash
npm run test:auth-smoke
npm run test:critical-regressions
```

The auth smoke tests stub Firebase CDN dependencies so they can run reliably without live network access to those browser-side modules.

## Troubleshooting

### Authentication is unavailable

- Check `js/firebase-config.js`.
- Confirm all required Firebase config keys are present.
- Check browser console for Firebase initialization errors.

### Verification flow does not advance

- Confirm the account exists in Firebase Authentication.
- Confirm the signed-in account's `emailVerified` state changed after verification.
- Refresh from `verify-email.html` after using the email link.

### Firestore permission denied

- Confirm the correct project is active.
- Confirm the latest `firestore.rules` were deployed.
- Check whether the attempted write violates ownership or privileged-role policy.

### Admin role updates fail

- Confirm the acting user has the `developer` role.
- Confirm the target account already exists as a signed-in teacher record.
- Confirm teacher-to-admin promotion only happens for verified teacher accounts.
