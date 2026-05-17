/**
 * diff-and-version.js — post-extraction diff, version bump, snapshot, history.
 *
 * Mechanical work only: decode source maps, hash files, compute diff, bump
 * version, rotate snapshots, write manifests. No AI reasoning, no network.
 *
 * Public entry point: runDiffAndVersion({ extractedRawDir, projectRoot, level, force })
 *
 * Outputs (all at projectRoot):
 *   ./vibe-source/                    — clean TS, replaces previous contents
 *   ./vibe-baseline/                  — clean TS, replaces previous contents
 *   ./vibe-baselines-snapshots/v.../  — preserved snapshot of the new baseline
 *   ./vibe-history.json               — appended audit entry
 *   ./vibe-pending-update.json        — diff manifest for /migrate Mode B to consume
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const SNAPSHOTS_DIR = 'vibe-baselines-snapshots';
const BASELINE_DIR = 'vibe-baseline';
const SOURCE_DIR = 'vibe-source';
const HISTORY_FILE = 'vibe-history.json';
const PENDING_FILE = 'vibe-pending-update.json';
const SNAPSHOT_KEEP = 3;

// ── Source-map decoding ─────────────────────────────────────────────────────

/**
 * Read a raw extracted file and return its clean TypeScript form.
 *
 * Vibe files are Vite-transformed: HMR boilerplate + the original source in a
 * base64 inline source map. We pull `sourcesContent[0]` out of the map.
 * Files with no source map and no HMR boilerplate are already clean — return
 * them as-is. Files with HMR but no map have unrecoverable original source;
 * we skip them (return null).
 */
function decodeOne(raw) {
  const mapMatch = raw.match(/\/\/# sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)/);
  if (mapMatch) {
    try {
      const json = Buffer.from(mapMatch[1], 'base64').toString('utf8');
      const map = JSON.parse(json);
      if (Array.isArray(map.sourcesContent) && map.sourcesContent.length > 0) {
        return map.sourcesContent[0];
      }
    } catch { /* fall through */ }
  }
  if (!raw.includes('__vite__createHotContext')) return raw;
  return null;
}

/**
 * Walk a raw extraction directory and return a Map<relPath, cleanContent>.
 * Skips the `generated/` folder (replaced during migration) and files we
 * cannot recover clean source for.
 */
export function extractCleanTree(rawDir) {
  const root = path.join(rawDir, 'src');
  if (!fs.existsSync(root)) return new Map();
  const out = new Map();
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      const rel = path.relative(rawDir, full).split(path.sep).join('/');
      if (ent.isDirectory()) {
        if (rel === 'src/generated' || rel.startsWith('src/generated/')) continue;
        walk(full);
        continue;
      }
      if (!/\.(tsx?|css)$/.test(ent.name)) continue;
      const raw = fs.readFileSync(full, 'utf8');
      const clean = decodeOne(raw);
      if (clean != null) out.set(rel, clean);
    }
  };
  walk(root);
  return out;
}

// ── Baseline I/O ────────────────────────────────────────────────────────────

function readBaseline(baselineDir) {
  const out = new Map();
  if (!fs.existsSync(baselineDir)) return out;
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) { walk(full); continue; }
      const rel = path.relative(baselineDir, full).split(path.sep).join('/');
      out.set(rel, fs.readFileSync(full, 'utf8'));
    }
  };
  walk(baselineDir);
  return out;
}

