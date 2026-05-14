#!/usr/bin/env pwsh
# check-setup.ps1
# Idempotent prerequisite checker for vs_VibePower2PowerCode.
# Safe to run multiple times. Installs missing components, skips existing ones.

$results = @()

function Check($label, $test, $install) {
    $exists = $false
    try { $exists = & $test 2>$null } catch {}
    if ($exists) {
        $results += [PSCustomObject]@{ Status = "OK"; Component = $label }
    } else {
        $results += [PSCustomObject]@{ Status = "INSTALLING"; Component = $label }
        try { & $install } catch {
            $results[-1].Status = "FAILED"
        }
        try { $exists = & $test 2>$null } catch {}
        if ($exists) { $results[-1].Status = "INSTALLED" }
    }
}

# ── Node.js ──────────────────────────────────────────────────────────
Check "Node.js LTS" `
    { (Get-Command node -ErrorAction SilentlyContinue) -ne $null } `
    { winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements }

# ── Power Platform CLI (pac) ─────────────────────────────────────────
Check "Power Platform CLI (pac)" `
    { (Get-Command pac -ErrorAction SilentlyContinue) -ne $null } `
    { winget install Microsoft.PowerPlatformCLI --silent --accept-package-agreements --accept-source-agreements }

# ── vibe-extractor npm packages ───────────────────────────────────────
Check "vibe-extractor packages" `
    { Test-Path (Join-Path $PSScriptRoot "..\vibe-extractor\node_modules") } `
    {
        Push-Location (Join-Path $PSScriptRoot "..\vibe-extractor")
        npm install --silent
        Pop-Location
    }

# ── Playwright Chromium browser ───────────────────────────────────────
Check "Playwright Chromium" `
    {
        $dir = Join-Path $PSScriptRoot "..\vibe-extractor\node_modules\playwright-core\.local-browsers"
        (Test-Path $dir) -and (Get-ChildItem $dir -Filter "chromium*" -ErrorAction SilentlyContinue).Count -gt 0
    } `
    {
        Push-Location (Join-Path $PSScriptRoot "..\vibe-extractor")
        npx playwright install chromium 2>$null
        Pop-Location
    }

# ── @microsoft/power-apps-vite (npx power-apps) ──────────────────────
Check "power-apps CLI (npx)" `
    { (npx --yes power-apps --version 2>$null) -ne $null } `
    { npm install -g @microsoft/power-apps-vite --silent }

# ── PAC authenticated ─────────────────────────────────────────────────
Check "pac auth (environment)" `
    { (pac auth list 2>$null) -match "\*" } `
    {
        Write-Host ""
        Write-Host "  No active pac auth found. Please authenticate:"
        Write-Host "  pac auth create --environment https://[your-org].crm[N].dynamics.com/"
    }

# ── Report ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Setup Check"
Write-Host "-----------"
foreach ($r in $results) {
    $icon = switch ($r.Status) {
        "OK"        { "[OK]      " }
        "INSTALLED" { "[INSTALLED]" }
        "INSTALLING"{ "[...]     " }
        "FAILED"    { "[FAILED]  " }
    }
    Write-Host "  $icon $($r.Component)"
}
Write-Host ""

$failed = $results | Where-Object { $_.Status -eq "FAILED" }
if ($failed) {
    Write-Host "  Some components failed to install. See above."
    Write-Host "  You can install them manually and re-run."
    exit 1
}

$needsAuth = $results | Where-Object { $_.Component -eq "pac auth (environment)" -and $_.Status -ne "OK" }
if ($needsAuth) {
    Write-Host "  Action required: run pac auth create before continuing."
    exit 2
}

Write-Host "  All prerequisites satisfied."
exit 0
