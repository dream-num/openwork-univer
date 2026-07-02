## ADDED Requirements

### Requirement: Sessions bind explicitly to one Primary Univerfile

OpenWork SHALL support Univer Task Sessions that are explicitly bound to one Primary Univerfile and SHALL keep unbound sessions as General Sessions.

#### Scenario: Bound session has one Univerfile

- **WHEN** a Univer Task Session is created for a `.univer` file
- **THEN** OpenWork SHALL persist the Primary Univerfile in durable session metadata
- **AND** the session SHALL have at most one Primary Univerfile
- **AND** other workspace files MAY remain available as supporting context

#### Scenario: Non-empty bound session does not switch Univerfile

- **WHEN** a bound session already contains user or agent history
- **AND** the user wants to work on another `.univer` file
- **THEN** OpenWork SHALL open or create another session
- **AND** OpenWork SHALL NOT mutate the existing session's Primary Univerfile

#### Scenario: Legacy session remains general

- **WHEN** an existing session has no durable Primary Univerfile metadata
- **THEN** OpenWork SHALL place it under General Sessions
- **AND** OpenWork SHALL NOT infer a Univerfile from message history, opened artifacts, or file mentions

### Requirement: Sidebar groups visible Univerfiles and general sessions

OpenWork SHALL auto-discover visible `.univer` files in the workspace and render each as a Univerfile Row with bound sessions underneath.

#### Scenario: Visible Univerfiles are discovered

- **WHEN** a workspace contains user-facing `.univer` files
- **THEN** OpenWork SHALL list them as Univerfile Rows under a dedicated `Univerfiles` sidebar section
- **AND** OpenWork SHALL filter hidden runtime data, dependency directories, generated caches, and other non-user-facing `.univer` artifacts

#### Scenario: Univerfile row shows compact metadata

- **WHEN** a Univerfile Row is rendered
- **THEN** it SHALL show compact Univerfile metadata including file name, unit count, and actionable session count
- **AND** it SHALL use existing Univerfile language and SHALL NOT display a generic `Target` label
- **AND** unit count and actionable session count SHALL render as compact numeric badges only when present
- **AND** it SHALL NOT expand into a unit tree

#### Scenario: Empty Univerfile row does not create filler sessions

- **WHEN** a Univerfile Row has no visible task sessions
- **THEN** OpenWork SHALL NOT render a `New task` placeholder row under it
- **AND** the row-level `+` action SHALL remain the way to create a task for that Univerfile

#### Scenario: General sessions remain available

- **WHEN** sessions are not bound to a Primary Univerfile
- **THEN** OpenWork SHALL keep them under General Sessions

#### Scenario: Deleted Univerfiles move to unavailable section

- **WHEN** a session remains bound to a Primary Univerfile that is no longer auto-discovered
- **THEN** OpenWork SHALL keep that session under a collapsed `Unavailable Univerfiles` section
- **AND** OpenWork SHALL NOT delete the session
- **AND** OpenWork SHALL NOT infer a replacement Primary Univerfile

#### Scenario: User removes an unavailable Univerfile entry

- **WHEN** a user chooses the remove action on an unavailable Univerfile Row
- **THEN** OpenWork SHALL ask for confirmation before deleting anything
- **AND** confirmation SHALL delete the sessions bound to that unavailable Univerfile entry
- **AND** OpenWork SHALL NOT attempt to delete the missing `.univer` file from disk

### Requirement: Univerfile rows open task sessions through priority and overview

OpenWork SHALL use univerfile rows as the primary entry point for switching Univer work streams without changing the current session's Univerfile binding.

#### Scenario: Univerfile row click opens highest-priority active session

- **WHEN** a user clicks a Univerfile Row
- **THEN** OpenWork SHALL open the highest-priority non-Done task session for that Univerfile
- **AND** ready, conflict, and needs-attention sessions SHALL rank before working sessions
- **AND** working sessions SHALL rank before ordinary planning or historical sessions

#### Scenario: Univerfile row falls back to overview

