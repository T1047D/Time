# Chronos — Phase 2 Final (Firebase Cloud Sync)

GitHub Pages-ready static app. No build command or source-code edits are needed after downloading this ZIP. Firebase config is already filled in.

## Features
- Dashboard, countdown events, timeline, monthly/yearly calendars, Life Milestones
- Search, category filter, dark/light theme
- JSON export/import (Events + Milestones)
- Google sign-in/sign-out with Firebase Authentication
- Firestore backup and cross-device sync
- LocalStorage remains the primary data store; Phase 1 data keys are preserved
- Offline editing; online sync resumes when connection returns
- Firestore IndexedDB persistence where supported
- Initial local/cloud conflict options: Merge, Upload this device, Restore cloud, Cancel
- Sync status and manual Sync now button
- Deletion log to propagate deleted events/milestones

## Firebase configuration included
- Project ID: `chronos-time-7193`
- Web App ID: `1:394250438974:web:b2e8036f87cd5609f2846f`
- All six config values are already in `firebase-sync.js`; do not edit the code.

## One-time Firebase Console setup (no code editing)
1. Firebase Console → Authentication → Sign-in method → enable **Google**.
2. Authentication → Settings → Authorized domains → add your GitHub Pages host (e.g. `t1047d.github.io` if that is your current hostname).
3. Firestore Database → create a database if it does not already exist.
4. Firestore → Rules → paste and **Publish** the rules below.

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/chronos/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

These rules allow each authenticated user to access only their own Chronos documents.

## Existing local data keys (preserved)
- Events: `chronos_events_v1`
- Milestones: `chronos_milestones_v1`
- Theme: `chronos_theme`
- Sync deletion log (new): `chronos_deleted_v1`

## First sign-in on a device
- If only local data exists: it is backed up to cloud.
- If only cloud data exists: it is restored to the device.
- If both contain data: choose Merge (recommended), Upload this device, Restore cloud, or Cancel.
- Cancel pauses automatic sync on that session. Tap **Sync now** to reopen the choices.

## Deployment
Extract the ZIP and upload the **contents** of `Time-main` into the GitHub repository root (same directory as the repo's `index.html` for Pages). Ensure the site is served over HTTPS. No code editing is required.
