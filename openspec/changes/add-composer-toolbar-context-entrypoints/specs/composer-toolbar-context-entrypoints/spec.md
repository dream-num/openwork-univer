## ADDED Requirements

### Requirement: OpenWork renders a Composer Toolbar in the Compact Chat Composer stack

OpenWork SHALL render durable workspace and office context entry points in a `Composer Toolbar` in the Compact Chat Composer stack.

#### Scenario: Toolbar appears in the composer stack

- **WHEN** a user opens a session with a usable workspace context
- **THEN** OpenWork SHALL render a Composer Toolbar above the composer editor controls
- **AND** the toolbar SHALL align with the Compact Chat Pane width rhythm
- **AND** the toolbar SHALL NOT render as a rounded floating card
- **AND** the toolbar SHALL use a full-width bottom divider consistent with the compact composer border color

#### Scenario: Higher-priority status stays above the toolbar

- **WHEN** queued messages, questions, permissions, or todos are present
- **THEN** those status or blocking accessories SHALL remain above the Composer Toolbar
- **AND** the Composer Toolbar SHALL remain above the editor and action row

### Requirement: Files opens Workspace Files from the Composer Toolbar

OpenWork SHALL expose Workspace Files through a `Files` entry point in the Composer Toolbar.

#### Scenario: Files is visible for available workspace sessions

- **WHEN** the current session has an available workspace context
- **THEN** the Composer Toolbar SHALL show a `Files` entry point
- **AND** the session header SHALL NOT show the old Files entry point next to notifications

#### Scenario: Files opens only the workspace file tree

- **WHEN** the user opens `Files`
- **THEN** OpenWork SHALL show the current workspace file tree
- **AND** the popover SHALL NOT include Office Worktree sections

#### Scenario: Files preserves current file tree behavior

- **WHEN** the user searches, expands folders, refreshes files, or opens a previewable file from Files
- **THEN** OpenWork SHALL preserve the existing Workspace Files behavior
- **AND** opening a file SHALL continue to select or open the right-side artifact panel when the file is previewable

### Requirement: Changes opens Office Worktree for the active Univer artifact

OpenWork SHALL expose the active `.univer` artifact's Office Worktree through a `Changes` entry point in the Composer Toolbar.

#### Scenario: Changes appears for active Univer artifact

- **WHEN** the active right-side artifact tab is a `.univer` target
- **THEN** the Composer Toolbar SHALL show a `Changes` entry point
- **AND** the entry point SHALL open the Office Worktree for that active artifact

#### Scenario: Changes is absent without Univer context

- **WHEN** there is no active right-side `.univer` artifact tab
- **THEN** the Composer Toolbar SHALL NOT show a disabled `Changes` entry point

#### Scenario: Changes owns loading and error states

- **WHEN** a `.univer` artifact is active and Office Worktree state is loading or errored
- **THEN** the `Changes` entry point SHALL remain visible
- **AND** its popover SHALL show the loading or error state

#### Scenario: Changes shows ready review badge only when needed

- **WHEN** the active `.univer` artifact has one or more ready-for-review worktrees
- **THEN** the `Changes` entry point MAY show a count badge
- **AND** the badge SHALL represent ready-for-review count
- **WHEN** the ready-for-review count is zero
- **THEN** the `Changes` entry point SHALL NOT show an all-clear badge

#### Scenario: Review worktree actions are inline

- **WHEN** Changes shows a ready-for-review worktree
- **THEN** merge, discard, and refresh actions SHALL be available as inline icon controls on that worktree row
- **AND** OpenWork SHALL NOT render a separate action row solely for those worktree actions

#### Scenario: Selected review details load automatically

- **WHEN** Changes selects a ready-for-review worktree
- **THEN** OpenWork SHALL request review details for that worktree automatically
- **AND** the user SHALL NOT need to click refresh before review units can appear

### Requirement: Files and Changes remain independent

OpenWork SHALL keep Workspace Files and Office Worktree as separate toolbar actions and separate popovers.

#### Scenario: Opening one toolbar popover closes the other

- **WHEN** the Files popover is open and the user opens Changes
- **THEN** OpenWork SHALL close Files before showing Changes
- **WHEN** the Changes popover is open and the user opens Files
- **THEN** OpenWork SHALL close Changes before showing Files

#### Scenario: Opening a Univer file does not auto-switch to Changes

- **WHEN** the user opens a `.univer` file from Files
- **THEN** OpenWork SHALL open or select the corresponding right-side artifact
- **AND** Files SHALL remain the active popover until the user closes it or opens another toolbar popover
- **AND** OpenWork SHALL NOT automatically replace Files with Changes

#### Scenario: Changes follows active artifact, not file selection

- **WHEN** a different file is selected inside Files
- **THEN** Changes SHALL NOT change content solely because of that file tree selection
- **WHEN** the active right-side artifact tab changes to a different `.univer` target
- **THEN** Changes SHALL update to that active artifact's Office Worktree

### Requirement: Composer Toolbar popover state is scoped to the current session

OpenWork SHALL keep Composer Toolbar popover open state local to the current mounted session.

#### Scenario: Session switch closes toolbar popovers

- **WHEN** the user switches to a different session
- **THEN** any open Files or Changes popover SHALL close

#### Scenario: File tree browsing state keeps existing cache semantics

- **WHEN** Files is reopened for the same session, workspace, and workspace root
- **THEN** existing Workspace Files search, expanded folder, and selected file cache behavior MAY be reused

#### Scenario: Changes closes when active artifact stops being Univer

- **WHEN** Changes is open and the active right-side artifact changes to a non-`.univer` target
- **THEN** OpenWork SHALL close Changes
- **AND** the Changes entry point SHALL disappear

### Requirement: Composer Toolbar is validated as a user-visible experience

OpenWork SHALL validate the Composer Toolbar entry points through focused tests and fraimz evidence.

#### Scenario: Focused tests cover toolbar contracts

- **WHEN** the Composer Toolbar implementation is complete
- **THEN** focused tests SHALL cover toolbar placement, Files visibility, Changes visibility, and popover independence

#### Scenario: Fraimz proves Files from toolbar

- **WHEN** the implementation is ready for review
- **THEN** fraimz evidence SHALL show the user opening Files from the Composer Toolbar
- **AND** the evidence SHALL prove file search, file selection, and artifact opening still work

#### Scenario: Fraimz proves Changes from toolbar

- **WHEN** a `.univer` artifact is active
- **THEN** fraimz evidence SHALL show the user opening Changes from the Composer Toolbar
- **AND** the evidence SHALL prove Office Worktree sections remain available and follow the active `.univer` artifact
