/**
 * render-status.js — render the fleet-wide status table.
 *
 * Pure ASCII (no ANSI colour) for cross-platform compatibility.
 * Marks problem projects with a trailing ⚠ symbol; legend prints below.
 */

function fmtDaysAgo(days) {
  if (days == null) return '—';
  if (days < 0) return 'in future';   // clock skew or test data
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function fmtVersion(v) {
  return v ? `v${v}` : '—';
}

function fmtTests(probe) {
  if (probe.lastTestRunAt == null) return 'never run';
  return `${probe.lastTestPassed ?? 0}P/${probe.lastTestFailed ?? 0}F`;
}

function fmtPending(probe) {
  return probe.hasPendingUpdate ? 'yes' : 'no';
}

function flagSymbol(probe) {
  if (probe.health === 'ok') return '';
  return ' ⚠';
}

// ── Table layout helpers ───────────────────────────────────────────────────

function pad(s, width) {
  s = String(s ?? '');
  // ASCII length only — wide chars not used in our columns
  if (s.length >= width) return s.slice(0, width);
  return s + ' '.repeat(width - s.length);
}

function makeTable(rows, columns) {
  // columns: [{ key, header, minWidth }]
  const widths = columns.map(c => {
    const cells = [c.header, ...rows.map(r => String(r[c.key] ?? ''))];
    return Math.max(c.minWidth ?? 0, ...cells.map(s => s.length));
  });
  const sep = widths.map(w => '─'.repeat(w)).join('  ');
  const header = columns.map((c, i) => pad(c.header, widths[i])).join('  ');
  const body = rows.map(r =>
    columns.map((c, i) => pad(r[c.key], widths[i])).join('  '),
  );
  return [header, sep, ...body].join('\n');
}

// ── Public renderer ────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {object} opts.registry  Parsed fleet config
 * @param {string} opts.configPath
 * @param {string} opts.configSource  How discovery found it (flag/env/walked-up/home-default)
 * @param {Array}  opts.probes    probeProject() results, one per registered project
 * @returns {string}  Multi-line table ready to print
 */
export function renderStatus({ registry, configPath, configSource, probes }) {
  const out = [];
  out.push('');
  out.push(`Fleet: ${registry.fleetName}  (config: ${configPath}, via ${configSource})`);
  out.push(`${registry.projects.length} project${registry.projects.length === 1 ? '' : 's'} registered`);
  out.push('');

  if (registry.projects.length === 0) {
    out.push('No projects yet. Register one with:');
    out.push('  vibe-fleet register <path-to-project>');
    out.push('');
    return out.join('\n');
  }

  // Compose table rows from each {alias, probe} pair.
  const rows = registry.projects.map((p, i) => {
    const probe = probes[i];
    return {
      alias: p.alias + flagSymbol(probe),
      version: fmtVersion(probe.currentVersion),
      lastExtract: fmtDaysAgo(probe.lastExtractedDaysAgo),
      pending: fmtPending(probe),
      lastTest: fmtDaysAgo(probe.lastTestRunAt ? Math.floor((Date.now() - new Date(probe.lastTestRunAt).getTime()) / 86_400_000) : null),
      tests: fmtTests(probe),
    };
  });

  const columns = [
    { key: 'alias',       header: 'Alias',         minWidth: 16 },
    { key: 'version',     header: 'Version',       minWidth: 7 },
    { key: 'lastExtract', header: 'Last extract',  minWidth: 12 },
    { key: 'pending',     header: 'Pending',       minWidth: 7 },
    { key: 'lastTest',    header: 'Last test',     minWidth: 12 },
    { key: 'tests',       header: 'Tests',         minWidth: 9 },
  ];

  out.push(makeTable(rows, columns));
  out.push('');

  // Legend / warnings
  const flagged = probes
    .map((p, i) => ({ alias: registry.projects[i].alias, probe: p }))
    .filter(x => x.probe.health !== 'ok');
  if (flagged.length > 0) {
    out.push('Legend: ⚠ = needs attention');
    out.push('');
    for (const { alias, probe } of flagged) {
      out.push(`  ⚠ ${alias} (${probe.health}):`);
      for (const w of probe.warnings) {
        out.push(`      ${w}`);
      }
    }
    out.push('');
  }

  return out.join('\n');
}
