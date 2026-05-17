#!/usr/bin/env node
/**
 * vibe-toolkit-doc CLI
 *
 * Generate docs/SYSTEM.md and docs/SYSTEM.docx for the VibePower2PowerCode
 * toolkit itself (NOT for a migrated user project — that's vibe-reporter's job).
 *
 * Usage:
 *   node vibe-toolkit-doc/index.js                  Generate both
 *   node vibe-toolkit-doc/index.js --md-only        Skip the .docx
 *   node vibe-toolkit-doc/index.js --out <folder>   Custom output folder (default: ./docs)
 *
 * Run from the toolkit's project root.
 */

import fs from 'fs';
import path from 'path';
import { systemModel } from './lib/system-model.js';
import { renderMarkdown } from './lib/render-md.js';

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
  vibe-toolkit-doc — generate the VibePower2PowerCode system documentation.

  Usage:
    node vibe-toolkit-doc/index.js [options]

  Options:
    --md-only             Generate SYSTEM.md only (no Word document)
    --out <folder>        Output folder (default: ./docs)
    --help, -h            Show this message

  Outputs:
    docs/SYSTEM.md        Markdown source (always)
    docs/SYSTEM.docx      Word document (unless --md-only)

  Note: this documents the TOOLKIT itself. For user-project docs use
        vibe-reporter (writes docs/PROJECT.md + docs/PROJECT.docx).
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
  console.log('  vibe-toolkit-doc — system documentation');
  console.log(DIVIDER);
  console.log(`  Model:     ${systemModel.name} v${systemModel.version}`);
  console.log(`  Nodes:     ${systemModel.nodes.length}`);
  console.log(`  Edges:     ${systemModel.edges.length}`);
  console.log(`  Flows:     ${systemModel.flows.length}`);
  console.log(`  Impact:    ${systemModel.impactAnalysis.length} entries`);

  // ── Markdown (always) ────────────────────────────────────────────────────
  const mdPath = path.join(outDir, 'SYSTEM.md');
  const md = renderMarkdown(systemModel);
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
      console.log('    Install: cd vibe-toolkit-doc && npm install');
      console.log(`    (cause: ${err.message})`);
      console.log(DIVIDER);
      console.log('');
      return;
    }
    try {
      const buf = await renderDocx(systemModel);
      const docxPath = path.join(outDir, 'SYSTEM.docx');
      fs.writeFileSync(docxPath, buf);
      console.log(`  ✓ Wrote ${path.relative(projectRoot, docxPath)} (${buf.length} bytes)`);
    } catch (err) {
      console.error(`  ! Failed to render Word document: ${err.message}`);
      console.error(`    ${err.stack?.split('\\n').slice(0, 3).join('\\n')}`);
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
