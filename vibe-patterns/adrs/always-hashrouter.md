# Always use HashRouter in Power Code

## Status
Accepted

## Context

Power Code apps run inside the Power Apps player as an iframe at a non-root path. `BrowserRouter` from `react-router-dom` resolves routes against `window.location.pathname`, which inside the player is something like `/play/e/{envId}/a/{appId}/...` — not the app's own root. The result: every internal navigation 404s.

## Decision

All Vibe → Power Code migrations replace `BrowserRouter` with `HashRouter`. Routes become `#/page` instead of `/page`. The hash is the only part of the URL the app can fully control inside the iframe.

## Consequences

- Internal navigation works in the player.
- URLs are uglier (`#/dashboard` vs `/dashboard`).
- Deep links from outside the player must include the hash.

## Why this is a pattern

This decision is the same for every Power Code app. There is no project where `BrowserRouter` is correct in this context. New migrations inherit it automatically.

## References

- React Router docs: https://reactrouter.com/en/main/router-components/hash-router
- VibePower2PowerCode CLAUDE.md Rule 2: "Always use HashRouter"
