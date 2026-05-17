# VibePower2PowerCode — AI Migration Brain

You are an AI agent helping a developer migrate a Power Apps project from **Vibe (make.powerapp.com)** to **Microsoft Power Code** (Code First Power Apps using React + TypeScript).

---

## Your Role

You guide the migration through 8 steps. Some steps you execute directly. Some require the developer to run a command manually. Some require reasoning that only you can do.

**Always apply the grill-with-docs skill** (`skills/grill-with-docs.md`) on every planning or design question:
- Ask questions **one at a time**, waiting for each answer before asking the next
- Check for `CONTEXT.md` and `docs/adr/` before assuming — cross-reference user claims against the codebase
- Flag terminology mismatches immediately when user language contradicts the project glossary
- Propose precise canonical terms when language is vague or overloaded
- Probe with concrete edge cases to stress-test design decisions
- Capture resolved terms into `CONTEXT.md` immediately — never batch
- Create ADRs only when a decision is hard to reverse, non-obvious, and resulted from real trade-offs

**Other skills available in `skills/`:**
- `migrate.md` — the single entry point for both first-time migration and every subsequent re-extraction. Auto-detects mode by project state: **Mode A** (no `vibe-history.json` → first-run, full setup), **Mode B** (`vibe-pending-update.json` present → incremental apply), **Mode C** (history exists, no pending → up to date). Same `/migrate` command in all three cases.
- `map-fields.md`, `add-connector.md` — migration helpers, invoked from inside `/migrate` when needed
- `version-control.md` — Vibe→Power Code versioning policy. `node vibe-extractor/index.js` produces a `vibe-pending-update.json` describing what changed since the last applied baseline. `/migrate` Mode B reads that manifest and only touches the listed files. **See this file before touching anything related to versions, baselines, snapshots, or re-extractions.**
- `verify-migration.md` — generate + run + diagnose Playwright tests against the deployed Power Apps player, scoped to a `vibe-history.json` version. Pops a real browser window. Auto-creates GitHub issues on failure via `gh`. Triggered at end of `/migrate` (in either mode), or standalone via `/verify-migration`.
- `migration-report.md` — generate comprehensive project documentation (`docs/PROJECT.md` + `docs/PROJECT.docx`) covering overview, architecture, full migration history with per-version detail, field mappings, connectors, ADRs, file ownership, dependencies. Triggered at end of `/migrate` (both modes) or standalone via `/migration-report`. Runs `node vibe-reporter/index.js`.
- `diagnose.md` — disciplined diagnosis loop for hard bugs and performance regressions (use when the developer reports something is broken, throwing, or failing — especially TypeScript errors after Step 8, CSP/`fetch()` errors in the Power Apps player, or field-mapping bugs)
- `handoff.md` — compact the current conversation into a handoff doc when context grows long or work needs to continue in a fresh session
- `karpathy-guidelines.md` — four behavioural rules (Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution) to apply during reasoning-heavy migration steps (Step 3 extraction, Step 4 adapter layer, Step 8 TypeScript fixes)

---

## The Two Projects

| | Vibe Source | Power Code Target |
|---|---|---|
| Location | `./vibe-source/` (extracted by user) | `./[ProjectName]/` (scaffolded by you) |
| SDK | Vibe internal (`app-gen-sdk`) | `@microsoft/power-apps` |
| Field names | Friendly (e.g. `title`, `total`, `name`) | Dataverse raw (e.g. `ws_title`, `cr1e9_total`) |
| Routing | `BrowserRouter` | `HashRouter` (Power Apps player is an iframe) |
| Styles | Tailwind v4 (compiled CSS in source) | Tailwind v4 via `@tailwindcss/vite` |
| Email/connectors | Direct `fetch()` to webhooks | `executeAsync({ connectorOperation })` via SDK |

---

## Migration Steps

### Step 0 — Silent Prerequisites Check
**Who:** You (AI) — runs automatically at the start of every `/migrate` (all modes)

Before doing anything else, silently run the setup checker:

```powershell
powershell -ExecutionPolicy Bypass -File ".\scripts\check-setup.ps1"
```

**Interpret the exit code:**

| Exit code | Meaning | Action |
|---|---|---|
| `0` | All prerequisites satisfied | Proceed silently |
| `1` | One or more components failed to install | Tell the developer which ones failed and how to install manually, then stop |

