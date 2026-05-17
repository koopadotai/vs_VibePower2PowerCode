/**
 * registry.js — CRUD on the fleet config (fleet.config.json or registry.json).
 *
 * Loads + validates against fleetConfigSchema. Writes back through the same
 * validator so the file can never be left in an invalid state.
 *
 * Paths in registered project entries are stored as absolute (canonical) so
 * the registry can be opened from any CWD without re-resolving.
 */

import fs from 'fs';
import path from 'path';
import { fleetConfigSchema, parseFleetConfig } from './schemas.js';
import { ToolkitError, ERROR_CODES, formatZodIssues } from './errors.js';

export function loadRegistry(configPath) {
  if (!fs.existsSync(configPath)) {
    throw new ToolkitError(
      ERROR_CODES.E_FLEET_NOT_FOUND,
      `Fleet config not found at ${configPath}`,
      { configPath },
    );
  }
  return parseFleetConfig(fs.readFileSync(configPath, 'utf8'), configPath);
}

export function writeRegistry(configPath, data) {
  const validation = fleetConfigSchema.safeParse(data);
  if (!validation.success) {
    throw new ToolkitError(
      ERROR_CODES.E_FLEET_SCHEMA_INVALID,
      `Refusing to write invalid fleet config:\n${formatZodIssues(validation.error)}`,
      { configPath, issues: validation.error.issues },
    );
  }
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(validation.data, null, 2) + '\n', 'utf8');
}

export function createEmptyRegistry({ fleetName }) {
  return {
    fleetName,
    createdAt: new Date().toISOString(),
    projects: [],
  };
}

/**
 * Derive a default alias from a project path. Lowercased, last path
 * component, sanitised. Caller may override.
 */
export function deriveAlias(projectPath) {
  const base = path.basename(path.resolve(projectPath));
  return base.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'unnamed';
}

export function registerProject(registry, { alias, projectPath, tags }) {
  const abs = path.resolve(projectPath);
  // Guard: alias must be unique
  if (registry.projects.some(p => p.alias === alias)) {
    throw new ToolkitError(
      ERROR_CODES.E_PROJECT_ALREADY_REGISTERED,
      `Alias \`${alias}\` is already registered (path: ${registry.projects.find(p => p.alias === alias).path}).`,
      { alias },
    );
  }
  // Guard: path must look like a vibe-managed project
  const historyPath = path.join(abs, 'vibe-history.json');
  if (!fs.existsSync(historyPath)) {
    throw new ToolkitError(
      ERROR_CODES.E_PROJECT_INVALID,
      `Path \`${abs}\` does not contain vibe-history.json — not a vibe-managed project. ` +
      `Run vibe-extractor + /migrate at that path first.`,
      { path: abs, expected: 'vibe-history.json' },
    );
  }

  const entry = {
    alias,
    path: abs,
    registeredAt: new Date().toISOString(),
    ...(tags?.length ? { tags } : {}),
  };
  return { ...registry, projects: [...registry.projects, entry] };
}

export function unregisterProject(registry, alias) {
  const found = registry.projects.find(p => p.alias === alias);
  if (!found) {
    throw new ToolkitError(
      ERROR_CODES.E_PROJECT_NOT_REGISTERED,
      `No registered project with alias \`${alias}\`.`,
      { alias, registeredAliases: registry.projects.map(p => p.alias) },
    );
  }
  return { ...registry, projects: registry.projects.filter(p => p.alias !== alias) };
}

export function touchLastSeen(registry, alias) {
  return {
    ...registry,
    projects: registry.projects.map(p =>
      p.alias === alias ? { ...p, lastSeen: new Date().toISOString() } : p,
    ),
  };
}
