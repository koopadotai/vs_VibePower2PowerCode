/**
 * lock.js — file-based concurrency lock for project-root operations.
 *
 * Prevents two concurrent runs of `vibe-extractor` or `vibe-verifier`
 * against the same project from corrupting state by interleaving writes.
 *
 * Lock file: `vibe-lock` at the project root.
 * Contents:  { pid, startedAt, command, host }
 *
 * Auto-recovers from stale locks:
 *   - PID no longer alive on this machine → take over immediately
 *   - Older than staleAfterMs (default 1 h) → take over (covers crashed
 *     processes on remote hosts where we can't check pid liveness)
 *
 * Uses atomic file create (O_EXCL via `wx` flag) so two processes
 * racing to acquire never both succeed.
 *
 * Authoritative copy in vibe-extractor. Duplicated into vibe-verifier.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { ToolkitError, ERROR_CODES } from './errors.js';

const LOCK_FILE = 'vibe-lock';
const DEFAULT_STALE_MS = 60 * 60 * 1000; // 1 hour

// ── Helpers ────────────────────────────────────────────────────────────────

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0); // signal 0 = liveness check, no actual signal sent
    return true;
  } catch (err) {
    if (err.code === 'ESRCH') return false; // no such process
    if (err.code === 'EPERM') return true;  // exists but we lack permission
    return false;
  }
}

function readLockSafely(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return null; // corrupted, unreadable, or vanished mid-check
  }
}

function isStaleLock(lock, staleAfterMs) {
  if (!lock || typeof lock !== 'object') return true;
  if (!lock.startedAt || typeof lock.pid !== 'number') return true;

  const age = Date.now() - new Date(lock.startedAt).getTime();
  // Sanity: if startedAt was unparseable, age is NaN — treat as stale.
  if (Number.isNaN(age)) return true;

  const sameHost = !lock.host || lock.host === os.hostname();
  if (sameHost) {
    // We can check pid liveness on this host.
    if (!isProcessAlive(lock.pid)) return true;
    // Alive same-host process → only stale if very old.
    return age > staleAfterMs;
  }
  // Different host — can't check liveness, fall back to time only.
  return age > staleAfterMs;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Try to acquire the project lock.
 *
 * @param {object} opts
 * @param {string} [opts.projectRoot]    Defaults to process.cwd()
 * @param {string} [opts.command]        Identifier for the lock holder
 * @param {number} [opts.staleAfterMs]   How long before a foreign lock is considered abandoned
 * @returns {{ lockPath, lock, recoveredFrom? }}
 * @throws  ToolkitError(E_LOCK_HELD) if a valid lock is held by another process
 */
export function acquireLock({
  projectRoot = process.cwd(),
  command,
  staleAfterMs = DEFAULT_STALE_MS,
} = {}) {
  const lockPath = path.join(projectRoot, LOCK_FILE);
  const myLock = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    command: command ?? path.basename(process.argv[1] ?? 'unknown'),
    host: os.hostname(),
  };
  const content = JSON.stringify(myLock, null, 2) + '\n';

  // Atomic create-or-fail (O_EXCL).
  try {
    fs.writeFileSync(lockPath, content, { flag: 'wx', encoding: 'utf8' });
    return { lockPath, lock: myLock };
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }

  // Lock file already exists — check if it's stale enough to take over.
  const existing = readLockSafely(lockPath);
  if (isStaleLock(existing, staleAfterMs)) {
    // Take over: best-effort delete + re-create. Tiny race remains if two
    // processes both detect the stale lock at the same instant; the loser's
    // second writeFileSync({flag:'wx'}) will EEXIST and they'll throw.
    try { fs.unlinkSync(lockPath); } catch { /* gone already, fine */ }
    try {
      fs.writeFileSync(lockPath, content, { flag: 'wx', encoding: 'utf8' });
      return { lockPath, lock: myLock, recoveredFrom: existing };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      // Another process beat us to recovery. Fall through to the "held" error.
    }
  }

  const reread = readLockSafely(lockPath);
  throw new ToolkitError(
    ERROR_CODES.E_LOCK_HELD,
    `Cannot acquire vibe-lock at ${lockPath} — held by another process.\n` +
    `  pid:       ${reread?.pid ?? '?'}\n` +
    `  host:      ${reread?.host ?? '?'}\n` +
    `  command:   ${reread?.command ?? '?'}\n` +
    `  startedAt: ${reread?.startedAt ?? '?'}\n` +
    `\n` +
    `If you believe this is a stale lock (process crashed, host gone), wait until\n` +
    `it auto-expires (default: 1 hour after startedAt), or manually delete ${LOCK_FILE}.`,
    { lockPath, existingLock: reread }
  );
}

/**
 * Release the lock. Safe to call if no lock exists (no-op).
 * Best-effort: never throws on missing file.
 */
export function releaseLock({ projectRoot = process.cwd() } = {}) {
  const lockPath = path.join(projectRoot, LOCK_FILE);
  try {
    fs.unlinkSync(lockPath);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

/**
 * Run `fn()` with the lock held. Always releases on exit, even on throw.
 */
export async function withLock(opts, fn) {
  acquireLock(opts);
  try {
    return await fn();
  } finally {
    releaseLock(opts);
  }
}

/**
 * Wire signal handlers so Ctrl+C / SIGTERM release the lock. Call once
 * after acquireLock. The handlers re-raise the signal so default exit
 * behaviour still occurs.
 */
export function installSignalHandlers({ projectRoot = process.cwd() } = {}) {
  const handler = (sig, code) => () => {
    try { releaseLock({ projectRoot }); } catch { /* best-effort */ }
    process.exit(code);
  };
  process.once('SIGINT',  handler('SIGINT',  130));
  process.once('SIGTERM', handler('SIGTERM', 143));
}
