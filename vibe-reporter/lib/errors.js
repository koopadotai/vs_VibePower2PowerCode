/**
 * errors.js — structured error codes for the toolkit.
 *
 * Throwing a ToolkitError with a stable `code` lets downstream tooling
 * (fleet aggregators, CI scripts, dashboards) grep / branch on the code
 * instead of fragile string-matching on messages.
 *
 * Codes are namespaced E_<DOMAIN>_<DETAIL>. Add new codes here; never
 * inline a magic string in a throw.
 */

export const ERROR_CODES = Object.freeze({
  // Schema validation
  E_HISTORY_SCHEMA_INVALID: 'E_HISTORY_SCHEMA_INVALID',
  E_PENDING_SCHEMA_INVALID: 'E_PENDING_SCHEMA_INVALID',
  E_MIGRATION_SCHEMA_INVALID: 'E_MIGRATION_SCHEMA_INVALID',
  E_JSON_PARSE_FAILED: 'E_JSON_PARSE_FAILED',

  // Concurrency
  E_LOCK_HELD: 'E_LOCK_HELD',

  // Configuration / state
  E_CONFIG_NOT_FOUND: 'E_CONFIG_NOT_FOUND',           // power.config.json missing
  E_CONFIG_INCOMPLETE: 'E_CONFIG_INCOMPLETE',         // power.config.json missing required fields
  E_AUTH_NOT_FOUND: 'E_AUTH_NOT_FOUND',               // verifier auth state never set up

  // Runtime
  E_SCOPE_INVALID: 'E_SCOPE_INVALID',                 // --since vX.Y.Z bad value
  E_PLAYWRIGHT_NO_REPORT: 'E_PLAYWRIGHT_NO_REPORT',   // playwright crashed before writing JSON
  E_DOCX_RENDER_FAILED: 'E_DOCX_RENDER_FAILED',       // docx library threw during render
});

export class ToolkitError extends Error {
  /**
   * @param {string} code        One of ERROR_CODES
   * @param {string} message     Human-readable message
   * @param {object} [details]   Extra context (path, issues, cause...)
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ToolkitError';
    this.code = code;
    this.details = details;
  }

  /** One-line representation for logs. */
  toString() {
    return `[${this.code}] ${this.message}`;
  }
}

/**
 * Format a Zod error into a human-readable bullet list.
 */
export function formatZodIssues(zodError) {
  return zodError.issues.map(i => {
    const where = i.path.length > 0 ? i.path.join('.') : '(root)';
    return `  - ${where}: ${i.message}`;
  }).join('\n');
}
