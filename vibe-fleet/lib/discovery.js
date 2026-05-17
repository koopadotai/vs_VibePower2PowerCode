/**
 * discovery.js — locate the active fleet config.
 *
 * Resolution order:
 *   1. --config <path>  (explicit, highest priority)
 *   2. $FLEET_CONFIG    (env var)
 *   3. fleet.config.json found by walking up from CWD
 *   4. ~/.vibe-fleet/registry.json (per-user default)
 *
 * If none exists, returns the home-default path WITHOUT creating it —
 * `vibe-fleet init` is the only command that creates new configs.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { ToolkitError, ERROR_CODES } from './errors.js';

export const FLEET_CONFIG_BASENAME = 'fleet.config.json';
const HOME_DEFAULT_DIR = '.vibe-fleet';
const HOME_DEFAULT_FILE = 'registry.json';

export function homeDefaultPath() {
  return path.join(os.homedir(), HOME_DEFAULT_DIR, HOME_DEFAULT_FILE);
}

function walkUpForConfig(startDir) {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;
  while (true) {
    const candidate = path.join(dir, FLEET_CONFIG_BASENAME);
    if (fs.existsSync(candidate)) return candidate;
    if (dir === root) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Resolve the active fleet config path. Does NOT validate existence
 * unless `requireExists` is true (used by commands that need to read).
 *
 * @param {object} opts
 * @param {string} [opts.configFlag]  Explicit --config value
 * @param {string} [opts.startDir]    Defaults to process.cwd()
 * @param {boolean} [opts.requireExists]  Throw E_FLEET_NOT_FOUND if none found
 * @returns {{ path: string, source: 'flag'|'env'|'walked-up'|'home-default' }}
 */
export function resolveFleetConfigPath({
  configFlag,
  startDir = process.cwd(),
  requireExists = false,
} = {}) {
  // 1. Explicit flag
  if (configFlag) {
    const abs = path.resolve(configFlag);
    if (requireExists && !fs.existsSync(abs)) {
      throw new ToolkitError(
        ERROR_CODES.E_FLEET_NOT_FOUND,
        `No fleet config at ${abs} (specified via --config).`,
        { resolvedFrom: 'flag', path: abs },
      );
    }
    return { path: abs, source: 'flag' };
  }

  // 2. Env var
  if (process.env.FLEET_CONFIG) {
    const abs = path.resolve(process.env.FLEET_CONFIG);
    if (requireExists && !fs.existsSync(abs)) {
      throw new ToolkitError(
        ERROR_CODES.E_FLEET_NOT_FOUND,
        `No fleet config at ${abs} (FLEET_CONFIG env var).`,
        { resolvedFrom: 'env', path: abs },
      );
    }
    return { path: abs, source: 'env' };
  }

  // 3. Walk up looking for fleet.config.json
  const walked = walkUpForConfig(startDir);
  if (walked) return { path: walked, source: 'walked-up' };

  // 4. Home default
  const home = homeDefaultPath();
  if (requireExists && !fs.existsSync(home)) {
    throw new ToolkitError(
      ERROR_CODES.E_FLEET_NOT_FOUND,
      `No fleet config found.\n` +
      `  Searched: --config flag, FLEET_CONFIG env, walk-up from ${startDir}, ${home}\n` +
      `\n` +
      `Run \`vibe-fleet init <name>\` to create one.`,
      { resolvedFrom: 'none', searched: { flag: false, env: false, walkedUpFrom: startDir, home } },
    );
  }
  return { path: home, source: 'home-default' };
}
