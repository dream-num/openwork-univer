# OpenWork Univer CLI

This context describes how OpenWork integrates Univer as the native Univer authoring surface for agentic spreadsheet, document, and slide work.

## Language

**Univer CLI Extension**:
An OpenWork extension that installs and exposes Univer capabilities inside a workspace, including the `univer` executable and the complete `univer-cli` skill package.
_Avoid_: Generic plugin, Univer plugin when referring to the OpenWork installable package.

**Univerfile**:
A `.univer` file that OpenWork treats as the primary editable and distributable Univer workspace for spreadsheets, documents, and slides.
_Avoid_: Intermediate file, converted workbook, temporary import result.

**Primary Univerfile**:
The single Univerfile that an OpenWork session is centered on for Univer work. A session has at most one Primary Univerfile; other workspace files may still be used as context, references, or exchange files.
_Avoid_: Target, active file, selected artifact, current workbook when referring to the session-level binding.

**Visible Univerfile**:
A Univerfile that OpenWork auto-discovers in a workspace and considers appropriate for first-level user navigation.
_Avoid_: Target, hidden runtime target, dependency artifact, generated cache.

**Univerfile Row**:
A workspace sidebar navigation row for one Visible Univerfile and the sessions bound to it as their Primary Univerfile. It presents a compact file-level summary rather than a unit tree.
_Avoid_: Target hub, folder, session group, file tree node when referring to the task navigation concept.

**General Session**:
An OpenWork session that is not bound to a Primary Univerfile and remains workspace-scoped for general agent work, including older sessions without durable Univerfile metadata.
_Avoid_: Unassigned session, orphan session, default target session.

**Univer Session Context**:
The minimal implicit context OpenWork sends to the agent for a session bound to a Primary Univerfile: Univerfile identity, path, and session-scope rules. Read and analysis tasks inspect the Univerfile trunk through Univer CLI; modifying tasks create or reuse the session's Session Univer Worktree.
_Avoid_: Full file tree dump, unit inventory cache, worktree state snapshot.

**Univer Task Intent**:
The user's explicit choice to either continue the current Primary Univerfile session or create a new session bound to the same Primary Univerfile.
_Avoid_: Inferred prompt mode, hidden composer state, worktree selector.

**Univer Task Session**:
A session bound to a Primary Univerfile that may discuss, inspect, export, or modify that Univerfile. It does not imply a Session Univer Worktree exists until a modifying agent task creates one.
_Avoid_: Worktree, change branch, review item.

**Univerfile Overview Session**:
The single empty or planning Univer Task Session that a Univerfile Row may reuse as the neutral entry point for a Primary Univerfile when no actionable task session exists. It is represented by the Univerfile Row's default content rather than as an ordinary task row, and centers the Univerfile Surface rather than a blank chat. If the user submits a task from this overview, OpenWork creates and switches to a new bound Univer Task Session instead of storing task chat history in the overview.
_Avoid_: New task, Done session, throwaway empty session.

**Session Univer Worktree**:
The Univer worktree owned by one Univer Task Session for that session's current modifying task, identified by a persisted session worktree id. It is absent for read-only or planning sessions, and a session should have at most one active Session Univer Worktree at a time.
_Avoid_: Target worktree, global current worktree, workspace branch.

**Session Review State**:
The sidebar-visible review state of a Univer Task Session, derived from that session's Session Univer Worktree when one exists. OpenWork computes it from the persisted session worktree id joined with live cowork or CLI state, not from agent text. A missing persisted worktree resolves to needs attention, with the Tasks Panel showing Worktree missing/stale rather than rebinding automatically. Terminal states such as merged and discarded move the session under Done; the session remains viewable for history and results, but new modifying work should start a new bound Univer Task Session.
_Avoid_: File-level review state, hidden review queue, panel-only review status.

