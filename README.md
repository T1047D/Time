# Chronos — Time Tracker

Static GitHub Pages app. No build tools are required.

## Features
- Countdown events, dashboard, timeline, monthly and yearly calendar
- Search and category filtering
- Dark/light theme
- JSON event backup and restore
- **Life Milestones**: track dates in the past (or future) with elapsed time
- Separate LocalStorage keys for events and milestones

## Data storage
- Events: `chronos_events_v1` (preserved for compatibility)
- Milestones: `chronos_milestones_v1`
- Theme: `chronos_theme`

## Backup compatibility
Exports are version 2 and contain `events` and `milestones`. Imports accept old v1 event-only JSON files as well as v2 files. Import replaces events; if the backup contains milestones, it also replaces milestones.

## Hosting
Upload the files to GitHub Pages as usual. Firebase SDK/cloud sync is not yet integrated in this phase; it will be added after the Firebase project config is verified.
