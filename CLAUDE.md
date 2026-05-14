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
**Who:** You (AI) — runs automatically before every `/migrate` and `/update`

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

### Step 3 — Extract Clean TypeScript from Vibe Source
**Who:** You (AI) — this requires reasoning

The files in `./vibe-source/` are **Vite-transformed** — they contain HMR (Hot Module Replacement) code injected at the top and Vite internal imports (`/node_modules/.vite/deps/...`). They cannot be used directly.

**How to detect transformed files:** Look for `__vite__createHotContext` at the top of the file.

**How to extract original TypeScript:**
Every transformed file contains the original source inside a base64-encoded inline source map:
```
//# sourceMappingURL=data:application/json;base64,<BASE64>
```
Decode: base64 → JSON → `sourcesContent[0]` = original TypeScript.

**Special cases you must handle:**
- `index.css` — wrapped in a JS template literal: `const __vite__css = "...";` — parse the string value
- Files with no source map and no HMR code — copy directly (already clean)
- Files with no source map but HMR code — original source is lost; reconstruct from context

**What to skip:** The `generated/` folder in vibe-source — the Power Code project will have its own generated files with Dataverse raw field names.

**Run a PowerShell extraction script** to automate this. Write and execute:
```powershell
$srcDir = ".\vibe-source\src"
$destDir = ".\[ProjectName]\src"

Get-ChildItem -Recurse -Path $srcDir -Include "*.tsx","*.ts" | ForEach-Object {
    $relativePath = $_.FullName.Substring($srcDir.Length + 1)
    if ($relativePath -match '^generated[\\/]') { return }
    
    $content = [System.IO.File]::ReadAllText($_.FullName)
    $destPath = Join-Path $destDir $relativePath
    New-Item -ItemType Directory -Path (Split-Path $destPath) -Force | Out-Null
    
    if ($content -match '//# sourceMappingURL=data:application/json;base64,([A-Za-z0-9+/=]+)') {
        try {
            $map = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Matches[1])) | ConvertFrom-Json
            if ($map.sourcesContent -and $map.sourcesContent.Count -gt 0) {
                [System.IO.File]::WriteAllText($destPath, $map.sourcesContent[0], [System.Text.Encoding]::UTF8)
                return
            }
        } catch {}
    }
    if ($content -notmatch '__vite__createHotContext') {
        [System.IO.File]::WriteAllText($destPath, $content, [System.Text.Encoding]::UTF8)
    }
}
```

For `index.css` (wrapped in JS), extract the CSS string separately:
```powershell
# Parse __vite__css = "..." and write as plain CSS
```

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

### After Migration — Save Baseline for Future Updates

Once the app builds and pushes successfully, run the baseline-saving steps from `skills/migrate.md`. This enables `/update` to work on future re-downloads.

Creates:
- `./vibe-baseline/` — clean TypeScript snapshot of the Vibe source at this point in time
- `./vibe-migration.json` — manifest recording which Power Code files are Vibe-owned vs migration-owned

**Without these two files, `/update` cannot run.**

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

---

## Context File

Always write decisions and field mappings to `CONTEXT.md` in the project root as they are discovered. Use the format in `docs/migration-guide.md`.
