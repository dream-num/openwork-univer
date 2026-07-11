# Source the canonical skill from univer-cli

The canonical `univer-cli` product skill is owned under `dream-num/univer-cli/packages/skills/skills/univer-cli`. OpenWork will extract it from the `univer-cli` source revision locked by the Univer Compatibility Set; `dream-num/skills` is a downstream mirror populated by the `univer-cli` release synchronization workflow and is not an OpenWork build source.

This supersedes ADR-0003. Reading from the mirror would usually produce equivalent files after synchronization, but it reverses ownership, introduces release-sync lag, and prevents one source revision from identifying both the CLI implementation and its agent guidance.

**Consequences**

The OpenWork release pipeline retrieves the source archive for the locked full commit, extracts only `packages/skills/skills/univer-cli`, and verifies its required files and normalized tree digest before staging it. Mirror availability or merge timing cannot affect desktop build reproducibility or first-use readiness; adding the skill to a future npm artifact is an optional upstream optimization rather than a prerequisite for this migration.
