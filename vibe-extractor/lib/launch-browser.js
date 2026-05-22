/**
 * launch-browser.js — wrap chromium.launch with a friendlier error.
 *
 * The npm postinstall hook downloads Chromium automatically, but it can be
 * skipped (npm install --ignore-scripts) or blocked by corporate proxies.
 * When that happens, Playwright's default error ("browserType.launch:
 * Executable doesn't exist at …") is technically clear but tells the user
 * to run `npx playwright install` from wherever they happen to be — which
 * fails if they're not in vibe-extractor/. This wrapper points them at the
 * right directory.
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTRACTOR_DIR = path.resolve(__dirname, '..');

const DEFAULT_OPTS = { headless: false, slowMo: 20 };

export async function launchChromium(opts = {}) {
  try {
    return await chromium.launch({ ...DEFAULT_OPTS, ...opts });
  } catch (err) {
    if (/Executable doesn't exist|Please run.*playwright install/i.test(err.message)) {
      const friendly = new Error(
        `Playwright's Chromium browser is not installed.\n\n` +
        `  Fix — from this directory, run:\n` +
        `    cd "${EXTRACTOR_DIR}"\n` +
        `    npx playwright install chromium\n\n` +
        `  (npm install should run this automatically via the postinstall hook,\n` +
        `   but it may have been skipped — e.g. 'npm install --ignore-scripts'\n` +
        `   or blocked by a corporate proxy.)\n\n` +
        `Original error: ${err.message}`,
      );
      friendly.cause = err;
      throw friendly;
    }
    throw err;
  }
}
