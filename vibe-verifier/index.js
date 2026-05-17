#!/usr/bin/env node
/**
 * Vibe Verifier CLI
 *
 * Usage:
 *   node vibe-verifier/index.js --setup-auth         Interactive MS sign-in, saves storage state
 *   node vibe-verifier/index.js                       Run all version specs (default)
 *   node vibe-verifier/index.js --latest              Run only the latest version's specs
 *   node vibe-verifier/index.js --since v1.0.0        Run v1.0.0 → latest
 *   node vibe-verifier/index.js --headless            CI mode, no browser window
 *   node vibe-verifier/index.js --no-report           Don't create GitHub issues on failure
 *   node vibe-verifier/index.js --app-url <URL>       Override the deployed app URL
 *
 * Expects to run from the project root (the folder that contains power.config.json or
 * [ProjectName]/power.config.json plus vibe-history.json and tests/).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupAuth, authStatus } from './lib/auth-setup.js';
import { resolveScope } from './lib/version-filter.js';
import { runPlaywright, recordResultsInHistory } from './lib/runner.js';
import { reportFailures } from './lib/github-reporter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIVIDER = '═'.repeat(58);

function findPowerConfig(projectRoot) {
  // Look at root first, then one level into any directory that contains it.
  const direct = path.join(projectRoot, 'power.config.json');
  if (fs.existsSync(direct)) return direct;
  for (const ent of fs.readdirSync(projectRoot, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const candidate = path.join(projectRoot, ent.name, 'power.config.json');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function constructAppUrl(powerConfigPath) {
  const cfg = JSON.parse(fs.readFileSync(powerConfigPath, 'utf8'));
  if (!cfg.environmentId || !cfg.appId) {
    throw new Error(`power.config.json at ${powerConfigPath} is missing environmentId or appId.`);
  }
  return `https://apps.powerapps.com/play/e/${cfg.environmentId}/a/${cfg.appId}`;
}

function parseFlags(argv) {
  const flags = {
    setupAuth: false,
    scope: 'all',         // 'all' | 'latest' | 'vX.Y.Z'
    headless: false,
    report: true,
    appUrl: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--setup-auth') flags.setupAuth = true;
    else if (a === '--latest') flags.scope = 'latest';
    else if (a === '--since') flags.scope = argv[++i];
    else if (a === '--all') flags.scope = 'all';
    else if (a === '--headless') flags.headless = true;
    else if (a === '--no-report') flags.report = false;
    else if (a === '--app-url') flags.appUrl = argv[++i];
    else if (a === '--help' || a === '-h') flags.help = true;
  }
  return flags;
}

function printHelp() {
  console.log(`
  Vibe Verifier — run version-scoped Playwright tests against the deployed Power Apps player.

  Usage:
    node vibe-verifier/index.js [options]

  Options:
    --setup-auth          Interactive MS sign-in; saves auth to ./vibe-verifier/.auth/
    --latest              Run only the latest version's specs
    --since vX.Y.Z        Run specs from this version forward
    --all                 Run all version specs (default)
    --headless            Don't pop a browser window (CI mode)
    --no-report           Don't auto-create GitHub issues on failure
    --app-url <URL>       Override the deployed Power Apps player URL
    --help, -h            Show this message
  `);
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help) { printHelp(); return; }

  const projectRoot = process.cwd();

  // ── Resolve app URL ───────────────────────────────────────────────────────
  let appUrl = flags.appUrl ?? process.env.VIBE_VERIFY_APP_URL ?? null;
  if (!appUrl) {
    const cfg = findPowerConfig(projectRoot);
    if (!cfg) {
      console.error('  ! No power.config.json found at project root or one level down.');
      console.error('    Provide --app-url <URL> or set VIBE_VERIFY_APP_URL.');
      process.exit(1);
    }
    try { appUrl = constructAppUrl(cfg); }
    catch (err) {
      console.error(`  ! ${err.message}`);
      console.error('    Provide --app-url <URL> to override.');
      process.exit(1);
    }
  }

  console.log('');
  console.log(DIVIDER);
  console.log('  Vibe Verification — Power Apps Player');
  console.log(DIVIDER);
  console.log(`  Target  : ${appUrl}`);

  // ── Auth setup mode ───────────────────────────────────────────────────────
  if (flags.setupAuth) {
    await setupAuth({ appUrl, log: console.log });
    return;
  }

  // ── Verify auth exists ────────────────────────────────────────────────────
  const auth = authStatus();
  if (!auth.exists) {
    console.error('  ! No saved auth — run with --setup-auth first.');
    process.exit(1);
  }
  console.log(`  Auth    : ${path.relative(projectRoot, auth.statePath)} (${auth.ageDays} day${auth.ageDays === 1 ? '' : 's'} old)`);
  if (auth.ageDays > 14) {
    console.log('            ! Auth is over 2 weeks old — re-run --setup-auth if tests fail with login redirects.');
  }

  // ── Resolve scope ─────────────────────────────────────────────────────────
  const { folders, versions, latestVersion } = resolveScope({ projectRoot, scope: flags.scope });
  if (folders.length === 0) {
    console.log('  Scope   : (no specs found in tests/specs/)');
    console.log(DIVIDER);
    console.log('  Nothing to run. Generate specs via the /verify-migration skill in Claude Code first.');
    return;
  }
  const versionLabel = versions.length === 1 ? versions[0] : (flags.scope === 'all' ? 'all' : `since-${versions[0]}`);
  console.log(`  Scope   : ${flags.scope} → ${versions.join(', ')}`);
  if (latestVersion) console.log(`  Latest  : v${latestVersion}`);

  // ── Run Playwright ────────────────────────────────────────────────────────
  console.log('');
  let results;
  try {
    results = runPlaywright({
      specFolders: folders,
      versionLabel,
      appUrl,
      storageState: auth.statePath,
      headless: flags.headless,
      projectRoot,
    });
  } catch (err) {
    console.error(`  ! Runner failed: ${err.message}`);
    process.exit(1);
  }

  console.log('');
  console.log(DIVIDER);
  console.log(`  Summary: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped (${(results.durationMs / 1000).toFixed(1)}s)`);

  // ── Report failures ───────────────────────────────────────────────────────
  if (results.failed > 0 && flags.report) {
    console.log('');
    console.log('  Reporting failures to GitHub…');
    reportFailures({ failures: results.failures, appUrl, log: console.log });
  }

  // ── History append ────────────────────────────────────────────────────────
  recordResultsInHistory({ projectRoot, versionLabel, results });
  if (/^v\d+\.\d+\.\d+$/.test(versionLabel)) {
    console.log(`  vibe-history.json updated: ${versionLabel} → testResults { passed: ${results.passed}, failed: ${results.failed} }`);
  }

  console.log(DIVIDER);
  console.log('');

  // Non-zero exit on failure so CI / shell scripts can react.
  if (results.failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('\nFatal error:', err.stack || err.message);
  process.exit(1);
});
