# VibePower2PowerCode

A migration toolkit for converting **Power Apps Vibe projects** (make.powerapp.com) into **Microsoft Power Code** (Code First, React + TypeScript) apps — with AI assistance via Claude Code.

---

## What This Is

When you build an app on **make.powerapp.com**, it runs on Vibe — Microsoft's internal React + Vite framework. Vibe apps are not directly portable to Power Code because:

- Source files are Vite-transformed (HMR code injected, internal import paths)
- Data models use friendly field names; Power Code uses raw Dataverse names
- Connectors are called via direct `fetch()` which is blocked by Power Apps player CSP
- Routing uses `BrowserRouter` which fails inside the Power Apps player iframe

This toolkit provides:
- **`vibe-extractor/`** — Playwright tool to download your Vibe source code
- **`CLAUDE.md`** — Instructions that teach Claude Code how to migrate any Vibe app
- **`skills/`** — Claude Code slash commands (`/migrate`, `/map-fields`, `/add-connector`)
- **`docs/`** — Complete migration guide and troubleshooting reference

---

## Quick Start

### Prerequisites
- Node.js LTS
- Claude Code (VS Code extension or CLI)
- Access to [make.powerapps.com](https://make.powerapps.com)

### 1. Clone this repo

```powershell
git clone https://github.com/koopadotai/vs_VibePower2PowerCode.git
cd vs_VibePower2PowerCode
```

### 2. Open in VS Code with Claude Code

```powershell
code .
```

### 3. Extract your Vibe app source

```powershell
cd vibe-extractor
npm install
node index.js
```

Enter your project name and Vibe app URL when prompted.
Output goes to `./vibe-source/`.

### 4. Ask Claude Code to migrate

In the Claude Code chat panel, type:
```
/migrate
```

Claude Code will guide you through the migration, ask clarifying questions, and tell you when you need to run a manual command.

### 5. Add connectors (when prompted)

When Claude Code tells you to add a connector:
```powershell
cd [YourProjectName]
npx power-apps add-data-source
```

### 6. Build and push

```powershell
cd [YourProjectName]
npm run build
npx power-apps push
```

---

## What Claude Code Does vs What You Do

| Step | Claude Code | You |
|---|---|---|
| Extract TypeScript from Vite source maps | Writes and runs extraction script | Run vibe-extractor first |
| Discover field name mappings | Reads both schemas, maps automatically, asks when ambiguous | Confirm ambiguous mappings |
| Build data adapter layer | Writes all adapter files | Review output |
| Add npm dependencies | Updates package.json | Run `npm install` |
| Fix TypeScript errors | Diagnoses and fixes | — |
| Fix routing | Changes BrowserRouter → HashRouter | — |
| Add connectors | Guides you through the command | Run `npx power-apps add-data-source` |
| Build and push | Guides you | Run the commands |

---

## Why AI Is Needed

Some migration steps cannot be scripted — they require reasoning:

- **Field mapping:** Vibe uses friendly names (`photo`), Dataverse uses raw names (`cr1e9_photo`). The publisher prefix (`cr1e9_`) differs from the common prefix (`ws_`) — a script cannot resolve this ambiguity
- **SDK differences:** Vibe uses `initialize()` from an internal SDK. Power Code's SDK doesn't have this function — AI knows to delete the call, not replace it
- **Dependency decisions:** `next-themes` is in the Vibe source — a script installs it, AI removes it (it's Next.js specific, wrong for Power Apps)
- **Routing diagnosis:** The app shows 404 after deployment — AI diagnoses `BrowserRouter` as the cause from the symptom

See [`docs/why-ai-is-required.md`](docs/why-ai-is-required.md) for a complete analysis.

---

## Project Structure

```
vs_VibePower2PowerCode/
├── CLAUDE.md                  ← AI migration instructions (the brain)
├── README.md                  ← This file
├── vibe-extractor/            ← Playwright source extraction tool
│   ├── index.js               ← CLI entry point
│   ├── extractor.js           ← Core extraction engine
│   ├── extract.js             ← Manual extraction (fallback)
│   └── console-extract.js     ← Browser console script (fallback)
├── skills/
│   ├── migrate.md             ← /migrate — full migration wizard
│   ├── update.md              ← /update — incremental update after Vibe changes
│   ├── map-fields.md          ← /map-fields — field name discovery
│   ├── add-connector.md       ← /add-connector — connector setup
│   └── grill-with-docs.md     ← /grill-with-docs — structured design review protocol
├── scripts/
│   └── check-setup.ps1        ← Idempotent prerequisite checker (runs silently)
├── docs/
│   ├── migration-guide.md     ← Complete step-by-step guide
│   ├── why-ai-is-required.md  ← Why scripts alone can't do this
│   └── troubleshooting.md     ← Common errors and fixes
└── examples/
    └── dice-game/             ← Reference migration (3 Dice Game)
        └── CONTEXT.md
```

---

## Updating After Vibe Changes

Made changes in make.powerapp.com and want to re-deploy? You don't need to re-migrate everything.

### 1. Re-extract the new Vibe source
```powershell
cd vibe-extractor
node index.js
# vibe-source/ is replaced with the new download
```

### 2. Ask Claude Code to apply only the changes
```
/update
```

Claude Code will:
- Diff the new Vibe source against `vibe-baseline/` (saved after your first migration)
- Identify which files actually changed
- Update only those files in your Power Code project
- Skip files that were modified during migration (routing fix, connector code, adapter layer)
- Ask you to review any ambiguous changes before applying

### 3. Build and push
```powershell
cd [YourProjectName]
npm run build
npx power-apps push
```

**How it knows what changed:** After your first `/migrate`, the toolkit saves `vibe-baseline/` (clean TypeScript snapshot) and `vibe-migration.json` (ownership manifest). Every `/update` diffs the new download against the baseline and updates the baseline on success.

---

## Reference Migration

The `examples/dice-game/` folder documents a complete real migration — the 3 Dice Game app was migrated from Vibe to Power Code using this exact toolkit.

Key lessons from that migration:
- `playerPhoto` → `cr1e9_playerphoto` (different publisher prefix — required AI to resolve)
- `BrowserRouter` → `HashRouter` (Power Apps player iframe routing fix)
- Office 365 email: replaced `fetch()` webhook with `executeAsync({ connectorOperation })` via SDK
- `npx power-apps add-data-source` is the only safe way to register connectors

---

## Vibe Extractor — Extraction Methods

| Method | When to use | Command |
|---|---|---|
| **Automatic** (recommended) | Most apps | `node index.js` |
| **Manual** | If automatic misses files | `node extract.js ./vibe-source` |
| **Console script** | If browser automation fails | Paste `console-extract.js` into DevTools |

---

## Contributing

Issues and PRs welcome at [github.com/koopadotai/vs_VibePower2PowerCode](https://github.com/koopadotai/vs_VibePower2PowerCode).

---

## License

MIT
