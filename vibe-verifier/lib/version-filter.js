/**
 * version-filter.js — resolve test scope flags to a list of spec folders.
 *
 * Reads ./tests/specs/ to find available version folders (vX.Y.Z), cross-
 * references with ./vibe-history.json so we know which version is "latest",
 * and produces the list of folders to hand to Playwright.
 */

import fs from 'fs';
import path from 'path';

const SPECS_ROOT = 'tests/specs';
const HISTORY_FILE = 'vibe-history.json';

function compareVersions(a, b) {
  const pa = a.replace(/^v/, '').split('.').map(n => parseInt(n, 10));
  const pb = b.replace(/^v/, '').split('.').map(n => parseInt(n, 10));
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

function listVersionFolders(projectRoot) {
  const root = path.join(projectRoot, SPECS_ROOT);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(e => e.isDirectory() && /^v\d+\.\d+\.\d+$/.test(e.name))
    .map(e => e.name)
    .sort(compareVersions);
}

function latestFromHistory(projectRoot) {
  const p = path.join(projectRoot, HISTORY_FILE);
  if (!fs.existsSync(p)) return null;
  try {
    const h = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!h.versions?.length) return null;
    return h.versions[h.versions.length - 1].version;
  } catch { return null; }
}

/**
 * @param {object} opts
 * @param {string} [opts.projectRoot]  Defaults to CWD
 * @param {'all'|'latest'|string} opts.scope  'all' | 'latest' | 'v1.0.0' (since)
 * @returns {{ folders: string[], versions: string[], latestVersion: string|null }}
 */
export function resolveScope({ projectRoot = process.cwd(), scope }) {
  // Validate scope shape FIRST so typos surface even when no specs exist yet.
  const validScope =
    scope === 'all' ||
    scope === 'latest' ||
    (typeof scope === 'string' && /^v?\d+\.\d+\.\d+$/.test(scope));
  if (!validScope) {
    throw new Error(`Unknown scope: ${scope}. Use 'all', 'latest', or 'vX.Y.Z'.`);
  }

  const folders = listVersionFolders(projectRoot);
  const latestVersion = latestFromHistory(projectRoot);

  if (folders.length === 0) {
    return { folders: [], versions: [], latestVersion };
  }

  let selected;
  if (scope === 'all') {
    selected = folders;
  } else if (scope === 'latest') {
    // Prefer the version from vibe-history.json (source of truth); fall back to highest folder.
    const target = latestVersion ? `v${latestVersion}` : folders[folders.length - 1];
    selected = folders.includes(target) ? [target] : [folders[folders.length - 1]];
  } else {
    // "since v1.0.0" — include this version and all later ones.
    const from = scope.startsWith('v') ? scope : `v${scope}`;
    selected = folders.filter(v => compareVersions(v, from) >= 0);
  }

  const fullFolders = selected.map(v => path.join(projectRoot, SPECS_ROOT, v));
  return { folders: fullFolders, versions: selected, latestVersion };
}
