/**
 * collect.js — gather all data needed for the migration report from the project.
 *
 * Reads (gracefully — missing files become empty sections):
 *   vibe-history.json       — version history
 *   vibe-migration.json     — file ownership manifest
 *   CONTEXT.md              — glossary + field mappings
 *   docs/adr/               — architecture decisions
 *   [ProjectName]/package.json     — current version, project name, deps
 *   [ProjectName]/src/generated/   — Dataverse models, services
 *   [ProjectName]/.power/schemas/appschemas/dataSourcesInfo.ts — connectors
 *
 * Returns a plain object that the markdown and docx renderers consume.
 */

import fs from 'fs';
import path from 'path';
import { parseHistory, parseMigration } from './schemas.js';

function readJsonSafe(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

/**
 * Read + validate a project-state JSON file. Returns null if the file is
 * missing OR if validation fails (the reporter is read-only and should
 * degrade gracefully — log a warning, continue with empty sections).
 */
function readValidated(p, parser, label) {
  if (!fs.existsSync(p)) return null;
  try {
    return parser(fs.readFileSync(p, 'utf8'), p);
  } catch (err) {
    // Surface but don't crash — generation must succeed even with partial data.
    console.warn(`  ! ${label} failed validation at ${p}: ${err.code ?? err.message}`);
    if (err.details?.issues) {
      for (const issue of err.details.issues.slice(0, 5)) {
        console.warn(`    ${issue.path.join('.') || '(root)'}: ${issue.message}`);
      }
    }
    return null;
  }
}

function readTextSafe(p) {
  if (!fs.existsSync(p)) return null;
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function listDirSafe(p) {
  if (!fs.existsSync(p)) return [];
  try { return fs.readdirSync(p, { withFileTypes: true }); } catch { return []; }
}

/**
 * Find the Power Code project folder (the one with power.config.json).
 * Returns its absolute path, or null.
 */
function findPowerCodeProject(projectRoot) {
  for (const ent of listDirSafe(projectRoot)) {
    if (!ent.isDirectory()) continue;
    const p = path.join(projectRoot, ent.name, 'power.config.json');
    if (fs.existsSync(p)) return path.join(projectRoot, ent.name);
  }
  return null;
}

/**
 * Pull the field-mapping block out of CONTEXT.md if present.
 * Heuristic: lines after a "## Field Mappings" (or similar) heading.
 */
function parseFieldMappings(contextMd) {
  if (!contextMd) return null;
  const match = contextMd.match(/##+\s*(Field Mappings?|Mappings?)[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i);
  return match ? match[2].trim() : null;
}

function parseGlossary(contextMd) {
  if (!contextMd) return null;
  const match = contextMd.match(/##+\s*(Glossary|Terms?)[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i);
  return match ? match[2].trim() : null;
}

/**
 * Read ADR files (docs/adr/*.md) and return them as { filename, title, body }.
 */
function readAdrs(projectRoot) {
  const dir = path.join(projectRoot, 'docs', 'adr');
  const out = [];
  for (const ent of listDirSafe(dir)) {
    if (!ent.isFile() || !ent.name.endsWith('.md')) continue;
    const body = readTextSafe(path.join(dir, ent.name)) ?? '';
    const titleMatch = body.match(/^#\s+(.+)$/m);
    out.push({
      filename: ent.name,
      title: titleMatch ? titleMatch[1] : ent.name.replace(/\.md$/, ''),
      body,
    });
  }
  out.sort((a, b) => a.filename.localeCompare(b.filename));
  return out;
}

/**
 * Extract connector names from dataSourcesInfo.ts by reading the object keys.
 * Best-effort regex parse; if it fails, returns an empty list.
 */
function readConnectors(powerCodeDir) {
  if (!powerCodeDir) return [];
  const p = path.join(powerCodeDir, '.power', 'schemas', 'appschemas', 'dataSourcesInfo.ts');
  const text = readTextSafe(p);
  if (!text) return [];
  const names = new Set();
  // Match keys in the top-level dataSourcesInfo object.
  const re = /['"]([a-zA-Z_][a-zA-Z0-9_-]*)['"]\s*:\s*\{[\s\S]*?apis\s*:/g;
  let m;
  while ((m = re.exec(text)) !== null) names.add(m[1]);
  return [...names];
}

/**
 * List generated Dataverse models by scanning src/generated/models/.
 */
function readModels(powerCodeDir) {
  if (!powerCodeDir) return [];
  const dir = path.join(powerCodeDir, 'src', 'generated', 'models');
  return listDirSafe(dir)
    .filter(e => e.isFile() && /\.(ts|tsx)$/.test(e.name))
    .map(e => e.name.replace(/\.tsx?$/, ''));
}

/**
 * Read top-level package.json fields from the Power Code project.
 */
function readProjectPackage(powerCodeDir) {
  if (!powerCodeDir) return null;
  const pkg = readJsonSafe(path.join(powerCodeDir, 'package.json'));
  if (!pkg) return null;
  return {
    name: pkg.name,
    version: pkg.version,
    dependencies: Object.keys(pkg.dependencies ?? {}),
    devDependencies: Object.keys(pkg.devDependencies ?? {}),
  };
}

/**
 * @param {object} [opts]
 * @param {string} [opts.projectRoot]  Defaults to CWD
 * @returns {object}  The complete data bundle for renderers
 */
export function collect({ projectRoot = process.cwd() } = {}) {
  const history = readValidated(path.join(projectRoot, 'vibe-history.json'), parseHistory, 'vibe-history.json');
  const migration = readValidated(path.join(projectRoot, 'vibe-migration.json'), parseMigration, 'vibe-migration.json');
  const contextMd = readTextSafe(path.join(projectRoot, 'CONTEXT.md'));
  const powerCodeDir = findPowerCodeProject(projectRoot);
  const powerConfig = powerCodeDir ? readJsonSafe(path.join(powerCodeDir, 'power.config.json')) : null;
  const projectPkg = readProjectPackage(powerCodeDir);

  const projectName =
    history?.projectName
    ?? migration?.projectName
    ?? projectPkg?.name
    ?? (powerCodeDir ? path.basename(powerCodeDir) : 'Untitled Project');

  const currentVersion = projectPkg?.version ?? history?.versions?.at(-1)?.version ?? '1.0.0';

  return {
    meta: {
      projectName,
      currentVersion,
      generatedAt: new Date().toISOString(),
      projectRoot,
      powerCodeDir: powerCodeDir ? path.relative(projectRoot, powerCodeDir) : null,
    },
    powerConfig: powerConfig
      ? {
          environmentId: powerConfig.environmentId,
          region: powerConfig.region,
          appId: powerConfig.appId,
          appDisplayName: powerConfig.appDisplayName,
        }
      : null,
    history: history?.versions ?? [],
    ownership: migration
      ? {
          vibeOwned: migration.vibeOwned ?? [],
          migrationOwned: migration.migrationOwned ?? [],
          requiresReview: migration.requiresReview ?? [],
          migratedAt: migration.migratedAt,
        }
      : null,
    context: {
      full: contextMd,
      fieldMappings: parseFieldMappings(contextMd),
      glossary: parseGlossary(contextMd),
    },
    adrs: readAdrs(projectRoot),
    connectors: readConnectors(powerCodeDir),
    models: readModels(powerCodeDir),
    dependencies: projectPkg?.dependencies ?? [],
    devDependencies: projectPkg?.devDependencies ?? [],
  };
}
