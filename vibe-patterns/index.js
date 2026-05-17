#!/usr/bin/env node
/**
 * vibe-patterns CLI
 *
 * Thin reader/applier for the patterns library. Most use is by the
 * /migrate skill reading these files directly, not by humans typing
 * commands. Provided for completeness + ad-hoc inspection.
 *
 * Usage:
 *   vibe-patterns list                          List all patterns
 *   vibe-patterns list <kind>                   Only one kind (field-mappings / connectors / adrs)
 *   vibe-patterns show <kind>/<name>            Print one pattern to stdout
 *   vibe-patterns apply adrs/<name> --to <dir>  Copy an ADR into a project's docs/adr/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PATTERNS_ROOT = __dirname;
const KINDS = ['field-mappings', 'connectors', 'adrs'];

// ── Helpers ─────────────────────────────────────────────────────────────────

function listDirSafe(p) {
  if (!fs.existsSync(p)) return [];
  try { return fs.readdirSync(p, { withFileTypes: true }); } catch { return []; }
}

function listPatterns(kind) {
  const dir = path.join(PATTERNS_ROOT, kind);
  return listDirSafe(dir)
    .filter(e => e.isFile() && (e.name.endsWith('.json') || e.name.endsWith('.md')))
    .map(e => e.name.replace(/\.(json|md)$/, ''));
}

function resolvePattern(kindAndName) {
  const [kind, name] = kindAndName.split('/');
  if (!KINDS.includes(kind)) {
    console.error(`  ! Unknown kind: ${kind}. Valid: ${KINDS.join(', ')}`);
    process.exit(1);
  }
  if (!name) {
    console.error(`  ! Expected <kind>/<name>, got "${kindAndName}".`);
    process.exit(1);
  }
  const ext = kind === 'adrs' ? '.md' : '.json';
  const file = path.join(PATTERNS_ROOT, kind, name + ext);
  if (!fs.existsSync(file)) {
    console.error(`  ! Pattern not found: ${kindAndName} (looked at ${file})`);
    process.exit(1);
  }
  return { kind, name, file };
}

// ── Commands ────────────────────────────────────────────────────────────────

function cmdList(filter) {
  const kinds = filter ? (KINDS.includes(filter) ? [filter] : []) : KINDS;
  if (filter && kinds.length === 0) {
    console.error(`  ! Unknown kind: ${filter}. Valid: ${KINDS.join(', ')}`);
    process.exit(1);
  }
  console.log('');
  for (const k of kinds) {
    const items = listPatterns(k);
    console.log(`${k}/  (${items.length})`);
    if (items.length === 0) {
      console.log('  (none)');
    } else {
      for (const name of items) console.log(`  ${name}`);
    }
    console.log('');
  }
}

function cmdShow(target) {
  if (!target) {
    console.error('  ! vibe-patterns show requires <kind>/<name>');
    process.exit(1);
  }
  const { file } = resolvePattern(target);
  process.stdout.write(fs.readFileSync(file, 'utf8'));
}

function cmdApply(target, toDir) {
  if (!target || !toDir) {
    console.error('  ! Usage: vibe-patterns apply <kind>/<name> --to <project-dir>');
    process.exit(1);
  }
  const { kind, name, file } = resolvePattern(target);
  if (kind !== 'adrs') {
    console.error('  ! Only adrs can be applied. Field-mappings + connectors are consumed by /migrate inline.');
    process.exit(1);
  }
  const adrDir = path.join(path.resolve(toDir), 'docs', 'adr');
  fs.mkdirSync(adrDir, { recursive: true });
  const destName = `0000-${name}.md`; // user can renumber after
  const dest = path.join(adrDir, destName);
  if (fs.existsSync(dest)) {
    console.error(`  ! ADR already exists at ${dest}. Rename or delete it first.`);
    process.exit(1);
  }
  fs.copyFileSync(file, dest);
  console.log(`  ✓ Applied ${target} → ${dest}`);
  console.log('    Renumber the ADR (rename 0000-… → next available NNNN-…) when you commit.');
}

// ── Main ────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
  vibe-patterns — shared knowledge base of reusable migration patterns

  Commands:
    list [kind]                          List all patterns (or only one kind)
    show <kind>/<name>                   Print a pattern
    apply adrs/<name> --to <dir>         Copy an ADR into a project's docs/adr/

  Kinds: ${KINDS.join(', ')}
  `);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    printHelp();
    return;
  }
  const command = argv[0];
  const positional = argv.slice(1).filter(a => !a.startsWith('--'));
  const toIdx = argv.indexOf('--to');
  const toDir = toIdx !== -1 ? argv[toIdx + 1] : null;

  switch (command) {
    case 'list':  return cmdList(positional[0]);
    case 'show':  return cmdShow(positional[0]);
    case 'apply': return cmdApply(positional[0], toDir);
    default:
      console.error(`  ! Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main();
