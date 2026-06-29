## Context

OpenWork already has installable skills, OpenCode plugins, MCP servers, built-in extension manifests, extension actions, artifact previews, and managed OpenCode runtime configuration. Its current office support is artifact-oriented: files such as `.xlsx`, `.csv`, and `.pptx` can be produced or previewed, but OpenWork does not own spreadsheet, document, or slide semantics.

Univer already owns the relevant office semantics through `.univer` targets, the `univer` CLI, SaC authoring and verification, managed inspect tools, import/export, and the `collab-gateway` / `collab-client` office surface. The integration should make OpenWork a control surface for Univer, not a second office engine.

## Goals / Non-Goals

**Goals:**

- Provision a `univer` executable through an OpenWork-managed install by default, with detected or user-selected binaries only as fallback or development overrides.
- Install the complete `univer-cli` skill package from `dream-num/skills`, including references and managed inspect tool resources.
- Make `univer` available to managed OpenCode sessions launched by OpenWork.
- Treat `.univer` as the native OpenWork office artifact for spreadsheet, document, and slide work.
- Route `.univer` navigation, viewing, worktree review, and supported editing to the current `collab-gateway` / `collab-client` surface.
- Treat `.xlsx`, `.docx`, `.pptx`, and `.csv` import/export as exchange capabilities.

**Non-Goals:**

- Reimplement spreadsheet, document, or slide semantics inside OpenWork.
- Replace `univer-cli` SaC, inspect, import, export, versioning, or verification logic.
- Require `.xlsx`, `.docx`, or `.pptx` as the default authoring or distribution format.
- Use `univerfile-viewer` as the target OpenWork office surface.
- Claim browser direct-edit parity for unit types whose collab-client editing gate is not implemented.

## Decisions

### Use an OpenWork extension as the installation seam

The Univer integration will start as a Univer CLI Extension. The extension owns setup, health checks, composer prompts, runtime discovery, and future office surface contributions.

Alternative considered: document a manual setup path. Manual setup is useful for development, but it does not give non-technical users a reliable one-click OpenWork experience and does not give OpenWork a place to report health or repair drift.

### Install the full skill package, not only `SKILL.md`

The extension will install `univer-cli` as a full skill package from `dream-num/skills`. This preserves `references/` and `inspect-tools/`, which are part of the agent-facing product surface, and keeps OpenWork aligned with the canonical Univer skill source.

Alternative considered: use the existing single-file skill upsert path. That would install the entrypoint but lose package-local resources and managed inspect tool discovery hints.

Alternative considered: install from the local `univer-cli/packages/skills` tree or a generic OpenWork hub mirror. Those paths are useful for development or distribution plumbing, but they should not become the user-facing source of truth because they can drift from the canonical skill repository.

### Prefer an OpenWork-managed npm executable

The extension will make an OpenWork-managed npm package install the primary executable strategy for v1. OpenWork installs `univer-cli` into an OpenWork-owned directory, resolves the package `univer` bin, and injects that bin into managed OpenCode sessions. System `PATH` discovery and user-selected executable paths remain useful as fallback and development override mechanisms, but they are not the default user path.

Alternative considered: rely on a global `npm install -g univer-cli` or whichever `univer` appears first on `PATH`. That would be simpler to implement but would make setup depend on shell configuration that managed OpenCode sessions may not inherit.

Alternative considered: bundle and ship a signed `univer` binary with OpenWork. That may become desirable later, but it adds packaging, update, and platform-signing complexity before the integration shape is proven.

### Treat readiness as atomic

The extension will be ready only when the complete skill package is installed, the managed or override executable is resolved, and required health checks pass for the active workspace/runtime. Partial success should remain visible as setup diagnostics, but OpenWork must keep the extension incomplete until every required part is healthy.

Alternative considered: enable the extension when either the skill package or executable is present. That would make the extension appear available while agents still lack either the knowledge layer or the runtime executor needed to complete office work.

### Keep installer health checks lightweight

The v1 required health checks are: executable version/help succeeds, the complete skill package exists, `univer inspect tools list --json` succeeds, and `univer sac migration templates --json` succeeds. Installer readiness should not create a real `.univer` target or run apply/verify; those belong to product-flow validation after setup.