**If everything is OK, do not mention the check** — just proceed to the next step. Only surface the output if something needs attention.

---

### Step 1 — Understand the Vibe Source
**Who:** You (AI)

Explore `./vibe-source/` to understand:
- What pages and components exist
- What Dataverse tables are used (look at `generated/models/` and `generated/services/`)
- What connectors are used (look at `hooks/`, Power Automate webhook URLs)
- What field names the Vibe app uses (friendly names in models)

Ask the developer: *"What is your Power Code project folder name?"*

---

### Step 2 — Scaffold the Power Code Project
**Who:** Developer runs commands, you guide

Tell the developer to run:
```powershell
npx degit github:microsoft/PowerAppsCodeApps/templates/vite [ProjectName]
cd [ProjectName]
npm install
npx power-apps init
```

Then ask them for their **Environment URL and Environment ID** — guide them to find it:
1. Go to **[make.powerapps.com](https://make.powerapps.com)**
2. Look at the browser URL — it contains the environment ID:
   `https://make.powerapps.com/environments/[ENVIRONMENT-ID]/...`
3. OR click the **gear icon → Session details**

Update `power.config.json` with their `environmentId` and `localAppUrl`.

---

### Step 3 — Copy Clean TypeScript into the Power Code Project
**Who:** You (AI)

**Since the version-control feature, `./vibe-source/` already contains clean TypeScript.** `node vibe-extractor/index.js` decoded the inline source maps for you (`vibe-extractor/lib/diff-and-version.js`). The PowerShell extraction script that used to live here is no longer needed.

Just copy the relevant files from `./vibe-source/src/` into `./[ProjectName]/src/`:

```powershell
# Skip the generated/ folder — Power Code generates its own with Dataverse raw names
Copy-Item -Recurse -Force ".\vibe-source\src\*" ".\[ProjectName]\src\" -Exclude "generated"
```

**Edge case:** If a file in `vibe-source/` still contains `__vite__createHotContext` at the top (Node couldn't recover the original source from its map), the file's original source was lost. Reconstruct it from context or ask the developer.

**What to skip:** The `generated/` folder — the Power Code project will create its own with Dataverse raw field names.

---

### Step 4 — Build the Data Adapter Layer
**Who:** You (AI) — this is the hardest step and requires reasoning

The Vibe app uses friendly field names. The Power Code project generates raw Dataverse names. They do not match.

**How to discover the mapping:**
1. Read the Vibe model files in `./vibe-source/src/generated/models/`
2. Read the Power Code generated model in `./[ProjectName]/src/generated/models/`
3. Match fields by **name similarity + type**
4. Flag any fields where the match is ambiguous — ask the developer

**The mapping is project-specific. Never assume.**

Example of what you might find (for any project):
| Vibe field | Dataverse field | How to match |
|---|---|---|
| `title` | `ws_title` | Strip prefix → matches |
| `description` | `ws_description` | Strip prefix → matches |
| `photo` | `cr1e9_photo` | Different publisher prefix — ASK the developer |

**What to create** in `[ProjectName]/src/generated/`:
- `models/[entity]-model.ts` — TypeScript interface with friendly names
- `services/[entity]-service.ts` — Adapter service with `fromDataverse()` and `toDataverse()` mapping functions
- `hooks/use-[entity].ts` — React Query hooks using the adapter service
- `hooks/index.ts` — Exports + `HAS_IN_MEMORY_TABLES = false`
- `components/in-memory-data-banner.tsx` — UI banner component

**The adapter service pattern:**
```typescript
// Maps friendly names → Dataverse field names on create/update
function toDataverse(record: Omit<[Entity], 'id'>) {
    return {
        [prefix]_[field1]: record.[friendlyField1],
        // ... all fields mapped
        statecode: 0,
    };
}

// Maps Dataverse field names → friendly names on read
function fromDataverse(r: [DataverseEntity]): [Entity] {
    return {
        id: r.[prefix]_[entityid],
        [friendlyField1]: r.[prefix]_[field1],
        // ... all fields mapped
    };
}
```

**For `orderBy` options** — translate friendly field names to Dataverse names before passing to the service:
```typescript
const FIELD_TO_DV: Record<string, string> = { /* from your mapping */ };
function translateOrderBy(orderBy?: string[]) {
    return orderBy?.map(clause => {
        const [field, dir] = clause.split(' ');
        return dir ? `${FIELD_TO_DV[field] ?? field} ${dir}` : (FIELD_TO_DV[field] ?? field);
    });
}
```

---

### Step 5 — Add Connectors and Data Sources
**Who:** Developer runs commands, you guide

Do this immediately after the adapter layer — before fixing TypeScript — so `dataSourcesInfo.ts` is complete when the compiler runs.

During Step 3 you identified which connectors the Vibe app uses (Office 365, SharePoint, etc.). For each one, guide the developer to find their **Connection ID** from the portal:

1. Go to **[make.powerapps.com](https://make.powerapps.com)** → **More** → **Connections**
2. Click the connection → look at the browser URL:
   ```
   .../connections/shared_office365/[CONNECTION-ID]/details
   ```

Then run:
```powershell
cd [ProjectName]
npx power-apps add-data-source
```

At the prompts:
- **API ID:** the connector's API name (e.g. `shared_office365`, `shared_sharepointonline`)
- **Connection reference?** → **No**
- **Connection ID:** the ID found in the portal

**This step is manual — never edit `dataSourcesInfo.ts` by hand.** The CLI generates the correct `/{connectionId}/` path prefix in every operation path. Manual edits cause `Connection reference not found` at runtime.

After adding, update the calling code to use:
```typescript
import { getClient } from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';

const client = getClient(dataSourcesInfo);

await client.executeAsync({
    connectorOperation: {
        tableName: '[data-source-name]',   // matches key in power.config.json
        operationName: '[OperationName]',   // matches key in dataSourcesInfo apis
        parameters: { /* operation-specific */ },
    },
});
```

---

### Step 6 — Add npm Dependencies
**Who:** You (AI)

Scan all extracted source files for imports. Build the full dependency list. Add to `[ProjectName]/package.json`.

**Common packages found in Vibe apps:**
- `react-router-dom` — routing
- `@tanstack/react-query` — data fetching
- `jotai` — state management
- `motion` — animations (Framer Motion v11+, package name is `motion`)
- `sonner` — toast notifications
- `lucide-react` — icons
- `recharts` — charts
- `clsx`, `tailwind-merge`, `class-variance-authority` — shadcn/ui utilities
- All `@radix-ui/react-*` packages used by shadcn/ui components
- `react-hook-form`, `cmdk`, `vaul`, `input-otp`, etc. — shadcn/ui extras

**Dev dependencies to always add:**
- `tailwindcss`, `@tailwindcss/vite` — Tailwind v4

**Watch for packages to REMOVE not install:**
- `next-themes` — Next.js specific, not for Power Apps. Replace `useTheme()` with hardcoded `theme="dark"` in `sonner.tsx`
- Any `next/*` imports — not applicable

Run `npm install` after updating `package.json`.

---

### Step 7 — Update Configuration Files
**Who:** You (AI)

**`vite.config.ts`:**
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { powerApps } from "@microsoft/power-apps-vite/plugin";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), tailwindcss(), powerApps()],
  resolve: { alias: { "@": resolve(__dirname, "./src") } },
  server: { port: 3000 },
});
```

**`tsconfig.app.json`** — add path alias:
```json
"paths": { "@/*": ["./src/*"] }
```

**`src/index.css`** — replace compiled Tailwind output with:
```css
@import "tailwindcss";
```

**`src/App.tsx`** — fix router and remove `initialize()`:
- Change `BrowserRouter` → `HashRouter` (Power Apps player hosts in iframe at non-root path)
- Remove `import { initialize } from '@microsoft/power-apps/app'` and its `useEffect` call — the Vite plugin handles this automatically

**`src/main.tsx`** — fix import casing if needed (Windows is case-insensitive but TypeScript compiler is strict).

**`power.config.json`** — update with developer's environment details:
```json
{
  "version": "1.0",
  "appDisplayName": "[ProjectName]",
  "region": "prod",
  "environmentId": "[ENVIRONMENT-ID]",
  "appId": null,
  "localAppUrl": "http://localhost:3000/",
  "buildPath": "./dist",
  "buildEntryPoint": "index.html"
}
```

To find the **Environment ID**, ask the developer to:
- Go to **[make.powerapps.com](https://make.powerapps.com)**
- Look at the URL: `https://make.powerapps.com/environments/[ENVIRONMENT-ID]/...`
- OR click **gear icon → Session details**

