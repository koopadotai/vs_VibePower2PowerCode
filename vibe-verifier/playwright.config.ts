import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for Vibe Verifier.
 *
 * Config lives inside vibe-verifier/ (not the user's project) so a fresh
 * project never has to copy a template. The CLI (vibe-verifier/index.js)
 * spawns Playwright from this directory and sets env vars to bridge the
 * user-project paths in:
 *   VIBE_VERIFY_BASE_URL        — deployed Power Apps player URL
 *   VIBE_VERIFY_STORAGE_STATE   — path to saved auth state (cookies + localStorage)
 *   VIBE_VERIFY_OUTPUT_DIR      — where to write trace/screenshot artifacts
 *   VIBE_VERIFY_TEST_DIR        — absolute path to the user project's tests/specs/
 *
 * Spec folders are passed positionally on the CLI (absolute paths under
 * VIBE_VERIFY_TEST_DIR), which Playwright uses as a filter on testDir.
 */

const baseURL = process.env.VIBE_VERIFY_BASE_URL ?? 'https://apps.powerapps.com/';
const storageState = process.env.VIBE_VERIFY_STORAGE_STATE || undefined;
const outputDir = process.env.VIBE_VERIFY_OUTPUT_DIR || 'tests/results/default';
const testDir = process.env.VIBE_VERIFY_TEST_DIR || './specs';

export default defineConfig({
  testDir,
  testMatch: '**/*.spec.ts',

  fullyParallel: false,        // deployed app + shared Dataverse → serial is safer
  workers: 1,
  retries: process.env.CI ? 2 : 1,
  timeout: 60_000,             // Power Apps player is slow to first paint
  expect: { timeout: 15_000 },

  reporter: [
    ['list'],
    ['json', { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? `${outputDir}/report.json` }],
  ],

  outputDir,

  use: {
    baseURL,
    storageState,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
