# /migrate

Start a full AI-guided migration from Vibe (make.powerapp.com) to Power Code.

## When to use
The user has extracted their Vibe app source into `./vibe-source/` and wants to migrate it to a Power Code project.

## What you do

1. **Silently run the prerequisites check** — `powershell -ExecutionPolicy Bypass -File ".\scripts\check-setup.ps1"`. Only surface output if exit code is non-zero. If all OK, proceed without mentioning it.
2. Ask: *"What is your Power Code project name? (e.g. MyApp)"* — wait for answer
3. Check if `./vibe-source/` exists — if not, tell the user to run the vibe-extractor first (see README.md)
4. Explore `./vibe-source/src/` to understand the app's structure, pages, components, and data sources
5. Check for `CONTEXT.md` — if it exists, read it for prior decisions
6. Follow the migration steps in `CLAUDE.md` in this order:
   - Step 0: Silent prerequisites check
   - Step 1: Understand Vibe source (note which connectors are used)
   - Step 2: Scaffold Power Code project
   - Step 3: Extract clean TypeScript
   - Step 4: Build data adapter layer
   - **Step 5: Add connectors & data sources** ← before npm install, so dataSourcesInfo is complete
   - Step 6: Add npm dependencies
   - Step 7: Update configuration files
   - Step 8: Fix TypeScript errors (dataSourcesInfo now complete → clean compile)
   - Step 9: Build and push

## Questions to ask before starting

Ask **one question at a time** and wait for each answer before asking the next.

- What is the target Power Code project folder name?
- What Power Platform environment are you deploying to? (URL and ID)
- Are there any connectors the app uses beyond Dataverse? (e.g. Office 365, SharePoint)

## After migration completes — save the baseline

Once the migration is done and the app builds successfully, run these steps to enable future incremental updates via `/update`:

### 1. Save the Vibe baseline

Extract clean TypeScript from the current `vibe-source/` and save to `vibe-baseline/`:

```powershell
$srcDir = ".\vibe-source\src"
$destDir = ".\vibe-baseline\src"

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
Write-Host "Baseline saved to ./vibe-baseline/"
```

### 2. Write the ownership manifest

Create `./vibe-migration.json` that records which Power Code files are owned by Vibe (safe to auto-update) vs owned by the migration (must not be overwritten).

Build it by examining what was extracted vs what was created/modified during migration:

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

**Rules for categorising files:**
- `vibeOwned` — files extracted directly from Vibe source maps with only import-path adaptations
- `migrationOwned` — files that were rewritten or significantly modified during migration (HashRouter, theme fix, SDK connector calls, adapter layer, config files)
- `requiresReview` — files where Vibe logic was preserved but the implementation was changed (e.g. connector hooks rewritten to use SDK)

Write this file accurately — it is the decision record the `/update` skill uses on every future update.

## Output

At completion, the developer should have:
- `[ProjectName]/` — working Power Code project
- `vibe-baseline/` — clean TypeScript snapshot of the Vibe source at migration time
- `vibe-migration.json` — ownership manifest for incremental updates
- `CONTEXT.md` — field mappings and decisions

And be able to run:
```powershell
cd [ProjectName]
npm run build
npx power-apps push
```
