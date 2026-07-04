## MODIFIED Requirements

### Requirement: Sessions bind explicitly to one Primary Univerfile

OpenWork SHALL support Univer Task Sessions that are explicitly bound to one Primary Univerfile and SHALL keep unbound sessions as General Sessions.

#### Scenario: General session promotes from direct Univerfile mention

- **WHEN** the current session is a General Session
- **AND** the user submits a task with a direct composer `@` mention to one `.univer` file
- **THEN** OpenWork SHALL persist that file as the session's Primary Univerfile before the agent run
- **AND** the session SHALL become a Univer Task Session
- **AND** the session SHALL move under that Univerfile Row

#### Scenario: General session promotes from univer new creation

- **WHEN** the current session is a General Session
- **AND** `univer new` successfully creates one `.univer` file
- **THEN** OpenWork SHALL persist the created file as the session's Primary Univerfile
- **AND** the session SHALL become a Univer Task Session
- **AND** the session SHALL move under the created Univerfile Row

#### Scenario: Weak signals do not promote a general session

- **WHEN** a General Session sees a `.univer` file through ordinary text, search results, file browsing, artifact preview, or generic assistant output links
- **THEN** OpenWork SHALL NOT bind the session to that Univerfile
- **AND** OpenWork SHALL keep the session under General Sessions unless a direct `@` mention or successful `univer new` creation signal occurs

#### Scenario: General-origin direct mention can hand off to a newly created Univerfile

- **WHEN** a General Session task directly mentions `@A.univer`
- **AND** later tool output creates `B.univer`
- **THEN** OpenWork SHALL create or reuse an idempotent Univer Task Session bound to `B.univer`
- **AND** that `B.univer` session SHALL record the original `A.univer` session as `univerSourceSessionId`
- **AND** OpenWork SHALL switch the user to the `B.univer` session
- **AND** OpenWork SHALL clear the source session's General-origin first-stage lifecycle marker
- **AND** the original `A.univer` session SHALL remain bound to `A.univer`
- **AND** the original `A.univer` session SHALL NOT acquire a Session Univer Worktree or Session Review State for `B.univer`
- **AND** OpenWork SHALL NOT copy the original transcript into the new `B.univer` session

#### Scenario: Ordinary bound session ignores new Primary Univerfile creation lifecycle

- **WHEN** a session is already bound to `A.univer`
- **AND** the session is not marked as General-origin first-stage context for the current run
- **AND** `univer new` successfully creates `B.univer`
- **THEN** OpenWork SHALL NOT switch the current session's Primary Univerfile
- **AND** OpenWork SHALL NOT create or open a new Univer Task Session bound to `B.univer` from that lifecycle signal
- **AND** the original `A.univer` session SHALL remain bound to `A.univer`
- **AND** the original `A.univer` session SHALL remain openable non-terminal history unless its own Session Univer Worktree reaches a terminal state
- **AND** the server/API SHALL own this lifecycle decision rather than relying only on client-side UI checks

#### Scenario: Bound session context forbids hidden primary-file switching

- **WHEN** OpenWork builds Univer Session Context for a bound session
- **AND** the session is not marked as General-origin first-stage context
- **THEN** the context SHALL tell the agent that the session's Primary Univerfile is fixed
- **AND** modifying work SHALL use the current Primary Univerfile trunk or session-owned worktree
- **AND** work requiring a different Primary Univerfile SHALL not be started in the bound session

#### Scenario: General-origin context allows explicit new-file handoff

- **WHEN** OpenWork builds Univer Session Context for a session that was promoted from a General Session by a direct `@A.univer` mention for the current run
- **THEN** the context SHALL identify `A.univer` as the first-stage Primary Univerfile context
- **AND** the context SHALL allow `univer new B.univer` only when the user's task explicitly requires a new Primary Univerfile
- **AND** the context SHALL tell the agent that OpenWork will route the newly created Primary Univerfile into a separate session

#### Scenario: Multiple direct Univerfile mentions require user choice

- **WHEN** the current session is a General Session
- **AND** the user submits a task with direct composer `@` mentions to more than one `.univer` file
- **THEN** OpenWork SHALL NOT guess a Primary Univerfile
- **AND** OpenWork SHALL ask the user to choose one Primary Univerfile before the agent run starts
- **AND** OpenWork SHALL NOT start the task as a bound Univer Task Session until that choice is resolved

#### Scenario: Multiple direct Univerfile mentions do not block a bound session

- **WHEN** the current session is already bound to a Primary Univerfile
- **AND** the user submits a task with direct composer `@` mentions to one or more other `.univer` files
- **THEN** OpenWork SHALL keep the current session's Primary Univerfile unchanged
- **AND** OpenWork SHALL treat those mentions as ordinary context or reference files
- **AND** OpenWork SHALL NOT show the General Session Primary Univerfile choice gate
- **AND** OpenWork SHALL NOT block task submission for a Primary Univerfile selection

### Requirement: Sidebar groups visible Univerfiles and general sessions

OpenWork SHALL auto-discover visible `.univer` files in the workspace and render each as a Univerfile Row with bound sessions underneath.

#### Scenario: Session navigation sections remain visible when empty

- **WHEN** the workspace has no General Sessions
- **OR** the workspace has no visible current Univerfiles
- **OR** the workspace has no unavailable Univerfiles
- **THEN** OpenWork SHALL still render the General Sessions, Univerfiles, and Unavailable Univerfiles sidebar sections
- **AND** empty sections SHALL remain visually quiet
- **AND** the sidebar SHALL NOT remove a top-level session section solely because that section has no rows

### Requirement: Session lifecycle transitions are server-owned

OpenWork SHALL enforce General-to-Univer Task Promotion through server/API lifecycle semantics, while clients handle user choice and focus.

#### Scenario: Server owns durable promotion and bound-session no-op decisions

- **WHEN** a client, control action, remote worker, or eval helper reports a Primary Univerfile promotion or `univer new` creation event
- **THEN** the server/API SHALL apply the same Primary Univerfile locking, General Session promotion, and bound-session no-op rules
- **AND** client-side UI checks SHALL NOT be the only enforcement of those lifecycle rules

#### Scenario: Client focuses the resulting session

- **WHEN** the server/API promotes a General Session
- **THEN** the client SHALL update sidebar grouping from the returned lifecycle state
- **AND** the active client SHALL apply the returned session metadata to its local session list before waiting for any full route refresh
- **AND** the client SHOULD keep focus on the promoted session when that is the user's active task flow

#### Scenario: Client focuses the created handoff session

- **WHEN** the server/API creates or reuses a `B.univer` session for a General-origin first-stage `@A.univer` run
- **THEN** the active client SHALL insert or update the returned `B.univer` session in its local session list
- **AND** the active client SHALL apply returned source-session metadata so the source session no longer appears as pending first-stage lifecycle state
- **AND** the active client SHALL switch focus to the returned `B.univer` session
