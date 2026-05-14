/**
 * save-files.js
 * Reads the JSON produced by the browser console snippet and saves
 * each file to disk under ./dice-game-source/ preserving folder structure.
 *
 * Usage:
 *   1. Paste clipboard into files.json  (or pipe: pbpaste > files.json)
 *   2. node save-files.js [files.json] [outputDir]
 */

import fs from 'fs';
import path from 'path';

const INPUT  = process.argv[2] ?? 'files.json';
const OUTPUT = path.resolve(process.argv[3] ?? './dice-game-source');

if (!fs.existsSync(INPUT)) {
  console.error(`File not found: ${INPUT}`);
  console.error('Usage: node save-files.js <files.json> [outputDir]');
  process.exit(1);
}

const files = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
console.log(`\nSaving ${files.length} files → ${OUTPUT}\n`);

let saved = 0;
for (const { path: relPath, content } of files) {
  if (!relPath || !content) continue;

  // Normalise separators and strip any leading slash
  const clean = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts  = clean.split('/').map(p => p.replace(/[<>:"|?*\x00-\x1f]/g, '_'));
  const full   = path.join(OUTPUT, ...parts);

  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  console.log(`  ✔  ${clean}`);
  saved++;
}

console.log(`\nDone. ${saved} files saved to: ${OUTPUT}\n`);
