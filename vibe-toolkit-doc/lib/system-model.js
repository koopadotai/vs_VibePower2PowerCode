/**
 * system-model.js — the structured representation of the VibePower2PowerCode toolkit.
 *
 * This is the source of truth for both human documentation and AI-agent
 * consumption. The renderers (render-md.js and render-docx.js) project this
 * model into Markdown and Word respectively. The model itself is exported
 * as JSON in the rendered output so AI agents can parse it directly.
 *
 * When the toolkit's architecture changes, edit THIS FILE — never edit
 * the generated docs directly.
 */

export const systemModel = {
  // ── Identity ──────────────────────────────────────────────────────────────
  name: 'VibePower2PowerCode',
  shortName: 'VibePower2PowerCode',
  version: '1.0.0',
  repo: 'https://github.com/koopadotai/vs_VibePower2PowerCode',
  generatedFor: 'humans + AI agents',

  // ── Business framing ──────────────────────────────────────────────────────
  businessPurpose:
    'Migrate Power Apps Vibe projects (make.powerapp.com — Microsoft\'s low-code React/Vite ' +
    'authoring environment) into Microsoft Power Code (Code First Power Apps using React + ' +
    'TypeScript with the @microsoft/power-apps SDK). Vibe is not directly portable to Power ' +
    'Code: source files are Vite-transformed, data models use friendly field names instead of ' +
    'raw Dataverse names, routing breaks inside the Power Apps player iframe, and connectors ' +
    'must be called via the SDK rather than direct fetch(). This toolkit automates the ' +
    'mechanical work and provides AI-guided assistance for the reasoning work, so a developer ' +
    'can take a Vibe prototype and ship it as a maintainable, deployable Power Code app.',

  executiveSummary:
    'VibePower2PowerCode is an AI-assisted migration toolkit. It consists of three Node.js ' +
    'CLIs (vibe-extractor, vibe-verifier, vibe-reporter) plus seven Claude Code skills that ' +
    'orchestrate them. The developer extracts their Vibe app source via Playwright, runs ' +
    '/migrate in Claude Code (which auto-detects first-time vs incremental and adapts the ' +
    'reasoning steps accordingly), optionally generates Playwright verification tests, and ' +
    'optionally produces stakeholder documentation. The system maintains a versioned baseline ' +
    'so every re-extraction from Vibe produces a scoped diff — /migrate Mode B then applies ' +
    'only the changed files instead of re-running the full migration. Version control, test ' +
    'results, and ADRs flow into a single auto-generated project documentation artifact ' +
    '(PROJECT.md + PROJECT.docx) for handover and audit.',

  // ── Nodes (components) ────────────────────────────────────────────────────
  // Each node is a participant in the system. Types:
  //   cli-tool     — Node.js CLI runnable as `node <path>`
  //   skill        — Claude Code skill (invoked as a slash command)
  //   artifact     — file or folder produced/consumed by the system
  //   handoff      — short-lived artifact that passes data between phases
  //   external     — outside dependency the system relies on
  //   config       — configuration the developer maintains
  //   actor        — human or AI that initiates work
  nodes: [
    {
      id: 'developer',
      type: 'actor',
      description: 'The person running the migration. Provides project name, env IDs, and approves ambiguous decisions.',
    },
    {
      id: 'claude-code',
      type: 'actor',
      description: 'AI agent that executes skills, makes mechanical edits, and grills the developer on ambiguous decisions.',
    },
    {
      id: 'vibe-app',
      type: 'external',
      description: 'The source Vibe project at make.powerapp.com. Authored in Microsoft\'s low-code Vibe environment.',
      location: 'make.powerapp.com',
    },
    {
      id: 'power-apps-player',
      type: 'external',
      description: 'The deployed-app runtime at apps.powerapps.com/play. Hosts the migrated Power Code app inside an iframe.',
      location: 'apps.powerapps.com',
    },
    {
      id: 'github',
      type: 'external',
      description: 'Where test failures are filed as issues. Requires `gh` CLI and authenticated session.',
    },
    {
      id: 'gh-cli',
      type: 'external',
      description: 'GitHub CLI. Used by vibe-verifier to create/comment on issues. Must be installed and authenticated (`gh auth login`).',
    },
    {
      id: 'playwright',
      type: 'external',
      description: 'Browser automation framework. Used by vibe-extractor to scrape Vibe and by vibe-verifier to run tests.',
    },
    {
      id: 'docx',
      type: 'external',
      description: 'npm package for producing .docx files. Used by vibe-reporter and vibe-toolkit-doc.',
    },

    {
      id: 'vibe-extractor',
      type: 'cli-tool',
      description: 'Playwright tool that signs into make.powerapp.com, scrapes the Vibe source tree, decodes inline source maps, then diffs against vibe-baseline/ to bump the version and write a pending-update manifest.',
      location: 'vibe-extractor/',
      entrypoint: 'node vibe-extractor/index.js',
      flags: ['--major', '--patch', '--force'],
      dependencies: ['playwright'],
    },
    {
      id: 'vibe-verifier',
      type: 'cli-tool',
      description: 'Playwright runner for the deployed Power Apps player. Runs version-scoped test specs against the live app and auto-creates GitHub issues on failure (deduped).',
      location: 'vibe-verifier/',
      entrypoint: 'node vibe-verifier/index.js',
      flags: ['--setup-auth', '--latest', '--since vX.Y.Z', '--headless', '--no-report', '--app-url'],
      dependencies: ['playwright', '@playwright/test', 'gh-cli'],
    },
    {
      id: 'vibe-reporter',
      type: 'cli-tool',
      description: 'Builds PROJECT.md and PROJECT.docx from the migrated project state: history, ownership, ADRs, field mappings, dependencies, test results.',
      location: 'vibe-reporter/',
      entrypoint: 'node vibe-reporter/index.js',
      flags: ['--md-only', '--out <folder>'],
      dependencies: ['docx'],
    },
    {
      id: 'vibe-toolkit-doc',
      type: 'cli-tool',
      description: 'Generates the toolkit\'s own system documentation (SYSTEM.md + SYSTEM.docx) — the document you are currently reading.',
      location: 'vibe-toolkit-doc/',
      entrypoint: 'node vibe-toolkit-doc/index.js',
      dependencies: ['docx'],
    },
    {
      id: 'vibe-fleet',
      type: 'cli-tool',
      description: 'Multi-project orchestration. Maintains a registry of migrated projects (`fleet.config.json` or `~/.vibe-fleet/registry.json`) and shows their state on one screen. Drives batch extract/verify across the whole fleet and generates aggregated reports (FLEET.md/docx/html).',
      location: 'vibe-fleet/',
      entrypoint: 'node vibe-fleet/index.js',
      flags: ['init', 'register', 'unregister', 'list', 'status', 'doctor', 'extract', 'verify', 'report', '--config', '--alias', '--tag', '--global', '--since', '--headless', '--no-report', '--md-only', '--html', '--out', '--stop-on-failure'],
      dependencies: ['zod', 'docx'],
    },
    {
      id: 'vibe-patterns',
      type: 'cli-tool',
      description: 'Shared knowledge base of reusable migration patterns: per-environment field mappings, connector configs, common ADR templates. New migrations inherit instead of re-discovering. Thin CLI; most use is by /migrate consuming patterns inline.',
      location: 'vibe-patterns/',
      entrypoint: 'node vibe-patterns/index.js',
      flags: ['list', 'show', 'apply', '--to'],
      dependencies: [],
    },

    {
      id: 'skill:migrate',
      type: 'skill',
      description: 'Single entry point for migration. Dispatches to Mode A (first-run), Mode B (incremental apply), or Mode C (up-to-date) based on project state.',
      location: 'skills/migrate.md',
      invokedAs: '/migrate',
    },
    {
      id: 'skill:verify-migration',
      type: 'skill',
      description: 'Generate Playwright tests, run them against the deployed app, diagnose failures, surface GitHub issues. Triggered at end of /migrate or invoked standalone.',
      location: 'skills/verify-migration.md',
      invokedAs: '/verify-migration',
    },
    {
      id: 'skill:migration-report',
      type: 'skill',
      description: 'Run vibe-reporter to produce PROJECT.md and PROJECT.docx. Triggered at end of /migrate or invoked standalone.',
      location: 'skills/migration-report.md',
      invokedAs: '/migration-report',
    },
    {
      id: 'skill:map-fields',
      type: 'skill',
      description: 'Discover and document field-name mappings between Vibe friendly names and Dataverse raw names. Called inline by /migrate when needed.',
      location: 'skills/map-fields.md',
      invokedAs: '/map-fields',
    },
    {
      id: 'skill:add-connector',
      type: 'skill',
      description: 'Guide the developer through `npx power-apps add-data-source` for Office 365, SharePoint, etc.',
      location: 'skills/add-connector.md',
      invokedAs: '/add-connector',
    },
    {
      id: 'skill:grill-with-docs',
      type: 'skill',
      description: 'Interview protocol: ask one question at a time, enforce terminology, probe edge cases, capture resolved terms in CONTEXT.md.',
      location: 'skills/grill-with-docs.md',
      invokedAs: '/grill-with-docs',
    },
    {
      id: 'skill:diagnose',
      type: 'skill',
      description: 'Disciplined diagnosis loop for hard bugs: reproduce → minimise → hypothesise → instrument → fix → regression test.',
      location: 'skills/diagnose.md',
      invokedAs: '/diagnose',
    },
    {
      id: 'skill:handoff',
      type: 'skill',
      description: 'Compact the current conversation into a handoff document for the next agent or session.',
      location: 'skills/handoff.md',
      invokedAs: '/handoff',
    },
    {
      id: 'skill:karpathy-guidelines',
      type: 'skill',
      description: 'Behavioural rules: think before coding, simplicity first, surgical changes, goal-driven execution.',
      location: 'skills/karpathy-guidelines.md',
      invokedAs: '/karpathy-guidelines',
    },
    {
      id: 'doc:version-control',
      type: 'skill',
      description: 'Reference doc (not a slash command) describing the versioning policy: file ownership, manifest schemas, snapshot rotation, semver rules.',
      location: 'skills/version-control.md',
    },

    {
      id: 'art:vibe-source',
      type: 'artifact',
      description: 'Cleaned TypeScript source extracted from Vibe (source maps decoded). Refreshed by every vibe-extractor run.',
      location: 'vibe-source/',
      schema: 'Tree of .ts/.tsx/.css files mirroring src/ of the Vibe app.',
      ownership: 'vibe-extractor writes; /migrate reads.',
    },
    {
      id: 'art:vibe-baseline',
      type: 'artifact',
      description: 'Live baseline — the most recent Vibe state on disk. Used as the diff reference for the next extraction.',
      location: 'vibe-baseline/',
      schema: 'Same tree shape as vibe-source/ at the time of the last successful run.',
      ownership: 'vibe-extractor writes (on diff); /migrate Mode A initialises on first run.',
    },
    {
      id: 'art:vibe-history',
      type: 'artifact',
      description: 'Append-only audit log of every migration version. Survives snapshot rotation. The single source of truth for version history.',
      location: 'vibe-history.json',
      schema: '{ projectName, versions: [{ version, extractedAt, fileCount, treeHash, changedFiles, snapshotPath, gitTag, note, testResults? }] }',
      ownership: 'vibe-extractor appends; /migrate Mode A initialises; /migrate Mode B writes `note`; vibe-verifier writes `testResults`.',
    },
    {
      id: 'art:vibe-baselines-snapshots',
      type: 'artifact',
      description: 'Filesystem snapshots, one per version. Last 3 kept; older auto-rotated. Git tags (vibe-baseline-vX.Y.Z) preserve them past rotation.',
      location: 'vibe-baselines-snapshots/v{X.Y.Z}/',
      schema: 'Same tree shape as vibe-baseline/ at the time of that version.',
      ownership: 'vibe-extractor writes; rotated automatically.',
    },
    {
      id: 'art:vibe-pending-update',
      type: 'handoff',
      description: 'Short-lived diff manifest from extractor to /migrate. Presence triggers Mode B; absence + history present triggers Mode C.',
      location: 'vibe-pending-update.json',
      schema: '{ fromVersion, toVersion, extractedAt, changedFiles: { added, modified, deleted }, sourceDir, baselineDir, snapshotPath }',
      ownership: 'vibe-extractor writes; /migrate Mode B reads then deletes.',
    },
    {
      id: 'art:vibe-migration',
      type: 'artifact',
      description: 'File ownership manifest. Decides which files /migrate Mode B may auto-overwrite (vibeOwned) vs must ask about (migrationOwned / requiresReview).',
      location: 'vibe-migration.json',
      schema: '{ projectName, migratedAt, vibeOwned: [], migrationOwned: [], requiresReview: [] }',
      ownership: '/migrate Mode A writes once; Mode B reads on every incremental run.',
    },
    {
      id: 'art:power-code-project',
      type: 'artifact',
      description: 'The migrated Power Code project — what the developer actually deploys. Lives at the project name the developer chose.',
      location: '[ProjectName]/',
      schema: 'Vite + React + TypeScript project with @microsoft/power-apps SDK.',
      ownership: '/migrate writes; npx power-apps push deploys.',
    },
    {
      id: 'art:power-config',
      type: 'config',
      description: 'Per-project config that names the Power Platform environment, region, and (once pushed) appId. Drives connector and deployment behaviour.',
      location: '[ProjectName]/power.config.json',
      schema: '{ version, appDisplayName, region, environmentId, appId, localAppUrl, buildPath, buildEntryPoint }',
      ownership: 'developer + npx power-apps push.',
    },
    {
      id: 'art:context',
      type: 'artifact',
      description: 'Glossary + field-mapping decisions. Append-only — grill-with-docs writes here as terms are resolved.',
      location: 'CONTEXT.md',
      ownership: 'developer + /migrate + /grill-with-docs.',
    },
    {
      id: 'art:adrs',
      type: 'artifact',
      description: 'Architecture Decision Records. One file per significant, hard-to-reverse decision.',
      location: 'docs/adr/*.md',
      ownership: 'developer (created lazily when /grill-with-docs decides one is warranted).',
    },
    {
      id: 'art:test-specs',
      type: 'artifact',
      description: 'Playwright test files. One folder per migration version. AI-generated initially; human-reviewed before being trusted.',
      location: 'tests/specs/v{X.Y.Z}/*.spec.ts',
      ownership: '/verify-migration writes; developer reviews and edits.',
    },
    {
      id: 'art:test-results',
      type: 'artifact',
      description: 'Per-run Playwright artifacts: report.json, traces, screenshots, videos. Used for diagnosis.',
      location: 'tests/results/v{X.Y.Z}/{YYYY-MM-DD}/',
      ownership: 'vibe-verifier writes.',
    },
    {
      id: 'art:auth-state',
      type: 'artifact',
      description: 'Saved Microsoft account session for the deployed Power Apps player. Gitignored — contains auth tokens.',
      location: 'vibe-verifier/.auth/state.json',
      ownership: '`node vibe-verifier/index.js --setup-auth` writes once; subsequent runs read.',
    },
    {
      id: 'art:project-doc',
      type: 'artifact',
      description: 'Project documentation for the user\'s migrated app. Comprehensive bundle of overview, history, mappings, ADRs, dependencies, test results.',
      location: 'docs/PROJECT.md, docs/PROJECT.docx',
      ownership: 'vibe-reporter writes.',
    },
    {
      id: 'art:system-doc',
      type: 'artifact',
      description: 'System documentation for the toolkit itself (this document).',
      location: 'docs/SYSTEM.md, docs/SYSTEM.docx',
      ownership: 'vibe-toolkit-doc writes.',
    },
    {
      id: 'art:fleet-config',
      type: 'config',
      description: 'The fleet registry — lists every project vibe-fleet manages. Per-workspace (./fleet.config.json) or global (~/.vibe-fleet/registry.json). Stores alias, absolute path, registration date, optional tags.',
      location: 'fleet.config.json OR ~/.vibe-fleet/registry.json',
      schema: '{ fleetName, createdAt, projects: [{ alias, path, registeredAt, lastSeen?, tags? }] }',
      ownership: 'vibe-fleet (init/register/unregister write; status/doctor/report/extract/verify read).',
    },
    {
      id: 'art:fleet-doc',
      type: 'artifact',
      description: 'Aggregated fleet documentation — every project on one screen. FLEET.md is git-trackable source; FLEET.docx for stakeholders; FLEET.html is a self-contained single-file dashboard with sortable tables.',
      location: 'FLEET.md, FLEET.docx, FLEET.html (same dir as fleet.config.json or --out)',
      ownership: 'vibe-fleet report writes.',
    },
    {
      id: 'art:vibe-patterns',
      type: 'artifact',
      description: 'Shared knowledge base. Reusable field mappings, connector configs, and ADR templates that new migrations inherit. Lives in the toolkit checkout, not in any individual project.',
      location: 'vibe-patterns/{field-mappings,connectors,adrs}/',
      schema: 'field-mappings/*.json + connectors/*.json + adrs/*.md',
      ownership: 'developer maintains; vibe-patterns CLI lists/applies; /migrate Mode A consumes.',
    },
  ],

  // ── Edges (relationships) ─────────────────────────────────────────────────
  // type: invokes | reads | writes | appends | triggers | depends-on
  edges: [
    { from: 'developer', to: 'vibe-extractor', type: 'invokes', description: 'Runs node vibe-extractor/index.js' },
    { from: 'developer', to: 'claude-code', type: 'invokes', description: 'Types /migrate or other slash commands' },
    { from: 'developer', to: 'vibe-verifier', type: 'invokes', description: 'Runs node vibe-verifier/index.js (directly or via /verify-migration)' },
    { from: 'developer', to: 'vibe-reporter', type: 'invokes', description: 'Runs node vibe-reporter/index.js (directly or via /migration-report)' },

    { from: 'vibe-extractor', to: 'vibe-app', type: 'reads', description: 'Playwright scrapes the Vibe app via authenticated browser session' },
    { from: 'vibe-extractor', to: 'art:vibe-source', type: 'writes', description: 'Cleaned TypeScript (source maps decoded)' },
    { from: 'vibe-extractor', to: 'art:vibe-baseline', type: 'writes', description: 'Replaces with new clean content when diff is non-empty' },
    { from: 'vibe-extractor', to: 'art:vibe-baselines-snapshots', type: 'writes', description: 'Snapshots new version; rotates oldest if > 3' },
    { from: 'vibe-extractor', to: 'art:vibe-history', type: 'appends', description: 'New entry with version, hash, file diff, snapshot path' },
    { from: 'vibe-extractor', to: 'art:vibe-pending-update', type: 'writes', description: 'Diff manifest for /migrate Mode B' },
    { from: 'vibe-extractor', to: 'playwright', type: 'depends-on' },

    { from: 'claude-code', to: 'skill:migrate', type: 'invokes', description: 'Reads skill markdown and follows its procedure' },
    { from: 'claude-code', to: 'skill:verify-migration', type: 'invokes' },
    { from: 'claude-code', to: 'skill:migration-report', type: 'invokes' },

    { from: 'skill:migrate', to: 'art:vibe-pending-update', type: 'reads', description: 'Mode B reads the pending manifest' },
    { from: 'skill:migrate', to: 'art:vibe-migration', type: 'writes', description: 'Mode A creates; Mode B reads' },
    { from: 'skill:migrate', to: 'art:vibe-source', type: 'reads', description: 'Source of files to copy into the Power Code project' },
    { from: 'skill:migrate', to: 'art:power-code-project', type: 'writes', description: 'Mode A scaffolds; Mode B applies file-scoped changes' },
    { from: 'skill:migrate', to: 'art:vibe-history', type: 'writes', description: 'Mode B writes the `note` field on the latest version entry' },
    { from: 'skill:migrate', to: 'art:context', type: 'writes', description: 'Glossary + decisions written inline as they\'re resolved' },
    { from: 'skill:migrate', to: 'art:adrs', type: 'writes', description: 'Lazily creates ADRs for hard-to-reverse decisions' },
    { from: 'skill:migrate', to: 'skill:map-fields', type: 'invokes', description: 'Inline when field mapping is ambiguous' },
    { from: 'skill:migrate', to: 'skill:add-connector', type: 'invokes', description: 'When a new connector is detected' },
    { from: 'skill:migrate', to: 'skill:grill-with-docs', type: 'invokes', description: 'When a decision needs interview-style resolution' },
    { from: 'skill:migrate', to: 'skill:verify-migration', type: 'triggers', description: 'End-of-migrate prompts to generate/run tests' },
    { from: 'skill:migrate', to: 'skill:migration-report', type: 'triggers', description: 'End-of-migrate prompts to generate/refresh the project doc' },

    { from: 'skill:verify-migration', to: 'vibe-verifier', type: 'invokes' },
    { from: 'skill:verify-migration', to: 'art:test-specs', type: 'writes', description: 'Generated Playwright tests' },
    { from: 'skill:verify-migration', to: 'skill:diagnose', type: 'invokes', description: 'On test failure' },

    { from: 'vibe-verifier', to: 'art:test-specs', type: 'reads' },
    { from: 'vibe-verifier', to: 'art:auth-state', type: 'reads', description: 'Loads saved MS account session' },
    { from: 'vibe-verifier', to: 'power-apps-player', type: 'reads', description: 'Playwright runs tests against the live deployed app' },
    { from: 'vibe-verifier', to: 'art:test-results', type: 'writes' },
    { from: 'vibe-verifier', to: 'art:vibe-history', type: 'appends', description: 'Writes testResults onto the matching version entry' },
    { from: 'vibe-verifier', to: 'gh-cli', type: 'depends-on' },
    { from: 'vibe-verifier', to: 'github', type: 'writes', description: 'Creates/comments on issues for failures' },
    { from: 'vibe-verifier', to: 'playwright', type: 'depends-on' },

    { from: 'skill:migration-report', to: 'vibe-reporter', type: 'invokes' },
    { from: 'vibe-reporter', to: 'art:vibe-history', type: 'reads' },
    { from: 'vibe-reporter', to: 'art:vibe-migration', type: 'reads' },
    { from: 'vibe-reporter', to: 'art:context', type: 'reads' },
    { from: 'vibe-reporter', to: 'art:adrs', type: 'reads' },
    { from: 'vibe-reporter', to: 'art:power-code-project', type: 'reads', description: 'Scans package.json, models, connectors' },
    { from: 'vibe-reporter', to: 'art:power-config', type: 'reads' },
    { from: 'vibe-reporter', to: 'art:project-doc', type: 'writes' },
    { from: 'vibe-reporter', to: 'docx', type: 'depends-on' },

    { from: 'vibe-toolkit-doc', to: 'art:system-doc', type: 'writes' },
    { from: 'vibe-toolkit-doc', to: 'docx', type: 'depends-on' },

    // ── Fleet edges ──────────────────────────────────────────────────────
    { from: 'developer', to: 'vibe-fleet', type: 'invokes', description: 'Runs vibe-fleet commands (init, register, status, doctor, extract, verify, report)' },
    { from: 'vibe-fleet', to: 'art:fleet-config', type: 'writes', description: 'init/register/unregister write; status/doctor/report/extract/verify read' },
    { from: 'vibe-fleet', to: 'art:vibe-history', type: 'reads', description: 'Probe step reads each project\'s history for status/doctor/report' },
    { from: 'vibe-fleet', to: 'art:vibe-pending-update', type: 'reads', description: 'Detects pending updates per project' },
    { from: 'vibe-fleet', to: 'art:vibe-migration', type: 'reads' },
    { from: 'vibe-fleet', to: 'art:power-config', type: 'reads' },
    { from: 'vibe-fleet', to: 'art:context', type: 'reads', description: 'Excerpts CONTEXT.md first paragraph for fleet report' },
    { from: 'vibe-fleet', to: 'vibe-extractor', type: 'invokes', description: '`vibe-fleet extract` spawns one per project, sequentially' },
    { from: 'vibe-fleet', to: 'vibe-verifier', type: 'invokes', description: '`vibe-fleet verify` spawns one per project, sequentially' },
    { from: 'vibe-fleet', to: 'art:fleet-doc', type: 'writes', description: '`vibe-fleet report` writes FLEET.md (always), FLEET.docx, FLEET.html' },
    { from: 'vibe-fleet', to: 'docx', type: 'depends-on' },

    // ── Patterns edges ───────────────────────────────────────────────────
    { from: 'developer', to: 'vibe-patterns', type: 'invokes', description: 'list/show/apply patterns' },
    { from: 'vibe-patterns', to: 'art:vibe-patterns', type: 'reads', description: 'Lists / reads pattern files' },
    { from: 'vibe-patterns', to: 'art:adrs', type: 'writes', description: '`vibe-patterns apply adrs/X --to DIR` copies an ADR into docs/adr/' },
    { from: 'skill:migrate', to: 'art:vibe-patterns', type: 'reads', description: 'Mode A consults field-mappings/, connectors/, adrs/ to offer inheritance' },
  ],

  // ── Data flows ────────────────────────────────────────────────────────────
  // Each flow is a temporally-ordered sequence of state transitions.
  flows: [
    {
      name: 'First-time migration (Mode A)',
      trigger: 'developer runs /migrate with no vibe-history.json present',
      steps: [
        'developer extracts Vibe source: node vibe-extractor/index.js → writes vibe-source/, no baseline yet so no diff/pending-update',
        'developer runs /migrate in Claude Code',
        'claude-code reads skills/migrate.md, dispatches to Mode A (no vibe-history.json detected)',
        'claude-code grills developer: project name, environment ID, connectors used',
        'developer runs npx degit + npx power-apps init to scaffold [ProjectName]/',
        'claude-code copies vibe-source/ → [ProjectName]/src/ (skipping generated/)',
        'claude-code builds the data adapter layer (fromDataverse / toDataverse) — heaviest reasoning step',
        'developer runs npx power-apps add-data-source for each connector',
        'claude-code installs npm dependencies + writes vite.config.ts, tsconfig.app.json, etc.',
        'claude-code runs npx tsc --noEmit and fixes errors',
        'developer runs npm run build && npx power-apps push',
        'claude-code copies vibe-source/ → vibe-baseline/ + writes v1.0.0 snapshot + initialises vibe-history.json',
        'claude-code writes vibe-migration.json ownership manifest',
        'developer suggested: git tag vibe-baseline-v1.0.0',
        'claude-code offers /verify-migration → /migration-report at the end',
      ],
    },
    {
      name: 'Incremental update (Mode B)',
      trigger: 'developer makes Vibe changes, re-extracts; vibe-pending-update.json now exists',
      steps: [
        'developer edits app on make.powerapp.com',
        'developer runs node vibe-extractor/index.js',
        'extractor scrapes the new Vibe state, decodes source maps in memory',
        'extractor hashes each clean file and diffs against vibe-baseline/',
        'on non-empty diff: bumps minor version, snapshots new content to vibe-baselines-snapshots/vX.Y.0/, appends vibe-history.json, replaces vibe-baseline/, writes vibe-pending-update.json',
        'developer runs /migrate in Claude Code',
        'claude-code dispatches to Mode B (vibe-pending-update.json present)',
        'claude-code reads the pending manifest — knows exactly which files changed',
        'for each changed file: looks up category in vibe-migration.json',
        'vibeOwned → copy from vibe-source/ to [ProjectName]/, adapt imports only',
        'migrationOwned → show diff, ask developer whether to apply manually',
        'requiresReview → show diff, ask before applying',
        'claude-code handles new connectors (via /add-connector) and model changes (via /map-fields) if detected',
        'claude-code runs npx tsc --noEmit, npm run build, npx power-apps push',
        'claude-code bumps [ProjectName]/package.json version to pending.toVersion',
        'claude-code deletes vibe-pending-update.json',
        'claude-code offers /verify-migration → /migration-report',
      ],
    },
    {
      name: 'Verification (deployed app)',
      trigger: 'developer types /verify-migration or accepts the end-of-migrate prompt',
      steps: [
        'first-time only: developer runs node vibe-verifier/index.js --setup-auth (interactive MS sign-in, saves vibe-verifier/.auth/state.json)',
        'claude-code generates tests/specs/v{version}/*.spec.ts from the Power Code project source (or from changedFiles for incremental)',
        'developer reviews tests (Reviewed: not yet → yes)',
        'claude-code invokes node vibe-verifier/index.js (with --latest or --since vX.Y.Z)',
        'verifier reads tests/specs/v{version}/, loads auth state, opens Chromium headed at the deployed URL',
        'Playwright runs each test serially, captures traces + screenshots on failure',
        'verifier parses report.json, identifies failures',
        'for each failure: searches GitHub for matching open issue, comments if found or creates new issue via gh',
        'verifier appends testResults to the matching vibe-history.json version entry',
        'on failure: claude-code applies /diagnose to the trace/screenshot to draft a hypothesis',
      ],
    },
    {
      name: 'Documentation generation',
      trigger: 'developer types /migration-report or accepts the end-of-migrate prompt',
      steps: [
        'claude-code invokes node vibe-reporter/index.js',
        'collect.js gathers: vibe-history.json, vibe-migration.json, CONTEXT.md, docs/adr/, [ProjectName]/package.json, generated models, dataSourcesInfo.ts',
        'render-markdown.js builds docs/PROJECT.md (always)',
        'render-docx.js builds docs/PROJECT.docx (unless --md-only)',
        'developer commits both (optional — .docx is binary, some teams gitignore it)',
      ],
    },
    {
      name: 'Fleet operations (status + batch + report)',
      trigger: 'developer (or CI) runs a vibe-fleet command after onboarding many projects',
      steps: [
        'one-time: vibe-fleet init "<fleet name>" — creates fleet.config.json (or ~/.vibe-fleet/registry.json with --global)',
        'one-time per project: vibe-fleet register <path> — guards: path must contain vibe-history.json; alias must be unique',
        'daily: vibe-fleet status — probes every registered project (no lock held), prints table with health column + ⚠ legend for problems',
        'daily / CI: vibe-fleet doctor — same probes but exits 1 if any project has warnings; suitable as a CI gate',
        'when needed: vibe-fleet extract [--alias X] — sequentially invokes node vibe-extractor/index.js inside each project. Each project\'s vibe-lock prevents concurrent fleet runs from corrupting state',
        'when needed: vibe-fleet verify [--alias X] [--since vX.Y.Z] [--headless] — same shape, invokes vibe-verifier with --latest by default. Output is prefixed with [alias] for attribution',
        'weekly / before stakeholder meeting: vibe-fleet report [--html] — generates FLEET.md (always), FLEET.docx (default), FLEET.html (with --html). Health summary table, per-project cards, aggregated totals',
        'patterns: vibe-patterns list / show / apply consumed inline by /migrate Mode A when a new project starts — offers inherited field mappings / connector configs / ADRs',
      ],
    },
  ],

  // ── Impact analysis ───────────────────────────────────────────────────────
  // For each significant component, what changes when you modify or remove it.
  impactAnalysis: [
    {
      component: 'vibe-extractor',
      ifModified: 'May affect format of vibe-source/, vibe-history.json schema, or diff semantics. Run on a known project to verify.',
      breaksIfRemoved: ['/migrate Mode A (no vibe-source/)', '/migrate Mode B (no pending manifest)', 'version control entirely'],
      criticalInvariants: ['Must never alter vibe-baseline/ on a no-op (no-diff) run', 'Must refuse to overwrite vibe-pending-update.json without --force'],
    },
    {
      component: 'vibe-history.json schema',
      ifModified: 'Breaks vibe-reporter\'s collect.js + render-markdown.js + render-docx.js, breaks vibe-verifier\'s recordResultsInHistory, breaks vibe-toolkit-doc Solution Graph references.',
      breaksIfRemoved: ['All three CLIs', 'Migration history section of every doc'],
      criticalInvariants: ['versions[] is append-only', 'version field follows semver vX.Y.Z'],
    },
    {
      component: 'vibe-pending-update.json schema',
      ifModified: 'Breaks /migrate Mode B file-application logic. Schema changes must be reflected in skills/migrate.md AND skills/version-control.md.',
      breaksIfRemoved: ['Mode B has nothing to consume — extractor and /migrate become silently uncoordinated'],
      criticalInvariants: ['changedFiles paths must be relative to vibe-source/', 'toVersion must match what vibe-extractor wrote to vibe-history.json'],
    },
    {
      component: 'vibe-migration.json categorisation',
      ifModified: 'Changes which files /migrate Mode B may auto-overwrite. Wrong categorisation in Mode A causes wrong updates on every subsequent run.',
      breaksIfRemoved: ['Mode B treats every file as vibeOwned (the documented default) — may overwrite migrationOwned files unsafely'],
      criticalInvariants: ['Once written, paths should only move between categories with developer approval'],
    },
    {
      component: 'vibe-verifier/.auth/state.json',
      ifModified: 'Tokens rotate; sessions expire after ~2 weeks. Verifier prints a warning when state is older than 14 days.',
      breaksIfRemoved: ['Every verifier run fails with login-redirect; developer must re-run --setup-auth'],
      criticalInvariants: ['NEVER commit to git — covered by both vibe-verifier/.gitignore AND root .gitignore'],
    },
    {
      component: 'skills/migrate.md',
      ifModified: 'Affects every /migrate invocation. Mode dispatch logic at the top is load-bearing — Modes A, B, C are mutually exclusive based on filesystem state.',
      breaksIfRemoved: ['No migration possible at all'],
      criticalInvariants: ['Mode dispatch must be deterministic from filesystem state alone — never ask the developer which mode'],
    },
    {
      component: 'fleet.config.json',
      ifModified: 'Hand-edits that break the schema cause every vibe-fleet command (except init) to fail with E_FLEET_SCHEMA_INVALID. Aliases must remain unique; paths must be absolute and contain vibe-history.json.',
      breaksIfRemoved: ['vibe-fleet status/doctor/report/extract/verify all fail with E_FLEET_NOT_FOUND'],
      criticalInvariants: ['projects[].alias is unique', 'projects[].path is absolute', 'each path contains vibe-history.json (validated at register time)'],
    },
    {
      component: 'vibe-fleet probe layer (lib/probe.js)',
      ifModified: 'Every fleet command depends on probeProject(). Bugs here propagate to status, doctor, and report simultaneously.',
      breaksIfRemoved: ['Fleet operations entirely; the registry remains intact but no health classification is possible'],
      criticalInvariants: ['Probe NEVER takes a project lock — fleet ops are read-only across many projects; locking would create false-positive conflicts'],
    },
    {
      component: 'vibe-patterns/ directory',
      ifModified: 'Each pattern is independent; a broken JSON file only affects projects that try to inherit it. Bad patterns surface during /migrate Mode A as JSON-parse errors with the file path.',
      breaksIfRemoved: ['No automatic inheritance — new migrations re-discover field mappings, connectors, ADRs from scratch. /migrate still works, just slower.'],
      criticalInvariants: ['NEVER store secrets — connection IDs are project-public; auth tokens/passwords/customer data are not'],
    },
    {
      component: 'docs/SYSTEM.docx (this document)',
      ifModified: 'Never edit directly — regenerate via `node vibe-toolkit-doc/index.js`. Edits to the model live in vibe-toolkit-doc/lib/system-model.js.',
      breaksIfRemoved: ['AI agents lose the structured Solution Graph reference; new contributors lose the architectural overview'],
    },
  ],
};
