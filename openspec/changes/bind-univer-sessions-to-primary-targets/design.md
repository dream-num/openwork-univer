## Context

Univer work is Univerfile-centric. A `.univer` file can contain multiple units and can host multiple related agent worktrees. OpenWork's existing workspace/session model is useful for ordinary agent work, but it does not yet express that a user may repeatedly dispatch tasks against the same Univerfile while several sessions and worktrees remain active or ready for review.

The current composer toolbar split also still reflects a directory/active-artifact model: Files opens workspace files, and Changes follows the active right-side `.univer` artifact. The new model should keep Workspace Files for General Sessions, but bound Univer sessions need a Univerfile-centric control surface where the session's Primary Univerfile is the anchor.

## Goals

- Make Primary Univerfile explicit and durable per session.
- Preserve General Sessions for unbound workspace work and old sessions without metadata.
- Let users see all visible Univerfiles directly in the workspace sidebar.
- Let users see which sessions under each Univerfile are working, ready, conflicted, needs attention, merged, or discarded.
- Keep session titles task-oriented while status chips carry review state.
- Keep worktree ownership session-scoped so multiple agents can work against the same Univerfile without stealing each other's review context.
- Replace bound-session Files with separate Units and Tasks toolbar entries.
- Make the right-side Univer Surface file-bound through a breadcrumb route rather than visually owned by the chat session.
- Ensure agent context is minimal and Univerfile-scoped.
- Make exceptional states explicit rather than silently rebinding or inferring state.

## Non-Goals

- Do not infer a Primary Univerfile for existing sessions from chat messages, artifacts, or file mentions.
- Do not let a non-empty session switch Primary Univerfile.
- Do not show a unit tree in the sidebar.
- Do not put unit diffs, conflict details, merge, or discard actions directly in sidebar rows.
- Do not create a Session Univer Worktree for read-only or analysis tasks.
- Do not let right-side unit/worktree navigation mutate a session's Primary Univerfile or Session Univer Worktree ownership.
- Do not let agent text mark a session ready, merged, conflicted, or discarded.
- Do not make the Univerfile Overview Session a hidden long-running task history.
- Do not make Manual reassociation the default recovery action for ordinary users.

## Decision 1: Bind one Primary Univerfile per Univer task session

A bound Univer session has at most one Primary Univerfile. The binding lives in durable server/session metadata and is the source of truth for sidebar grouping, composer context, agent context, right-side Univer Surface defaults, and review state.

Sessions without durable Primary Univerfile metadata remain General Sessions. OpenWork should not infer Univerfile binding from prior messages, artifact tabs, or file mentions.

An empty bound session may be created for a Univerfile. Once the session is non-empty, switching to another Univerfile means opening or creating another session.

## Decision 2: Keep General Sessions

General Sessions remain a first-class section for unbound workspace-level work, legacy sessions, and tasks that are not centered on one Univerfile. This avoids forcing every OpenWork workflow into the Univerfile model.

## Decision 3: Sidebar groups sessions under auto-discovered univerfile rows

OpenWork auto-discovers visible `.univer` files in the workspace and renders them under a dedicated `Univerfiles` sidebar section. Each visible file renders as a Univerfile Row. Discovery filters hidden runtime data, dependency directories, generated caches, and other non-user-facing `.univer` artifacts.

A univerfile row shows compact Univerfile metadata only: file name, unit count, and actionable session count. It uses existing Univerfile language, not a generic `Target` label. Unit count and actionable session count render as compact numeric badges only when present.

If a visible Univerfile has no task sessions, the row does not render a `New task` filler row. The row-level `+` action is the creation path, and it can remain visible for empty rows so the file list does not become artificially tall.

Sessions bound to a Univerfile render under that row. Session row titles describe tasks, using the user's first task prompt or an agent-generated short title. Review state belongs in the status chip and should not rewrite the title. Done sessions render in a nested Done group inside their owning Univerfile Row, not as another top-level workspace section.

