/**
 * render-md.js — render the system model to docs/SYSTEM.md
 *
 * The Solution Graph is rendered in THREE forms:
 *   1. ASCII diagram     — for any text viewer
 *   2. Mermaid source    — for GitHub-rendered viewers
 *   3. JSON graph spec   — for AI agents (machine-parseable)
 *
 * Every section also includes structured metadata so an AI agent can extract
 * component info, edges, flows, and impact analysis directly from the doc.
 */

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function section(title) {
  return `\n## ${title}\n`;
}

function bullet(items) {
  return items.map(i => `- ${i}`).join('\n');
}

// ── Solution Graph: three views ────────────────────────────────────────────

function renderAsciiGraph() {
  return [
    '```',
    '                           ┌─────────────┐',
    '                           │  developer  │',
    '                           └──────┬──────┘',
    '            ┌─────────────────────┼──────────────────────┐',
    '            ▼                     ▼                      ▼',
    '   ┌────────────────┐   ┌──────────────────┐   ┌──────────────────┐',
    '   │ vibe-extractor │   │   claude-code    │   │  vibe-verifier   │',
    '   │  (Playwright)  │   │   (skills/*)     │   │  (Playwright)    │',
    '   └────────┬───────┘   └────────┬─────────┘   └────────┬─────────┘',
    '            │                    │                       │',
    '            │ writes             │ reads + writes        │ reads/writes',
    '            ▼                    ▼                       ▼',
    '   ┌────────────────────────────────────────────────────────────────┐',
    '   │   vibe-source/  vibe-baseline/  vibe-history.json              │',
    '   │   vibe-pending-update.json  vibe-migration.json                │',
    '   │   vibe-baselines-snapshots/v*/                                 │',
    '   └─────────────────────────────┬──────────────────────────────────┘',
    '                                 │                ┌──────────────────┐',
    '                                 ▼                │  vibe-reporter   │',
    '                       ┌──────────────────┐       │  (docx)          │',
    '                       │ [ProjectName]/   │◄──────┤                  │',
    '                       │ (Power Code app) │       └────────┬─────────┘',
    '                       └────────┬─────────┘                │',
    '                                │ npx power-apps push      ▼',
    '                                ▼                ┌──────────────────┐',
    '                       ┌──────────────────┐      │ docs/PROJECT.md  │',
    '                       │ Power Apps player│      │ docs/PROJECT.docx│',
    '                       │ (deployed app)   │      └──────────────────┘',
    '                       └────────┬─────────┘',
    '                                │',
    '                                │ tests run against',
    '                                ▼',
    '                       ┌──────────────────┐      ┌──────────────────┐',
    '                       │   tests/specs/   │─────▶│  github (issues) │',
    '                       │   tests/results/ │      │   via gh CLI     │',
    '                       └──────────────────┘      └──────────────────┘',
    '```',
  ].join('\n');
}

function renderMermaidGraph(model) {
  const lines = ['```mermaid', 'graph TD'];
  // Subgraphs by type for readability
  const byType = {};
  for (const n of model.nodes) {
    (byType[n.type] ??= []).push(n);
  }
  // Node declarations
  for (const n of model.nodes) {
    const label = n.id.replace(/[:/]/g, '_');
    const text = `${n.id}<br/><i>${n.type}</i>`;
    if (n.type === 'actor') lines.push(`    ${label}(["${text}"])`);
    else if (n.type === 'cli-tool') lines.push(`    ${label}["${text}"]`);
    else if (n.type === 'skill') lines.push(`    ${label}{{"${text}"}}`);
    else if (n.type === 'artifact' || n.type === 'handoff') lines.push(`    ${label}[("${text}")]`);
    else if (n.type === 'external') lines.push(`    ${label}>"${text}"]`);
    else if (n.type === 'config') lines.push(`    ${label}[/"${text}"/]`);
    else lines.push(`    ${label}["${text}"]`);
  }
  // Edges
  for (const e of model.edges) {
    const fromLabel = e.from.replace(/[:/]/g, '_');
    const toLabel = e.to.replace(/[:/]/g, '_');
    const arrow =
      e.type === 'depends-on' ? '-..->|depends|'
      : e.type === 'triggers' ? '-->|triggers|'
      : e.type === 'invokes'  ? '-->|invokes|'
      : e.type === 'reads'    ? '-->|reads|'
      : e.type === 'writes'   ? '==>|writes|'
      : e.type === 'appends'  ? '==>|appends|'
      : '-->';
    lines.push(`    ${fromLabel} ${arrow} ${toLabel}`);
  }
  lines.push('```');
  return lines.join('\n');
}

