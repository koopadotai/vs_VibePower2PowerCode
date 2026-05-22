/**
 * Vibe Source Extractor  (v2)
 *
 * Strategy:
 *   1. Opens a real browser — you log in once.
 *   2. YOU manually click each file in the Vibe editor left panel.
 *   3. Script captures every file API response and filters to readable source.
 *   4. Press  ENTER  in this terminal when you're done clicking.
 *   5. All source files are saved to ./dice-game-source/
 *
 * Usage:
 *   node extract.js [outputDir]
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { launchChromium } from './lib/launch-browser.js';

// ── Config ────────────────────────────────────────────────────────────────────
const VIBE_URL =
  'https://vibe.powerapps.com/e/a54c44ed-fdbd-ecba-833f-24a72ce23985' +
  '/s/00000001-0000-0000-0001-00000000009b' +
  '/w/modelType/project/modelId/73b9ba9d-8f7c-44af-ae1f-5101884686f5/app';

const OUTPUT_DIR = path.resolve(process.argv[2] ?? './dice-game-source');

// URL segments that are NOT project source — skip these
const PLATFORM_SKIP_PATTERNS = [
  // Vibe / MakerX platform bundles
  '/static/js/',
  '/static/css/',
  '/static/media/',
  'chunk.js',
  'chunk.css',
  '/module/main.',
  'makerx',
  'oauth2',
  '/runtime.',
  'webpack',
  'hot-update',
  // Vite internal / HMR
  '@vite/',
  '@react-refresh',
  '.vite/deps/',
  '@fs/server/',
  '@fs/',
  // npm packages served by Vite dev server
  'node_modules/',
  '@tanstack',
  'jotai',
  'react-dom',
  'react-router',
  'react_jsx',
  // Auth / platform plumbing
  'common/SAS/',
  'ProcessAuth',
  // Binary / media
  'favicon',
  '.png',
  '.svg',
  '.ico',
  '.woff',
  '.ttf',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true if the URL looks like a Vibe platform asset (not project source). */
function isPlatformAsset(url) {
  return PLATFORM_SKIP_PATTERNS.some(p => url.includes(p));
}

/** Returns true if content looks like readable (non-minified) source code. */
function isReadableSourceCode(content) {
  if (!content || content.length < 20) return false;

  const lines = content.split('\n');
  if (lines.length < 3) return false;

  // Minified files collapse everything into 1–2 very long lines
  const avgLineLen = content.length / lines.length;
  if (avgLineLen > 300) return false;

  // Must match at least one source-code pattern
  const patterns = [
    /^import\s+/m,
    /^export\s+(default\s+)?/m,
    /^const\s+\w+/m,
    /^function\s+\w+/m,
    /^interface\s+\w+/m,
    /^type\s+\w+\s*=/m,
    /useState|useEffect|useRef|useCallback|useMemo/,
    /<[A-Z][A-Za-z]+[\s/>]/,   // JSX component tag
    /^\s*"name"\s*:/m,          // package.json / json config
    /^\s*"version"\s*:/m,
  ];

  return patterns.some(p => p.test(content));
}

/**
 * Tries to derive a clean relative file path from a Monaco model URI or network URL.
 * Monaco URIs look like:  inmemory://model/1   or   file:///project/apps/dice-game/src/app.tsx
 * Network URLs may contain the file path after the project ID.
 */
function derivePath(uri, fallbackIndex) {
  // Monaco file:// URI — best case
  const fileMatch = uri.match(/^file:\/\/\/(.+)$/);
  if (fileMatch) return fileMatch[1];

  // Monaco inmemory URI — skip, useless
  if (uri.startsWith('inmemory://')) return null;

  // Network URL — try to extract path after projectId
  const projectId = '73b9ba9d-8f7c-44af-ae1f-5101884686f5';
  try {
    const parsed = new URL(uri);
    let p = parsed.pathname;
    const idx = p.indexOf(projectId);
    if (idx !== -1) p = p.slice(idx + projectId.length);
    p = p.replace(/^\/+/, '').replace(/\?.*$/, '');
    if (p.length > 3) return p;
  } catch { /* not a valid URL */ }

  // Last resort — name by capture index with a hint from the URL
  const guessedName = uri.split('/').pop()?.split('?')[0] ?? `captured-${fallbackIndex}`;
  return `_unknown/${guessedName}`;
}