If a session remains bound to a Univerfile that is no longer auto-discovered because the file was deleted or moved, OpenWork keeps that history under a collapsed `Unavailable Univerfiles` section. It does not delete the sessions, infer a new Univerfile, or show those stale files in the main current-work list. The unavailable row may expose an explicit remove action that deletes the bound sessions for that stale entry after confirmation; this is a user-initiated cleanup action, not automatic file deletion.

## Decision 4: Univerfile row uses priority and overview

Clicking a univerfile row opens the highest-priority non-Done session for that Univerfile: ready, conflict, or needs attention first; then working; then ordinary planning or historical sessions. If no non-Done task exists, OpenWork opens or creates the Univerfile's single Univerfile Overview Session.

The Univerfile Overview Session is not an ordinary row, does not count as a new task, and does not enter Done. It centers the Univerfile's Univer Surface. If the user submits a task from the overview composer, OpenWork creates and switches to a new bound task session instead of storing task history in the overview.

The univerfile row `+` action creates an empty bound task session, selects it, and focuses the composer with a Univerfile-aware placeholder rather than prefilled prompt text.

## Decision 5: Units and Tasks replace Files for bound sessions

For sessions bound to a Primary Univerfile, the composer toolbar should show separate `Units` and `Tasks` entries instead of generic Files. General Sessions keep Workspace Files.

The same toolbar shows the current Univerfile as a compact file-name chip so the user can see which `.univer` file the session is bound to while composing. The chip uses existing Univerfile language, not `Target`, and opens the current Univer Surface rather than switching binding.

The two entries have separate responsibilities:

- `Units`, showing Univerfile trunk unit status.
- `Tasks`, showing the current session's Session Univer Worktree state when one exists.

Before a modifying task creates a Session Univer Worktree, `Tasks` shows an explicit no-changes-in-this-session state and no ready/review controls.

## Decision 6: Session Univer Worktree ownership is explicit

Worktree ownership is session-scoped through `sessionUniverWorktreeId`. When a modifying task creates a worktree in the current bound session, the OpenWork runtime or Univer CLI Adapter persists that id after verifying it belongs to the session's Primary Univerfile.

Opening another worktree, viewing another session's review, or selecting worktree scope in the Univer Surface does not overwrite ownership.

A session should have at most one active Session Univer Worktree. If a second active worktree is created anyway, the session becomes needs attention. Split Into New Task is the primary recovery action; Manual reassociation is secondary or advanced.

## Decision 7: Review state comes from live state, not agent text

Sidebar state chips are derived by joining persisted `sessionUniverWorktreeId` to live cowork or CLI state. Agent messages may explain progress, but they are not authoritative for working, ready, conflict, merged, discarded, or needs-attention state.

If the persisted worktree id is missing from live state, the row shows needs attention and the Tasks panel shows Worktree missing/stale. OpenWork must not silently choose another worktree for the same Univerfile or fall back to working.

## Decision 8: Refresh status is read-only recomputation

Refresh status only refetches cowork/CLI snapshot data and recomputes the session review state. It does not mutate session metadata, clear `sessionUniverWorktreeId`, rebind to another worktree, or start an agent run.

If the worktree reappears, the session state returns to the matching live state. If it remains absent, the session stays needs attention.

## Decision 9: Create new task from here starts clean recovery work

Create new task from here creates a new task session on the same Primary Univerfile without inheriting the old `sessionUniverWorktreeId`. It keeps a read-only source reference to the original session so the agent and user can understand context.

The new session may seed its title as `Retry: <original task title>` until the user sends a first new task prompt. The original session remains needs attention and is not automatically moved to Done.

## Decision 10: Terminal worktree states are inspectable but closed

After merge or discard, the session-owned worktree becomes terminal. The session remains openable for history and result inspection, then collapses under Done by default.

Merged sessions default to the current Univerfile trunk result. Discarded sessions default to a read-only discarded worktree diff or summary. Neither state defaults to an editable worktree scope. Further modifying work should create a new bound task session.

## Decision 11: Agent context is minimal and Univerfile-scoped

Bound sessions send only minimal Univer Session Context to agents: Univerfile identity, workspace-relative Univerfile path, current task intent, and the rule that Univerfile changes require another session.

