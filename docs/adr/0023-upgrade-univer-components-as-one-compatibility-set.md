# Upgrade Univer components as one compatibility set

OpenWork will record the exact Published Cowork SDK version, its complete Univer SDK peer cohort, Published Univer CLI Runtime version, canonical skill source revision, and skill tree digest in one checked-in Univer Compatibility Set. Packaging, repair, and runtime health checks use that set, and an upgrade must update and validate all affected inputs in one OpenWork change and release.

Allowing the CLI, Cowork SDK, SDK peers, or skill to update independently would make user machines assemble combinations that OpenWork has not tested. The peer cohort must resolve once without mixed Univer SDK versions, and the existing `univer-cli@latest` update path must not bypass the release lock.

**Consequences**

OpenWork repair restores the versions selected by the installed OpenWork release. User-facing version status may report newer upstream releases, but applying them requires an OpenWork compatibility-set update rather than an in-place component upgrade.
