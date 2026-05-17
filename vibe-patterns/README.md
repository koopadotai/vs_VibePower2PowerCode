# vibe-patterns

Shared knowledge base of reusable migration patterns. When you migrate many Vibe apps that share an environment, a publisher prefix, a set of connectors, or a common architectural decision, the same answers come up over and over. `vibe-patterns/` is where you write them down **once** so future migrations can inherit them instead of re-discovering.

This is the **Tier-2 "shared knowledge" feature** from the enterprise roadmap.

---

## Three kinds of patterns

### 1. `field-mappings/`
Vibe-friendly-name → Dataverse-raw-name translations for a given Dataverse environment or publisher prefix. New projects in that environment inherit the same mappings, eliminating the round of "which prefix does this field use" grilling.

Each file is a JSON object:
```json
{
  "name": "acme-cr1e9",
  "description": "ACME corp's main Dataverse env — publisher prefix cr1e9_",
  "mappings": {
    "title": "ws_title",
    "description": "ws_description",
    "photo": "cr1e9_photo",
    "playerName": "cr1e9_playername"
  }
}
```

### 2. `connectors/`
Reusable Power Platform connector configuration snippets — connection IDs that recur, naming conventions, common operations.

Each file is JSON:
```json
{
  "name": "acme-office365",
  "description": "ACME's tenant Office 365 connection",
  "apiId": "shared_office365",
  "connectionId": "00000000-0000-0000-0000-000000000000",
  "commonOperations": ["SendEmailV2", "CalendarV4Get"]
}
```

### 3. `adrs/`
Architecture Decision Record templates that the team has already decided on across all migrations. Drop into a project's `docs/adr/` to inherit the decision without re-deriving it.

Each is a standard ADR markdown file with a leading `# <title>` line.

---

## How `/migrate` Mode A consumes patterns

When the AI runs `/migrate` Mode A and is about to perform a step where patterns could apply, it checks the relevant `vibe-patterns/` subfolder first:

- **Step 4 (adapter layer)** — for each Dataverse entity, scan `field-mappings/*.json` for a matching publisher prefix. If found, offer to inherit. If multiple match, ask which.
- **Step 5 (connectors)** — for each connector identified, scan `connectors/*.json` for a matching `apiId`. If found, suggest the connection ID without making the developer dig in the portal.
- **After Mode A completes** — offer to copy any always-applied ADRs from `adrs/` into the new project's `docs/adr/`.

The AI **never auto-applies** a pattern silently — always asks the developer first ("I found field mapping pattern `acme-cr1e9` — inherit?").

---

## CLI

```powershell
node vibe-patterns/index.js list                          # list every pattern
node vibe-patterns/index.js list field-mappings           # only one kind
node vibe-patterns/index.js show field-mappings/acme-cr1e9
node vibe-patterns/index.js apply adrs/use-hashrouter --to /path/to/project
```

The CLI is thin — most use is by reading directly via `/migrate`.

---

## Rules

1. **Patterns are reference, not authority.** The developer always reviews before inheriting. A pattern that no longer applies to a new client must not be inherited just because it's there.
2. **Name patterns by client + identifier** when client-specific (e.g., `acme-cr1e9`, `bravo-office365`). Use generic names for cross-client conventions (e.g., `always-hashrouter`).
3. **Never store secrets in patterns.** Connection IDs are not secrets (they're project-public), but auth tokens, passwords, real customer data are. The CLI refuses to apply a pattern whose JSON contains values matching common secret regex.
4. **Patterns drift.** If you change a publisher prefix or rotate a connection, update the pattern AND notify projects that inherited it.
