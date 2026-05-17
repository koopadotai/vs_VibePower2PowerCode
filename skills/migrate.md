# /migrate

Bring a Vibe app into Power Code. **Auto-detects mode** by project state — same command for first-time and every subsequent re-extraction.

## Mode dispatch (do this first, every time)

Inspect the project root and pick the right mode. Don't ask the user — the state tells you.

```powershell
$hasHistory  = Test-Path ".\vibe-history.json"
$hasPending  = Test-Path ".\vibe-pending-update.json"
$hasSource   = Test-Path ".\vibe-source"
```

| State | Mode | Procedure |
|---|---|---|
| **No `vibe-history.json`** | **A — First-time migration** | Scaffold project, build adapter, init versioning at v1.0.0. Heavy planning + design. |
| **`vibe-pending-update.json` exists** | **B — Incremental update** | Apply only the files listed in the pending manifest. Mechanical. |
| **`vibe-history.json` exists, no pending** | **C — Up to date** | Tell the developer to run `node vibe-extractor/index.js` first if they have new Vibe changes. Stop. |
| **No `vibe-source/`** | (error) | Tell the developer to run `node vibe-extractor/index.js` first. Stop. |

Announce the chosen mode before doing anything substantive:

> *"Mode A — first-time migration (no `vibe-history.json` found). Setting up Power Code project from scratch."*

Then proceed to the matching section below.

---

# Mode A — First-time migration

## When this fires
The user has just run `node vibe-extractor/index.js` for the first time. `vibe-source/` exists but there's no `vibe-history.json` yet.

## Procedure

### A.0 — Silent prerequisites check

```powershell
powershell -ExecutionPolicy Bypass -File ".\scripts\check-setup.ps1"
```

Only surface output if exit code is non-zero. If all OK, proceed without mentioning it.

### A.1 — Ask the planning questions

Apply [grill-with-docs](grill-with-docs.md). Ask **one question at a time**, wait for each answer.

1. *"What is the target Power Code project folder name? (e.g. MyApp)"*
2. *"What Power Platform environment are you deploying to? (Environment ID, found at `make.powerapps.com` → gear → Session details)"*
3. *"Beyond Dataverse, which connectors does this app use? (e.g. Office 365, SharePoint)"*

Check for an existing `CONTEXT.md` — if present, read it for prior decisions before asking.

### A.2 — Execute the migration steps

Follow `CLAUDE.md` in this exact order. The steps inter-depend; don't reorder.

| Step | Owner | What |
|---|---|---|
| Step 1 | AI | Explore `./vibe-source/src/` — pages, components, Dataverse tables, connector calls |
| Step 2 | Developer | Scaffold via `npx degit github:microsoft/PowerAppsCodeApps/templates/vite [Name]` |
| Step 3 | AI | Copy clean TypeScript from `./vibe-source/src/` into project (source maps already decoded by Node) |
| Step 4 | AI | Build the data adapter layer (`fromDataverse` / `toDataverse`) — **heaviest reasoning step** |
| Step 5 | Developer | `npx power-apps add-data-source` for each connector identified in A.1 |
| Step 6 | AI | Scan imports, build `package.json` deps list, `npm install` |
| Step 7 | AI | Update `vite.config.ts`, `tsconfig.app.json`, `index.css`, `App.tsx`, `power.config.json` |
| Step 8 | AI | `npx tsc --noEmit` and fix every error |
| Step 9 | Developer | `npm run build && npx power-apps push` |

If any step needs grilling (ambiguous field names, unclear connector mapping, etc.), invoke [grill-with-docs](grill-with-docs.md) inline. Don't batch decisions.

### A.3 — Initialise version control (v1.0.0)

Once Step 9 succeeds:

```powershell
# Live baseline — the reference point for future diffs
Copy-Item -Recurse -Force ".\vibe-source" ".\vibe-baseline"

# Permanent snapshot of v1.0.0
New-Item -ItemType Directory -Path ".\vibe-baselines-snapshots" -Force | Out-Null
Copy-Item -Recurse -Force ".\vibe-source" ".\vibe-baselines-snapshots\v1.0.0"
```

Write `vibe-history.json`:

```powershell
$fileCount = (Get-ChildItem -Recurse -File ".\vibe-baseline").Count
$entry = @{
    projectName = "[ProjectName]"
    versions = @(
        @{
            version = "1.0.0"
            extractedAt = (Get-Date).ToUniversalTime().ToString("o")
            fileCount = $fileCount
            treeHash = ""
            changedFiles = @{ added = @(); modified = @(); deleted = @() }
            snapshotPath = "vibe-baselines-snapshots/v1.0.0"
            gitTag = "vibe-baseline-v1.0.0"
            note = "Initial migration"
        }
    )
}
$entry | ConvertTo-Json -Depth 10 | Set-Content -Path ".\vibe-history.json" -Encoding UTF8
```

Set `[ProjectName]/package.json` `version` to `"1.0.0"`.

### A.4 — Write the ownership manifest

Create `./vibe-migration.json`. This is the **decision record** the next `/migrate` (Mode B) uses on every future incremental run.

