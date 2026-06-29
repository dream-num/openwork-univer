# OpenWork Univer CLI

This context describes how OpenWork integrates Univer as the native office authoring surface for agentic spreadsheet, document, and slide work.

## Language

**Univer CLI Extension**:
An OpenWork extension that installs and exposes Univer capabilities inside a workspace, including the `univer` executable and the complete `univer-cli` skill package.
_Avoid_: Office plugin, Univer plugin when referring to the OpenWork installable package.

**Native Office Target**:
A `.univer` file that OpenWork treats as the primary editable and distributable office artifact for spreadsheets, documents, and slides.
_Avoid_: Intermediate file, converted workbook, temporary import result.

**Exchange Capability**:
The ability to import from or export to external office formats such as `.xlsx`, `.docx`, `.pptx`, or `.csv`.
_Avoid_: Default authoring path, roundtrip pipeline.

**Univer Office Surface**:
The OpenWork-hosted office UI for a Native Office Target, backed by the current `collab-gateway` / `collab-client` surface rather than OpenWork's generic artifact preview/editor.
_Avoid_: Spreadsheet editor when referring to the unified sheet/doc/slide surface; `univerfile-viewer` when referring to the target implementation.

**Collab Gateway Office Surface**:
The Univer browser surface served by `univer-cli`'s daemon-owned `collab-gateway`, combining the official collaboration-client runtime, unit navigation, worktree board, merge preview, lifecycle SSE, and trunk editing gate.
_Avoid_: Rebuilt OpenWork office shell, legacy local viewer.

**Collab Surface Adapter**:
The OpenWork module that embeds the Collab Gateway Office Surface for a `.univer` file using the gateway view URL and `file`, `worktree`, and `unit` routing parameters. Opening the same URL in an external browser is a development or fallback path, not the default product path.
_Avoid_: Custom editor implementation, direct `.univer` renderer, browser-only handoff.

**Embedded Collab View**:
The default OpenWork presentation mode for the Collab Gateway Office Surface: an in-app embedded web view that keeps the `.univer` office workflow inside OpenWork while still using the gateway-served collab-client assets.
_Avoid_: External-browser default, static screenshot preview.

**Univer CLI Adapter**:
The OpenWork module responsible for invoking the `univer` executable and translating its results into OpenWork extension actions and artifacts.
_Avoid_: Reimplemented workbook engine, generic shell wrapper.

**Managed Univer Executable**:
The `univer` executable installed and versioned by OpenWork for a workspace/runtime so agents can use Univer without relying on user shell configuration.
_Avoid_: Global npm install when referring to the default setup path.

**Managed npm Install**:
The v1 provisioning strategy where OpenWork installs the `univer-cli` npm package into an OpenWork-managed directory, resolves the package `univer` bin, and exposes that bin to managed agent runtimes.
_Avoid_: Bundled binary when referring to the first implementation slice.

**Canonical Univer Skill Package**:
The `univer-cli` skill package published from `dream-num/skills`, including its entrypoint, references, and managed inspect tool resources.
_Avoid_: Skill copies from local `univer-cli/packages/skills` or generic OpenWork hub mirrors when referring to the user-facing install source.

**Ready Univer Installation**:
An extension state where the Canonical Univer Skill Package is installed, the Managed Univer Executable is resolved, and required Univer health checks pass for the active workspace/runtime.
_Avoid_: Enabled when only one setup part succeeded.

**Required Univer Health Check**:
The v1 readiness probe set for the Univer CLI Extension: run the resolved executable for version/help, verify the complete skill package, list managed inspect tools, and list SaC migration templates.
_Avoid_: Full workbook smoke when referring to installer readiness.

**Installer Action**:
An extension action whose only purpose is installing, checking, or repairing the Univer CLI Extension setup.
_Avoid_: Office workflow action.

**Office Workflow Action**:
An action that operates on `.univer` or exchange files, such as import, export, inspect, apply, verify, or open.
_Avoid_: Installer action.

**Worktree Office Flow**:
The user-visible review flow where an agent changes a `.univer` file through a collab worktree, the surface shows open/ready worktrees and per-unit changes, and the user merges or discards the result.
_Avoid_: Background-only CLI mutation when referring to the reviewable OpenWork experience.

**Direct Trunk Editing**:
Human editing of the current `.univer` trunk through the Collab Gateway Office Surface, currently governed by the collab-client editing gate and explicit capability support rather than assumed equally for every unit type.
_Avoid_: Agent worktree commit path.
