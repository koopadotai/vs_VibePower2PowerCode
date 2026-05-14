#!/usr/bin/env node
/**
 * Vibe Source Extractor CLI
 *
 * Usage:
 *   node index.js                         ← interactive prompts
 *   node index.js <project-name> <url>    ← non-interactive
 *
 * Example:
 *   node index.js dice-game "https://vibe.powerapps.com/e/.../app"
 */

import readline from 'readline';
import path from 'path';
import { extractVibeProject } from './extractor.js';

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

  // ── Collect inputs ────────────────────────────────────────────────────────
  let projectName = process.argv[2]?.trim();
  let vibeUrl     = process.argv[3]?.trim();

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
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