Alternative considered: run a full workbook smoke during installation. That would provide stronger end-to-end confidence but would make setup slower, more stateful, and more failure-prone than an installer health check should be.

### Keep extension actions narrow

The setup slice exposes extension actions for setup status, install, retry, and repair. The native surface slice adds one narrow `open_surface` handoff action that starts or reuses the local collab gateway and returns a local gateway-served collab-client URL for OpenWork to embed. Semantic office workflow actions such as import, export, inspect, apply, verify, and arbitrary open remain behind the Native Office Target and Univer CLI Adapter design.

Alternative considered: expose workflow actions immediately after installation. That would give a richer action surface earlier, but it would force the installer and surface slices to settle the full `.univer` workflow interface before the native target model is designed.

### Make `.univer` native-first

OpenWork will model `.univer` as the Native Office Target for spreadsheets, documents, and slides. New office files created in OpenWork should be `.univer` files unless the user explicitly asks for an exchange file.

Alternative considered: treat external Office formats as primary and convert through `.univer` during agent work. That would make import/export appear to be the product model instead of an interoperability layer.

### Keep native creation outcome-oriented

OpenWork does not need to require the first CLI operation for "new spreadsheet/document/slides" to create a typed unit immediately. Agent workflows can use `univer new`, SaC, import, or other public `univer-cli` surfaces to create and populate the requested `.univer` target; the user-facing contract is that the final artifact is a native `.univer` result containing the requested office work.

Alternative considered: require dedicated OpenWork "new sheet/doc/slide" actions to create typed units as the first operation. That would over-specify implementation order and expose a CLI primitive concern that agents can already handle.

### Treat import/export as exchange, not identity

The Native Office Target Adapter should keep one explicit `.univer` target path as the durable work object. Creating new spreadsheet, document, or slide work chooses or creates a `.univer` path first, then lets the agent/CLI populate the requested units through public `univer-cli` surfaces. The adapter may return `unitId` and `worktreeId` route metadata when those are known, but the artifact identity remains the `.univer` file.

Existing `.xlsx`, `.docx`, `.pptx`, and `.csv` files are exchange sources. When a user asks OpenWork to work on one of those files, the adapter should import the source into a `.univer` target using `univer import --file <source> <target.univer>`, preserve the original source as provenance, and continue subsequent reads/writes/review against the `.univer` target. The imported source should not become the active working artifact merely because it was the starting file.

External handoff files are exchange outputs. OpenWork should export from the `.univer` target only when the user explicitly requests a handoff format or another integration requires one. The export result may appear as a secondary artifact, but it should not replace the `.univer` target as the session's primary office artifact. If a requested import/export path is unsupported by the installed Univer capability, OpenWork should report that exchange limitation and leave the native `.univer` target intact.

Alternative considered: mirror every external source and output as the primary artifact. That would preserve familiar Office extensions in the UI, but it would make `.univer` look like an implementation detail instead of the durable native target and would complicate worktree review.

### Wrap the collab gateway/client surface

OpenWork will use `univer-cli`'s current collab packages as the source of truth for the native office surface. The implemented surface is not the legacy `univerfile-viewer` path: `collab-gateway` owns the local `.univer` authority, snapshot/comb APIs, worktree control plane, lifecycle SSE, merge preview, and static serving of the browser view; `collab-client` owns unit navigation, current-version vs worktree routing, worktree board states, merge/discard controls, preview/original toggle, reset rebuild behavior, and the official collaboration-client runtime mount.

Evidence from the current `univer-cli` code:

- `packages/collab-client` is the browser client for `collab-gateway`; it uses official `@univerjs-pro/collaboration-client` for trunk/worktree content and adds shell UI for files, worktrees, pending changes, merge preview, and direct trunk editing under a gate.
- `packages/collab-gateway-contract` defines supported unit types as doc=1, sheet=2, slide=3, with base=5 reserved.
- `packages/collab-gateway/src/univer/unit-types.ts` contains adapters for sheet, doc, and slide creation, snapshot building, and materialization.
- `apps/cli/src/surface.ts` routes local `.univer` open commands to the gateway-served collab-client URL using `?file=...&worktree=...&unit=...`.
- `apps/cli/src/daemon/collab-gateway-service.ts` exposes `collabGateway.viewUrl` from the daemon-owned gateway.