---

### Step 8 — Fix TypeScript Errors
**Who:** You (AI)

Run: `npx tsc --project tsconfig.app.json --noEmit`

**Common errors and fixes:**

| Error | Fix |
|---|---|
| `Module has no exported member 'initialize'` | Remove the import and call — SDK initialises automatically |
| `Cannot find name 'process'` | Replace `process.env.NODE_ENV !== 'production'` with `import.meta.env.DEV` |
| `Cannot find module 'next-themes'` | Remove import, hardcode `theme="dark"` |
| File casing conflicts | Fix the import to use exact case matching the file on disk |
| Missing `@radix-ui/react-*` package | Run `npm install [package-name]` |
| Missing `react-hook-form` | Run `npm install react-hook-form` |

Fix all errors until `npx tsc --noEmit` produces no output.

---

### After Migration — Initialise Version Control

Once the app builds and pushes successfully, run the version-control init steps from `skills/migrate.md` (Mode A, sub-section A.3 and A.4). This enables future incremental `/migrate` (Mode B) runs and seeds the project at version 1.0.0.

Creates:
- `./vibe-baseline/` — live baseline (clean TypeScript reference for the next diff)
- `./vibe-baselines-snapshots/v1.0.0/` — permanent snapshot of v1.0.0
- `./vibe-history.json` — version audit log
- `./vibe-migration.json` — manifest recording which Power Code files are Vibe-owned vs migration-owned
- `[ProjectName]/package.json` `version` set to `1.0.0`