- **WHEN** a Univerfile has no non-Done task session
- **THEN** OpenWork SHALL open or create the Univerfile's single Univerfile Overview Session
- **AND** the Univerfile Overview Session SHALL default the right-side content to that Univerfile's Univer Surface
- **AND** the Univerfile Overview Session SHALL NOT render as an ordinary task row

#### Scenario: Univerfile row creates a new empty task

- **WHEN** the user chooses the univerfile row `+` action
- **THEN** OpenWork SHALL create an empty task session bound to that Primary Univerfile
- **AND** OpenWork SHALL select it and focus the composer
- **AND** the composer SHALL use a Univerfile-aware placeholder rather than a prefilled prompt

#### Scenario: Overview task submission creates a task session

- **WHEN** the user submits a task from the Univerfile Overview Session
- **THEN** OpenWork SHALL create and switch to a new bound task session
- **AND** OpenWork SHALL NOT store long-running task chat history in the Univerfile Overview Session

### Requirement: Session rows expose task titles and computed review state

OpenWork SHALL render each bound task session row with a task title and one primary computed Session Review State.

#### Scenario: Session row title remains task-oriented

- **WHEN** OpenWork renders a bound task session row
- **THEN** the row title SHALL describe the task from the user's first task prompt or an agent-generated short title
- **AND** review state SHALL appear in a status chip
- **AND** review state SHALL NOT replace or rewrite the task title

#### Scenario: Review state is computed from live state

- **WHEN** a session has a persisted `sessionUniverWorktreeId`
- **THEN** OpenWork SHALL derive the row status chip by joining that id with live cowork or CLI state
- **AND** OpenWork SHALL NOT treat agent text as authoritative for working, ready, conflict, merged, discarded, or needs-attention state

#### Scenario: Sessions sort by actionability

- **WHEN** OpenWork lists sessions under a univerfile row
- **THEN** ready, conflict, and needs-attention sessions SHALL sort before working sessions
- **AND** working sessions SHALL sort before ordinary or historical sessions
- **AND** sessions with the same state SHALL sort by recent activity

#### Scenario: Done sessions collapse

- **WHEN** sessions are merged or discarded
- **THEN** OpenWork SHALL collapse them into a nested Done group inside the owning Univerfile Row by default
- **AND** they SHALL remain openable for history and result inspection

### Requirement: Units and Tasks replace Files for bound Univer sessions

OpenWork SHALL use separate Units and Tasks toolbar entries as the primary composer-adjacent context entry points for sessions bound to a Primary Univerfile.

#### Scenario: Bound session shows Units and Tasks

- **WHEN** the current session is bound to a Primary Univerfile
- **THEN** OpenWork SHALL show a `Units` toolbar entry for unit navigation
- **AND** OpenWork SHALL show a `Tasks` toolbar entry for the current session's task/worktree state
- **AND** the generic Workspace Files popover SHALL NOT be the primary bound-session context panel

#### Scenario: Bound session shows current Univerfile context

- **WHEN** the current session is bound to a Primary Univerfile
- **THEN** OpenWork SHALL show the current Univerfile filename in the composer toolbar
- **AND** OpenWork SHALL NOT label the filename as a generic `Target`
- **AND** selecting the filename SHALL open the current Univer Surface without switching the session binding

#### Scenario: General session keeps Workspace Files

- **WHEN** the current session is a General Session
- **THEN** OpenWork SHALL keep Workspace Files available as the ordinary filesystem browser

#### Scenario: Units shows unit navigation

- **WHEN** the user opens `Units`
- **THEN** OpenWork SHALL show Univerfile trunk unit status
- **AND** selecting a unit SHALL route the right-side Univer Surface to that unit

#### Scenario: Tasks shows current session task state

- **WHEN** the user opens `Tasks`
- **THEN** OpenWork SHALL show the current session's Session Univer Worktree state

#### Scenario: No worktree shows no changes

- **WHEN** the current bound session has no Session Univer Worktree
- **THEN** `Tasks` SHALL show an explicit no-changes-in-this-session state
- **AND** it SHALL NOT show ready/review controls

### Requirement: Worktree ownership is session-scoped

OpenWork SHALL associate modifying task worktrees with the owning Univer Task Session rather than treating a worktree as global current state for the whole Univerfile.