**Split Into New Task**:
The recovery action that moves an extra Univer worktree out of a needs-attention session into its own Univer Task Session bound to the same Primary Univerfile.
_Avoid_: Reassign worktree as the primary recovery path, merge task sessions.

**Worktree Missing/Stale**:
A needs-attention state where a session has a persisted Session Univer Worktree id that cannot be found in live cowork or CLI state. The primary recovery actions are Refresh status and Create new task from here; Manual reassociation is secondary or advanced.
_Avoid_: Working state, automatic rebinding, default manual reassociation prompt.

**Refresh Status**:
A non-mutating recovery action that reloads live cowork or CLI state and recomputes Session Review State without changing session metadata, clearing `sessionUniverWorktreeId`, or invoking an agent.
_Avoid_: Repair action, metadata reset, agent retry.

**Create New Task From Here**:
A recovery action that starts a new Univer Task Session on the same Primary Univerfile from a needs-attention session without inheriting the old `sessionUniverWorktreeId`. The new session keeps a read-only source reference to the original session and may seed its title from `Retry: <original task title>` until the user's first new task prompt replaces it.
_Avoid_: Rebind worktree, mark original session Done, clone hidden worktree state.

**Exchange Capability**:
The ability to import from or export to external document formats such as `.xlsx`, `.docx`, `.pptx`, or `.csv`.
_Avoid_: Default authoring path, roundtrip pipeline.

**Univer Surface**:
The OpenWork-hosted Univer UI for a Univerfile, backed by the current `collab-gateway` / `collab-client` surface rather than OpenWork's generic artifact preview/editor.
_Avoid_: Spreadsheet editor when referring to the unified sheet/doc/slide surface; `univerfile-viewer` when referring to the implementation.

**Univer Surface Route**:
The current view route inside a Univer Surface: one Primary Univerfile plus the selected unit and selected worktree/content scope. It is view state for the surface, not session metadata and not Session Univer Worktree ownership.
_Avoid_: Session binding, target route, current task when referring to what the right-side Univer UI is showing.

**Univer Surface Breadcrumb**:
The OpenWork-owned header path for a Univer Surface, rendered as `<Univerfile> / <Unit>`. The Univerfile segment identifies the bound file, and the Unit segment selects the rendered sheet/doc/slide without changing session ownership.
_Avoid_: File icon title, session title, Target label.

**Univer Content View Selector**:
The control that chooses which content mode the Univer Surface renders for the current unit: current version, original worktree changes, or merge preview. It is adjacent to, but not part of, the Univer Surface Breadcrumb because these modes are view scopes rather than path segments.
_Avoid_: Breadcrumb worktree segment, task selector, file path segment.

**Univer Artifact Header**:
The OpenWork-owned header shown above a Univerfile, combining artifact identity with controls for the currently rendered unit, scope, and worktree. It should present the Univer Surface Breadcrumb as the primary identity rather than a generic file preview title.
_Avoid_: Generic artifact titlebar, collab-client topbar, external-browser toolbar.

**Univer Artifact Header View Model**:
A thin OpenWork-derived model that combines a Univerfile, embedded surface state, and cowork content state into the data rendered by the Univer Artifact Header.
_Avoid_: Generic artifact header framework, persisted header store, direct JSX condition soup.

**Compact Chat Composer**:
The default OpenWork session composer shape: a dense, refined agent chat input that keeps drafting, attachments, tools, model selection, queueing, steering, and stop controls available without letting the input container dominate the workspace. Agent selection belongs in the tools/agents menu rather than as default bottom chrome.
_Avoid_: Univer-only composer, large task box, marketing chat prompt.

**Compact Chat Pane**:
The default OpenWork session conversation layout where the transcript and Compact Chat Composer share a dense full-width content rhythm with only small refined padding and a broad safety cap for extreme screens.
_Avoid_: Narrow centered chat column, floating prompt card, target-only chat layout.