function safeSave(relativePath, content) {
  const parts = relativePath.replace(/\\/g, '/').split('/').map(p =>
    p.replace(/[<>:"|?*\x00-\x1f]/g, '_')
  );
  const fullPath = path.join(OUTPUT_DIR, ...parts);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
  return fullPath;
}

function waitForEnter(prompt) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, () => { rl.close(); resolve(); });
  });
}

// ── Monaco polling ────────────────────────────────────────────────────────────
async function extractMonacoModels(page) {
  return page.evaluate(() => {
    const win = /** @type {any} */ (window);
    if (!win.monaco?.editor) return [];
    return win.monaco.editor.getModels().map(m => ({
      uri: m.uri.toString(),
      content: m.getValue(),
    }));
  }).catch(() => []);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  const captured = new Map(); // key → { path, content }
  let captureIndex = 0;

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  Vibe Source Extractor  v2');
  console.log('════════════════════════════════════════════════════════════\n');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  // ── Network interception ─────────────────────────────────────────────────
  page.on('response', async response => {
    try {
      const url = response.url();
      if (response.status() !== 200) return;
      if (isPlatformAsset(url)) return;

      const ct = response.headers()['content-type'] ?? '';

      // Only process text-based responses
      const isText =
        ct.includes('text/') ||
        ct.includes('javascript') ||
        ct.includes('typescript') ||
        ct.includes('json') ||
        ct.includes('yaml');

      if (!isText) return;

      const text = await response.text();
      if (!isReadableSourceCode(text)) return;
      if (captured.has(url)) return;

      const rel = derivePath(url, captureIndex++);
      if (!rel) return;

      captured.set(url, { path: rel, content: text });
      console.log(`  [net] ${rel}`);
    } catch { /* response consumed / binary */ }
  });

  // ── Load Vibe ────────────────────────────────────────────────────────────
  console.log('Opening Vibe…');
  await page.goto(VIBE_URL, { waitUntil: 'domcontentloaded' });

  console.log('\n>>> LOG IN to your Microsoft account in the browser window.');
  console.log('>>> The script will continue automatically.\n');
  await page.waitForURL(/vibe\.powerapps\.com.*app/, { timeout: 300_000 });

  console.log('Editor loaded.\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  ACTION REQUIRED:                                        ║');
  console.log('║  In the browser, click EVERY FILE in the left panel.    ║');
  console.log('║  Each click loads that file and the script captures it. ║');
  console.log('║                                                          ║');
  console.log('║  When you have clicked all files, come back here and    ║');
  console.log('║  press  ENTER  to finish.                               ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Poll Monaco models every 3 s while waiting for user
  let polling = true;
  const pollInterval = setInterval(async () => {
    if (!polling) return;
    const models = await extractMonacoModels(page);
    for (const { uri, content } of models) {
      if (captured.has(uri)) continue;
      if (!isReadableSourceCode(content)) continue;
      const rel = derivePath(uri, captureIndex++);
      if (!rel) continue;
      captured.set(uri, { path: rel, content });
      console.log(`  [editor] ${rel}`);
    }
  }, 3000);

  await waitForEnter('  Press ENTER when done clicking files...\n');
  polling = false;
  clearInterval(pollInterval);

  // One final Monaco sweep
  const finalModels = await extractMonacoModels(page);
  for (const { uri, content } of finalModels) {
    if (captured.has(uri)) continue;
    if (!isReadableSourceCode(content)) continue;
    const rel = derivePath(uri, captureIndex++);
    if (!rel) continue;
    captured.set(uri, { path: rel, content });
    console.log(`  [editor-final] ${rel}`);
  }

  await browser.close();

  // ── Save ─────────────────────────────────────────────────────────────────
  console.log(`\n════════════════════════════════════════════════════════════`);
  console.log(`  Saving ${captured.size} files  →  ${OUTPUT_DIR}`);
  console.log(`════════════════════════════════════════════════════════════\n`);

  let saved = 0;
  for (const [, { path: rel, content }] of captured) {
    try {
      const full = safeSave(rel, content);
      console.log(`  ✔  ${full.replace(OUTPUT_DIR + path.sep, '')}`);
      saved++;
    } catch (err) {
      console.error(`  ✘  ${rel}: ${err.message}`);
    }
  }

  console.log(`\n  Done.  ${saved} files saved to: ${OUTPUT_DIR}\n`);
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
