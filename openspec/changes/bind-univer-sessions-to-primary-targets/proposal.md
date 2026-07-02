## Why

OpenWork still presents most work as a directory-scoped workspace with flat sessions, Files, and the active right-side artifact driving context. That model is weak for Univer work. A `.univer` file is itself a multi-unit workspace for related spreadsheet, document, and slide work, and `univer-cli` supports multiple worktrees so several agent tasks can collaborate against the same Univerfile.

Users need OpenWork to make the active Univerfile explicit, stable, and visible in the daily workflow. A session should either be general workspace work or be centered on one Primary Univerfile. The sidebar, composer context, review state, Units/Tasks panels, agent prompt context, and Univer Surface should all follow that binding instead of whichever file or artifact was clicked most recently.

## What Changes

- Add a Primary Univerfile model for bound Univer sessions.
- Keep unbound and legacy sessions under General Sessions.
- Auto-discover visible `.univer` files in the workspace and show them as Univerfile Rows in the sidebar.
- Show sessions under their bound Univerfile Row, with actionability-first sorting and Done grouping.
- Add a single Univerfile Overview Session per Univerfile for neutral target entry, not as an ordinary task row.
- Make the univerfile row `+` action create an empty bound task session and focus the composer without prefilled prompt text.
- Replace the bound-session Files popover with separate Units and Tasks toolbar entries.
- Render the right-side Univer Surface header as a breadcrumb `<Univerfile> / <Unit> / <Worktree>` so the surface is visually file-bound, not session-title-bound.
- Keep deleted or moved Univerfiles with bound sessions under a collapsed Unavailable Univerfiles sidebar section.
- Make Session Univer Worktree ownership session-scoped through persisted `sessionUniverWorktreeId`.
- Derive sidebar review state from persisted session worktree id plus live cowork/CLI state, not from agent text.
- Handle missing/stale and multiple-worktree needs-attention states with explicit recovery paths.
- Keep read/analysis tasks on trunk inspect; create or reuse a Session Univer Worktree only for modifying tasks.
- Treat merged/discarded worktrees as terminal session states that remain inspectable but do not accept further modification.

## Capabilities

### New Capabilities

- `univer-target-session-workflow`: Bind Univer work sessions to one Primary Univerfile, group them under univerfile rows, and route task/review/worktree state through session-owned worktrees.

### Modified Capabilities

- `composer-toolbar-context-entrypoints`: Bound Univer sessions use Units and Tasks instead of the generic Files popover as the primary composer-adjacent context entry points.
- `native-univer-surface`: The Univer Surface follows the session's Primary Univerfile and selected Session Univer Worktree/content scope.
- `univer-artifact-header`: Header/content scope defaults align with session review state and terminal Done states.

## Impact

- Affected product surfaces:
  - Workspace sidebar session navigation and grouping.
  - Session metadata and session creation flows.
  - Composer placeholder, task creation, and Univerfile Overview behavior.
  - Units/Tasks panels and existing Workspace Files behavior.
  - Univer Surface breadcrumb routing, worktree scope, and review-state defaults.
  - Agent prompt context for bound Univer sessions.
- Affected code areas likely include:
  - `apps/app/src/react-app/domains/session/sidebar/*`
  - `apps/app/src/react-app/domains/session/chat/session-page.tsx`
  - `apps/app/src/react-app/domains/session/panel/*`
  - `apps/app/src/react-app/domains/session/artifacts/*`
  - server/session metadata and workspace/session APIs.
- Affected docs:
  - `CONTEXT.md`
  - `docs/adr/0014-one-primary-univer-target-per-session.md`
  - `docs/adr/0015-sidebar-groups-univer-targets-and-general-sessions.md`
  - `docs/adr/0016-current-target-panel-for-bound-univer-sessions.md`
- Out of scope:
  - Replacing Univer CLI or cowork state as the worktree authority.
  - Reimplementing sheet/doc/slide semantics inside OpenWork.
  - Making General Sessions require a Univerfile.
  - Inferring Primary Univerfile for old sessions from chat history or opened artifacts.
