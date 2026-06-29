## Why

OpenWork can already manage agents, skills, MCP servers, and standard artifacts, but it does not yet provide a native office authoring surface for spreadsheet, document, and slide work. Univer can fill that gap if OpenWork installs the Univer runtime capabilities first and then treats `.univer` as the native office target instead of an intermediate conversion format.

## What Changes

- Add a Univer CLI Extension that installs or detects the `univer` executable and installs the complete `univer-cli` skill package.
- Expose Univer health checks and runtime configuration so managed OpenCode sessions can reliably invoke `univer`.
- Register `.univer` as a first-class OpenWork office artifact.
- Make `.univer` the default target for new spreadsheet, document, and slide work in OpenWork.
- Treat `.xlsx`, `.docx`, `.pptx`, and `.csv` import/export as exchange capabilities rather than the default authoring path.
- Prepare OpenWork to embed the current `collab-gateway` / `collab-client` office surface by default for viewing, navigation, worktree review, and supported editing of `.univer` units.

## Capabilities

### New Capabilities

- `univer-extension-installation`: Install and verify the `univer` executable plus the complete `univer-cli` skill package through an OpenWork extension.
- `native-univer-office-surface`: Use `.univer` as OpenWork's native spreadsheet, document, and slide target, with import/export as exchange capabilities.

### Modified Capabilities

- None.

## Impact

- OpenWork extension manifests, installation flows, runtime configuration, and extension action routing.
- Skill installation paths, especially full-directory skill packages from canonical repositories.
- Managed OpenCode environment setup so `univer` is available during agent sessions.
- Artifact classification and office preview/editor routing for `.univer`.
- Future integration with the `univer-cli` collab packages, especially the daemon-owned `collab-gateway` view and `collab-client` browser surface.
