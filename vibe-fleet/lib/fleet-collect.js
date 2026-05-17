/**
 * fleet-collect.js — gather data for the fleet-wide report.
 *
 * For each registered project, runs probeProject() (state + health) plus
 * lightweight reads of CONTEXT.md and power.config.json so the aggregated
 * report can show env, app name, glossary excerpt, etc.
 *
 * Pure read-only: never takes a lock, never throws on missing files —
 * problem projects surface in their `health` / `warnings` fields.
 */

import fs from 'fs';
import path from 'path';
import { probeProject } from './probe.js';

function readTextSafely(p) {
  if (!fs.existsSync(p)) return null;
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function readJsonSafely(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function findPowerCodeProject(projectRoot) {
  if (!fs.existsSync(projectRoot)) return null;
  try {
    for (const ent of fs.readdirSync(projectRoot, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const p = path.join(projectRoot, ent.name, 'power.config.json');
      if (fs.existsSync(p)) return path.join(projectRoot, ent.name);
    }
  } catch { /* permission etc. */ }
  return null;
}

function summariseContextMd(contextMd) {
  if (!contextMd) return null;
  // Lift first paragraph after the title heading as a one-line summary.
  const lines = contextMd.split('\n');
  const titleIdx = lines.findIndex(l => l.startsWith('#'));
  if (titleIdx === -1) return contextMd.slice(0, 200);
  // Look for the first non-empty, non-heading line after the title.
  for (let i = titleIdx + 1; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l && !l.startsWith('#')) return l.slice(0, 240);
  }
  return null;
}

/**
 * @param {object} entry  Registry project entry { alias, path, tags?, registeredAt }
 * @returns {object}      Enriched project data for the report
 */
export function collectProject(entry) {
  const probe = probeProject(entry.path);
  const powerCodeDir = findPowerCodeProject(entry.path);
  const powerConfig = powerCodeDir
    ? readJsonSafely(path.join(powerCodeDir, 'power.config.json'))
    : null;
  const projectPkg = powerCodeDir
    ? readJsonSafely(path.join(powerCodeDir, 'package.json'))
    : null;
  const contextMd = readTextSafely(path.join(entry.path, 'CONTEXT.md'));

  return {
    alias: entry.alias,
    path: entry.path,
    tags: entry.tags ?? [],
    registeredAt: entry.registeredAt,
    probe,
    powerCodeDir: powerCodeDir ? path.relative(entry.path, powerCodeDir) : null,
    appDisplayName: powerConfig?.appDisplayName ?? null,
    environmentId: powerConfig?.environmentId ?? null,
    region: powerConfig?.region ?? null,
    appId: powerConfig?.appId ?? null,
    packageVersion: projectPkg?.version ?? null,
    dependencyCount: projectPkg ? Object.keys(projectPkg.dependencies ?? {}).length : null,
    contextSummary: summariseContextMd(contextMd),
  };
}

/**
 * @param {object} opts
 * @param {object} opts.registry  Loaded fleet registry
 * @param {string} opts.configPath
 * @param {string} opts.configSource
 * @returns {object} Bundle the renderers consume
 */
export function collectFleet({ registry, configPath, configSource }) {
  const projects = registry.projects.map(collectProject);

  const healthCounts = {};
  for (const p of projects) {
    const h = p.probe.health;
    healthCounts[h] = (healthCounts[h] ?? 0) + 1;
  }

  return {
    meta: {
      fleetName: registry.fleetName,
      fleetCreatedAt: registry.createdAt,
      generatedAt: new Date().toISOString(),
      configPath,
      configSource,
      projectCount: projects.length,
      healthCounts,
    },
    projects,
  };
}
