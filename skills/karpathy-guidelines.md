# karpathy-guidelines: Behavioral Guidelines for LLM Coding

Behavioral guidelines to reduce common LLM coding mistakes, derived from [Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876) on LLM coding pitfalls.

**Use when** writing, reviewing, or refactoring code — especially during the reasoning-heavy migration steps (Step 3 extraction, Step 4 adapter layer, Step 8 TypeScript fixes) where over-engineering and silent assumptions are the realistic failure modes.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

---

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## Migration-specific applications

- **Step 3 (extract clean TypeScript)** — *Simplicity First*: don't add error handling for source-map edge cases that the script logic already guarantees can't happen. *Surgical Changes*: don't reformat or "clean up" the extracted source — copy it back verbatim.
- **Step 4 (adapter layer)** — *Think Before Coding*: when a field name match is ambiguous (different publisher prefix, plural vs singular, etc.), surface it and ask. *Simplicity First*: don't build a generic mapping framework — write the two functions (`fromDataverse`, `toDataverse`) per entity, flat and obvious.
- **Step 8 (fix TypeScript errors)** — *Surgical Changes*: fix the specific error, don't refactor the file. *Goal-Driven Execution*: success criterion is `npx tsc --project tsconfig.app.json --noEmit` producing no output — loop until that holds.
- **All steps** — *Think Before Coding* reinforces the project's existing rule: "Field mapping is never assumed — always inspect both schemas and ask when ambiguous."

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

*Source: https://github.com/multica-ai/andrej-karpathy-skills/blob/main/skills/karpathy-guidelines/SKILL.md*