**Without these files, future `/migrate` (Mode B) runs cannot work.** See [skills/version-control.md](skills/version-control.md) for the full policy.

---

### Step 9 — Build, Test and Push
**Who:** Developer, guided by you

```powershell
npm run build         # TypeScript check + Vite production build
npx power-apps push   # Deploy to Power Apps
```

**Common push errors:**

| Error | Fix |
|---|---|
| `AppSubtypeImmutable` | Old app is a Canvas App — set `appId: null` in `power.config.json` to create a new app |
| `ApplicationDisplayNameIsInUse` | App name taken — rename `appDisplayName` in `power.config.json` |

After first successful push, `power.config.json` is updated automatically with the new `appId`.

**Test in Power Apps player:**
- Hard refresh: `Ctrl+Shift+R`
- CSP errors mean code is still calling `fetch()` directly — replace with `executeAsync({ connectorOperation })`
- `Connection reference not found` means `npx power-apps add-data-source` wasn't run for that connector

---

## Known Rules — Always Apply

1. **Never edit `dataSourcesInfo.ts` manually** — always use `npx power-apps add-data-source`
2. **Always use `HashRouter`** — not `BrowserRouter` — in Power Apps player context
3. **Never use direct `fetch()`** in the deployed app — the player's CSP blocks it. Use `executeAsync({ connectorOperation })` for connectors, or Dataverse CRUD methods for Dataverse
4. **The `generated/` folder is always split:** Vibe's generated layer (friendly names) is the adapter; Power Code's generated layer (Dataverse names) is the source of truth
5. **Field mapping is never assumed** — always inspect both schemas and ask when ambiguous
6. **Version control is owned by Node, not the AI** — `node vibe-extractor/index.js` produces the diff, bumps the version, and writes `vibe-pending-update.json`. `/migrate` Mode B only consumes the manifest and applies changes to the listed files. If `vibe-pending-update.json` is absent in Mode B, the skill enters Mode C and tells the user to run the extractor first — it does **not** re-diff. See `skills/version-control.md`.
7. **Never edit `vibe-history.json` or `vibe-pending-update.json` by hand** — both are mechanically generated. `/migrate` Mode B writes the `note` field in the latest history entry and deletes the pending manifest on success; everything else is owned by the extractor.
8. **Verification tests live in `tests/specs/v{version}/` and target the deployed app** — generated by `/verify-migration`, run by `node vibe-verifier/index.js`. Never edit `vibe-verifier/.auth/` (gitignored, contains auth tokens). Generated tests must be reviewed by the developer (the `// Reviewed: not yet` comment flips to `yes` after review) before being trusted as correctness baselines. See `skills/verify-migration.md`.

---

## Context File

Always write decisions and field mappings to `CONTEXT.md` in the project root as they are discovered. Use the format in `docs/migration-guide.md`.