The first OpenWork implementation should therefore embed the gateway-served collab-client view by default and pass the route state rather than extracting a reduced editor shell. Opening the same gateway URL in an external browser is a development or fallback path. Later component extraction is allowed only if it preserves the same contract: official collaboration-client runtime, worktree control plane, lifecycle SSE, merge preview, and direct trunk editing gate semantics.

Alternative considered: build a new OpenWork office shell around existing artifact previews. That would duplicate navigation and collaboration behavior already implemented in `collab-client`.

Alternative considered: target `univerfile-viewer`. That package is being retired and should not anchor new OpenWork integration.

### Embed the collab view by default

OpenWork will keep the native office workflow inside the app by embedding the gateway-served collab-client view. The Collab Surface Adapter owns the embedded web-view host, daemon/gateway discovery, route construction, and unavailable-gateway error state. The browser URL remains a useful escape hatch for development and debugging, but the product path is in-app.

Alternative considered: always open the gateway view URL in the user's browser. That would reuse the view quickly, but it would break the OpenWork control-surface experience and make the user leave the artifact/session context for core office work.

### Keep CLI operations behind a narrow adapter

OpenWork will call `univer` through a Univer CLI Adapter that returns structured results and artifacts. The adapter should expose high-level OpenWork actions such as install status, create native target, import exchange source, export exchange output, inspect, apply, verify, and open target.

Alternative considered: expose a generic command runner for arbitrary `univer` commands. That would duplicate shell access while making permissions, output parsing, and user-facing errors harder to control.

### Stage the implementation

The first implementation slice should install and verify the executable and complete skill package. The second slice should register `.univer` as a first-class artifact and introduce the native office target flow. The native surface slice should first embed the gateway-served collab-client view; deeper component extraction can follow after the embedded host proves the OpenWork lifecycle.

## Risks / Trade-offs

- Version mismatch between installed executable and skill package -> health checks MUST report both versions and identify incompatible states.
- Skill source drift -> installer status MUST distinguish the canonical `dream-num/skills` package from same-named local or single-file skill copies.
- Partial setup success can be mistaken for usable readiness -> extension state MUST expose detailed diagnostics but remain incomplete until all required checks pass.
- Lightweight health checks may miss real workflow failures -> product-flow tests and fraimz MUST validate `.univer` creation/opening separately from installer readiness.
- Exposing workflow actions too early can freeze the wrong interface -> first-slice extension actions MUST stay installer-scoped.
- Remote workspaces may not share the user's local executable -> installer status MUST be evaluated per workspace/runtime, not only per desktop machine.
- OpenWork-managed npm installation increases updater complexity -> the first slice SHOULD report install/update status explicitly before attempting automatic repair.
- `.univer` native-first changes user expectations -> artifact labels and creation flows MUST present `.univer` as the primary format and external Office files as exchange.
- Some `univer-cli` docs still contain stale sheet/doc-only wording while current contract/code includes slide -> OpenWork docs MUST follow the current collab contract and implementation, not older package README scope text.
- Direct browser editing capability differs from agent worktree editing capability -> UI MUST distinguish agent/CLI/SaC worktree operations from human direct trunk editing.
- Embedding the gateway-served view introduces process and URL lifecycle concerns -> the Collab Surface Adapter MUST handle daemon discovery, view URL routing, unavailable gateway states, and external-browser fallback explicitly.

## Migration Plan

1. Add the Univer CLI Extension manifest and settings/status surface.
2. Add server-side install/status actions for the OpenWork-managed npm `univer-cli` executable and full `univer-cli` skill package from `dream-num/skills`.
3. Inject the resolved managed or override `univer` executable path into managed OpenCode runtime configuration.
4. Register `.univer` as a first-class artifact.
5. Add native office creation flows for spreadsheet, document, and slide targets.
6. Embed the gateway-served collab-client view for `.univer` artifacts, preserving file/worktree/unit route state.
7. Extract lower-level collab-client components into OpenWork only after the wrapper behavior is validated.

Rollback is straightforward for the installer slice: remove the extension actions and runtime path injection. Rollback becomes more involved after `.univer` becomes the default office artifact, so that change should ship with explicit feature gating.

## Open Questions

- Which embedded-webview host API should OpenWork use for the first implementation, and what security/navigation restrictions should it enforce around the local gateway origin?
