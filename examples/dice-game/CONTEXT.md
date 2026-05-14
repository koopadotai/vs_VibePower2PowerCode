# 3 Dice Game — Migration Reference

This is a reference migration showing a complete Vibe → Power Code migration. Use it as a guide for your own project.

**Source app:** 3 Dice Game on make.powerapp.com  
**Power Code app:** "3 Dice Game v2" (`c39e190f-cea4-4cd5-b60f-1c5d170c0f9b`)  
**Environment:** Wee Siong Goh's Environment  
**Dataverse:** `org8c09a494.crm5.dynamics.com`

---

## Field Mappings

The Vibe model used friendly names. The Dataverse model used raw names with two different publisher prefixes.

| Vibe (friendly) | Dataverse (raw) | How matched |
|---|---|---|
| `id` | `ws_dicegameresultorgid` | Primary key — always maps to `[prefix][entity]id` |
| `resultname` | `ws_name` | Different suffix — required inspection |
| `dice1` | `ws_dice1` | Auto — strip `ws_` prefix |
| `dice2` | `ws_dice2` | Auto |
| `dice3` | `ws_dice3` | Auto |
| `total` | `ws_total` | Auto |
| `playername` | `ws_playername` | Auto |
| `resulttype` | `ws_resulttype` | Auto |
| `rolldatetime` | `ws_rolldatetime` | Auto |
| `playerPhoto` | `cr1e9_playerphoto` | **Different publisher prefix** — required AI to resolve |

The `cr1e9_` prefix on `playerPhoto` was the key insight: a different solution publisher created this column. A script looking for `ws_` prefix would fail to find `ws_playerphoto` (it doesn't exist) and silently drop the field.

---

## Connectors Added

| Connector | API ID | Connection ID |
|---|---|---|
| Office 365 Outlook | `shared_office365` | `shared-office365-ecb327de-373b-46d2-ac82-78581b464924` |

Command used:
```powershell
npx power-apps add-data-source
# API ID:         shared_office365
# Connection ref? No
# Connection ID:  shared-office365-ecb327de-373b-46d2-ac82-78581b464924
```

---

## Key Decisions

### HashRouter instead of BrowserRouter
Power Apps player hosts the app in an iframe at a non-root URL path. `BrowserRouter` routes on the full URL path, so React Router matched no routes and showed the 404 page.
**Fix:** `HashRouter` routes on the `#` fragment, which is independent of the host URL.

### Send Email via SDK not fetch()
The original Vibe app called a Power Automate HTTP webhook directly with `fetch()`. The Power Apps player blocks this with `connect-src 'none'` CSP.
**Fix:** Use `executeAsync({ connectorOperation })` via the `@microsoft/power-apps/data` SDK. The SDK routes requests through `postMessage` to the player, which proxies the HTTP call — bypassing CSP entirely.

### npx power-apps add-data-source — not manual edits
An attempt was made to manually write the Office 365 connector entry in `dataSourcesInfo.ts`. This failed with `Connection reference not found: office365` because the manually-written path was `/v2/Mail` instead of the correct `/{connectionId}/v2/Mail`. The CLI generates the `/{connectionId}/` path parameter automatically — never edit this file manually.

---

## Push Issues Encountered

| Attempt | Error | Fix |
|---|---|---|
| 1 | `AppSubtypeImmutable` | Old Canvas App can't change to Power Code — set `appId: null` |
| 2 | `ApplicationDisplayNameIsInUse` | "3 Dice Game" taken — renamed to "3 Dice Game v2" |
| 3 | Success | App ID: `c39e190f-cea4-4cd5-b60f-1c5d170c0f9b` |

---

## Final Status

All 8 features working after migration:
- Dice rolling animation (Framer Motion)
- Dataverse read (last 20 results)
- Save result to Dataverse
- Player photo (webcam capture → base64 → Dataverse)
- Statistics chart (Recharts)
- Connection diagnostics panel
- Player name from Azure AD (`getContext().user.fullName`)
- Send Email via Office 365 Outlook connector
