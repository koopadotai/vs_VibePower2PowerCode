# /update

Apply incremental changes from a re-downloaded Vibe source to an already-migrated Power Code project. Only files that actually changed in Vibe are updated.

## When to use
The user has made changes to their Vibe app on make.powerapp.com, re-extracted the source via vibe-extractor (replacing `./vibe-source/`), and wants to apply only the changes to their Power Code project without re-migrating everything.

## Prerequisites
- `./vibe-baseline/` exists — created by `/migrate` after the first migration
- `./vibe-migration.json` exists — the ownership manifest created by `/migrate`
- `./[ProjectName]/` exists — the migrated Power Code project

## What you do

### Step 0 — Silent prerequisites check

```powershell
powershell -ExecutionPolicy Bypass -File ".\scripts\check-setup.ps1"
```

Only surface output if exit code is non-zero. If all OK, proceed without mentioning it.

Also verify:
- `./vibe-baseline/` exists — if not, tell the user to run `/migrate` first
- `./vibe-migration.json` exists — if not, tell the user to run `/migrate` first

### Step 1 — Extract clean TypeScript from the new Vibe source

Run the same source map extraction as the initial migration, writing to a **temp folder** (`./vibe-source-new/`):

```powershell
$srcDir = ".\vibe-source\src"
$destDir = ".\vibe-source-new\src"

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

### Step 2 — Diff new vs baseline

Compare `./vibe-source-new/src/` against `./vibe-baseline/src/` to find:
- **New files** — files in new but not in baseline → full fresh migration needed for these
- **Deleted files** — files in baseline but not in new → check if safe to remove from Power Code
- **Changed files** — files that differ between baseline and new → apply changes

For each changed file, read `./vibe-migration.json` to determine its category.

### Step 3 — Apply changes by category

Read `./vibe-migration.json`:
```json
{
  "projectName": "[ProjectName]",
  "vibeOwned": ["src/components/dice.tsx", "src/pages/index.tsx", ...],
  "migrationOwned": ["src/App.tsx", "src/components/ui/sonner.tsx", ...],
  "requiresReview": ["src/hooks/use-send-results-email.ts", ...]
}
```

**For each changed file:**

| Category | Action |
|---|---|
| `vibeOwned` | Replace the Power Code file directly with the new extracted version (adapt imports only) |
| `migrationOwned` | **Do NOT overwrite.** Show the user what changed in Vibe and ask if the change should be manually applied |
| `requiresReview` | Show the diff, explain the risk, ask the user to confirm before applying |
| New file | Migrate it fresh using the same steps as the initial migration |

**Adapting `vibeOwned` files:**
When copying from `vibe-source-new/` to Power Code, apply these mechanical transformations:
- Fix imports: replace Vite internal paths (`/node_modules/.vite/deps/...`) with npm package names
- Fix `@/` alias imports — leave as-is, already correct
- Do NOT change field names — the file uses friendly names which the adapter handles

### Step 4 — Check for model changes

If any file in `vibe-source-new/src/generated/models/` differs from `vibe-baseline/src/generated/models/`:
- New fields added → update the adapter service's `fromDataverse()` and `toDataverse()` with the new mappings
- Existing fields changed → update the mapping and ask the user to confirm the Dataverse field name
- Run `/map-fields` for new fields

### Step 5 — Check for new connector usage

Scan changed files for new connector calls (new `fetch()` URLs, new Power Automate webhook URLs).
If found:
- Tell the user which connector is now needed
- Guide them through `/add-connector`
- Update the calling code to use `executeAsync({ connectorOperation })`

### Step 6 — TypeScript check

```powershell
cd [ProjectName]
npx tsc --project tsconfig.app.json --noEmit
```

Fix any errors introduced by the updated files.

### Step 7 — Update the baseline

Replace `./vibe-baseline/` with `./vibe-source-new/` so the next update has a correct reference point:

```powershell
Remove-Item -Recurse -Force ".\vibe-baseline"
Rename-Item ".\vibe-source-new" "vibe-baseline"
```

### Step 8 — Build and push

```powershell
cd [ProjectName]
npm run build
npx power-apps push
```

## Rules

- **Never overwrite `migrationOwned` files automatically** — always show the diff and ask
- **Always update the baseline** after a successful update — otherwise the next diff is wrong
- **Model changes always need adapter review** — a new Vibe field might map to a Dataverse field with a different publisher prefix
- **Never assume a new field mapping** — ask the developer to confirm
- If in doubt about a change, use `/grill-with-docs` to interview the developer before applying