function renderJsonGraph(model) {
  // Minimal AI-targeted projection — strip prose, keep relationships.
  const nodes = model.nodes.map(n => ({
    id: n.id,
    type: n.type,
    location: n.location ?? null,
    entrypoint: n.entrypoint ?? null,
    invokedAs: n.invokedAs ?? null,
    ownership: n.ownership ?? null,
  }));
  const edges = model.edges.map(e => ({ from: e.from, to: e.to, type: e.type }));
  return '```json\n' + JSON.stringify({ nodes, edges }, null, 2) + '\n```';
}

// ── Section renderers ──────────────────────────────────────────────────────

function renderTitle(model) {
  return [
    `# ${model.name} — System Documentation`,
    '',
    `**Version:** ${model.version}`,
    `**Generated:** ${fmtDate(new Date().toISOString())}`,
    `**Repository:** ${model.repo}`,
    `**Audience:** ${model.generatedFor}`,
    '',
    '> Auto-generated by `vibe-toolkit-doc`. **Do not edit by hand** — edit `vibe-toolkit-doc/lib/system-model.js` and re-run `node vibe-toolkit-doc/index.js`.',
  ].join('\n');
}

function renderBusinessPurpose(model) {
  return [section('Business Purpose'), model.businessPurpose].join('\n');
}

function renderExecutiveSummary(model) {
  return [section('Executive Summary'), model.executiveSummary].join('\n');
}

function renderSystemOverview(model) {
  const counts = {};
  for (const n of model.nodes) counts[n.type] = (counts[n.type] ?? 0) + 1;
  const rows = Object.entries(counts).map(([t, c]) => `| ${t} | ${c} |`).join('\n');
  return [
    section('System Overview'),
    'The toolkit is composed of:',
    '',
    '| Component type | Count |',
    '|---|---|',
    rows,
    '',
    `Plus **${model.edges.length} explicit relationships** between them, **${model.flows.length} named data flows**, and **${model.impactAnalysis.length} impact-analysis entries**.`,
  ].join('\n');
}

function renderSolutionGraph(model) {
  return [
    section('Solution Graph'),
    'Three representations of the same graph. Use whichever fits your viewer:',
    '',
    '### View 1 — ASCII diagram (for any text viewer)',
    '',
    renderAsciiGraph(),
    '',
    '### View 2 — Mermaid (renders in GitHub, VS Code, many Markdown viewers)',
    '',
    renderMermaidGraph(model),
    '',
    '### View 3 — JSON graph spec (for AI agents)',
    '',
    'Parse this directly. Each `node` has `id, type, location, entrypoint, invokedAs, ownership`. Each `edge` is `{from, to, type}`.',
    '',
    renderJsonGraph(model),
  ].join('\n');
}

