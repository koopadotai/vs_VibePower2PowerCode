/**
 * auth-setup.js — interactive Microsoft account sign-in.
 *
 * Opens the deployed Power Apps player URL in a real Chromium window.
 * The user signs in manually (handles MFA, security keys, anything).
 * Once signed in to the app, the user presses Enter; we save the auth
 * cookies and localStorage to ./vibe-verifier/.auth/state.json.
 *
 * Same pattern used by vibe-extractor/extractor.js for Vibe login.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.resolve(__dirname, '..', '.auth');
const STATE_PATH = path.join(AUTH_DIR, 'state.json');

function waitForEnter(prompt) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, () => { rl.close(); resolve(); });
  });
}

/**
 * @param {object} opts
 * @param {string} opts.appUrl  Deployed Power Apps player URL
 * @param {function} [opts.log]
 */
export async function setupAuth({ appUrl, log = console.log }) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  log('');
  log('  Opening browser to:');
  log(`    ${appUrl}`);
  log('');

  const browser = await chromium.launch({ headless: false, slowMo: 20 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  } catch (err) {
    log(`  ! Navigation error (continuing anyway): ${err.message}`);
  }

  log('  >>> Sign in to your Microsoft account in the browser window.');
  log('  >>> Wait until the Power Apps player has fully loaded your app.');
  await waitForEnter('  >>> Press ENTER here when signed in and the app is visible: ');

  // Save storage state (cookies + localStorage).
  await context.storageState({ path: STATE_PATH });
  try { await browser.close(); } catch { }

  log('');
  log(`  ✓ Auth state saved to ${path.relative(process.cwd(), STATE_PATH)}`);
  log('    Subsequent verify runs will reuse this session.');
  log('    Re-run --setup-auth if your tokens expire (usually weeks).');
  log('');

  return { statePath: STATE_PATH };
}

/**
 * Check whether saved auth exists and (optionally) how old it is.
 */
export function authStatus() {
  if (!fs.existsSync(STATE_PATH)) return { exists: false };
  const stat = fs.statSync(STATE_PATH);
  const ageMs = Date.now() - stat.mtimeMs;
  const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  return { exists: true, statePath: STATE_PATH, ageDays };
}
