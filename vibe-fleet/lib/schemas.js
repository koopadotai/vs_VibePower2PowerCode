/**
 * schemas.js — Zod schemas for the JSON manifests written + read by the toolkit.
 *
 * Authoritative copy. Duplicated verbatim into vibe-verifier/lib/schemas.js
 * and vibe-reporter/lib/schemas.js because the packages don't share
 * node_modules. If you change a schema, update all three.
 *
 * Validated on both WRITE (writers can't emit invalid data) and READ (catches
 * hand-edits and downstream corruption).
 */

import { z } from 'zod';
import { ToolkitError, ERROR_CODES, formatZodIssues } from './errors.js';

const semverRegex = /^\d+\.\d+\.\d+$/;

const isoDateString = z.string().refine(
  s => !Number.isNaN(Date.parse(s)),
  { message: 'must be ISO 8601 date string' },
);

const changedFilesSchema = z.object({
  added: z.array(z.string()),
  modified: z.array(z.string()),
  deleted: z.array(z.string()),
}).strict();

const testResultsSchema = z.object({
  runAt: isoDateString,
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
}).passthrough();

const versionEntrySchema = z.object({
  version: z.string().regex(semverRegex, 'must be semver vX.Y.Z (no v prefix in stored value)'),
  extractedAt: isoDateString,
  fileCount: z.number().int().nonnegative(),
  treeHash: z.string(),
  changedFiles: changedFilesSchema,
  snapshotPath: z.string(),
  gitTag: z.string(),
  note: z.string().default(''),
  testResults: testResultsSchema.optional(),
}).passthrough(); // forward-compat for future fields

export const vibeHistorySchema = z.object({
  projectName: z.string().min(1),
  versions: z.array(versionEntrySchema),
}).passthrough();

export const vibePendingUpdateSchema = z.object({
  fromVersion: z.string().regex(semverRegex),
  toVersion: z.string().regex(semverRegex),
  extractedAt: isoDateString,
  changedFiles: changedFilesSchema,
  sourceDir: z.string(),
  baselineDir: z.string(),
  snapshotPath: z.string(),
}).passthrough();

export const vibeMigrationSchema = z.object({
  projectName: z.string().min(1),
  migratedAt: isoDateString.optional(),
  vibeOwned: z.array(z.string()),
  migrationOwned: z.array(z.string()),
  requiresReview: z.array(z.string()),
}).passthrough();

// ── Fleet registry schema ──────────────────────────────────────────────────

const fleetProjectEntrySchema = z.object({
  alias: z.string().min(1).regex(/^[a-z0-9][a-z0-9-_]*$/i, 'alias must be alphanumeric (plus -_)'),
  path: z.string().min(1),
  registeredAt: isoDateString,
  lastSeen: isoDateString.optional(),
  tags: z.array(z.string()).optional(),
}).passthrough();

export const fleetConfigSchema = z.object({
  fleetName: z.string().min(1),
  createdAt: isoDateString,
  projects: z.array(fleetProjectEntrySchema),
}).passthrough();

// ── Parse helpers ───────────────────────────────────────────────────────────
//
// Each helper takes either a JSON string or a parsed object plus the source
// path (for error messages). Returns the validated, typed object — or throws
// ToolkitError with a stable code.

function parseJsonSafely(input, code, sourcePath) {
  if (typeof input !== 'string') return input;
  try {
    return JSON.parse(input);
  } catch (err) {
    throw new ToolkitError(
      ERROR_CODES.E_JSON_PARSE_FAILED,
      `Could not parse JSON at ${sourcePath}: ${err.message}`,
      { sourcePath, cause: err.message, downstreamCode: code },
    );
  }
}

function validate(schema, parsed, code, label, sourcePath) {
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ToolkitError(
      code,
      `${label} schema violation at ${sourcePath}:\n${formatZodIssues(result.error)}`,
      { sourcePath, issues: result.error.issues },
    );
  }
  return result.data;
}

export function parseHistory(input, sourcePath = 'vibe-history.json') {
  const parsed = parseJsonSafely(input, ERROR_CODES.E_HISTORY_SCHEMA_INVALID, sourcePath);
  return validate(vibeHistorySchema, parsed, ERROR_CODES.E_HISTORY_SCHEMA_INVALID, 'vibe-history.json', sourcePath);
}

export function parsePendingUpdate(input, sourcePath = 'vibe-pending-update.json') {
  const parsed = parseJsonSafely(input, ERROR_CODES.E_PENDING_SCHEMA_INVALID, sourcePath);
  return validate(vibePendingUpdateSchema, parsed, ERROR_CODES.E_PENDING_SCHEMA_INVALID, 'vibe-pending-update.json', sourcePath);
}

export function parseMigration(input, sourcePath = 'vibe-migration.json') {
  const parsed = parseJsonSafely(input, ERROR_CODES.E_MIGRATION_SCHEMA_INVALID, sourcePath);
  return validate(vibeMigrationSchema, parsed, ERROR_CODES.E_MIGRATION_SCHEMA_INVALID, 'vibe-migration.json', sourcePath);
}

export function parseFleetConfig(input, sourcePath = 'fleet.config.json') {
  const parsed = parseJsonSafely(input, ERROR_CODES.E_FLEET_SCHEMA_INVALID, sourcePath);
  return validate(fleetConfigSchema, parsed, ERROR_CODES.E_FLEET_SCHEMA_INVALID, 'fleet.config.json', sourcePath);
}