#### Scenario: Modifying task creates owned worktree

- **WHEN** a modifying agent task creates a Univer worktree in a bound session
- **THEN** the OpenWork runtime or Univer CLI Adapter SHALL persist the created worktree id as `sessionUniverWorktreeId`
- **AND** it SHALL verify the worktree belongs to the session's Primary Univerfile before persisting

#### Scenario: Read task does not create worktree

- **WHEN** the user asks for read-only inspection, explanation, or analysis
- **THEN** the agent SHALL inspect the Primary Univerfile trunk through Univer CLI
- **AND** OpenWork SHALL NOT create a Session Univer Worktree or review state for that task

#### Scenario: Viewing another worktree does not steal ownership

- **WHEN** the user opens an existing worktree, views another session's review, or selects a worktree in the Univer Surface
- **THEN** OpenWork SHALL NOT overwrite the current session's `sessionUniverWorktreeId`

#### Scenario: Session has at most one active worktree

- **WHEN** a bound session already owns an active Session Univer Worktree
- **THEN** the runtime and adapter SHALL avoid creating another active worktree in that same session
- **AND** additional modifying work SHOULD be steered toward a new task session

### Requirement: Missing or multiple worktrees become needs-attention states

OpenWork SHALL expose exceptional session-worktree states explicitly and SHALL avoid silent recovery that may mis-associate task history.

#### Scenario: Persisted worktree is missing

- **WHEN** the persisted `sessionUniverWorktreeId` cannot be found in live cowork or CLI state
- **THEN** the session row SHALL show needs attention
- **AND** Tasks SHALL show Worktree missing/stale
- **AND** OpenWork SHALL NOT fall back to working
- **AND** OpenWork SHALL NOT automatically bind the session to another worktree for the same Univerfile

#### Scenario: Refresh status is read-only

- **WHEN** the user chooses Refresh status from Worktree missing/stale
- **THEN** OpenWork SHALL refetch cowork or CLI snapshot state and recompute the session review state
- **AND** OpenWork SHALL NOT mutate session metadata
- **AND** OpenWork SHALL NOT clear `sessionUniverWorktreeId`
- **AND** OpenWork SHALL NOT trigger an agent run
- **WHEN** the persisted worktree is found again
- **THEN** OpenWork SHALL restore the matching working, ready, conflict, merged, or discarded state
- **WHEN** the persisted worktree is still absent
- **THEN** OpenWork SHALL keep the session in needs attention

#### Scenario: Create new task from missing state starts clean

- **WHEN** the user chooses Create new task from here from Worktree missing/stale
- **THEN** OpenWork SHALL create and select a new task session bound to the same Primary Univerfile
- **AND** the new session SHALL NOT inherit the old `sessionUniverWorktreeId`
- **AND** the new session SHALL preserve only a read-only source reference to the original session
- **AND** the original session SHALL remain needs attention

#### Scenario: Multiple active worktrees split by default

- **WHEN** a session has multiple active worktrees
- **THEN** OpenWork SHALL mark the session needs attention
- **AND** Split Into New Task SHALL be the primary recovery action
- **AND** Manual reassociation SHALL remain secondary or advanced

### Requirement: Terminal worktree states are inspectable and closed

OpenWork SHALL treat merged and discarded Session Univer Worktrees as terminal session states.

#### Scenario: Merge moves session to Done

- **WHEN** the user merges a session-owned worktree
- **THEN** the session row SHALL become merged
- **AND** it SHALL move under Done by default
- **AND** reopening it SHALL default the Univer Surface to the current Univerfile trunk result

#### Scenario: Discard moves session to Done

- **WHEN** the user discards a session-owned worktree
- **THEN** the session row SHALL become discarded
- **AND** it SHALL move under Done by default
- **AND** reopening it SHALL default to a read-only discarded worktree diff or summary

#### Scenario: Further modification creates new task

- **WHEN** the user submits another modifying task from a Done session
- **THEN** OpenWork SHALL prompt to create a new bound task session for the same Primary Univerfile
- **AND** OpenWork SHALL NOT reuse the completed Session Univer Worktree for further modification

### Requirement: Univer Surface is Primary Univerfile-bound

