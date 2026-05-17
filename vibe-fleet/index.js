#!/usr/bin/env node
/**
 * vibe-fleet CLI
 *
 * Multi-project orchestration for VibePower2PowerCode. Maintains a registry
 * of migrated projects and shows their state on one screen.
 *
 * Usage:
 *   vibe-fleet init <name>             Create a fleet config in CWD
 *   vibe-fleet init <name> --global    Create at ~/.vibe-fleet/registry.json
 *   vibe-fleet register <path> [--alias X] [--tag T1 --tag T2]
 *   vibe-fleet unregister <alias>
 *   vibe-fleet status                  Show all projects + health
 *   vibe-fleet doctor                  Validate every registered project's manifests
 *   vibe-fleet list                    Print just the alias→path mapping
 *   vibe-fleet --config <path> <cmd>   Use a specific fleet config
 *
 * Resolution order for fleet config:
 *   1. --config <path>
 *   2. $FLEET_CONFIG env var
 *   3. ./fleet.config.json (walking up from CWD)
 *   4. ~/.vibe-fleet/registry.json
 */

import fs from 'fs';
import path from 'path';
import { resolveFleetConfigPath, homeDefaultPath, FLEET_CONFIG_BASENAME } from './lib/discovery.js';
import {
  loadRegistry, writeRegistry, createEmptyRegistry,
  registerProject, unregisterProject, deriveAlias,
} from './lib/registry.js';
import { probeProject } from './lib/probe.js';
import { renderStatus } from './lib/render-status.js';
import { ToolkitError, ERROR_CODES } from './lib/errors.js';

const DIVIDER = '═'.repeat(58);

// ── Flag parser ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { command: null, positional: [], config: null, alias: null, tags: [], global: false, help: false };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--config')       { out.config = argv[++i]; }
    else if (a === '--alias')   { out.alias = argv[++i]; }
    else if (a === '--tag')     { out.tags.push(argv[++i]); }
    else if (a === '--global')  { out.global = true; }
    else if (a === '--help' || a === '-h') { out.help = true; }
    else if (out.command == null) { out.command = a; }
    else { out.positional.push(a); }
    i++;
  }
  return out;
}

function printHelp() {
  console.log(`
  vibe-fleet — multi-project orchestration for VibePower2PowerCode

  Commands:
    init <name> [--global]            Create a new fleet config
    register <path> [--alias X] [--tag T]
                                      Add a project to the fleet
    unregister <alias>                Remove a project
    status                            Show all projects + health (default)
    doctor                            Validate every project's manifests
    list                              Print alias → path mapping

  Global options:
    --config <path>                   Use a specific fleet config
    --help, -h                        Show this message

  Config discovery (in order):
    1. --config <path>
    2. \$FLEET_CONFIG env var
    3. ./fleet.config.json (walk up from CWD)
    4. ~/.vibe-fleet/registry.json
  `);
}

// ── Command implementations ────────────────────────────────────────────────

function cmdInit({ args }) {
  const fleetName = args.positional[0];
  if (!fleetName) {
    console.error('  ! vibe-fleet init requires a name. Example: vibe-fleet init "ACME migrations"');
    process.exit(1);
  }
  let configPath;
  if (args.global) {
    configPath = homeDefaultPath();
  } else if (args.config) {
    configPath = path.resolve(args.config);
  } else {
    configPath = path.join(process.cwd(), FLEET_CONFIG_BASENAME);
  }
  if (fs.existsSync(configPath)) {
    console.error(`  ! Fleet config already exists at ${configPath}.`);
    console.error('    Choose a different location or delete the existing one first.');
    process.exit(1);
  }
  const registry = createEmptyRegistry({ fleetName });
  writeRegistry(configPath, registry);
  console.log('');
  console.log(`  ✓ Created fleet config at ${configPath}`);
  console.log(`    Fleet name: "${fleetName}"`);
  console.log('');
  console.log('  Next: register your first project with');
  console.log(`    vibe-fleet register <path-to-project>`);
}

