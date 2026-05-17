# version-control: Versioned Vibe → Power Code Updates

Reference doc for the versioning policy. Track every re-extraction of the Vibe source as a discrete version of the Power Code project. The Node extractor does the mechanical work (diff, version bump, snapshot, history); `/migrate` Mode B applies the changes, scoped to **only the files that changed**.

**Use when** the user asks about versions, re-downloads from Vibe, runs `node index.js` after a previous migration, or asks why `/migrate` Mode B "only sees a few files".

For the operational procedure (the actual steps `/migrate` Mode B follows), see [migrate.md](migrate.md). This file is the **policy reference** only.

---

## Pipeline

```
make.powerapp.com  → user edits app
       ↓
node index.js      → re-extracts → decodes source maps → diffs against ./vibe-baseline/
       ├ no change                → exits with "v1.X.0 — no changes"
       └ change detected          → bumps version, snapshots, writes vibe-pending-update.json
       ↓
/migrate (Mode B)  → reads vibe-pending-update.json → applies only the listed files
       ↓
npm run build && npx power-apps push
```

`node index.js` and `/migrate` are intentionally separate. The extractor never reasons about the migration; `/migrate` never touches the source tree without a manifest telling it what changed.

---

## Files owned by version control (at project root)

| File / Folder | Owner | Purpose |
|---|---|---|
| `./vibe-source/` | `node index.js` | Cleaned TypeScript ready for `/migrate` (either mode) to read. Replaced every extraction. |
| `./vibe-baseline/` | `node index.js` (on diff); `/migrate` Mode A (on first run) | The "live" baseline — represents the most recent Vibe state on disk. Used as the diff reference for the next extraction. |
| `./vibe-baselines-snapshots/v{ver}/` | `node index.js` | Filesystem snapshot of each version's baseline. Last **3** kept; older auto-deleted. |
| `./vibe-history.json` | `node index.js` (appends), `/migrate` Mode A (initialises) | Append-only audit log. Contains every version ever (even after its snapshot folder is rotated out). |
| `./vibe-pending-update.json` | `node index.js` writes, `/migrate` Mode B reads + deletes | The handoff. Lists the file-level diff for Mode B to apply. Presence triggers Mode B; absence means Mode C ("up to date"). |
| `[ProjectName]/package.json` `version` | `/migrate` Mode A (sets 1.0.0), `/migrate` Mode B (matches pending manifest) | Source of truth for the Power Code project's version. |

---

## Version rules

- **First migration** (`/migrate` Mode A) sets the project to `1.0.0`.
- **Each successful `node index.js` with a real diff** bumps the **minor** version (`1.0.0 → 1.1.0 → 1.2.0 …`).
- **No diff = no bump** — extractor exits silently with "no changes since v1.X.0".
- **Major bump** only when the developer passes `--major`: `node index.js MyApp <url> --major`. Use for SDK breaking changes or intentional reset points.
- **Patch** (`--patch`) is available but rarely needed — provided for completeness.
- `/migrate` Mode B reads the version from `vibe-pending-update.json` and sets `[ProjectName]/package.json` to match on successful apply.

---

## Manifest formats

### `vibe-pending-update.json`

Written by `node index.js`. Consumed and deleted by `/migrate` Mode B.

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

### `vibe-history.json`

Append-only. One entry per version. Never edited by hand (except `note` and `testResults`, which `/migrate` and `/verify-migration` write respectively).

```json
{
  "projectName": "MyApp",
  "versions": [
    {
      "version": "1.0.0",
      "extractedAt": "2026-05-01T09:00:00.000Z",
      "fileCount": 47,
      "treeHash": "sha256:abc...",
      "changedFiles": { "added": [], "modified": [], "deleted": [] },
      "snapshotPath": "vibe-baselines-snapshots/v1.0.0",
      "gitTag": "vibe-baseline-v1.0.0",
      "note": "Initial migration"
    },
    {
      "version": "1.1.0",
      "extractedAt": "2026-05-17T10:30:00.000Z",
      "fileCount": 49,
      "treeHash": "sha256:def...",
      "changedFiles": { "added": ["..."], "modified": ["..."], "deleted": [] },
      "snapshotPath": "vibe-baselines-snapshots/v1.1.0",
      "gitTag": "vibe-baseline-v1.1.0",
      "note": ""
    }
  ]
}
```

---

## Snapshot rotation

`vibe-baselines-snapshots/` keeps the **last 3** versions on disk. When a 4th is written, the oldest folder is deleted automatically.

**That's why git tags exist as the "belt and braces":** every snapshot rotation is irreversible on disk, but if the user runs `git tag vibe-baseline-v1.X.0 && git commit` after `/migrate` Mode B succeeds, the full history stays recoverable in the repo. The `gitTag` field in `vibe-history.json` records the tag the user is **expected to create** — actually creating it is the user's call.

---

## Rules

1. **Never edit `vibe-history.json` or `vibe-pending-update.json` by hand.** Both are mechanically generated. The exception: `/migrate` Mode B writes the `note` field on the latest history entry; `/verify-migration` writes the `testResults` field.
2. **Never let `/migrate` re-do the diff.** The extractor is the single source of truth for "what changed." Mode B reads `vibe-pending-update.json` and trusts it.
3. **Never run `node index.js` twice without `/migrate` Mode B in between** without using `--force`. The extractor refuses by default to avoid stacking versions for changes that were never applied.
4. **First migration is detected automatically.** If no `vibe-history.json` exists, `/migrate` runs Mode A; otherwise it dispatches to Mode B or C based on whether a pending manifest exists. The user always types the same command: `/migrate`.
5. **Snapshot rotation is permanent on disk** — rely on git tags + `vibe-history.json` for long-term history beyond 3 versions.