OpenWork SHALL anchor the right-side Univer Surface to the selected session's Primary Univerfile and SHALL treat selected unit and selected worktree as Univer Surface Route state.

#### Scenario: Overview and planning use current Univerfile

- **WHEN** the selected session is a Univerfile Overview Session or planning session without a Session Univer Worktree
- **THEN** the Univer Surface SHALL default to current Univerfile content

#### Scenario: Working session uses worktree changes

- **WHEN** the selected session owns a working Session Univer Worktree
- **THEN** the Univer Surface SHALL default to original worktree changes for that session-owned worktree

#### Scenario: Ready review uses review scope

- **WHEN** the selected session owns a ready-for-review Session Univer Worktree
- **THEN** the Univer Surface SHALL default to original changes or merge preview for that session-owned worktree

#### Scenario: Terminal sessions do not default editable worktree scope

- **WHEN** the selected session is merged or discarded
- **THEN** the Univer Surface SHALL NOT default to an editable worktree scope

#### Scenario: Surface header renders breadcrumb

- **WHEN** the right-side Univer Surface is showing a bound Primary Univerfile
- **THEN** OpenWork SHALL render the header identity as `<Univerfile> / <Unit> / <Worktree>`
- **AND** OpenWork SHALL NOT render a leading generic file icon before the breadcrumb
- **AND** OpenWork SHALL NOT label the Univerfile segment as `Target`

#### Scenario: Univerfile breadcrumb segment is binding context

- **WHEN** a bound Univer session is selected
- **THEN** the breadcrumb's Univerfile segment SHALL identify the session's Primary Univerfile
- **AND** selecting or viewing another unit or worktree SHALL NOT change the session's Primary Univerfile

#### Scenario: Unit selector changes only the surface route

- **WHEN** the user opens the Unit breadcrumb selector and chooses another unit in the Primary Univerfile
- **THEN** OpenWork SHALL route the right-side Univer Surface to that unit
- **AND** the Unit breadcrumb text SHALL show only the unit name
- **AND** the Unit breadcrumb MAY use an icon to express sheet, document, or slide type
- **AND** the Unit breadcrumb SHALL NOT append textual type labels such as `spreadsheet`, `doc`, or `slide`
- **AND** OpenWork SHALL NOT change `primaryUniverTarget`
- **AND** OpenWork SHALL NOT change `sessionUniverWorktreeId`

#### Scenario: Worktree selector changes only the surface route

- **WHEN** the user opens the Worktree breadcrumb selector and chooses Current version or another worktree for the Primary Univerfile
- **THEN** OpenWork SHALL route the right-side Univer Surface to that worktree/content scope
- **AND** OpenWork SHALL NOT change `primaryUniverTarget`
- **AND** OpenWork SHALL NOT change `sessionUniverWorktreeId`

#### Scenario: Worktree selector groups same-file routes

- **WHEN** the user opens the Worktree breadcrumb selector for a Primary Univerfile
- **THEN** OpenWork SHALL show `Current version` first
- **AND** OpenWork SHALL group the selected session's Session Univer Worktree under `This session` when present
- **AND** OpenWork SHALL group other viewable worktrees for the same Primary Univerfile under `Other sessions`
- **AND** selecting an `Other sessions` worktree SHALL be view-only for the selected session and SHALL NOT steal ownership

#### Scenario: Worktree selector uses task labels

- **WHEN** OpenWork renders Worktree breadcrumb choices
- **THEN** the trunk/current route SHALL be labeled `Current version`
- **AND** session-owned worktree choices SHALL use the owning session title as the primary label
- **AND** worktree choices MAY show a compact state chip such as `Working`, `Ready`, `Merged`, or `Discarded`
- **AND** OpenWork SHALL NOT use raw worktree ids as the primary visible label outside tooltip, diagnostics, or developer mode

#### Scenario: Session-owned worktree is only a default route

- **WHEN** the selected session owns a Session Univer Worktree
- **THEN** OpenWork MAY default the Worktree breadcrumb segment to that session-owned worktree or its review scope
- **AND** that default SHALL remain a view route under the Primary Univerfile rather than the identity of the whole right-side surface
