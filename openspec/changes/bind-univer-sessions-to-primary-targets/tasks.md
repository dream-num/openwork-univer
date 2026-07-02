## 1. Domain and Spec

- [x] 1.1 Define Primary Univerfile, Univerfile Row, General Session, Univer Task Session, Univerfile Overview Session, Session Univer Worktree, Session Review State, Units Panel, Tasks Panel, Worktree Missing/Stale, and Create New Task From Here in `CONTEXT.md`.
- [x] 1.2 Record ADR `0014-one-primary-univer-target-per-session`.
- [x] 1.3 Record ADR `0015-sidebar-groups-univer-targets-and-general-sessions`.
- [x] 1.4 Record ADR `0016-current-target-panel-for-bound-univer-sessions`.
- [x] 1.5 Run `pnpm exec openspec validate bind-univer-sessions-to-primary-targets --strict`.

## 2. Session Metadata and Binding

- [x] 2.1 Add durable Primary Univerfile metadata to session records.
- [x] 2.2 Add `sessionUniverWorktreeId` metadata to bound Univer task sessions.
- [x] 2.3 Ensure legacy or unbound sessions resolve to General Sessions.
- [x] 2.4 Prevent Primary Univerfile switching for non-empty bound sessions.
- [x] 2.5 Keep empty bound session creation lightweight and do not create a worktree eagerly.

## 3. Sidebar Univerfile Rows

- [x] 3.1 Auto-discover visible `.univer` files in a workspace.
- [x] 3.2 Filter hidden runtime data, dependency directories, generated caches, and non-user-facing `.univer` artifacts.
- [x] 3.3 Render Univerfile Rows with file name, unit count, and actionable session count.
- [x] 3.4 Render bound sessions under the matching row and unbound sessions under General Sessions.
- [x] 3.5 Sort sessions by actionability, then recent activity.
- [x] 3.6 Collapse merged and discarded sessions into Done by default.
- [x] 3.7 Implement row primary-click priority and Univerfile Overview fallback.
- [x] 3.8 Implement row `+` new task behavior with composer focus and no prefilled prompt.
- [x] 3.9 Implement no-task row fallback to a Univerfile Overview Session instead of an empty expansion.
- [x] 3.10 Remove generic `Target` labels and `New task` filler rows from Univerfile rows.
- [x] 3.11 Group Univerfile rows under a dedicated sidebar section and render Done as a nested group.
- [x] 3.12 Put deleted or moved Univerfiles that still have bound sessions under collapsed Unavailable Univerfiles.
- [x] 3.13 Add confirmed file-level cleanup for Unavailable Univerfiles that deletes bound sessions without touching the missing file.

## 4. Univerfile Overview and Task Creation

- [x] 4.1 Ensure each Univerfile has at most one Univerfile Overview Session.
- [x] 4.2 Render Univerfile Overview as row default content, not an ordinary task row.
- [x] 4.3 Default Univerfile Overview right-side content to the Univerfile Surface.
- [x] 4.4 Convert submitted Overview tasks into new bound task sessions.
- [x] 4.5 Seed task row titles from the first user task prompt or agent-generated short title.

## 5. Units and Tasks Toolbar Entries

- [x] 5.1 Replace the bound-session Files popover with split Units and Tasks entries.
- [x] 5.2 Keep Workspace Files available for General Sessions.
- [x] 5.3 Show `Units` trunk state in Units and active session task state in Tasks.
- [x] 5.4 Show no-changes-in-this-session when no Session Univer Worktree exists.
- [x] 5.5 Show active worktree status, changed units, review details, and merge/discard actions when applicable.
- [x] 5.6 Show merged and discarded read-only completion summaries.
- [x] 5.7 Implement Worktree missing/stale state with Refresh status, Create new task from here, and secondary Manual reassociation.
- [x] 5.8 Implement Create new task from here for Worktree missing/stale without clearing or rebinding the source session.
- [x] 5.9 Show the current bound Univerfile filename in the composer toolbar without using generic `Target` language.

