import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for Vibe Verifier.
 *
 * The CLI (vibe-verifier/index.js) sets these env vars before invoking
 * Playwright:
 *   VIBE_VERIFY_BASE_URL        — deployed Power Apps player URL
 *   VIBE_VERIFY_STORAGE_STATE   — path to saved auth state (cookies + localStorage)
 *   VIBE_VERIFY_OUTPUT_DIR      — where to write trace/screenshot artifacts
 *
 * Spec folders are passed positionally on the CLI (e.g. tests/specs/v1.1.0).
 */

const baseURL = process.env.VIBE_VERIFY_BASE_URL ?? 'https://apps.powerapps.com/';
const storageState = process.env.VIBE_VERIFY_STORAGE_STATE || undefined;
const outputDir = process.env.VIBE_VERIFY_OUTPUT_DIR || 'tests/results/default';

export default defineConfig({
  testDir: './specs',
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