function writeTree(targetDir, tree) {
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
  for (const [rel, content] of tree) {
    const full = path.join(targetDir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }
}

// ── Hash + diff ─────────────────────────────────────────────────────────────

function hash(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function treeHash(tree) {
  // Hash of hashes — stable order, captures the whole-tree state in one value.
  const lines = [...tree.entries()]
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([rel, content]) => `${rel} ${hash(content)}`);
  return hash(lines.join('\n'));
}

function diffTrees(oldTree, newTree) {
  const added = [];
  const modified = [];
  const deleted = [];
  for (const [rel, content] of newTree) {
    if (!oldTree.has(rel)) { added.push(rel); continue; }
    if (oldTree.get(rel) !== content) modified.push(rel);
  }
  for (const rel of oldTree.keys()) {
    if (!newTree.has(rel)) deleted.push(rel);
  }
  added.sort(); modified.sort(); deleted.sort();
  return { added, modified, deleted };
}

// ── Versioning ──────────────────────────────────────────────────────────────

function bumpVersion(current, level) {
  const [maj, min, pat] = current.split('.').map(n => parseInt(n, 10));
  if (level === 'major') return `${maj + 1}.0.0`;
  if (level === 'patch') return `${maj}.${min}.${pat + 1}`;
  return `${maj}.${min + 1}.0`; // default: minor
}

function readHistory(historyPath) {
  if (!fs.existsSync(historyPath)) return null;
  try { return JSON.parse(fs.readFileSync(historyPath, 'utf8')); } catch { return null; }
}

function currentVersion(history) {
  if (!history?.versions?.length) return null;
  return history.versions[history.versions.length - 1].version;
}

// ── Snapshot rotation ───────────────────────────────────────────────────────

function rotateSnapshots(snapshotsDir, keep) {
  if (!fs.existsSync(snapshotsDir)) return;
  const versions = fs.readdirSync(snapshotsDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith('v'))
    .map(e => e.name)
    .sort(compareVersions);
  while (versions.length > keep) {
    const oldest = versions.shift();
    fs.rmSync(path.join(snapshotsDir, oldest), { recursive: true, force: true });
  }
}

function compareVersions(a, b) {
  const pa = a.replace(/^v/, '').split('.').map(n => parseInt(n, 10));
  const pb = b.replace(/^v/, '').split('.').map(n => parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

// ── Public entry ────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string} opts.extractedRawDir  Where the extractor just wrote raw files
 * @param {string} [opts.projectRoot]    Defaults to process.cwd()
 * @param {'minor'|'major'|'patch'} [opts.level]
 * @param {boolean} [opts.force]         Overwrite an existing pending manifest
 * @param {function} [opts.log]
 * @returns {{ status, version, diff?, snapshotPath? }}
 *   status: 'first-run' | 'no-changes' | 'pending-exists' | 'updated'
 */
export function runDiffAndVersion(opts) {
  const log = opts.log ?? console.log;
  const root = path.resolve(opts.projectRoot ?? process.cwd());
  const baselineDir = path.join(root, BASELINE_DIR);
  const sourceDir = path.join(root, SOURCE_DIR);
  const snapshotsDir = path.join(root, SNAPSHOTS_DIR);
  const historyPath = path.join(root, HISTORY_FILE);
  const pendingPath = path.join(root, PENDING_FILE);

  // Decode the new extraction.
  const newTree = extractCleanTree(opts.extractedRawDir);
  if (newTree.size === 0) {
    log('  ! No recoverable source files in extraction — nothing to compare.');
    return { status: 'no-changes', version: null };
  }

  // Always refresh ./vibe-source/ from the new extraction. Both /migrate modes
  // (A and B) read this path; the extractor is now the single producer of it.
  writeTree(sourceDir, newTree);

  // First run: no baseline yet. /migrate will create it.
  if (!fs.existsSync(baselineDir)) {
    log(`  i First run — no ./${BASELINE_DIR}/ yet. ${newTree.size} clean files written to ./${SOURCE_DIR}/.`);
    log('  i Run /migrate in Claude Code to begin the migration.');
    return { status: 'first-run', version: null };
  }

  // Refuse to overwrite a pending manifest unless forced.
  if (fs.existsSync(pendingPath) && !opts.force) {
    log(`  ! ./${PENDING_FILE} already exists from a previous extraction.`);
    log('    Run /migrate in Claude Code to apply it first, or re-run with --force to discard.');
    return { status: 'pending-exists', version: currentVersion(readHistory(historyPath)) };
  }

  // Compute the diff.
  const oldTree = readBaseline(baselineDir);
  const diff = diffTrees(oldTree, newTree);
  const noChange = diff.added.length === 0 && diff.modified.length === 0 && diff.deleted.length === 0;

  const history = readHistory(historyPath);
  const prevVersion = currentVersion(history) ?? '1.0.0';

  if (noChange) {
    log(`  ✓ No changes since v${prevVersion}.`);
    return { status: 'no-changes', version: prevVersion };
  }

  // Bump and snapshot.
  const newVersion = bumpVersion(prevVersion, opts.level ?? 'minor');
  const snapshotPath = path.join(snapshotsDir, `v${newVersion}`);
  writeTree(snapshotPath, newTree);
  rotateSnapshots(snapshotsDir, SNAPSHOT_KEEP);

  // Replace live baseline with the new content.
  writeTree(baselineDir, newTree);

  // Append history.
  const entry = {
    version: newVersion,
    extractedAt: new Date().toISOString(),
    fileCount: newTree.size,
    treeHash: treeHash(newTree),
    changedFiles: diff,
    snapshotPath: `${SNAPSHOTS_DIR}/v${newVersion}`,
    gitTag: `vibe-baseline-v${newVersion}`,
    note: '',
  };
  const nextHistory = history ?? { projectName: path.basename(root), versions: [] };
  nextHistory.versions.push(entry);
  fs.writeFileSync(historyPath, JSON.stringify(nextHistory, null, 2) + '\n', 'utf8');

  // Write pending manifest for /migrate Mode B.
  const pending = {
    fromVersion: prevVersion,
    toVersion: newVersion,
    extractedAt: entry.extractedAt,
    changedFiles: diff,
    sourceDir: SOURCE_DIR,
    baselineDir: BASELINE_DIR,
    snapshotPath: entry.snapshotPath,
  };
  fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2) + '\n', 'utf8');

  // Friendly summary.
  log('');
  log(`  ✓ v${prevVersion} → v${newVersion}`);
  log(`    +${diff.added.length} added, ~${diff.modified.length} modified, -${diff.deleted.length} deleted`);
  if (diff.added.length > 0) log(`    added:    ${diff.added.slice(0, 5).join(', ')}${diff.added.length > 5 ? ` (+${diff.added.length - 5} more)` : ''}`);
  if (diff.modified.length > 0) log(`    modified: ${diff.modified.slice(0, 5).join(', ')}${diff.modified.length > 5 ? ` (+${diff.modified.length - 5} more)` : ''}`);
  if (diff.deleted.length > 0) log(`    deleted:  ${diff.deleted.slice(0, 5).join(', ')}${diff.deleted.length > 5 ? ` (+${diff.deleted.length - 5} more)` : ''}`);
  log(`    snapshot: ./${SNAPSHOTS_DIR}/v${newVersion}/`);
  log(`    pending:  ./${PENDING_FILE}`);
  log('');
  log('  Next: run /migrate in Claude Code to apply these changes.');

  return { status: 'updated', version: newVersion, diff, snapshotPath };
}
