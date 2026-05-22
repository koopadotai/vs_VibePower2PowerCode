/**
 * diagnose.js — Opens Vibe, waits for login, then:
 *   1. Takes a screenshot
 *   2. Dumps the file tree DOM structure
 *   3. Reports exactly which selectors work
 *   4. Auto-extracts all files using the working selectors
 *   5. Saves everything to ./dice-game-source/
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { launchChromium } from './lib/launch-browser.js';

const VIBE_URL =
  'https://vibe.powerapps.com/e/a54c44ed-fdbd-ecba-833f-24a72ce23985' +
  '/s/00000001-0000-0000-0001-00000000009b' +
  '/w/modelType/project/modelId/73b9ba9d-8f7c-44af-ae1f-5101884686f5/app';

const OUTPUT_DIR  = path.resolve('./dice-game-source');
const SCREENSHOT  = path.resolve('./vibe-screenshot.png');
const DOM_DUMP    = path.resolve('./vibe-dom.txt');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function waitForEnter(prompt) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, () => { rl.close(); resolve(); });
  });
}

async function run() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  Vibe DOM Diagnostics + Auto-Extractor');
  console.log('══════════════════════════════════════════════\n');

  const browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page    = await context.newPage();

  await page.goto(VIBE_URL, { waitUntil: 'domcontentloaded' });

  console.log('>>> LOG IN in the browser window, then press ENTER here.');
  await waitForEnter('  Press ENTER after login and the editor is fully visible: ');

  await sleep(3000); // let everything settle

  // ── Screenshot ──────────────────────────────────────────────────────────────
  await page.screenshot({ path: SCREENSHOT, fullPage: false });
  console.log(`\nScreenshot saved → ${SCREENSHOT}`);

  // ── DOM inspection ──────────────────────────────────────────────────────────
  console.log('\nInspecting DOM…');

  const domInfo = await page.evaluate(() => {
    const results = {};

    // Test every candidate selector
    const selectors = [
      '[role="tree"]',
      '[role="treeitem"]',
      '[aria-expanded]',
      '[class*="tree"]',
      '[class*="Tree"]',
      '[class*="file"]',
      '[class*="File"]',
      '[class*="sidebar"]',
      '[class*="Sidebar"]',
      '[class*="explorer"]',
      '[class*="Explorer"]',
      '[class*="panel"]',
      '[class*="Panel"]',
      '[class*="node"]',
      '[class*="Node"]',
      '[class*="item"]',
      '[class*="Item"]',
    ];

    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        results[sel] = {
          count: els.length,
          // Sample first 3 elements: tag, classes, aria attrs, text
          samples: [...els].slice(0, 3).map(el => ({
            tag: el.tagName,
            class: el.className?.toString().slice(0, 120),
            ariaLabel: el.getAttribute('aria-label'),
            ariaExpanded: el.getAttribute('aria-expanded'),
            role: el.getAttribute('role'),
            text: el.textContent?.trim().slice(0, 60),
            dataAttrs: [...el.attributes]
              .filter(a => a.name.startsWith('data-'))
              .map(a => `${a.name}="${a.value}"`)
              .join(' '),
          })),
        };
      }
    }

    // Also dump the left sidebar raw HTML (first 8000 chars)
    const sidebar =
      document.querySelector('[role="tree"]') ??
      document.querySelector('[class*="sidebar"]') ??
      document.querySelector('[class*="explorer"]') ??
      document.querySelector('[class*="panel"]');

    return {
      selectors: results,
      sidebarHtml: sidebar ? sidebar.outerHTML.slice(0, 8000) : 'NOT FOUND',
      monacoAvailable: !!window.monaco?.editor,
      monacoModels: window.monaco?.editor?.getModels()?.length ?? 0,
    };
  });

  // Write DOM dump
  const dump = JSON.stringify(domInfo.selectors, null, 2);
  fs.writeFileSync(DOM_DUMP, dump, 'utf8');
  console.log(`DOM dump saved → ${DOM_DUMP}`);

  // Print selector hits
  console.log('\n── Selector hits ─────────────────────────────');
  for (const [sel, info] of Object.entries(domInfo.selectors)) {
    console.log(`  ${sel.padEnd(30)} → ${info.count} elements`);
    if (info.count <= 5) {
      info.samples.forEach(s =>
        console.log(`     text="${s.text}"  aria-label="${s.ariaLabel}"  aria-expanded="${s.ariaExpanded}"  class="${s.class?.slice(0,60)}"`)
      );
    }
  }

  console.log(`\n  Monaco available: ${domInfo.monacoAvailable}`);
  console.log(`  Monaco models already loaded: ${domInfo.monacoModels}`);

  // ── Determine best selector ─────────────────────────────────────────────────
  // Pick the selector with the most elements that looks like tree items
  const candidates = Object.entries(domInfo.selectors)
    .filter(([sel, info]) =>
      info.count > 0 &&
      (sel.includes('treeitem') || sel.includes('role') ||
       info.samples.some(s => s.ariaExpanded !== null || s.ariaLabel?.match(/\.\w+$/)))
    )
    .sort((a, b) => b[1].count - a[1].count);

  const bestSel = candidates[0]?.[0] ?? '[role="treeitem"]';
  console.log(`\n  Best selector guess: ${bestSel}`);

  // ── Auto-expand and click all files ────────────────────────────────────────
  console.log('\nAuto-expanding folders and clicking files…');

  const extractedFiles = await page.evaluate(async (itemSel) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function getLabel(el) {
      return el.getAttribute('aria-label') ?? el.getAttribute('title') ?? el.textContent?.trim() ?? '';
    }

    // Expand all folders
    for (let round = 0; round < 15; round++) {
      const collapsed = [...document.querySelectorAll(itemSel)]
        .filter(el => el.getAttribute('aria-expanded') === 'false');
      if (!collapsed.length) break;
      for (const el of collapsed) { el.click(); await sleep(120); }
      await sleep(350);
    }

    // Click all files (items with file extensions)
    const allItems = [...document.querySelectorAll(itemSel)];
    const files = allItems.filter(el => {
      const label = getLabel(el);
      return /\.\w{1,6}$/.test(label) && el.getAttribute('aria-expanded') === null;
    });

    console.log('Files to click:', files.map(f => getLabel(f)));

    for (let i = 0; i < files.length; i++) {
      files[i].click();
      await sleep(800);
    }

    await sleep(2000);

    // Collect Monaco models
    const monaco = window.monaco;
    if (!monaco?.editor) return { error: 'Monaco not available', files: [] };

    const models = monaco.editor.getModels()
      .map(m => {
        const uri = m.uri.toString();
        const filePath = uri
          .replace(/^file:\/\/\//, '')
          .replace(/^inmemory:\/\/[^/]+\//, '')
          .replace(/\?.*$/, '');
        return { path: filePath, content: m.getValue() };
      })
      .filter(f =>
        f.content.trim().length > 5 &&
        !f.path.startsWith('ts:') &&
        !f.path.startsWith('node_modules') &&
        !/^[0-9]+$/.test(f.path)
      );

    return { files: models, clickedCount: files.length };
  }, bestSel);

  // ── Save files ──────────────────────────────────────────────────────────────
  if (extractedFiles.error) {
    console.error('\n✘ ' + extractedFiles.error);
  } else {
    const { files, clickedCount } = extractedFiles;
    console.log(`\nClicked ${clickedCount} files, captured ${files.length} Monaco models`);

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    let saved = 0;

    console.log('\n── Saving files ──────────────────────────────');
    for (const { path: rel, content } of files) {
      if (!rel || !content) continue;
      const parts = rel.replace(/\\/g, '/').replace(/^\/+/, '').split('/')
        .map(p => p.replace(/[<>:"|?*\x00-\x1f]/g, '_'));
      const full = path.join(OUTPUT_DIR, ...parts);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, 'utf8');
      console.log(`  ✔  ${rel}`);
      saved++;
    }

    console.log(`\n══════════════════════════════════════════════`);
    console.log(`  Done. ${saved} files saved → ${OUTPUT_DIR}`);
    console.log(`══════════════════════════════════════════════\n`);
  }

  await waitForEnter('Press ENTER to close the browser: ');
  await browser.close();
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
