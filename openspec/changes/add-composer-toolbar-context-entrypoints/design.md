## Context

OpenWork now uses a Compact Chat Pane where the composer is a dense bottom input bar. The old workspace file tree button still lives in the session header next to notifications. Its popover combines two surfaces:

- ordinary Workspace Files,
- `.univer` Office Worktree state from `@univer/cowork`.

That combination makes the header button do too much. It also makes Files and Worktree mutually dependent even though users often need them for different tasks:

- find or open a workspace file,
- review office changes for the active `.univer` artifact.

## Goals

- Add a stable Composer Toolbar inside the Compact Chat Composer stack.
- Make `Files` a workspace-level entry point for the ordinary file tree.
- Make `Changes` an active-artifact entry point for `.univer` Office Worktree state.
- Keep both entry points compact and close to the composer without making the composer feel like a large control console.
- Preserve existing file tree cache, selection, refresh, and artifact opening behavior.
- Preserve existing Office Worktree selection, section expansion defaults, review actions, and artifact route synchronization.
- Remove the duplicate session-header Files entry.

## Non-Goals

- Do not make Files and Changes part of notifications.
- Do not keep the combined Files + Office Worktree popover as the primary entry point.
- Do not make the Composer Toolbar a generic extension contribution surface in this slice.
- Do not add new MCP/control actions for these UI buttons.
- Do not change how agents refer to files or worktrees.
- Do not change Collab Gateway, cowork controller, or artifact panel routing semantics.

## Decision 1: Composer Toolbar owns durable context entry points

The Composer Toolbar is stable session chrome inside the Compact Chat Composer stack. It sits below higher-priority task status and blocking workflow accessories such as queued messages, questions, permissions, and todo progress.

The visual shape should be a single lightweight row:

- about 32px tall,
- no card treatment,
- no rounded outer container,
- aligned with the compact chat width rhythm,
- separated from adjacent composer strips by full-width dividers that match the compact composer border color.
- no toolbar-row padding or gap; Files and Changes own their horizontal padding.
- Files and Changes have square edges and no default background; hover background fills the toolbar row vertically.
- the empty prompt editor keeps a two-line minimum height so the composer remains compact but not cramped.
- composer shell, session header, and bottom status bar use one compact horizontal padding value without breakpoint widening.

This keeps Files and Changes close to the agent work loop without returning to the old large composer card.

## Decision 2: Files and Changes are separate entry points

`Files` opens only Workspace Files.

`Changes` opens only the active `.univer` artifact's Office Worktree. The user-visible label is `Changes`; the internal domain concept remains `Office Worktree`.

The old combined popover should be split into independent popovers or equivalent components. The implementation may reuse `WorkspaceFileTree` and `WorkspaceCoworkPanel`, but the user should no longer see one Files popover containing both concepts.

## Decision 3: Visibility follows context

`Files` is a workspace-level entry point. It should be visible whenever the current session has a usable workspace context. If the workspace is unavailable, the button may render disabled to keep toolbar structure stable.

`Changes` is an active-artifact entry point. It appears only when the current right-side active artifact tab is a `.univer` target. If there is no active `.univer` artifact, the toolbar should not show a disabled Changes button. This avoids teaching ordinary users a worktree concept outside an office-review context.

If a `.univer` artifact is active but cowork state is loading or errored, `Changes` remains visible and the popover owns the loading/error state.

## Decision 4: Changes binds to active artifact, not Files selection

The Office Worktree shown by `Changes` follows the current right-side active artifact tab.

Files selection does not directly drive Changes. Clicking a `.univer` file in Files opens or selects the right-side artifact. Once that artifact becomes active, the Changes entry appears or updates.

This prevents two state models from competing:

- Files selection describes which workspace file the file tree is focused on.
- Active artifact describes which target the right-side artifact panel is showing.

## Decision 5: Popovers are independent and mutually exclusive

Files and Changes should each open a popover:

- Files: roughly the current file tree popover size, about 420px wide and `min(78vh, 680px)` high.
- Changes: a smaller Office Worktree popover, content-driven with an upper bound around `min(60vh, 520px)`.

Opening one popover closes the other. Opening an artifact or selecting a unit from either popover does not automatically close the popover; users may keep browsing until they click outside or press Escape.

Files does not automatically switch to Changes after a `.univer` file is opened.

## Decision 6: State retention stays scoped

Popover open state is not retained across session switches.

Within the same mounted session:

- Files keeps its existing cached search, expansion, and selected file behavior by session/workspace/root key.
- Changes follows active artifact changes while open if the next active artifact is still `.univer`.
- Changes closes when the active artifact switches to a non-`.univer` target or disappears.
- Office Worktree sections keep their existing local defaults: Main worktree and Ready for review expanded, Active changes collapsed.

## Decision 7: Badge only pending reviews

The `Changes` toolbar button may show a small badge only when ready-for-review worktree count is greater than zero.

No extra "all clear" summary is needed inside the popover. The existing three-section Office Worktree presentation remains enough:

- Main worktree,
- Ready for review,
- Active changes.

## Decision 8: Worktree review actions are inline

Ready-for-review worktree actions belong on the worktree row itself. Merge, discard, and refresh should render as compact inline icon actions in the worktree title row, not as a separate action row below it.

When a review worktree becomes selected, OpenWork should automatically load review details for that worktree. The UI may show a transient loading row while the details are being fetched, but it should not ask users to click refresh before details appear. The refresh action remains available inline as an explicit retry/update control.

## Ownership

`ReactSessionComposer` owns toolbar placement and visual integration.

`SessionSurface` exposes a `composerToolbar` slot and passes it down.

`SessionPage` owns business assembly:

- workspace availability,
- active artifact lookup,
- Files and Changes popover open state,
- artifact panel opening,
- remote workspace context.

The composer should not directly import Workspace Files, Office Worktree, or panel-store business modules.

## Validation Plan

- Focused tests should cover toolbar rendering, Files visibility, Changes visibility, and slot placement below higher-priority composer status/accessories.
- Existing file tree tests should be updated so Files opens from the Composer Toolbar.
- Univer collab surface fraimz should prove Changes opens from the Composer Toolbar for an active `.univer` artifact.
- Fraimz should prove Files and Changes are independent entry points and that opening/selecting a `.univer` file does not automatically switch Files into Changes.

## Risks

- If the toolbar grows beyond a single compact row, the compact composer can regress into a large control console.
- If Changes is visible without `.univer` context, users will see an implementation concept before it is useful.
- If Files and Changes share open state or content, the original ambiguity remains.
- If Changes follows Files selection instead of active artifact state, artifact routing and worktree selection can drift apart.