function renderComponentCatalog(model) {
  const lines = [section('Component Catalog'), ''];
  const grouped = {};
  for (const n of model.nodes) (grouped[n.type] ??= []).push(n);
  for (const [type, nodes] of Object.entries(grouped)) {
    lines.push(`### Type: \`${type}\` (${nodes.length})`);
    lines.push('');
    for (const n of nodes) {
      lines.push(`#### \`${n.id}\``);
      lines.push('');
      lines.push(`${n.description}`);
      lines.push('');
      const metaRows = [];
      if (n.location) metaRows.push(['Location', `\`${n.location}\``]);
      if (n.entrypoint) metaRows.push(['Entrypoint', `\`${n.entrypoint}\``]);
      if (n.invokedAs) metaRows.push(['Invoked as', `\`${n.invokedAs}\``]);
      if (n.flags) metaRows.push(['Flags', n.flags.map(f => `\`${f}\``).join(', ')]);
      if (n.dependencies) metaRows.push(['Dependencies', n.dependencies.map(d => `\`${d}\``).join(', ')]);
      if (n.schema) metaRows.push(['Schema', n.schema]);
      if (n.ownership) metaRows.push(['Ownership', n.ownership]);
      if (metaRows.length > 0) {
        lines.push('| Field | Value |');
        lines.push('|---|---|');
        lines.push(...metaRows.map(([k, v]) => `| ${k} | ${v} |`));
        lines.push('');
      }
    }
  }
  return lines.join('\n');
}

function renderDataFlows(model) {
  const lines = [section('Data Flows'), ''];
  for (const flow of model.flows) {
    lines.push(`### Flow: ${flow.name}`);
    lines.push('');
    lines.push(`**Trigger:** ${flow.trigger}`);
    lines.push('');
    lines.push('**Steps:**');
    lines.push('');
    flow.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push('');
  }
  return lines.join('\n');
}

function renderImpactAnalysis(model) {
  const lines = [section('Impact Analysis'), ''];
  lines.push('What changes when you modify or remove each significant component.');
  lines.push('');
  for (const item of model.impactAnalysis) {
    lines.push(`### \`${item.component}\``);
    lines.push('');
    if (item.ifModified) {
      lines.push(`**If modified:** ${item.ifModified}`);
      lines.push('');
    }
    if (item.breaksIfRemoved) {
      lines.push(`**Breaks if removed:**`);
      lines.push(bullet(item.breaksIfRemoved));
      lines.push('');
    }
    if (item.criticalInvariants) {
      lines.push(`**Critical invariants:**`);
      lines.push(bullet(item.criticalInvariants));
      lines.push('');
    }
  }
  return lines.join('\n');
}

function renderRelationshipMatrix(model) {
  // For AI agents that want quick reverse-lookup: "who reads X?", "who writes X?"
  const by = { reads: {}, writes: {}, appends: {}, invokes: {}, triggers: {}, 'depends-on': {} };
  for (const e of model.edges) {
    if (!by[e.type]) continue;
    (by[e.type][e.to] ??= []).push(e.from);
  }
  const lines = [section('Relationship Matrix'), ''];
  lines.push('Reverse-lookup: for each target, who acts on it. AI agents can use this to answer "what breaks if I change X?" without re-traversing the edge list.');
  lines.push('');
  for (const [type, map] of Object.entries(by)) {
    if (Object.keys(map).length === 0) continue;
    lines.push(`### \`${type}\``);
    lines.push('');
    lines.push('| Target | Actors |');
    lines.push('|---|---|');
    for (const [target, actors] of Object.entries(map).sort()) {
      lines.push(`| \`${target}\` | ${actors.map(a => `\`${a}\``).join(', ')} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function renderFooter(model) {
  return [
    '\n---\n',
    `_Generated by \`vibe-toolkit-doc\` at ${fmtDate(new Date().toISOString())}._`,
    `_Edit the source model: \`vibe-toolkit-doc/lib/system-model.js\` — never edit this file directly._`,
  ].join('\n');
}

// ── Public entry ───────────────────────────────────────────────────────────

export function renderMarkdown(model) {
  return [
    renderTitle(model),
    renderBusinessPurpose(model),
    renderExecutiveSummary(model),
    renderSystemOverview(model),
    renderSolutionGraph(model),
    renderComponentCatalog(model),
    renderDataFlows(model),
    renderRelationshipMatrix(model),
    renderImpactAnalysis(model),
    renderFooter(model),
  ].join('\n');
}
