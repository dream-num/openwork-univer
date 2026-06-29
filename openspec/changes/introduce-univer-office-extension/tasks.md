## 1. Univer Extension Setup

- [x] 1.1 Add a built-in Univer CLI Extension manifest with setup copy, composer prompt, resources, and test action references.
- [x] 1.2 Add server-side installer-scoped extension actions for Univer setup status, setup install, setup retry, and repair.
- [x] 1.3 Reuse or extend hub skill installation so the extension installs the complete `univer-cli` skill package from `dream-num/skills`.
- [x] 1.4 Add atomic readiness state that remains incomplete unless the skill package, executable, and required health checks all pass.
- [x] 1.5 Add tests proving the installed skill includes `SKILL.md`, `references/`, and managed inspect tool resources.

## 2. Univer Executable Provisioning

- [x] 2.1 Add a server-side executable resolver that prefers the OpenWork-managed npm-installed `univer` bin and treats detected or user-provided binaries as fallback/development overrides.
- [x] 2.2 Add an OpenWork-managed npm package install path for `univer-cli`, with explicit incomplete status when managed installation is unavailable.
- [x] 2.3 Add health checks for executable version/help, complete skill package presence, managed inspect tool listing, and SaC migration template listing.
- [x] 2.4 Inject the resolved executable path into managed OpenCode runtime configuration without requiring shell startup file edits.
- [x] 2.5 Report resolved executable source, current command/package version, managed install root, and npm registry latest version in the Univer CLI Extension page.
- [x] 2.6 Add managed executable update controls: manual update, registry update check, and opt-in auto-update for managed npm installs without overwriting development overrides.

## 3. Native Univer Artifacts

- [x] 3.1 Register `.univer` as a first-class OpenWork office artifact.
- [x] 3.2 Route `.univer` artifact open actions to a Univer-specific target path instead of the lightweight generic spreadsheet editor.
- [x] 3.3 Add agent-facing native office guidance for new spreadsheet, document, and slide work that produces `.univer` targets by default without requiring the first CLI step to create a typed unit.
- [x] 3.4 Add agent-facing exchange-source guidance that imports `.xlsx`, `.docx`, `.pptx`, and `.csv` into `.univer` targets when users ask to work on existing external files.
- [x] 3.5 Add agent-facing exchange-output guidance that exports external formats only when users request a handoff format.

## 4. Univer Surface Integration

- [x] 4.1 Audit the current `collab-client`, `collab-gateway`, `collab-gateway-contract`, and `domain/collab-worktree` behavior before implementing OpenWork surface code.
- [x] 4.2 Embed the gateway-served collab-client view as the first OpenWork Univer Office Surface, using the daemon/gateway view URL plus `file`, `worktree`, and `unit` route parameters.
- [ ] 4.3 Preserve existing collab-client navigation and review behavior: trunk files, worktree lists, per-unit badges, preview/original toggle, ready/merge/discard controls, and SSE reset rebuild.
- [ ] 4.4 Define the OpenWork embedded web-view host interface, gateway unavailable state, and external-browser fallback path before future component extraction.
- [ ] 4.5 Add explicit unsupported-state UI for unit types, browser direct-edit paths, or exchange outputs that are not available in the installed collab/CLI capability.
- [ ] 4.6 Keep semantic mutations, inspect, apply, verify, status, commit, restore, import, export, open, and worktree operations behind the Univer CLI Adapter.

## 5. Validation

- [x] 5.1 Add unit tests for extension setup status, atomic readiness, and skill package installation.
- [x] 5.2 Add integration tests proving managed OpenCode sessions can invoke `univer` after setup.
- [x] 5.3 Add fraimz coverage for Univer CLI marketplace discovery and setup controls.
- [x] 5.4 Add artifact tests for `.univer` classification and open-target routing.
- [x] 5.5 Add fraimz coverage for installing the extension and opening a native `.univer` artifact in the embedded collab gateway/client surface.
- [ ] 5.6 Document any skipped validation paths with exact reproduction steps.
