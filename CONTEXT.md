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

**Univer Artifact Header**:
The OpenWork-owned header shown above a Native Office Target, combining artifact identity with controls for the currently rendered unit, scope, and worktree. The rendered unit is the primary title; the `.univer` file is secondary context, and file-level actions are secondary or fallback actions.
_Avoid_: Generic artifact titlebar, collab-client topbar, external-browser toolbar.

**Univer Artifact Header View Model**:
A thin OpenWork-derived model that combines a Native Office Target, embedded surface state, and cowork content state into the data rendered by the Univer Artifact Header.
_Avoid_: Generic artifact header framework, persisted header store, direct JSX condition soup.

**Compact Chat Composer**:
The default OpenWork session composer shape: a dense, refined agent chat input that keeps drafting, attachments, tools, model selection, queueing, steering, and stop controls available without letting the input container dominate the workspace. Agent selection belongs in the tools/agents menu rather than as default bottom chrome.
_Avoid_: Univer-only composer, large task box, marketing chat prompt.

**Compact Chat Pane**:
The default OpenWork session conversation layout where the transcript and Compact Chat Composer share a dense full-width content rhythm with only small refined padding and a broad safety cap for extreme screens.
_Avoid_: Narrow centered chat column, floating prompt card, office-only chat layout.

**Composer Toolbar**:
A stable session-level toolbar shown directly above the Compact Chat Composer for durable workspace and office context entry points. It shares the chat pane width rhythm and stays separate from transient composer workflow accessories such as queued messages, permissions, questions, and todos.
_Avoid_: Header file button, composer accessory, notification rail.

**Workspace Files**:
The current workspace's ordinary filesystem tree as exposed inside OpenWork for browsing, searching, selecting, and opening workspace files.
_Avoid_: Office worktree, Univer unit list, artifact list.

**Office Worktree**:
The `.univer`-specific cowork/worktree navigation and review surface for a Native Office Target, including main worktree units, ready-for-review worktrees, and active changes.
It may be exposed to users as `Changes` when the interaction is about reviewing pending office changes rather than teaching the implementation term.
_Avoid_: Workspace file tree, generic git worktree, artifact list.

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