## 6. Worktree Ownership and State

- [x] 6.1 Persist `sessionUniverWorktreeId` when a modifying task creates a worktree in the bound session.
- [x] 6.2 Verify created worktree Univerfile path matches the session Primary Univerfile before persisting.
- [x] 6.3 Do not overwrite ownership when viewing another session's worktree or selecting a worktree in the Univer Surface.
- [x] 6.4 Derive sidebar status chips from persisted worktree id joined with live cowork/CLI snapshot.
- [x] 6.5 Ignore agent text as an authoritative source for working, ready, conflict, merged, discarded, or needs-attention state.
- [x] 6.6 Treat missing persisted worktree id as needs attention with no automatic fallback.
- [x] 6.7 Treat multiple active worktrees in one session as needs attention and make Split Into New Task primary.
- [x] 6.8 Treat merged and discarded worktrees as terminal.

## 7. Agent Context and Behavior

- [x] 7.1 Inject minimal Univer Session Context into bound session prompts.
- [x] 7.2 Keep workspace file lists, unit inventories, and worktree snapshots out of default prompt context.
- [x] 7.3 Steer read-only and analysis tasks to inspect trunk without creating a worktree.
- [x] 7.4 Steer modifying tasks to create or reuse the session-owned Session Univer Worktree.
- [x] 7.5 Steer further modifying work from Done sessions into new bound task sessions.

## 8. Validation

- [x] 8.1 Add focused tests for session metadata and binding behavior.
- [x] 8.2 Add focused tests for sidebar grouping, sorting, Done collapse, and Univerfile Overview behavior.
- [x] 8.3 Add focused tests for Units and Tasks states and actions.
- [x] 8.4 Add focused tests for worktree state derivation from live snapshots.
- [x] 8.5 Add focused tests for Refresh status read-only recomputation.
- [x] 8.6 Add focused tests for Create new task from here metadata semantics.
- [x] 8.7 Run `pnpm --filter @openwork/app typecheck`.
- [x] 8.8 Run focused app tests for sidebar, session page, panel, and Univer artifact routing.
- [x] 8.9 Produce fraimz evidence for univerfile rows, task creation, review state, Done state, and missing/stale recovery.
- [x] 8.10 Run `pnpm exec openspec validate bind-univer-sessions-to-primary-targets --strict` after implementation updates.
- [x] 8.11 Add focused tests for Univerfile Overview staying on the univerfile row instead of General Sessions.
- [x] 8.12 Add focused server test for one Univerfile Overview Session per Primary Univerfile.
- [x] 8.13 Add focused tests for minimal Univer Session Context.

## 9. Univer Surface Breadcrumb Route

- [ ] 9.1 Replace the right-side Univer Surface title with a breadcrumb rendered as `<Univerfile> / <Unit> / <Worktree>`.
- [ ] 9.2 Remove the leading generic file icon from the Univer Surface header.
- [ ] 9.3 Add Unit breadcrumb dropdown routing for units inside the bound Primary Univerfile.
- [ ] 9.4 Render Unit breadcrumb text as unit name only, with icons for sheet/document/slide type.
- [ ] 9.5 Add Worktree breadcrumb dropdown routing for Current version and available worktrees under the bound Primary Univerfile.
- [ ] 9.6 Group Worktree choices as Current version, This session, and Other sessions.
- [ ] 9.7 Label Worktree choices with Current version or owning session title plus compact state chip, not raw worktree id.
- [ ] 9.8 Ensure Unit and Worktree breadcrumb changes do not mutate `primaryUniverTarget` or `sessionUniverWorktreeId`.
- [ ] 9.9 Keep session-owned worktree state as the default route for working/review sessions without making the right-side surface session-owned.
- [ ] 9.10 Add focused tests for breadcrumb rendering, route-only selector behavior, and view-only Other sessions worktrees.
- [ ] 9.11 Produce fraimz evidence for breadcrumb route switching in a bound Univer session.