```json
{
  "projectName": "[ProjectName]",
  "migratedAt": "[ISO date]",
  "vibeOwned": [
    "src/components/[component].tsx",
    "src/pages/[page].tsx",
    "src/hooks/[hook].ts",
    "src/lib/utils.ts"
  ],
  "migrationOwned": [
    "src/App.tsx",
    "src/main.tsx",
    "src/index.css",
    "src/components/ui/sonner.tsx",
    "src/components/system/error-boundary.tsx",
    "src/generated/"
  ],
  "requiresReview": [
    "src/hooks/use-send-results-email.ts"
  ]
}
```

**Categorisation rules:**
- `vibeOwned` — extracted directly from Vibe source maps, only mechanical import adaptation
- `migrationOwned` — rewritten or significantly modified during migration (HashRouter, theme fix, SDK connector calls, adapter layer, config files)
- `requiresReview` — Vibe logic preserved but implementation changed (e.g. connector hooks rewritten to use `executeAsync`)

Write this accurately — Mode B can't recover from a wrong manifest.

### A.5 — Suggest the git tag

Tell the developer:
```
git add -A
git commit -m "vibe: initial migration v1.0.0"
git tag vibe-baseline-v1.0.0
```

Optional but recommended — git tags preserve baselines beyond the 3-snapshot rotation window.

### A.6 — Offer verification tests

Ask:

> *"Generate baseline verification tests for v1.0.0 now? (Recommended) These pop a real browser and check key pages against the deployed app. Y/n"*

If **yes**: invoke [verify-migration](verify-migration.md) in `generate` mode, ask for depth, write tests into `./tests/specs/v1.0.0/`.

If **no**: print the commands they can run later:
```
node vibe-verifier/index.js --setup-auth    (first time only)
node vibe-verifier/index.js --latest
```

### A.7 — Offer to generate project documentation

Ask:

> *"Generate project documentation now? (Recommended) Produces `docs/PROJECT.md` and `docs/PROJECT.docx` — comprehensive bundle of overview, history, field mappings, ADRs, dependencies. Y/n"*

If **yes**: invoke [migration-report](migration-report.md) — runs `node vibe-reporter/index.js`, which writes both files. If `vibe-reporter/node_modules/` is missing, tell the developer to run `cd vibe-reporter && npm install` first.

If **no**: print the command they can run later: `node vibe-reporter/index.js`.

## Mode A output

At completion the developer has:
- `[ProjectName]/` — working Power Code project, `package.json` at `1.0.0`
- `vibe-baseline/` — clean TypeScript reference for future diffs
- `vibe-baselines-snapshots/v1.0.0/` — permanent snapshot
- `vibe-history.json` — version audit log seeded with v1.0.0
- `vibe-migration.json` — ownership manifest
- `CONTEXT.md` — field mappings and decisions
- Optionally: `tests/specs/v1.0.0/` and `git tag vibe-baseline-v1.0.0`

---

# Mode B — Incremental update

## When this fires
The user re-ran `node vibe-extractor/index.js` after editing their Vibe app. The extractor detected a diff and wrote `vibe-pending-update.json`. **Only the files listed in that manifest are touched** — the Node extractor has already done the diff, version bump, and snapshot work.

See [version-control.md](version-control.md) for the full versioning policy and manifest formats.

## Procedure

### B.0 — Silent prerequisites check

```powershell
powershell -ExecutionPolicy Bypass -File ".\scripts\check-setup.ps1"
```

