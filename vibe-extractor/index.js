#!/usr/bin/env node
/**
 * Vibe Source Extractor CLI
 *
 * Usage:
 *   node index.js                         ← interactive prompts
 *   node index.js <project-name> <url>    ← non-interactive
 *   node index.js <project-name> <url> --major    ← major version bump
 *   node index.js <project-name> <url> --force    ← discard existing pending manifest
 *
 * Example:
 *   node index.js dice-game "https://vibe.powerapps.com/e/.../app"
 */

import readline from 'readline';
import path from 'path';
import { extractVibeProject } from './extractor.js';
import { runDiffAndVersion } from './lib/diff-and-version.js';
import { acquireLock, releaseLock, installSignalHandlers } from './lib/lock.js';
import { ToolkitError } from './lib/errors.js';

const DIVIDER = '═'.repeat(56);

function ask(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
  });
}

function sanitizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

async function main() {
  console.log(`\n${DIVIDER}`);
  console.log('  Power Apps Vibe — Source Extractor');
  console.log(`${DIVIDER}\n`);

  // ── Parse flags ───────────────────────────────────────────────────────────
  const flags = process.argv.slice(2).filter(a => a.startsWith('--'));
  const positional = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const bumpLevel = flags.includes('--major') ? 'major' : flags.includes('--patch') ? 'patch' : 'minor';
  const force = flags.includes('--force');

  // ── Collect inputs ────────────────────────────────────────────────────────
  let projectName = positional[0]?.trim();
  let vibeUrl     = positional[1]?.trim();

  if (!projectName) {
    projectName = await ask('  Project name  (e.g. dice-game): ');
    if (!projectName) { console.error('  Project name is required.'); process.exit(1); }
  }

  if (!vibeUrl) {
    vibeUrl = await ask('  Vibe URL      (paste from browser): ');
    if (!vibeUrl) { console.error('  Vibe URL is required.'); process.exit(1); }
  }

  // Validate URL
  try { new URL(vibeUrl); } catch {
    console.error(`  Invalid URL: ${vibeUrl}`);
    process.exit(1);
  }

  const safeName  = sanitizeName(projectName);
  const outputDir = path.resolve(`./output/${safeName}`);

  console.log(`\n  Project : ${projectName}`);
  console.log(`  Output  : ${outputDir}`);
  console.log(`  URL     : ${vibeUrl.slice(0, 80)}…\n`);
  console.log(`${DIVIDER}\n`);

  // ── Run extraction ────────────────────────────────────────────────────────
  const startTime = Date.now();

  const result = await extractVibeProject({
    url: vibeUrl,
    outputDir,
    log: console.log,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${DIVIDER}`);
  console.log(`  Done in ${elapsed}s`);
  console.log(`  Saved : ${result.saved} / ${result.total} files`);
  if (result.failed > 0) console.log(`  Failed: ${result.failed} files`);
  console.log(`  Output: ${outputDir}`);
  console.log(`${DIVIDER}\n`);

  if (result.failed > 0) process.exit(1);

  // ── Diff + version + snapshot ─────────────────────────────────────────────
  // Looks for ./vibe-baseline/ at CWD. If absent → first run (do nothing,
  // /migrate will create it). If present → compute diff against new extraction,
  // bump version, snapshot, write pending manifest for /migrate Mode B.
  console.log(`${DIVIDER}`);
  console.log('  Version control');
  console.log(`${DIVIDER}`);
  try {
    runDiffAndVersion({
      extractedRawDir: outputDir,
      projectRoot: process.cwd(),
      level: bumpLevel,
      force,
    });
  } catch (err) {
    const code = err.code ? `[${err.code}] ` : '';
    console.error(`  ! Version control step failed: ${code}${err.message}`);
    console.error('    (Extraction itself succeeded — files are at ' + outputDir + ')');
    process.exit(1);
  }
  console.log(`${DIVIDER}\n`);
}

// ── Top-level: acquire lock, run main, release in finally ────────────────────
// projectRoot = CWD (where extraction artifacts land). Lock prevents two
// concurrent extractor runs from corrupting vibe-history.json / vibe-baseline/.
const projectRoot = process.cwd();
try {
  acquireLock({ projectRoot, command: 'vibe-extractor' });
} catch (err) {
  if (err instanceof ToolkitError && err.code === 'E_LOCK_HELD') {
    console.error('\n' + err.message);
    process.exit(2);
  }
  throw err;
}
installSignalHandlers({ projectRoot });

main()
  .catch(err => {
    console.error('\nFatal error:', err.message);
    process.exitCode = 1;
  })
  .finally(() => {
    releaseLock({ projectRoot });
  });
