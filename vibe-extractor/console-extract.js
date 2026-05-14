/**
 * Vibe Auto-Extractor — paste this entire script into the browser DevTools Console
 * while the Vibe editor is open.
 *
 * It will:
 *  1. Find every folder in the file tree and expand them
 *  2. Click every file to load it into Monaco
 *  3. Wait for each file to fully load
 *  4. Copy all file contents + paths to clipboard as JSON
 *
 * Then in PowerShell:
 *   Get-Clipboard | Out-File -Encoding utf8 files.json
 *   node save-files.js
 */
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ── 1. Find the file tree container ────────────────────────────────────────
  // Try every selector pattern we know about
  const TREE_SELECTORS = [
    '[role="tree"]',
    '[class*="fileTree"]',
    '[class*="file-tree"]',
    '[class*="FileTree"]',
    '[class*="explorer"]',
    '[class*="sidebar"]',
    '[class*="filebrowser"]',
  ];

  const ITEM_SELECTORS = [
    '[role="treeitem"]',
    '[class*="treeitem"]',
    '[class*="tree-item"]',
    '[class*="TreeItem"]',
    '[class*="file-item"]',
    '[class*="node"]',
  ];

  function findItems() {
    for (const sel of ITEM_SELECTORS) {
      const found = [...document.querySelectorAll(sel)];
      if (found.length > 0) return { items: found, sel };
    }
    return { items: [], sel: null };
  }

  // ── 2. Detect folders vs files ─────────────────────────────────────────────
  const FILE_EXT = /\.\w{1,6}$/;

  function getLabel(el) {
    return (
      el.getAttribute('aria-label') ??
      el.getAttribute('title') ??
      el.textContent?.trim() ??
      ''
    );
  }

  function isFolder(el) {
    // Collapsed/expanded markers
    if (el.getAttribute('aria-expanded') !== null) return true;
    // No extension = folder
    return !FILE_EXT.test(getLabel(el));
  }

  // ── 3. Expand all folders (loop until nothing new to expand) ───────────────
  async function expandAll() {
    console.log('[1/4] Expanding folders…');
    let rounds = 0;
    while (rounds++ < 15) {
      const { items } = findItems();
      const collapsed = items.filter(
        el => el.getAttribute('aria-expanded') === 'false'
      );
      if (collapsed.length === 0) break;
      console.log(`  Round ${rounds}: expanding ${collapsed.length} folders`);
      for (const el of collapsed) {
        el.click();
        await sleep(150);
      }
      await sleep(400); // let DOM settle
    }
    console.log('  All folders expanded.');
  }

  // ── 4. Click every file ────────────────────────────────────────────────────
  async function clickAllFiles() {
    console.log('[2/4] Opening files…');
    const { items, sel } = findItems();
    if (!items.length) {
      console.error('  ✘ No tree items found. Selector tried:', ITEM_SELECTORS);
      return;
    }
    console.log(`  Using selector: ${sel} — found ${items.length} items`);

    const files = items.filter(el => !isFolder(el));
    console.log(`  ${files.length} files to open`);

    for (let i = 0; i < files.length; i++) {
      const label = getLabel(files[i]);
      files[i].click();
      console.log(`  [${i + 1}/${files.length}] ${label}`);
      await sleep(700); // give Monaco time to load the file
    }
  }

  // ── 5. Collect Monaco models ───────────────────────────────────────────────
  function collectModels() {
    const monaco = window.monaco;
    if (!monaco?.editor) {
      console.error('  ✘ Monaco not available on window.monaco');
      return [];
    }
    return monaco.editor.getModels()
      .map(m => {
        const uri = m.uri.toString();
        let filePath = uri
          .replace(/^file:\/\/\//, '')           // file:///apps/… → apps/…
          .replace(/^inmemory:\/\/[^/]+\//, '')  // inmemory://model/1 → 1
          .replace(/\?.*$/, '');                 // strip query strings
        return { path: filePath, content: m.getValue() };
      })
      .filter(f =>
        f.content.trim().length > 5 &&
        !f.path.startsWith('ts:') &&            // skip TypeScript lib files
        !f.path.startsWith('node_modules') &&
        !/^[0-9]+$/.test(f.path)               // skip unnamed inmemory models
      );
  }

  // ── 6. Diagnostic dump (if Monaco or selectors failed) ────────────────────
  function diagnose() {
    console.group('Diagnostic info');
    console.log('monaco on window?', !!window.monaco);
    console.log('monaco.editor?', !!window.monaco?.editor);
    console.log('Models:', window.monaco?.editor?.getModels()?.length ?? 0);
    const tried = ITEM_SELECTORS.map(s => `${s}: ${document.querySelectorAll(s).length}`);
    console.log('Selector hits:', tried);
    console.groupEnd();
  }

  // ── Run ────────────────────────────────────────────────────────────────────
  try {
    await expandAll();
    await clickAllFiles();

    console.log('[3/4] Waiting 2 s for final Monaco loads…');
    await sleep(2000);

    console.log('[4/4] Collecting Monaco models…');
    const files = collectModels();

    if (files.length === 0) {
      console.warn('  ⚠ No files collected. Running diagnostics…');
      diagnose();
      return;
    }

    console.log(`\n  Collected ${files.length} files:`);
    files.forEach(f => console.log(`    ${f.path}  (${f.content.split('\n').length} lines)`));

    const json = JSON.stringify(files, null, 2);
    await navigator.clipboard.writeText(json);
    console.log(`\n✓ Copied to clipboard! (${(json.length / 1024).toFixed(1)} KB)`);
    console.log('\nNext step in PowerShell:');
    console.log('  Get-Clipboard | Out-File -Encoding utf8 files.json');
    console.log('  node save-files.js');

  } catch (err) {
    console.error('Error:', err);
    diagnose();
  }
})();
