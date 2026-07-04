## Why

The current Univer session model works once a session is already bound to a Primary Univerfile, but it leaves a gap in the first-run path. A user can enter an empty workspace with no `.univer` files, start from a General Session, and ask the agent to create a Univerfile. After the file appears, the session still behaves like general workspace work even though the user and agent are now working around one concrete Univerfile.

That breaks the mental model established by Univerfile Rows, Worktree, session-owned worktrees, and the Univer Artifact Header. The session should move from General Sessions into the appropriate Univerfile Row once the user or tool output gives an explicit Primary Univerfile signal.

## What Changes

- Add General-to-Univer Task Promotion for General Sessions.
- Promote a General Session when the user explicitly references one `.univer` through a composer `@` mention and the task is about that file.
- Promote a General Session when `univer new` successfully creates the task's first Primary Univerfile.
- Keep weak signals out of promotion: plain text mentions, search results, file browsing, artifact preview, and generic assistant output links.
- Treat a single direct `@A.univer` as immediate binding to `A.univer`; if the task later creates `B.univer`, redirect into a new `B.univer` session instead of rebinding the current session.
- Require user choice when a General Session task directly mentions multiple `.univer` files without a clear Primary Univerfile.
- Keep the sidebar's General Sessions, Univerfiles, and Unavailable Univerfiles sections visible even when they are empty.
- Update Univer Session Context so agents do not create another Primary Univerfile inside an already bound session.

## Capabilities

### Modified Capabilities

- `univer-target-session-workflow`: Extend session binding lifecycle so General Sessions can become Univer Task Sessions only from explicit `@` mentions or `univer new` creation events.

## Impact

- Affected product surfaces:
  - Composer `@` mention submission.
  - General Session to Univerfile Row migration.
  - Stable sidebar section rendering.
  - Session metadata persistence.
  - Agent prompt context for bound Univer sessions.
  - `univer new` output handling and session creation redirect after either General Session creation or already-bound session creation.
- Affected code areas likely include:
  - `apps/app/src/react-app/domains/session/chat/session-page.tsx`
  - `apps/app/src/react-app/domains/session/univer-session-context.ts`
  - `apps/app/src/react-app/domains/session/univer-session-worktree-adapter.ts`
  - server/session metadata and session creation APIs.
  - focused app/server tests and fraimz coverage.
- Out of scope:
  - Inferring Primary Univerfile from legacy chat history.
  - Promoting from passive artifact preview or workspace file browsing.
  - Allowing one session to switch Primary Univerfile after binding.