function cmdRegister({ args, configPath }) {
  const targetPath = args.positional[0];
  if (!targetPath) {
    console.error('  ! vibe-fleet register requires a path.');
    process.exit(1);
  }
  const registry = loadRegistry(configPath);
  const alias = args.alias ?? deriveAlias(targetPath);
  const updated = registerProject(registry, {
    alias,
    projectPath: targetPath,
    tags: args.tags,
  });
  writeRegistry(configPath, updated);
  console.log('');
  console.log(`  ✓ Registered \`${alias}\``);
  console.log(`    Path:   ${path.resolve(targetPath)}`);
  if (args.tags.length) console.log(`    Tags:   ${args.tags.join(', ')}`);
  console.log(`    Total projects in fleet: ${updated.projects.length}`);
}

function cmdUnregister({ args, configPath }) {
  const alias = args.positional[0];
  if (!alias) {
    console.error('  ! vibe-fleet unregister requires an alias.');
    process.exit(1);
  }
  const registry = loadRegistry(configPath);
  const updated = unregisterProject(registry, alias);
  writeRegistry(configPath, updated);
  console.log('');
  console.log(`  ✓ Unregistered \`${alias}\``);
  console.log(`    Total projects in fleet: ${updated.projects.length}`);
}

function cmdList({ configPath, configSource }) {
  const registry = loadRegistry(configPath);
  console.log('');
  console.log(`Fleet: ${registry.fleetName}  (config: ${configPath}, via ${configSource})`);
  console.log('');
  if (registry.projects.length === 0) {
    console.log('  (no projects registered)');
  } else {
    for (const p of registry.projects) {
      console.log(`  ${p.alias.padEnd(24)}  ${p.path}`);
    }
  }
  console.log('');
}

function cmdStatus({ configPath, configSource }) {
  const registry = loadRegistry(configPath);
  const probes = registry.projects.map(p => probeProject(p.path));
  process.stdout.write(renderStatus({ registry, configPath, configSource, probes }));
}

function cmdDoctor({ configPath, configSource }) {
  const registry = loadRegistry(configPath);
  console.log('');
  console.log(`Doctor — validating ${registry.projects.length} project(s) in ${registry.fleetName}`);
  console.log(`(config: ${configPath}, via ${configSource})`);
  console.log('');
  let healthy = 0;
  let withWarnings = 0;
  for (const proj of registry.projects) {
    const probe = probeProject(proj.path);
    if (probe.health === 'ok') {
      console.log(`  ✓ ${proj.alias.padEnd(24)} (${probe.path})`);
      healthy++;
    } else {
      console.log(`  ⚠ ${proj.alias.padEnd(24)} (${probe.path})  [${probe.health}]`);
      for (const w of probe.warnings) console.log(`      ${w}`);
      withWarnings++;
    }
  }
  console.log('');
  console.log(`  Summary: ${healthy} healthy, ${withWarnings} with warnings`);
  if (withWarnings > 0) process.exitCode = 1;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); return; }

  const command = args.command ?? 'status';

  // `init` doesn't need an existing config; the others do.
  if (command === 'init') {
    return cmdInit({ args });
  }

  let resolved;
  try {
    resolved = resolveFleetConfigPath({
      configFlag: args.config,
      requireExists: true,
    });
  } catch (err) {
    if (err instanceof ToolkitError && err.code === ERROR_CODES.E_FLEET_NOT_FOUND) {
      console.error('\n' + err.message);
      process.exit(2);
    }
    throw err;
  }
  const ctx = { args, configPath: resolved.path, configSource: resolved.source };

  switch (command) {
    case 'register':   return cmdRegister(ctx);
    case 'unregister': return cmdUnregister(ctx);
    case 'list':       return cmdList(ctx);
    case 'status':     return cmdStatus(ctx);
    case 'doctor':     return cmdDoctor(ctx);
    default:
      console.error(`  ! Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch(err => {
  if (err instanceof ToolkitError) {
    console.error(`\n[${err.code}] ${err.message}`);
    process.exit(2);
  }
  console.error('\nFatal:', err.stack ?? err.message);
  process.exit(1);
});
