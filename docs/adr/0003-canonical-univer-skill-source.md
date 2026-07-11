---
status: superseded by ADR-0024
---

# Canonical Univer skill source

The Univer CLI Extension will install the `univer-cli` skill package from `dream-num/skills`. Local `univer-cli/packages/skills` checkouts and OpenWork hub mirrors can support development or future distribution plumbing, but the user-facing source of truth is the canonical skill repository so skill guidance, references, and managed inspect resources do not drift.

**Consequences**

The installer must support installing a complete skill package from a configured canonical repository. The extension must not report a skill package as current merely because a same-named `SKILL.md` exists or because a local development copy is present.
