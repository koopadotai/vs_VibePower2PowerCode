/**
 * runner.js — invoke Playwright against the resolved spec folders, parse the
 * JSON report, and structure failures for the GitHub reporter.
 *
 * Shells out to `npx playwright test` rather than calling Playwright
 * programmatically — keeps us decoupled from internal API churn.
 *
 * The spawn uses cwd=vibe-verifier/ so npx finds the playwright package in
 * vibe-verifier/node_modules. All other paths (config, spec folders, output)
 * are passed as absolute so Playwright resolves them correctly.
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseHistory, vibeHistorySchema } from './schemas.js';
import { ToolkitError, ERROR_CODES, formatZodIssues } from './errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERIFIER_DIR = path.resolve(__dirname, '..');

const REPORTS_ROOT = 'tests/results';
const HISTORY_FILE = 'vibe-history.json';

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

/**
 * Recursive walk to flatten the Playwright JSON suite tree into spec entries.
 */
function flattenSuites(suites, parentTitle = '') {
  const out = [];
  for (const s of suites ?? []) {
    const title = parentTitle ? `${parentTitle} › ${s.title}` : s.title;
    for (const spec of s.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const result = t.results?.[0];
        out.push({
          describe: title,
          name: spec.title,
          file: spec.file,
          line: spec.line,
          status: result?.status ?? 'unknown',
          duration: result?.duration ?? 0,
          error: result?.error?.message ?? null,
          stack: result?.error?.stack ?? null,
          attachments: result?.attachments ?? [],
        });
      }
    }
    if (s.suites?.length) out.push(...flattenSuites(s.suites, title));
  }
  return out;
}

function pickAttachment(attachments, name) {
  const a = attachments?.find(x => x.name === name);
  return a?.path ?? null;
}

function extractVersionFromFile(file) {
  // tests/specs/v1.1.0/foo.spec.ts → 1.1.0
  const m = file?.match(/[\\/](v\d+\.\d+\.\d+)[\\/]/);
  return m ? m[1].slice(1) : 'unknown';
}

/**
 * @param {object} opts
 * @param {string[]} opts.specFolders   Absolute paths to version spec folders
 * @param {string}   opts.versionLabel  Label for output dir (e.g. "v1.1.0" or "all")
 * @param {string}   opts.appUrl        baseURL for Playwright (deployed player URL)
 * @param {string}   opts.storageState  Path to saved auth state
 * @param {boolean}  [opts.headless]    Default false (we want the window)
 * @param {string}   [opts.projectRoot] Defaults to CWD
 * @param {function} [opts.log]
 * @returns {{ passed, failed, skipped, durationMs, failures, reportPath, outputDir }}
 */
export function runPlaywright(opts) {
  const log = opts.log ?? console.log;
  const projectRoot = opts.projectRoot ?? process.cwd();
  const stamp = todayStamp();
  const outputDir = path.join(projectRoot, REPORTS_ROOT, opts.versionLabel, stamp);
  ensureDir(outputDir);
  const reportPath = path.join(outputDir, 'report.json');

  const env = {
    ...process.env,
    VIBE_VERIFY_BASE_URL: opts.appUrl,
    VIBE_VERIFY_STORAGE_STATE: opts.storageState ?? '',
    VIBE_VERIFY_OUTPUT_DIR: outputDir,
    PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
  };

  const args = [
    'playwright', 'test',
    '--config', path.join(projectRoot, 'tests', 'playwright.config.ts'),
    '--reporter', `list,json`,
    ...(opts.headless ? [] : ['--headed']),
    ...opts.specFolders,
  ];

  log(`  Running: npx ${args.join(' ')}`);
  log('');

  // Spawn from vibe-verifier/ so npx finds playwright in vibe-verifier/node_modules.
  // All paths in args + env are absolute, so cwd only affects package resolution.
  const result = spawnSync('npx', args, {
    cwd: VERIFIER_DIR,
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  });

  // Playwright exits non-zero on test failure — that's not a runner error.
  // We rely on the JSON report to know what actually happened.
  if (!fs.existsSync(reportPath)) {
    throw new ToolkitError(
      ERROR_CODES.E_PLAYWRIGHT_NO_REPORT,
      `Playwright did not produce a report at ${reportPath} (exit code ${result.status})`,
      { reportPath, exitCode: result.status },
    );
  }

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const tests = flattenSuites(report.suites);

  let passed = 0, failed = 0, skipped = 0;
  const failures = [];

  for (const t of tests) {
    if (t.status === 'passed' || t.status === 'expected') passed++;
    else if (t.status === 'skipped') skipped++;
    else {
      failed++;
      failures.push({
        testName: `${t.describe} — ${t.name}`,
        file: path.relative(projectRoot, t.file).replace(/\\/g, '/'),
        line: t.line,
        version: extractVersionFromFile(t.file),
        error: t.error || t.stack,
        screenshotPath: pickAttachment(t.attachments, 'screenshot'),
        tracePath: pickAttachment(t.attachments, 'trace'),
      });
    }
  }

  return {
    passed,
    failed,
    skipped,
    durationMs: report.stats?.duration ?? 0,
    failures,
    reportPath,
    outputDir,
  };
}

/**
 * Append the run summary to vibe-history.json under the matching version entry.
 * Skipped silently if the file or version entry doesn't exist.
 */
export function recordResultsInHistory({ projectRoot = process.cwd(), versionLabel, results }) {
  const p = path.join(projectRoot, HISTORY_FILE);
  if (!fs.existsSync(p)) return;
  // versionLabel can be 'v1.1.0' or 'all' — only record per-version runs.
  if (!/^v\d+\.\d+\.\d+$/.test(versionLabel)) return;

  // Validate on read — surface corruption loudly rather than silently skipping.
  const history = parseHistory(fs.readFileSync(p, 'utf8'), p);
  const version = versionLabel.slice(1);
  const entry = history.versions?.find(v => v.version === version);
  if (!entry) return;

  entry.testResults = {
    runAt: new Date().toISOString(),
    passed: results.passed,
    failed: results.failed,
    skipped: results.skipped,
    durationMs: results.durationMs,
  };

  // Validate before writing — never let the verifier emit invalid history.
  const validation = vibeHistorySchema.safeParse(history);
  if (!validation.success) {
    throw new ToolkitError(
      ERROR_CODES.E_HISTORY_SCHEMA_INVALID,
      `Refusing to write invalid vibe-history.json:\n${formatZodIssues(validation.error)}`,
      { sourcePath: p, issues: validation.error.issues },
    );
  }
  fs.writeFileSync(p, JSON.stringify(validation.data, null, 2) + '\n', 'utf8');
}
