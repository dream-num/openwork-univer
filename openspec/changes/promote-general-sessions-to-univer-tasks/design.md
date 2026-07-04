## Context

OpenWork already distinguishes General Sessions from Univer Task Sessions. A Univer Task Session has one durable Primary Univerfile; General Sessions remain workspace-scoped. The missing lifecycle rule is how a live General Session becomes a Univer Task Session when the first Univerfile appears during the task.

Promotion must be explicit enough to preserve the "one Primary Univerfile per session" guarantee. It should not reintroduce the older active-artifact model where opening or viewing a file silently changes session identity.

## Goals

- Promote General Sessions into Univer Task Sessions when the user or tool gives a strong Primary Univerfile signal.
- Keep the user's task flow continuous when `univer new` creates the first `.univer` in a workspace.
- Respect explicit `@` mentions as user intent.
- Prevent already bound sessions from silently switching Primary Univerfile.

## Non-Goals

- Do not infer promotion from plain text mentions, search/list results, workspace file browsing, or artifact preview.
- Do not infer promotion for legacy sessions from historical messages.
- Do not let `univer new` switch a bound session's Primary Univerfile.
- Do not make worktree creation the same thing as Univerfile binding.

## Decision 1: Promotion has only two strong signals

A General Session can promote to a Univer Task Session through exactly two product signals:

- The user submits a task with a direct composer `@` mention to one `.univer` file.
- A `univer new` command successfully creates a new `.univer` file while the session is still a General Session.

Weak signals do not promote: normal text mentions, search output, filesystem discovery, opening the file tree, previewing a `.univer` artifact, or assistant prose linking to a file.

## Decision 2: Single direct `@` binding is the first stage of a General-origin run

When a General Session task directly mentions exactly one `@A.univer`, OpenWork promotes the session to `A.univer` before the agent run and marks that binding as General-origin first-stage context. The agent receives Univer Session Context for `A.univer`, but OpenWork can still recognize that this session started the current run as a General Session.

If the same General-origin run later emits `univer new B.univer`, OpenWork creates a new Univer Task Session bound to `B.univer`, records the original session as `univerSourceSessionId`, clears the source session's first-stage marker, and switches the user to the new `B.univer` session. The new session does not copy transcript history; the source relationship is the durable provenance.

## Decision 3: `univer new` only promotes General Sessions

`univer new` promotes the current session only if the session is still General when the creation event arrives. This covers the empty-workspace first-run path where the user starts from a General Session without a direct `.univer` mention and the agent creates the first `B.univer`.

If the session is already bound and was not marked as General-origin first-stage context for the current run, `univer new B.univer` remains a no-op lifecycle signal. OpenWork must not switch the Primary Univerfile, must not show the General Session choice gate, and must not auto-redirect the user into a newly bound session. Bound sessions are expected to keep work inside their fixed Primary Univerfile; any need for a different Primary Univerfile should begin from an explicit new General Session or a separate user action.

## Decision 4: Bound session context forbids hidden new Primary Univerfiles

Bound Univer Session Context should tell agents that the current Primary Univerfile is fixed unless the session metadata says the current run is General-origin first-stage context. Ordinary bound sessions must not create another Primary Univerfile. General-origin first-stage runs may create a new Primary Univerfile through `univer new`, and OpenWork routes that file into a new bound session.

## Decision 5: Multiple direct Univerfile mentions require user choice

When a General Session task directly mentions multiple `.univer` files and the task is not explicitly creating a new Primary Univerfile, OpenWork should not guess which file becomes Primary. It should keep the task from starting as a bound Univer task until the user chooses one Primary Univerfile or clarifies that the mentioned files are sources for a new Univerfile.

This preserves the one-Primary-Univerfile mental model. A direct `@` mention is a strong signal only when it identifies one clear Primary Univerfile.

This choice gate applies only while the current session is a General Session. In an already bound Univer Task Session, the Primary Univerfile is fixed, so additional direct `@` mentions are ordinary context/reference files and must not block submission or trigger a Primary Univerfile choice.

The choice should happen before the agent run starts. The composer submit flow may intercept the send action, ask "Choose the Univerfile for this task", then persist the chosen Primary Univerfile and start the run. OpenWork should not start the agent while the task's Primary Univerfile is unresolved.

## Decision 6: Sidebar session sections are stable

General Sessions, Univerfiles, and Unavailable Univerfiles are stable top-level Session Navigation Sections. They should remain visible even when empty.

This avoids layout jumps when the first General Session promotes into a Univerfile Row. It also teaches users that General Sessions and Univerfile-centered work are parallel modes, not incidental groups that appear only after content exists. Empty sections should be visually quiet, but the structure should remain present.

## Decision 7: Server owns lifecycle semantics; client owns focus

The server/API layer owns the durable lifecycle semantics for General-to-Univer Task Promotion. It must reject Primary Univerfile changes consistently regardless of whether they come from the main desktop client, future remote workers, command palette actions, or eval helpers.

The client owns presentation and focus: showing any required user choice, moving the selected session under the right sidebar section after metadata changes, and focusing the composer or Univer Surface as appropriate.

When the lifecycle API returns promoted session metadata, the active client must apply that metadata to its local session list immediately. A full route refresh can still reconcile with the server afterward, but it must not be the only mechanism that moves the session from General Sessions into the Univerfile Row.

## Validation Plan

- Focused tests should cover General Session promotion from a single `@` mention.
- Focused tests should cover General Session promotion from successful `univer new`.
- Focused tests should cover single `@A.univer` binding before a later `univer new B.univer` no-op in that already bound session.
- Focused tests should cover multiple direct `.univer` mentions requiring a pre-run user choice before General Session promotion.
- Focused tests should cover multiple direct `.univer` mentions in an already bound session not triggering the choice gate.
- Focused tests should cover "create `B.univer` based on `@A.univer`" as bind-to-A then ignore later B lifecycle for the bound session.
- Focused server tests should cover promotion and bound-session no-op semantics so lifecycle cannot be bypassed through non-client entry points.
- Focused tests should cover stable empty General Sessions, Univerfiles, and Unavailable Univerfiles sidebar sections.
- Focused tests should cover local sidebar metadata application after `univer new` promotion so the UI does not wait for a full route refresh to move the session.
- Fraimz should prove the first-run empty-workspace path: start in General Sessions, create a Univerfile, see the session move under the new Univerfile Row, and continue with Worktree context.
