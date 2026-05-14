# Migration Guide: Vibe → Power Code

Complete step-by-step guide for migrating any Power Apps project from **make.powerapp.com (Vibe)** to **Microsoft Power Code** (Code First, React + TypeScript).

---

## Prerequisites

Before starting, ensure you have:

- [ ] Node.js LTS (`node --version`)
- [ ] Power Platform CLI (`pac --version`)
- [ ] Claude Code CLI or VS Code with Claude Code extension
- [ ] Access to your Power Platform environment (maker or admin)
- [ ] Your Vibe app URL from make.powerapp.com

Install missing tools:
```powershell
winget install OpenJS.NodeJS.LTS
winget install Microsoft.PowerPlatformCLI
npm install -g @anthropic-ai/claude-code
```

---

## Phase 1 — Extract Source from Vibe

### 1.1 Run the Vibe Extractor

```powershell
cd vibe-extractor
npm install
node index.js
```

You will be prompted for:
- **Project name** — used as the output folder name
- **Vibe app URL** — from your browser when the app is open in make.powerapp.com

The extractor opens a real browser. Log in with your Microsoft account when prompted. The tool monitors network requests and captures all source files automatically.

**Output:** `./vibe-source/` containing the full React/TypeScript source

### 1.2 Verify the extraction

Check that `./vibe-source/src/` contains:
- `app.tsx` or `App.tsx` — main entry
- `pages/` — page components
- `components/` — UI components
- `generated/models/` — Dataverse model interfaces (friendly field names)
- `generated/services/` — data access services

If files are missing, use the manual extraction method:
```powershell
node extract.js ./vibe-source
```
This opens the browser and waits for you to manually click through files.

---

## Phase 2 — Scaffold Power Code Project

### 2.1 Create the project

```powershell
npx degit github:microsoft/PowerAppsCodeApps/templates/vite [YourProjectName]
cd [YourProjectName]
npm install
npx power-apps init
```

### 2.2 Connect to your environment

```powershell
pac auth create --environment https://[your-org].crm[N].dynamics.com/
```

### 2.3 Generate Dataverse models

```powershell
npx power-apps generate
```

This creates `src/generated/` with models using raw Dataverse field names (e.g. `ws_title`, `cr1e9_photo`).

---

## Phase 3 — AI-Assisted Migration

**Open Claude Code in VS Code and type:**
```
/migrate
```

Claude Code will guide you through the rest. It will:

1. Explore your Vibe source to understand the app structure
2. Extract clean TypeScript from the Vite-transformed source files
3. Discover field name mappings between Vibe and Dataverse models
4. Build the data adapter layer (the hardest step — requires AI reasoning)
5. Add all npm dependencies
6. Fix configuration files and TypeScript errors

**This is where the project-specific work happens.** Claude Code will ask you questions when it finds ambiguities it cannot resolve automatically (particularly for field name mismatches with different publisher prefixes).

---

## Phase 4 — Add Connectors

For each external connector your app uses (Office 365, SharePoint, etc.):

```powershell
# List your available connections
pac connection list --environment https://[your-org].crm[N].dynamics.com/

# Add a connector to your Power Code project
cd [YourProjectName]
npx power-apps add-data-source
```

Follow the prompts:
- **API ID:** e.g. `shared_office365`
- **Connection reference?** → No
- **Connection ID:** from `pac connection list` output

Or ask Claude Code: `/add-connector`

> **Important:** Never edit `dataSourcesInfo.ts` manually. The CLI generates required path parameters (`/{connectionId}/`) that the SDK needs to route requests. Manual edits will fail with `Connection reference not found` at runtime.

---

## Phase 5 — Build and Deploy

### 5.1 Build

```powershell
cd [YourProjectName]
npm run build
```

Fix any TypeScript errors before proceeding. Ask Claude Code for help if errors are unclear.

### 5.2 First push (creates new app)

Ensure `power.config.json` has `"appId": null` for first deployment:

```powershell
npx power-apps push
```

On success, `power.config.json` is updated with the new `appId`. Subsequent pushes update the same app.

### 5.3 Common push errors

| Error | Solution |
|---|---|
| `AppSubtypeImmutable` | Old app is a Canvas App — set `"appId": null` to create new app |
| `ApplicationDisplayNameIsInUse` | Rename `appDisplayName` in `power.config.json` |
| `environmentId` missing | Add `"environmentId": "[your-env-id]"` to `power.config.json` |

---

## What to Document

As you migrate, write a `CONTEXT.md` in your project root to record:

```markdown
# [ProjectName] — Migration Context

## Field Mappings
| Vibe (friendly) | Dataverse (raw) | Notes |
|---|---|---|
| title | ws_title | Auto-matched |
| photo | cr1e9_photo | Different publisher prefix |

## Connectors Added
| Connector | API ID | Connection ID |
|---|---|---|
| Office 365 Outlook | shared_office365 | shared-office365-xxxx |

## Known Issues
- [any issues found during migration]

## Decisions Made
- [any non-obvious choices]
```

---

## Understanding the Architecture

```
Vibe App (make.powerapp.com)
    ↓  [vibe-extractor]
./vibe-source/src/
    ↓  [Claude Code — Step 3]
[ProjectName]/src/components/   ← Extracted clean TypeScript
[ProjectName]/src/pages/        ← Extracted clean TypeScript
[ProjectName]/src/hooks/        ← Extracted clean TypeScript
    ↑
[ProjectName]/src/generated/    ← Two layers:
    ├── models/[Entity]Model.ts (Dataverse raw names) ← pac generate
    ├── models/[entity]-model.ts (Friendly names)     ← Claude Code adapter
    ├── services/[Entity]Service.ts (Dataverse)       ← pac generate
    └── services/[entity]-service.ts (Adapter)        ← Claude Code adapter
```

The adapter layer is the bridge. Pages and components use friendly names and import from the adapter. The adapter maps to/from Dataverse names when communicating with the Power Apps SDK.
