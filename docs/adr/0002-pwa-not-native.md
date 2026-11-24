# ADR 0002: Ship a PWA, not native apps

- **Status:** Accepted
- **Date:** 2026-11-24

## Context

The target player plays 1 to 4 daily games on a phone and shares results in group chats.
The session budget is 2 to 4 minutes with no install or login. Retention, not distribution,
is the main risk early on.

## Decision

Build a mobile-first progressive web app (Next.js, a web app manifest, and a Serwist service
worker) and skip the App Store and Play Store for the MVP. Native wrappers are a P2 item,
considered only once retention justifies them.

## Consequences

- A shared link opens straight into the game: no install step between a group-chat share and playing.
- One codebase, deployed with Vercel previews on every PR.
- iOS Safari has no Vibration API, so iOS PWA players get no haptics; web push on iOS works only for installed apps. Both are accepted for the MVP.
- Discovery through app stores is lost until a native wrapper ships.
