/**
 * render-fleet-html.js — render the fleet bundle to a single self-contained
 * FLEET.html file.
 *
 * No external CSS or JS — everything inline so the file opens correctly when
 * emailed, copied to SharePoint, or dragged into a browser from disk.
 * Mirrors the structure of render-fleet-md.js + render-fleet-docx.js.
 *
 * Minimal JS for sortable tables (vanilla, ~30 LOC); no framework.
 */

function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function fmtDaysAgo(days) {
  if (days == null) return '—';
  if (days < 0) return 'in future';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const HEALTH_META = {
  ok:               { icon: '✓',  colour: '#16a34a', label: 'OK' },
  'pending-update': { icon: '⏳', colour: '#ca8a04', label: 'Pending update' },
  'tests-failed':   { icon: '✗',  colour: '#dc2626', label: 'Tests failed' },
  stale:            { icon: '🕒', colour: '#a16207', label: 'Stale' },
  warning:          { icon: '⚠',  colour: '#d97706', label: 'Warning' },
  missing:          { icon: '?',  colour: '#6b7280', label: 'Missing' },
  locked:           { icon: '🔒', colour: '#7c3aed', label: 'Locked' },
};

const STYLES = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    margin: 0;
    background: #f9fafb;
    color: #111827;
    line-height: 1.5;
  }
  main { max-width: 1100px; margin: 0 auto; padding: 32px 24px 64px; }
  h1 { font-size: 28px; margin: 0 0 8px; }
  h2 { font-size: 20px; margin: 32px 0 12px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
  h3 { font-size: 16px; margin: 24px 0 8px; }
  .meta { color: #6b7280; font-size: 14px; }
  .meta b { color: #111827; font-weight: 600; }
  .note {
    background: #f3f4f6; border-left: 3px solid #9ca3af;
    padding: 12px 16px; margin: 16px 0; font-size: 14px; color: #4b5563;
  }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 24px; font-size: 14px; background: white; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e5e7eb; }
  th { background: #f3f4f6; cursor: pointer; user-select: none; font-weight: 600; }
  th:hover { background: #e5e7eb; }
  th::after { content: " ↕"; color: #9ca3af; font-size: 11px; }
  th.asc::after  { content: " ↑"; color: #111827; }
  th.desc::after { content: " ↓"; color: #111827; }
  tr:hover td { background: #fafafa; }
  code { background: #f3f4f6; padding: 1px 6px; border-radius: 3px; font-family: Consolas, monospace; font-size: 13px; }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 10px;
    font-size: 12px; font-weight: 600; color: white;
  }
  .health-card {
    background: white; border: 1px solid #e5e7eb; border-radius: 8px;
    padding: 16px 20px; margin: 16px 0;
  }
  .health-card .header {
    display: flex; align-items: center; gap: 12px; margin-bottom: 12px;
  }
  .health-card .header .alias { font-weight: 600; font-size: 16px; }
  .health-card dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; font-size: 13px; }
  .health-card dt { color: #6b7280; }
  .health-card dd { margin: 0; }
  .health-card .warnings {
    margin-top: 12px; padding: 8px 12px; background: #fef3c7;
    border-radius: 4px; font-size: 13px; color: #78350f;
  }
  .health-card .warnings ul { margin: 4px 0 0; padding-left: 20px; }
  .health-card .ctx-excerpt {
    margin-top: 12px; padding: 8px 12px; background: #f3f4f6;
    border-left: 3px solid #9ca3af; font-size: 13px; color: #4b5563; font-style: italic;
  }
  .totals { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 0; }
  .totals td:last-child { text-align: right; font-weight: 600; }
  footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px; text-align: center; }
`;

const SORT_SCRIPT = `
(function() {
  function sortTable(table, colIdx, direction) {
    var tbody = table.tBodies[0]; if (!tbody) return;
    var rows = Array.from(tbody.rows);
    rows.sort(function (a, b) {
      var x = (a.cells[colIdx] && a.cells[colIdx].textContent || '').trim();
      var y = (b.cells[colIdx] && b.cells[colIdx].textContent || '').trim();
      // try numeric
      var xn = parseFloat(x), yn = parseFloat(y);
      if (!isNaN(xn) && !isNaN(yn)) return direction === 'asc' ? xn - yn : yn - xn;
      return direction === 'asc' ? x.localeCompare(y) : y.localeCompare(x);
    });
    rows.forEach(function (r) { tbody.appendChild(r); });
  }
  document.querySelectorAll('table.sortable').forEach(function (table) {
    table.querySelectorAll('thead th').forEach(function (th, idx) {
      th.addEventListener('click', function () {
        var cur = th.classList.contains('asc') ? 'asc' : (th.classList.contains('desc') ? 'desc' : null);
        var next = cur === 'asc' ? 'desc' : 'asc';
        table.querySelectorAll('thead th').forEach(function (other) { other.classList.remove('asc', 'desc'); });
        th.classList.add(next);
        sortTable(table, idx, next);
      });
    });
  });
})();
`;

// ── HTML escaping ──────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function badge(health) {
  const meta = HEALTH_META[health] ?? HEALTH_META.warning;
  return `<span class="badge" style="background:${meta.colour}">${esc(meta.icon)} ${esc(meta.label)}</span>`;
}

// ── Section renderers ──────────────────────────────────────────────────────

function renderHead(data) {
  return `
    <h1>${esc(data.meta.fleetName)} <span style="color:#6b7280">— Fleet Report</span></h1>
    <div class="meta">
      <p><b>Generated:</b> ${esc(fmt(data.meta.generatedAt))}<br/>
         <b>Fleet created:</b> ${esc(fmt(data.meta.fleetCreatedAt))}<br/>
         <b>Config:</b> <code>${esc(data.meta.configPath)}</code> (via ${esc(data.meta.configSource)})<br/>
         <b>Project count:</b> ${data.meta.projectCount}</p>
    </div>
    <div class="note">Auto-generated by <code>vibe-fleet report --html</code>. Single self-contained file — safe to email or upload to SharePoint.</div>
  `;
}

function renderHealthSummary(data) {
  const counts = data.meta.healthCounts;
  const keys = Object.keys(counts).sort();
  if (keys.length === 0) return '';
  const rows = keys.map(k =>
    `<tr><td>${badge(k)}</td><td>${counts[k]}</td></tr>`
  ).join('');
  return `
    <h2>Health Summary</h2>
    <table>
      <thead><tr><th>State</th><th>Count</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderRoster(data) {
  if (data.projects.length === 0) {
    return `<h2>Project Roster</h2><p>No projects registered yet.</p>`;
  }
  const rows = data.projects.map(p => {
    const tests = p.probe.lastTestRunAt
      ? `${p.probe.lastTestPassed ?? 0}P/${p.probe.lastTestFailed ?? 0}F`
      : '—';
    return `
      <tr>
        <td><code>${esc(p.alias)}</code></td>
        <td>${p.probe.currentVersion ? 'v' + esc(p.probe.currentVersion) : '—'}</td>
        <td>${esc(p.appDisplayName || '—')}</td>
        <td>${esc(fmtDaysAgo(p.probe.lastExtractedDaysAgo))}</td>
        <td>${p.probe.hasPendingUpdate ? 'yes' : 'no'}</td>
        <td>${esc(tests)}</td>
        <td>${badge(p.probe.health)}</td>
      </tr>`;
  }).join('');
  return `
    <h2>Project Roster <span style="color:#9ca3af;font-size:13px;font-weight:normal">— click column headers to sort</span></h2>
    <table class="sortable">
      <thead><tr>
        <th>Alias</th><th>Version</th><th>App</th><th>Last extract</th>
        <th>Pending</th><th>Tests</th><th>Health</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderProjectCard(p) {
  const meta = HEALTH_META[p.probe.health] ?? HEALTH_META.warning;
  const tests = p.probe.lastTestRunAt
    ? `${p.probe.lastTestPassed}P / ${p.probe.lastTestFailed}F / ${p.probe.lastTestSkipped}S — ${esc(fmt(p.probe.lastTestRunAt))}`
    : 'never';
  const warnings = p.probe.warnings.length > 0
    ? `<div class="warnings"><b>Warnings:</b><ul>${p.probe.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>`
    : '';
  const ctx = p.contextSummary
    ? `<div class="ctx-excerpt">${esc(p.contextSummary)}</div>`
    : '';
  const tags = p.tags.length > 0
    ? p.tags.map(t => `<code>${esc(t)}</code>`).join(' ')
    : '<span style="color:#9ca3af">(none)</span>';

  return `
    <div class="health-card">
      <div class="header">
        <span style="font-size:22px;color:${meta.colour}">${esc(meta.icon)}</span>
        <span class="alias">${esc(p.alias)}</span>
        ${badge(p.probe.health)}
      </div>
      <dl>
        <dt>Path</dt><dd><code>${esc(p.path)}</code></dd>
        <dt>Tags</dt><dd>${tags}</dd>
        ${p.appDisplayName ? `<dt>App</dt><dd>${esc(p.appDisplayName)}</dd>` : ''}
        ${p.environmentId ? `<dt>Environment</dt><dd><code>${esc(p.environmentId)}</code> (${esc(p.region ?? 'unknown')})</dd>` : ''}
        ${p.appId ? `<dt>App ID</dt><dd><code>${esc(p.appId)}</code></dd>` : ''}
        ${p.packageVersion ? `<dt>package.json</dt><dd>${esc(p.packageVersion)}</dd>` : ''}
        <dt>Current</dt><dd>${p.probe.currentVersion ? 'v' + esc(p.probe.currentVersion) : '—'}</dd>
        <dt>Versions</dt><dd>${p.probe.versionCount}</dd>
        <dt>Last extract</dt><dd>${esc(fmt(p.probe.lastExtractedAt))} (${esc(fmtDaysAgo(p.probe.lastExtractedDaysAgo))})</dd>
        <dt>Pending</dt><dd>${p.probe.hasPendingUpdate ? `yes (v${esc(p.probe.pendingFromVersion)} → v${esc(p.probe.pendingToVersion)})` : 'no'}</dd>
        <dt>Lock</dt><dd>${p.probe.hasLock ? `yes (pid ${p.probe.lockHolderPid ?? '?'})` : 'no'}</dd>
        <dt>Tests</dt><dd>${esc(tests)}</dd>
      </dl>
      ${warnings}
      ${ctx}
    </div>
  `;
}

function renderTotals(data) {
  if (data.projects.length === 0) return '';
  const totalVersions = data.projects.reduce((s, p) => s + (p.probe.versionCount || 0), 0);
  const withTests = data.projects.filter(p => p.probe.lastTestRunAt).length;
  const pending = data.projects.filter(p => p.probe.hasPendingUpdate).length;
  const failing = data.projects.filter(p => (p.probe.lastTestFailed ?? 0) > 0).length;
  const stale = data.projects.filter(p => p.probe.health === 'stale').length;
  return `
    <h2>Aggregated Totals</h2>
    <table class="totals">
      <tbody>
        <tr><td>Total version history entries across fleet</td><td>${totalVersions}</td></tr>
        <tr><td>Projects with at least one test run</td><td>${withTests} / ${data.projects.length}</td></tr>
        <tr><td>Projects with unapplied pending updates</td><td>${pending}</td></tr>
        <tr><td>Projects with failing tests on last run</td><td>${failing}</td></tr>
        <tr><td>Projects with stale extractions (&gt; 30 days)</td><td>${stale}</td></tr>
      </tbody>
    </table>
  `;
}

// ── Public ─────────────────────────────────────────────────────────────────

export function renderFleetHtml(data) {
  const projectCards = data.projects.length > 0
    ? `<h2>Per-Project Detail</h2>${data.projects.map(renderProjectCard).join('')}`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(data.meta.fleetName)} — Fleet Report</title>
<meta name="generator" content="vibe-fleet">
<style>${STYLES}</style>
</head>
<body>
<main>
${renderHead(data)}
${renderHealthSummary(data)}
${renderRoster(data)}
${projectCards}
${renderTotals(data)}
<footer>Generated by vibe-fleet at ${esc(fmt(data.meta.generatedAt))}</footer>
</main>
<script>${SORT_SCRIPT}</script>
</body>
</html>
`;
}
