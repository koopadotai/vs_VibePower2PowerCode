/**
 * run-on-project.js — invoke a toolkit CLI against a registered project's path.
 *
 * Used by batch fleet commands (extract, verify). Each project's CLI is
 * spawned sequentially with the project path as the subprocess CWD so the
 * existing lock mechanism (vibe-lock at project root) protects against
 * concurrent fleet runs against the same project.
 *
 * Output is streamed live to the parent's stdout/stderr with a `[alias]`
 * prefix so the user can tell whose output is whose when scrolling.
 *
 * Sequential by design:
 *  - extract is interactive (Microsoft account sign-in per project)
 *  - verify pops a headed browser by default; parallel would flood the desktop
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOLKIT_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Resolve the path to a sibling CLI inside the toolkit checkout.
 * vibe-fleet/lib/run-on-project.js → ../../<name>/index.js
 */
export function siblingCli(name) {
  return path.join(TOOLKIT_ROOT, name, 'index.js');
}

/**
 * Spawn a node script with the project's cwd. Prefixes each output line
 * with `[alias]` for easy attribution in batch runs.
 *
 * @param {object} opts
 * @param {string} opts.alias        Project alias for output prefixing
 * @param {string} opts.projectPath  cwd for the subprocess
 * @param {string} opts.scriptPath   Absolute path to the node script to run
 * @param {string[]} [opts.args]     Extra args after the script
 * @param {object}  [opts.env]       Extra env vars merged into process.env
 * @returns {Promise<{ alias, exitCode, durationMs }>}
 */
export function runOnProject({ alias, projectPath, scriptPath, args = [], env = {} }) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const prefix = `[${alias}] `;
    const writePrefixed = (stream, chunk) => {
      const text = chunk.toString();
      // Prefix each non-empty line; preserve trailing newline behaviour.
      const lines = text.split(/(\r?\n)/);
      let out = '';
      for (let i = 0; i < lines.length; i++) {
        if (lines[i] === '\n' || lines[i] === '\r\n' || lines[i] === '') {
          out += lines[i];
        } else {
          out += prefix + lines[i];
        }
      }
      stream.write(out);
    };

    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: projectPath,
      env: { ...process.env, ...env },
      stdio: ['inherit', 'pipe', 'pipe'], // pipe stdout/stderr to prefix; share stdin
    });

    child.stdout.on('data', (c) => writePrefixed(process.stdout, c));
    child.stderr.on('data', (c) => writePrefixed(process.stderr, c));

    child.on('error', (err) => {
      process.stderr.write(`${prefix}spawn error: ${err.message}\n`);
      resolve({ alias, exitCode: -1, durationMs: Date.now() - startedAt, spawnError: err.message });
    });

    child.on('exit', (code, signal) => {
      const durationMs = Date.now() - startedAt;
      resolve({ alias, exitCode: code, signal, durationMs });
    });
  });
}

/**
 * Run a CLI across many projects, sequentially. Aborts the rest of the
 * sequence only if `stopOnFirstFailure` is true (default: false — finish
 * all projects so the developer sees the full picture).
 */
export async function runOnProjects({ projects, scriptPath, args = [], env = {}, log = console.log, stopOnFirstFailure = false }) {
  const results = [];
  for (const proj of projects) {
    log('');
    log(`──> ${proj.alias}  (${proj.path})`);
    const result = await runOnProject({
      alias: proj.alias,
      projectPath: proj.path,
      scriptPath,
      args,
      env,
    });
    results.push(result);
    if (result.exitCode !== 0 && stopOnFirstFailure) {
      log(`──> Stopping fleet run: ${proj.alias} exited ${result.exitCode}`);
      break;
    }
  }
  return results;
}

/**
 * Render a final summary table after a batch run.
 */
export function summariseBatchResults(results) {
  const out = [''];
  out.push('Batch summary:');
  out.push('');
  for (const r of results) {
    const icon = r.exitCode === 0 ? '✓' : (r.exitCode === 2 ? '⚠' : '✗');
    const secs = (r.durationMs / 1000).toFixed(1);
    let line = `  ${icon} ${r.alias.padEnd(20)} exit=${String(r.exitCode).padStart(3)}  ${secs.padStart(6)}s`;
    if (r.spawnError) line += `  (spawn error: ${r.spawnError})`;
    if (r.signal) line += `  (signal: ${r.signal})`;
    out.push(line);
  }
  const failed = results.filter(r => r.exitCode !== 0).length;
  const succeeded = results.length - failed;
  out.push('');
  out.push(`  ${succeeded}/${results.length} succeeded`);
  out.push('');
  return out.join('\n');
}
