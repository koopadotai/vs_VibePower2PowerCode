/**
 * probe.js — read a project's state for fleet-wide views.
 *
 * Reads but never acquires the project's lock. Every read returns a
 * `health` field summarising what was found:
 *   ok                — everything readable and valid
 *   pending-update    — vibe-pending-update.json exists (apply needed)
 *   tests-failed      — latest run had failures
 *   stale             — last extraction > N days ago
 *   warning           — files exist but validation issues
 *   missing           — expected files absent (not a vibe project anymore?)
 *   locked            — vibe-lock exists (another process is mid-write)
 *
 * Safe to call against many projects in sequence; never throws on
 * routine corruption (warnings only).
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseHistory, parseMigration } from './schemas.js';
import { ToolkitError } from './errors.js';

const STALE_AFTER_DAYS = 30;
const STALE_LOCK_MS = 60 * 60 * 1000; // 1h — must match lock.js DEFAULT_STALE_MS

function readJsonOrNull(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function tryParse(parser, raw, sourcePath) {
  try {
    return { ok: true, data: parser(raw, sourcePath) };
  } catch (err) {
    return { ok: false, error: err instanceof ToolkitError ? err.code : err.message };
  }
}

function daysAgo(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

// Mirror of vibe-extractor/lib/lock.js isStaleLock — kept inline rather
// than imported to keep vibe-fleet free of cross-package coupling.
function isProcessAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (err) {
    if (err.code === 'ESRCH') return false;
    if (err.code === 'EPERM') return true;
    return false;
  }
}

function classifyLock(lock) {
  if (!lock || typeof lock !== 'object') return 'stale';      // corrupted
  if (!lock.startedAt || typeof lock.pid !== 'number') return 'stale';
  const age = Date.now() - new Date(lock.startedAt).getTime();
  if (Number.isNaN(age)) return 'stale';
  const sameHost = !lock.host || lock.host === os.hostname();
  if (sameHost) {
    if (!isProcessAlive(lock.pid)) return 'stale';
    return age > STALE_LOCK_MS ? 'stale' : 'active';
  }
  return age > STALE_LOCK_MS ? 'stale' : 'active';
}

/**
 * @param {string} projectPath  Absolute path to project root
 * @returns {object}  Probe result
 */
export function probeProject(projectPath) {
  const result = {
    path: projectPath,
    exists: fs.existsSync(projectPath),
    currentVersion: null,
    lastExtractedAt: null,
    lastExtractedDaysAgo: null,
    versionCount: 0,
    hasPendingUpdate: false,
    pendingFromVersion: null,
    pendingToVersion: null,
    hasLock: false,
    lockHolderPid: null,
    lockStatus: null,           // 'active' | 'stale' | null
    lastTestRunAt: null,
    lastTestPassed: null,
    lastTestFailed: null,
    lastTestSkipped: null,
    health: 'ok',
    warnings: [],
  };

  if (!result.exists) {
    result.health = 'missing';
    result.warnings.push(`Project path does not exist: ${projectPath}`);
    return result;
  }

  // ── Lock presence ─────────────────────────────────────────────────────
  const lockPath = path.join(projectPath, 'vibe-lock');
  if (fs.existsSync(lockPath)) {
    result.hasLock = true;
    const lock = readJsonOrNull(lockPath);
    result.lockHolderPid = lock?.pid ?? null;
    result.lockStatus = classifyLock(lock);
  }

  // ── Vibe history ──────────────────────────────────────────────────────
  const historyPath = path.join(projectPath, 'vibe-history.json');
  const historyRaw = fs.existsSync(historyPath) ? fs.readFileSync(historyPath, 'utf8') : null;
  if (historyRaw == null) {
    result.health = 'missing';
    result.warnings.push('vibe-history.json is missing — has /migrate Mode A been run here?');
  } else {
    const parsed = tryParse(parseHistory, historyRaw, historyPath);
    if (!parsed.ok) {
      result.health = 'warning';
      result.warnings.push(`vibe-history.json invalid: ${parsed.error}`);
    } else {
      const h = parsed.data;
      result.versionCount = h.versions.length;
      const latest = h.versions[h.versions.length - 1];
      if (latest) {
        result.currentVersion = latest.version;
        result.lastExtractedAt = latest.extractedAt;
        result.lastExtractedDaysAgo = daysAgo(latest.extractedAt);
        if (latest.testResults) {
          result.lastTestRunAt = latest.testResults.runAt;
          result.lastTestPassed = latest.testResults.passed;
          result.lastTestFailed = latest.testResults.failed;
          result.lastTestSkipped = latest.testResults.skipped;
        }
      }
    }
  }

  // ── Pending update ────────────────────────────────────────────────────
  const pendingPath = path.join(projectPath, 'vibe-pending-update.json');
  if (fs.existsSync(pendingPath)) {
    result.hasPendingUpdate = true;
    const pend = readJsonOrNull(pendingPath);
    result.pendingFromVersion = pend?.fromVersion ?? null;
    result.pendingToVersion = pend?.toVersion ?? null;
  }

  // ── Health classification (priority order) ────────────────────────────
  if (result.health === 'missing' || result.health === 'warning') {
    // already set
  } else if (result.hasLock && result.lockStatus === 'active') {
    result.health = 'locked';
    result.warnings.push(`vibe-lock active (pid ${result.lockHolderPid ?? '?'}) — another process is mid-write.`);
  } else if (result.hasLock && result.lockStatus === 'stale') {
    result.health = 'warning';
    result.warnings.push(`Orphaned vibe-lock (pid ${result.lockHolderPid ?? '?'} dead or > 1h old). Delete the file to clear, or the next command will auto-recover.`);
  } else if (result.hasPendingUpdate) {
    result.health = 'pending-update';
    result.warnings.push(`Unapplied update: v${result.pendingFromVersion} → v${result.pendingToVersion}. Run /migrate.`);
  } else if (result.lastTestFailed != null && result.lastTestFailed > 0) {
    result.health = 'tests-failed';
    result.warnings.push(`${result.lastTestFailed} test failures on last run.`);
  } else if (result.lastExtractedDaysAgo != null && result.lastExtractedDaysAgo > STALE_AFTER_DAYS) {
    result.health = 'stale';
    result.warnings.push(`Last extraction was ${result.lastExtractedDaysAgo} days ago (> ${STALE_AFTER_DAYS} day threshold).`);
  }

  // ── Migration manifest (informational — doesn't change health) ────────
  const migrationPath = path.join(projectPath, 'vibe-migration.json');
  if (fs.existsSync(migrationPath)) {
    const m = tryParse(parseMigration, fs.readFileSync(migrationPath, 'utf8'), migrationPath);
    if (!m.ok) {
      result.warnings.push(`vibe-migration.json invalid: ${m.error}`);
    }
  }

  return result;
}
