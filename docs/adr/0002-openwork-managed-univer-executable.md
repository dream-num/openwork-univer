# OpenWork-managed Univer executable

The Univer CLI Extension will prefer an OpenWork-managed `univer` executable over a system `PATH` lookup. Existing system binaries and user-selected executable paths are allowed as fallback or development overrides, but the default non-technical user path is managed by OpenWork so setup, version checks, health reporting, and managed OpenCode runtime injection are reliable.

**Consequences**

OpenWork must own an executable install location, store the resolved binary path, surface version/status drift, and inject that path into managed OpenCode sessions. This avoids hidden dependence on shell startup files at the cost of more installer and update logic inside OpenWork.