**Composer Toolbar**:
A stable session-level toolbar shown directly above the Compact Chat Composer for durable workspace and Univer context entry points. It shares the chat pane width rhythm and stays separate from transient composer workflow accessories such as queued messages, permissions, questions, and todos.
_Avoid_: Header file button, composer accessory, notification rail.

**Units Panel**:
The Composer Toolbar panel for a session bound to a Primary Univerfile that opens the Univerfile's trunk unit list and routes the right-side Univer Surface to a selected unit.
_Avoid_: Files popover, target panel, task review queue.

**Tasks Panel**:
The Composer Toolbar panel for a session bound to a Primary Univerfile that shows the current session's Session Univer Worktree state, including no changes, in progress, ready for review, merge/discard controls, missing/stale recovery, and terminal merged/discarded summaries.
_Avoid_: Unit navigator, Files popover, current target panel.

**Univer Content Scope**:
The content mode rendered inside the Univer Surface for a unit: current version, original worktree changes, or merge preview.
_Avoid_: Separate review surface, separate progress surface.

**Univer Edit Gate**:
The state that tells whether the current Univer Content Scope can be edited directly by the user, such as editable, read-only, locked by pending changes, or direct trunk editing in progress. It is a status indicator, not a menu section; only related commands such as leaving edit mode are actions.
_Avoid_: Workflow menu category, task status, route segment.

**Workspace Files**:
The current workspace's ordinary filesystem tree as exposed inside OpenWork for browsing, searching, selecting, and opening workspace files.
_Avoid_: Univer worktree, Univer unit list, artifact list.

**Univer Worktree**:
The `.univer`-specific cowork/worktree navigation and review surface for a Univerfile, including main worktree units, ready-for-review worktrees, and active changes.
It may be exposed to users as `Changes` when the interaction is about reviewing pending Univer changes rather than teaching the implementation term.
_Avoid_: Workspace file tree, generic git worktree, artifact list.

**Collab Gateway Univer Surface**:
The Univer browser surface served by `univer-cli`'s daemon-owned `collab-gateway`, combining the official collaboration-client runtime, unit navigation, worktree board, merge preview, lifecycle SSE, and trunk editing gate.
_Avoid_: Rebuilt OpenWork Univer shell, legacy local viewer.

**Collab Surface Adapter**:
The OpenWork module that embeds the Collab Gateway Univer Surface for a `.univer` file using the gateway view URL and `file`, `worktree`, and `unit` routing parameters. Opening the same URL in an external browser is a development or fallback path, not the default product path.
_Avoid_: Custom editor implementation, direct `.univer` renderer, browser-only handoff.

**Embedded Collab View**:
The default OpenWork presentation mode for the Collab Gateway Univer Surface: an in-app embedded web view that keeps the `.univer` workflow inside OpenWork while still using the gateway-served collab-client assets.
_Avoid_: External-browser default, static screenshot preview.

**Cowork Content Viewer**:
A reusable `@univer/cowork` content component extracted from `collab-client` embedded mode that renders a `CoworkContentViewerRequest` directly inside the host app using the same Univer collaboration-client and merge-preview behavior as the gateway-served page.
_Avoid_: Rebuilt OpenWork editor, iframe wrapper, standalone collab-client shell.

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
_Avoid_: Univer workflow action.

**Univer Workflow Action**:
An action that operates on `.univer` or exchange files, such as import, export, inspect, apply, verify, or open.
_Avoid_: Installer action.

**Univer Worktree Flow**:
The user-visible review flow where an agent changes a `.univer` file through a collab worktree, the surface shows open/ready worktrees and per-unit changes, and the user merges or discards the result.
_Avoid_: Background-only CLI mutation when referring to the reviewable OpenWork experience.

**Direct Trunk Editing**:
Human editing of the current `.univer` trunk through the Collab Gateway Univer Surface, currently governed by the collab-client editing gate and explicit capability support rather than assumed equally for every unit type.
_Avoid_: Agent worktree commit path.
