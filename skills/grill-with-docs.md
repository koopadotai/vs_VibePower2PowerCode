# grill-with-docs: Interview Protocol for Design Decisions

This document describes a structured interviewing approach for stress-testing plans against a project's domain model and documentation.

## Core Method

Ask questions sequentially, pausing after each for feedback before proceeding. When possible, consult the codebase rather than relying on user explanation.

## Key Practices

**Terminology enforcement**: Flag misalignments between user language and the project's glossary immediately. Example: if CONTEXT.md defines "cancellation" one way but the user means something different, surface the discrepancy.

**Precision over vagueness**: When terms are overloaded or unclear, propose specific canonical alternatives that distinguish between related concepts.

**Scenario-driven testing**: Probe domain relationships with concrete edge cases to expose boundary ambiguities.

**Code-reality checks**: Verify that stated behaviors match actual implementation; highlight contradictions when code and description diverge.

## Documentation Updates

Update `CONTEXT.md` incrementally as terms resolve—don't batch them. This file functions as a glossary only, with zero implementation details.

Create ADRs only when **all three** conditions hold:
- Costly to reverse later
- Non-obvious without explanation
- Result of genuine trade-offs between alternatives

Otherwise, skip the ADR.

---

*Source: https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md*
