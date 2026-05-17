# handoff: Compact the conversation for the next agent

Compact the current conversation into a handoff document so another agent (or a fresh session) can pick up the work without re-discovering context.

**Use when** the user says "handoff", "/handoff", "summarise for the next session", or signals that the current context is getting too long and work needs to continue elsewhere.

---

## What to produce

Write a handoff document summarising the current conversation so a fresh agent can continue the work.

- Save it to a temp path. On Windows PowerShell, generate one with:
  ```powershell
  $handoff = Join-Path $env:TEMP ("handoff-" + [guid]::NewGuid().ToString('N').Substring(0,6) + ".md")
  ```
  On Unix-like shells, `mktemp -t handoff-XXXXXX.md` is equivalent. **Read the file before you write to it** (the Write tool requires this for existing files).
- Tell the user the path when you're done.

## What to include

- **Goal** — what the user is trying to accomplish at the top level (e.g. "migrate the FurniMart Vibe app to Power Code").
- **Current step** — which of the 8 migration steps we're on, and what's blocking progress.
- **Decisions already made** — only those not captured elsewhere. Reference [`CONTEXT.md`](../CONTEXT.md), `docs/adr/`, commits, PRs, and plan files by path/URL instead of restating them.
- **Open questions** — anything the next agent needs to ask the user before proceeding.
- **Next concrete action** — the single first thing the next agent should do.
- **Suggested skills** — list any skills under [`skills/`](../skills/) the next session should invoke (e.g. `migrate`, `update`, `map-fields`, `add-connector`, `grill-with-docs`, `diagnose`).

## What to leave out

Do not duplicate content already captured in other artifacts (PRDs, plans, ADRs, issues, commits, diffs, `CONTEXT.md`, the migration manifest `vibe-migration.json`). Reference them by path or URL.

## Arguments

If the user passed arguments after the skill name (e.g. `/handoff fix the field mapping for orders`), treat them as a description of what the next session will focus on and tailor the doc accordingly — narrow the "Goal" and "Next concrete action" to that scope.

---

*Source: https://github.com/mattpocock/skills/blob/main/skills/productivity/handoff/SKILL.md*