Verify:
- `./vibe-pending-update.json` exists (you wouldn't be in Mode B otherwise, but double-check)
- `./vibe-migration.json` exists — if not, the project was never migrated; switch to Mode A
- `./[ProjectName]/` exists

### B.1 — Read the pending manifest

```powershell
$pending = Get-Content -Raw ".\vibe-pending-update.json" | ConvertFrom-Json
```

Manifest shape:
```json
{
  "fromVersion": "1.0.0",
  "toVersion": "1.1.0",
  "extractedAt": "2026-05-17T10:30:00.000Z",
  "changedFiles": {
    "added":    ["src/components/dark-mode-toggle.tsx"],
    "modified": ["src/App.tsx", "src/pages/dashboard.tsx"],
    "deleted":  []
  },
  "sourceDir": "vibe-source",
  "baselineDir": "vibe-baseline",
  "snapshotPath": "vibe-baselines-snapshots/v1.1.0"
}
```

Announce to the developer:
> *"Mode B — applying `v{fromVersion} → v{toVersion}`: {N added}, {N modified}, {N deleted}."*

### B.2 — Apply by category

Read `./vibe-migration.json` (from Mode A). For each path in `pending.changedFiles.added` and `pending.changedFiles.modified`:

| Category in `vibe-migration.json` | Action |
|---|---|
| `vibeOwned` | Copy `./vibe-source/{path}` → `./[ProjectName]/{path}`. Adapt imports only — file is already clean TS. |
| `migrationOwned` | **Do NOT overwrite.** Show the developer the diff of the Vibe-side change and ask whether to apply it manually to the migration-owned file. |
| `requiresReview` | Show the diff, explain the risk, ask the developer to confirm before applying. |
| (not in manifest) | Treat as `vibeOwned` by default. Mention it and ask the developer to confirm — then update `vibe-migration.json`. |

For each path in `pending.changedFiles.deleted`:
- If the file exists in the Power Code project, ask whether to delete it (may have been intentionally kept post-migration).

**Adapting `vibeOwned` files** — mechanical only:
- Replace any leftover Vite internal paths (`/node_modules/.vite/deps/...`) with the npm package name
- Leave `@/*` alias imports as-is
- Do NOT change field names — the adapter handles those

### B.3 — Check for model changes

If any path under `src/generated/models/` appears in `changedFiles`:
- Compare new model against the previous Dataverse generated model
- New fields → update `fromDataverse()` and `toDataverse()` in the adapter service
- Renamed fields → confirm Dataverse field name with the developer
- Invoke `/map-fields` for ambiguous mappings

### B.4 — Check for new connector usage

For each `vibeOwned` change, scan for new `fetch()` URLs, new Power Automate webhook URLs, or new SDK call patterns.

If found:
- Tell the developer which connector is now needed
- Guide them through `/add-connector`
- Update the calling code to use `executeAsync({ connectorOperation })`

### B.5 — TypeScript check

```powershell
cd [ProjectName]
npx tsc --project tsconfig.app.json --noEmit
```

Fix errors. Stay surgical — only touch what's needed (see [karpathy-guidelines](karpathy-guidelines.md) principle 3).

### B.6 — Build and push

```powershell
cd [ProjectName]
npm run build
npx power-apps push
```

### B.7 — Finalise the version

Only after build + push succeed:

```powershell
# Bump package.json to match the pending manifest
$pkgPath = ".\[ProjectName]\package.json"
$pkg = Get-Content -Raw $pkgPath | ConvertFrom-Json
$pkg.version = $pending.toVersion
$pkg | ConvertTo-Json -Depth 100 | Set-Content -Path $pkgPath -Encoding UTF8

# Consume the pending manifest — its work is done
Remove-Item ".\vibe-pending-update.json"
```

Suggest to the developer:
```
git add -A
git commit -m "vibe: v{toVersion} — {short summary of changes}"
git tag vibe-baseline-v{toVersion}
```

Ask the developer for a one-line note describing this version. If they provide one, append it to the matching entry in `vibe-history.json`:
```powershell
$h = Get-Content -Raw ".\vibe-history.json" | ConvertFrom-Json
$h.versions[-1].note = "{the note}"
$h | ConvertTo-Json -Depth 10 | Set-Content -Path ".\vibe-history.json" -Encoding UTF8
```

### B.8 — Offer verification tests

Ask:

> *"Generate verification tests for the {N} changed features in v{toVersion}? Or run the existing v{toVersion} tests if they already exist? Y/n"*

If **yes**, invoke [verify-migration](verify-migration.md):
- If `tests/specs/v{toVersion}/` doesn't exist → generate mode (incremental, only files in `pending.changedFiles`), ask depth, then offer to run
- If `tests/specs/v{toVersion}/` exists → skip generation, jump to run: `node vibe-verifier/index.js --latest`

If a test fails, apply [diagnose](diagnose.md) to the failure trace. The CLI auto-creates the GitHub issue.

If **no**: print `node vibe-verifier/index.js --latest` for later and finish.

### B.9 — Offer to regenerate project documentation

Ask:

> *"Regenerate project documentation to include v{toVersion}? (Recommended) `docs/PROJECT.md` and `docs/PROJECT.docx` will be refreshed with the new history entry. Y/n"*

If **yes**: invoke [migration-report](migration-report.md) — runs `node vibe-reporter/index.js`. The new version section is appended automatically.

If **no**: print `node vibe-reporter/index.js` for later and finish.

---

# Mode C — Up to date

`vibe-history.json` exists, no `vibe-pending-update.json`. Nothing has changed since the last applied version.

Print:
> *"Up to date at v{latest from history}. If you've made changes in Vibe, run `node vibe-extractor/index.js` first to detect them."*

Stop. Do not re-run any migration steps.

---

# Rules (apply in every mode)

1. **Never re-do the diff inside `/migrate` Mode B.** The Node extractor is the single source of truth for "what changed."
2. **Never overwrite `migrationOwned` files automatically** — always show the diff and ask.
3. **Never bump the version yourself in Mode B.** Use `pending.toVersion`. The extractor already decided.
4. **Never delete `vibe-pending-update.json` before build + push succeed** in Mode B — its presence is the developer's signal that the update isn't done.
5. **Model changes always need adapter review** — a new Vibe field might map to a Dataverse field with a different publisher prefix.
6. **Never assume a new field mapping** — ask the developer to confirm.
7. **Write `vibe-migration.json` accurately in Mode A.** Mode B reads it forever; a wrong category in Mode A causes wrong updates later.
8. If in doubt about any change, invoke [grill-with-docs](grill-with-docs.md). For hard-to-trace failures, invoke [diagnose](diagnose.md).
