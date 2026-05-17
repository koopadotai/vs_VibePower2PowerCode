#!/usr/bin/env node
/**
 * Vibe Reporter CLI
 *
 * Generate comprehensive project documentation (Markdown + Word) for a
 * migrated Power Code project. Reads vibe-history.json, vibe-migration.json,
 * CONTEXT.md, docs/adr/, and the Power Code project itself.
 *
 * Usage:
 *   node vibe-reporter/index.js                  Generate both PROJECT.md and PROJECT.docx
 *   node vibe-reporter/index.js --md-only        Skip the .docx (no docx dep needed)
 *   node vibe-reporter/index.js --out ./docs     Custom output folder (default: ./docs)
 *
 * Expects to run from the project root (the folder with vibe-history.json).
 */

import fs from 'fs';
import path from 'path';
import { collect } from './lib/collect.js';
import { renderMarkdown } from './lib/render-markdown.js';

const DIVIDER = '═'.repeat(58);

function parseFlags(argv) {
  const flags = { mdOnly: false, out: 'docs', help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--md-only') flags.mdOnly = true;
    else if (a === '--out') flags.out = argv[++i];
    else if (a === '--help' || a === '-h') flags.help = true;
  }
  return flags;
}

function printHelp() {
  console.log(`
  Vibe Reporter — generate project documentation from vibe-history.json + Power Code project.

  Usage:
    node vibe-reporter/index.js [options]

  Options:
    --md-only             Generate PROJECT.md only (no Word document)
    --out <folder>        Output folder (default: ./docs)
    --help, -h            Show this message

  Outputs:
    docs/PROJECT.md       Markdown source (always)
    docs/PROJECT.docx     Word document (unless --md-only)
  `);
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help) { printHelp(); return; }

  const projectRoot = process.cwd();
  const outDir = path.resolve(projectRoot, flags.out);
  fs.mkdirSync(outDir, { recursive: true });

  console.log('');
  console.log(DIVIDER);
  console.log('  Vibe Reporter — project documentation');
  console.log(DIVIDER);

  // ── Collect ──────────────────────────────────────────────────────────────
  console.log('  Collecting…');
  const data = collect({ projectRoot });
  console.log(`    Project:  ${data.meta.projectName} @ v${data.meta.currentVersion}`);
  console.log(`    History:  ${data.history.length} version${data.history.length === 1 ? '' : 's'}`);
  console.log(`    Models:   ${data.models.length}`);
  console.log(`    ADRs:     ${data.adrs.length}`);
  console.log(`    Connectors: ${data.connectors.length}`);

  // ── Markdown (always) ────────────────────────────────────────────────────
  const mdPath = path.join(outDir, 'PROJECT.md');
  const md = renderMarkdown(data);
  fs.writeFileSync(mdPath, md, 'utf8');
  console.log('');
  console.log(`  ✓ Wrote ${path.relative(projectRoot, mdPath)} (${md.length} chars)`);

  // ── DOCX (unless --md-only) ──────────────────────────────────────────────
  if (!flags.mdOnly) {
    let renderDocx;
    try {
      ({ renderDocx } = await import('./lib/render-docx.js'));
    } catch (err) {
      console.log('');
      console.log('  ! docx library not available — skipping Word output.');
      console.log('    Install: cd vibe-reporter && npm install');
      console.log(`    (cause: ${err.message})`);
      console.log(DIVIDER);
      console.log('');
      return;
    }
    try {
      const buf = await renderDocx(data);
      const docxPath = path.join(outDir, 'PROJECT.docx');
      fs.writeFileSync(docxPath, buf);
      console.log(`  ✓ Wrote ${path.relative(projectRoot, docxPath)} (${buf.length} bytes)`);
    } catch (err) {
      console.error(`  ! Failed to render Word document: ${err.message}`);
      console.error('    The Markdown was still written successfully.');
    }
  }

  console.log(DIVIDER);
  console.log('');
}

main().catch(err => {
  console.error('\nFatal error:', err.stack || err.message);
  process.exit(1);
});
