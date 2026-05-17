# /migration-report

Generate comprehensive project documentation (Markdown + Word) for the migrated Power Code project. Bundles everything stakeholders, auditors, and future maintainers need: project overview, architecture, full migration history with per-version detail, field mappings, connector list, ADRs, file ownership, dependencies, and test results.

**Use when** the user wants to:
- Hand the project off to another team or developer
- Send a status doc to stakeholders / management / auditors
- Snapshot the project state after a migration milestone
- Refresh the existing documentation after `/migrate` (Mode A or Mode B) completes

Triggered automatically at the end of `/migrate` (both modes). Can also be run standalone any time.

---

## What it produces

Two files at `./docs/`:

| File | Audience | Purpose |
|---|---|---|
| `docs/PROJECT.md` | Engineers, code reviewers, AI agents | Source of truth, git-trackable, diff-friendly |
| `docs/PROJECT.docx` | Stakeholders, management, SharePoint, email attachments | Polished Word document, opens in MS Word / Google Docs / LibreOffice |

Both are regenerated from the same data — markdown is the editable source, .docx is the export.

## What's inside

The document includes whatever data the project actually has. Empty sections are silently skipped.

| Section | Source |
|---|---|
| Title page | `[ProjectName]/package.json` `version` + `vibe-history.json` |
| Environment | `[ProjectName]/power.config.json` |
| Overview | `CONTEXT.md` glossary section |
| Architecture | scanned from `[ProjectName]/` structure |
| Migration history (table) | `vibe-history.json` `versions[]` |
| Per-version details | `vibe-history.json` — changed files, notes, test results per version |
| Field mappings | `CONTEXT.md` field-mapping section |
| Data sources | `[ProjectName]/src/generated/models/` + `dataSourcesInfo.ts` |
| File ownership | `vibe-migration.json` (vibeOwned / migrationOwned / requiresReview) |
| ADRs | `docs/adr/*.md` |
| Dependencies | `[ProjectName]/package.json` dependencies + devDependencies |
| Footer | generation timestamp |

## How to invoke

### Standalone

```powershell
node vibe-reporter/index.js              # Both .md and .docx
node vibe-reporter/index.js --md-only    # Skip the Word doc
node vibe-reporter/index.js --out ./docs # Custom output folder
```

### From inside Claude Code

When the user types `/migration-report`:

1. Check that `vibe-reporter/node_modules/` exists. If not, tell the developer to run `cd vibe-reporter && npm install` first.
2. Invoke `node vibe-reporter/index.js` from the project root.
3. Surface the output paths to the developer.
4. If the developer wants to revise any section, point them at `docs/PROJECT.md` (the markdown source) — the next regeneration will pull in their edits **only for sections derived from CONTEXT.md or docs/adr/**. Sections derived from `vibe-history.json` or `vibe-migration.json` are mechanically regenerated each time.

## Workflow integration

| Trigger | Behaviour |
|---|---|
| End of `/migrate` Mode A | Ask the developer: *"Generate project documentation now? (Recommended)"* — if yes, invoke this skill. The doc captures v1.0.0 as the first history entry. |
| End of `/migrate` Mode B | Ask: *"Regenerate project documentation to include v{toVersion}?"* — if yes, regenerate. The new version section is appended automatically (because the history grew). |
| Standalone `/migration-report` | Generate from current state. Useful before stakeholder meetings, end-of-sprint, audits. |

## First-time setup

Once, when the toolkit is cloned or `vibe-reporter/` is added:

```powershell
cd vibe-reporter
npm install
```

This installs the `docx` library (pure JS, no native dependencies). If the user wants markdown-only output, they can skip `npm install` and always pass `--md-only`.

## Rules

1. **Never edit `docs/PROJECT.docx` by hand** — it's regenerated from scratch every run.
2. **Edit `CONTEXT.md` and `docs/adr/` to shape the narrative sections** — those flow through into both outputs. The history section is not editable here (it comes from `vibe-history.json`, which is owned by `node vibe-extractor/index.js`).
3. **Commit `docs/PROJECT.md` to git** — it's the human-readable change log of the documentation itself. The `.docx` is your call; many teams commit it for SharePoint pickup, others gitignore it as a binary artifact.
4. **Regenerate after every `/migrate`**, not ad-hoc. The doc only stays trustworthy if it's refreshed in lockstep with each migration step.
5. **The report is not a spec.** It describes what's there, not what should be there. For decisions, use `docs/adr/`; for glossary, use `CONTEXT.md`.

## Example output (excerpt)

```markdown
# MyApp — Project Documentation

**Current version:** v1.2.0
**Generated:** 2026-05-17 11:42:08 UTC
**App display name:** MyApp
**Environment:** `abc-123-def` (prod)
**App ID:** `xyz-789`

## Migration History

| Version | Date | Diff | Files | Tests | Note |
|---|---|---|---|---|---|
| v1.0.0 | 2026-05-01 | +0 ~0 -0 | 47 | 5P/0F | Initial migration |
| v1.1.0 | 2026-05-10 | +1 ~2 -0 | 49 | 7P/1F | Added dark mode + dashboard chart |
| v1.2.0 | 2026-05-17 | +0 ~3 -1 | 48 | 8P/0F | Removed deprecated email flow |

## Version Details

### v1.2.0 — 2026-05-17
> Removed deprecated email flow
- Files in this version: 48
- Git tag: `vibe-baseline-v1.2.0`
- Tests (run at 2026-05-17 11:30:00 UTC): 8 passed, 0 failed, 0 skipped (15.3s)

**Modified files:**
- `src/App.tsx`
- `src/pages/dashboard.tsx`
- `src/hooks/use-notifications.ts`

**Deleted files:**
- `src/hooks/use-send-results-email.ts`
```