OpenWork should not inject full workspace file trees, unit inventories, or worktree snapshots into every prompt. Agents inspect Univerfile state through Univer CLI surfaces as needed.

Read and analysis tasks inspect the Primary Univerfile trunk. Modifying tasks create or reuse the session's Session Univer Worktree.

## Decision 12: Existing Univer Surface remains the rendering surface

OpenWork should not invent separate review, progress, and Univer surfaces. The right-side Univer Surface is anchored to the selected session's Primary Univerfile, while its currently rendered unit and worktree are a separate Univer Surface Route. State-specific defaults select the right existing Univer Content Scope:

- Overview or planning: current version.
- Working: original worktree changes.
- Ready review: original changes or merge preview.
- Merged: current trunk result.
- Discarded: read-only discarded diff or summary.

## Decision 13: Univer Surface header is a breadcrumb, not a session title

When a bound Univer session is selected, the right-side Univer Surface header should identify the Univerfile route being viewed, not the chat session. The header uses a breadcrumb shape: `<Univerfile> / <Unit> / <Worktree>`.

The Univerfile segment is the bound Primary Univerfile and does not switch the session binding. The Unit and Worktree segments are dropdown selectors that change the surface route for viewing. The Unit segment text is only the unit name; unit type is represented by an icon rather than inline text such as `spreadsheet`, `doc`, or `slide`. Selecting another unit or worktree must not overwrite `primaryUniverTarget` or `sessionUniverWorktreeId`.

For worktree labels, `Current version` is the trunk/current Univerfile scope. Session-owned worktrees may be used as the default route for working or review sessions, but they remain one route option under the file, not the identity of the entire right-side surface.

The Worktree selector should expose all viewable worktrees for the same Primary Univerfile, grouped as `Current version`, `This session`, and `Other sessions`. `Current version` is always first. `This session` contains the selected session's Session Univer Worktree when present. `Other sessions` contains worktrees owned by other sessions for the same Univerfile and is explicitly view-only from the perspective of the selected session. Choosing anything in the selector changes only the Univer Surface Route.

Worktree choices should be labeled for task comprehension, not implementation identity. The trunk route is `Current version`. Session-owned and other-session worktrees use the owning session title as the primary label, with a compact state chip such as `Working`, `Ready`, `Merged`, or `Discarded`. Raw worktree ids are reserved for tooltip, diagnostics, or developer mode.

## Risks

- Sidebar discovery can become noisy if hidden/generated `.univer` files are not filtered.
- If status chips follow agent text, review state can drift from the actual worktree state.
- If a missing worktree auto-rebinds, task history and review ownership can be mis-associated.
- If Overview stores long-running task chat, important work can become invisible under the univerfile row.
- If Done sessions accept continued modification, terminal worktree history becomes ambiguous.
- If Units and Tasks are merged back into one broad panel, content navigation and task review can become difficult to scan.
- If the right-side header looks like a session title, users can mistake surface navigation for session/worktree ownership changes.

## Validation Plan

- Focused tests should cover Primary Univerfile metadata, binding immutability, General Sessions fallback, univerfile row grouping, and univerfile row `+` task creation.
- Focused tests should cover session row review state derivation from live cowork/CLI snapshots, including missing/stale, multiple-worktree, merged, and discarded states.
- Focused tests should cover Units and Tasks toolbar entries, task empty state, terminal summaries, and recovery actions.
- Focused tests should cover Univer Surface Breadcrumb rendering, unit/worktree dropdown route changes, and non-mutation of session metadata.
- Fraimz should prove a workspace with multiple `.univer` files shows univerfile rows and General Sessions.
- Fraimz should prove a user can create a new task under a Univerfile, run or simulate a modifying task, see ready-for-review state in the sidebar row, merge/discard in the selected session, and see the session move under Done.
- Fraimz should prove Worktree missing/stale uses Refresh status and Create new task from here without rebinding automatically.
- Fraimz should prove the right-side Univer Surface header renders as `<Univerfile> / <Unit> / <Worktree>` and that changing Unit or Worktree only changes the view route.
