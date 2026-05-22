/**
 * extractor.js — core extraction engine (reusable module)
 *
 * export: extractVibeProject({ url, outputDir, log? })
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { launchChromium } from './lib/launch-browser.js';

const SKIP_URL = [
  'node_modules', '.vite/', '@vite', '@react-refresh',
  'chunk.js', 'chunk.css', '/static/', 'makerx', 'oauth2',
  'favicon', '.png', '.svg', '.ico', '.woff', 'hot-update',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function waitForEnter(prompt) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, () => { rl.close(); resolve(); });
  });
}

function saveFile(outputDir, filePath, content) {
  const parts = filePath.replace(/\\/g, '/').replace(/^\/+/, '').split('/')
    .map(p => p.replace(/[<>:"|?*\x00-\x1f]/g, '_'));
  const full = path.join(outputDir, ...parts);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  return full;
}

/**
 * Extract all source files from a Power Apps Vibe project.
 *
 * @param {object} options
 * @param {string} options.url        - Full Vibe project URL
 * @param {string} options.outputDir  - Local folder to save files into
 * @param {function} [options.log]    - Optional log function (defaults to console.log)
 * @returns {Promise<{ saved: number, failed: number, files: string[] }>}
 */
export async function extractVibeProject({ url, outputDir, log = console.log }) {
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await launchChromium();
  const context  = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();

  // ── Network cache ───────────────────────────────────────────────────────
  const networkCache = new Map();

  page.on('response', async response => {
    try {
      const url = response.url();
      if (response.status() !== 200) return;
      if (SKIP_URL.some(p => url.includes(p))) return;
      if (networkCache.has(url)) return;
      const ct = (response.headers()['content-type'] ?? '').toLowerCase();
      if (!ct.includes('text') && !ct.includes('javascript') && !ct.includes('json') && !ct.includes('typescript')) return;
      const text = await response.text();
      if (text?.trim().length > 5) networkCache.set(url, text);
    } catch { }
  });

  // ── Navigate + wait for login ───────────────────────────────────────────
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  log('\n>>> LOG IN to your Microsoft account in the browser.');
  await waitForEnter('    Press ENTER once the Vibe editor is fully loaded: ');
  await sleep(3000);

  // ── Expand all folders ──────────────────────────────────────────────────
  log('\n[1/3] Expanding folders…');
  for (let round = 0; round < 20; round++) {
    const collapsed = await page.$$('[role="treeitem"][aria-expanded="false"]');
    if (!collapsed.length) break;
    log(`  Round ${round + 1}: ${collapsed.length} collapsed`);
    for (const el of collapsed) { await el.click(); await sleep(150); }
    await sleep(400);
  }
  log('  All folders expanded.');

  // ── Collect file list ───────────────────────────────────────────────────
  log('\n[2/3] Reading file list…');
  const fileList = await page.evaluate(() =>
    [...document.querySelectorAll('[role="treeitem"]:not([aria-expanded])')]
      .map(el => el.getAttribute('data-fui-tree-item-value') ?? '')
      .filter(Boolean)
  );
  log(`  ${fileList.length} files found.`);

  // ── Capture each file ───────────────────────────────────────────────────
  log('\n[3/3] Capturing files…\n');
  const savedFiles = [];
  let saved = 0, failed = 0;

  for (let i = 0; i < fileList.length; i++) {
    const filePath = fileList[i];
    const fileName = filePath.split('/').pop();
    const tag      = `[${i + 1}/${fileList.length}]`;

    const treeEl = await page.$(`[data-fui-tree-item-value="${filePath}"]`);
    if (!treeEl) {
      log(`  ✘ ${tag} ${filePath}  — not found in tree`);
      failed++; continue;
    }
    await treeEl.click();
    await sleep(1200);

    let content = null;
    let method  = '';

    // 1 — Network cache
    for (const [netUrl, text] of networkCache) {
      try {
        const urlPath = new URL(netUrl).pathname.replace(/\?.*$/, '');
        if (urlPath.endsWith('/' + fileName) || urlPath.includes('/' + filePath.split('/').slice(-3).join('/'))) {
          content = text; method = 'network'; break;
        }
      } catch { }
    }

    // 2 — Monaco API
    if (!content) {
      content = await page.evaluate((fp) => {
        const m = window.monaco ?? window._monaco ?? window.__monaco;
        if (!m?.editor) return null;
        const fn = fp.split('/').pop();
        for (const model of m.editor.getModels()) {
          const uri = model.uri.toString();
          if (uri.includes(fp) || uri.endsWith('/' + fn)) return model.getValue();
        }
        const active = m.editor.getActiveCodeEditor?.() ?? m.editor.getFocusedCodeEditor?.();
        return active?.getModel()?.getValue() ?? null;
      }, filePath).catch(() => null);
      if (content) method = 'monaco';
    }

    // 3 — Ctrl+A → Ctrl+C → clipboard (guaranteed full content)
    if (!content) {
      try {
        const editorEl = await page.$('.monaco-editor .view-lines');
        if (editorEl) {
          await editorEl.click(); await sleep(200);
        } else {
          const box = await page.locator('.monaco-editor').first().boundingBox();
          if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          await sleep(200);
        }
        await page.keyboard.press('Control+a'); await sleep(150);
        await page.keyboard.press('Control+c'); await sleep(300);
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        if (clip?.trim().length > 5) { content = clip; method = 'clipboard'; }
      } catch { }
    }

    // Save
    if (content?.trim().length > 0) {
      try {
        saveFile(outputDir, filePath, content);
        log(`  ✔ ${tag} ${filePath}  [${method}, ${content.split('\n').length} lines]`);
        savedFiles.push(filePath);
        saved++;
      } catch (err) {
        log(`  ✘ ${tag} ${filePath}  save error: ${err.message}`);
        failed++;
      }
    } else {
      log(`  ✘ ${tag} ${filePath}  no content`);
      failed++;
    }
  }

  try { await browser.close(); } catch { }

  return { saved, failed, total: fileList.length, files: savedFiles };
}
