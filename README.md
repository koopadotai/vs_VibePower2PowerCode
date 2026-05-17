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
- **`vibe-extractor/`** — Playwright tool to download your Vibe source code (also handles version-control: diffs new extractions vs the last baseline and writes a pending-update manifest)
- **`vibe-verifier/`** — Playwright-based test runner that pops a browser, runs version-scoped specs against the deployed Power Apps player, and auto-raises GitHub issues on failure
- **`vibe-reporter/`** — Generates per-project documentation (`docs/PROJECT.md` + `.docx`) from `vibe-history.json`, `CONTEXT.md`, and the migrated project
- **`vibe-toolkit-doc/`** — Generates documentation for the toolkit *itself* (`docs/SYSTEM.md` + `.docx`) — AI-readable solution graph (nodes, edges, flows, impact analysis)
- **`vibe-fleet/`** — Multi-project orchestration: register many migration projects, run `status`/`extract`/`verify`/`report` across all of them, aggregate into `FLEET.md` / `.docx` / `.html`
- **`vibe-patterns/`** — Shared knowledge base of reusable patterns (field-mappings, connectors, ADRs) — consulted by `/migrate` before asking the developer
- **`CLAUDE.md`** — Instructions that teach Claude Code how to migrate any Vibe app
- **`skills/`** — Claude Code slash commands: `/migrate` (single entry point — auto-detects first-time vs incremental), `/verify-migration`, `/migration-report`, `/map-fields`, `/add-connector`, `/grill-with-docs`, `/diagnose`, `/handoff`, `/karpathy-guidelines`
- **`docs/`** — Complete migration guide, troubleshooting, and the generated `SYSTEM.md` / `SYSTEM.docx`

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
├── vibe-extractor/            ← Playwright source extraction + diff/version engine
│   ├── index.js               ← CLI entry point (interactive Vibe sign-in, scrape, diff, bump)
│   ├── extractor.js           ← Core extraction engine
│   ├── extract.js             ← Manual extraction (fallback)
│   ├── console-extract.js     ← Browser console script (fallback)
│   └── lib/                   ← diff-and-version, schemas, errors, lock
├── vibe-verifier/             ← Playwright test runner against deployed app
│   ├── index.js               ← CLI: --setup-auth, --latest, --since vX.Y.Z, --headless, --no-report
│   ├── playwright.config.ts   ← Bundled config (no setup needed in user projects)
│   └── lib/                   ← auth-setup, version-filter, runner, github-reporter, schemas, errors, lock
├── vibe-reporter/             ← Per-project documentation generator
│   ├── index.js               ← Produces docs/PROJECT.md + docs/PROJECT.docx
│   └── lib/                   ← collect, render-markdown, render-docx
├── vibe-toolkit-doc/          ← Toolkit-itself documentation generator
│   ├── index.js               ← Produces docs/SYSTEM.md + docs/SYSTEM.docx
│   └── lib/                   ← system-model (hand-authored graph), render-md, render-docx
├── vibe-fleet/                ← Multi-project orchestration (Tier-2)
│   ├── index.js               ← CLI: init, register, list, status, doctor, extract, verify, report
│   └── lib/                   ← discovery, registry, probe, render-status, run-on-project, fleet-collect, render-fleet-{md,docx,html}
├── vibe-patterns/             ← Shared knowledge base of reusable patterns
│   ├── index.js               ← CLI: list, show, apply
│   ├── field-mappings/        ← JSON patterns for friendly→Dataverse mapping
│   ├── connectors/            ← JSON patterns for connector setup
│   └── adrs/                  ← Markdown ADRs to copy into new projects
├── skills/                    ← Claude Code slash commands
│   ├── migrate.md             ← /migrate — auto-detects first-run, incremental, or up-to-date
│   ├── version-control.md     ← versioning policy reference (manifests, snapshots, semver)
│   ├── verify-migration.md    ← /verify-migration — generate + run Playwright tests
│   ├── migration-report.md    ← /migration-report — render PROJECT.md / PROJECT.docx
│   ├── map-fields.md          ← /map-fields — field name discovery
│   ├── add-connector.md       ← /add-connector — connector setup
│   ├── grill-with-docs.md     ← /grill-with-docs — structured design review protocol
│   ├── diagnose.md            ← /diagnose — disciplined diagnosis loop for hard bugs
│   ├── handoff.md             ← /handoff — compact current session to a handoff doc
│   └── karpathy-guidelines.md ← four behavioural rules for reasoning-heavy steps
├── scripts/
│   └── check-setup.ps1        ← Idempotent prerequisite checker (runs silently)
└── docs/
    ├── migration-guide.md     ← Complete step-by-step guide
    ├── why-ai-is-required.md  ← Why scripts alone can't do this
    ├── troubleshooting.md     ← Common errors and fixes
    ├── SYSTEM.md              ← Generated: AI-readable toolkit architecture
    ├── SYSTEM.docx            ← Generated: Word version of the above
    └── adr/                   ← Architecture decision records
```

---

## Updating After Vibe Changes

Made changes in make.powerapp.com and want to re-deploy? **Same command, different mode.** `/migrate` auto-detects what to do based on project state.

### 1. Re-extract the new Vibe source
```powershell
cd vibe-extractor
node index.js
# vibe-source/ is replaced with the new download
# If anything changed since the last baseline, vibe-pending-update.json is written
```

### 2. Run /migrate again — it picks the right mode
```
/migrate
```

The skill inspects the project state and dispatches:
- **Mode A** (first time, no `vibe-history.json`): full setup
- **Mode B** (`vibe-pending-update.json` present): apply only the listed file changes, bump version, ask about verification tests
- **Mode C** (history exists, no pending): "you're up to date"

In Mode B Claude Code will:
- Read the pending manifest written by the extractor
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

**How it knows what changed:** the `node index.js` extractor maintains `vibe-baseline/` (clean TypeScript) and `vibe-history.json` (version log). When it detects a diff, it writes `vibe-pending-update.json` describing exactly which files changed. `/migrate` Mode B reads that manifest — no re-diffing in the AI layer. See [skills/version-control.md](skills/version-control.md) for the full policy.

---

## Recurring patterns

Lessons learned that apply to every Vibe → Power Code migration — codified into the toolkit so you don't rediscover them:

- Friendly field names (e.g. `playerPhoto`) map to Dataverse raw names with a publisher prefix (e.g. `cr1e9_playerphoto`) — the prefix differs per environment, so the mapping is never assumed; `/migrate` asks when ambiguous and persists the answer in `vibe-patterns/field-mappings/`
- `BrowserRouter` → `HashRouter` is mandatory — the Power Apps player hosts your app in an iframe at a non-root path. See [vibe-patterns/adrs/always-hashrouter.md](vibe-patterns/adrs/always-hashrouter.md)
- Office 365 email and other connectors: replace direct `fetch()` to webhooks with `executeAsync({ connectorOperation })` via the SDK — CSP blocks `fetch()` in the deployed player
- `npx power-apps add-data-source` is the only safe way to register connectors — never edit `dataSourcesInfo.ts` by hand

See [vibe-patterns/](vibe-patterns/) for the full library.

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
