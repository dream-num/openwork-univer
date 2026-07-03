## MODIFIED Requirements

### Requirement: Univer Artifact Header title follows current content

The `Univer Artifact Header` SHALL present Univerfile and unit identity separately from content view state.

#### Scenario: Current unit is available

- **WHEN** the header view model receives current unit state
- **THEN** the header SHALL show a `Univer Surface Breadcrumb` containing the Univerfile and current unit
- **AND** the breadcrumb SHALL NOT include current version, original changes, merge preview, worktree name, or worktree state as a path segment
- **AND** the active content mode SHALL be shown through a `Univer Content View Selector` adjacent to the breadcrumb

#### Scenario: Current unit is unavailable

- **WHEN** the header view model does not have current unit state
- **THEN** the header SHALL fall back to the `.univer` file name as the visible route identity
- **AND** it SHALL NOT render placeholder content actions

### Requirement: Header supports staged cowork integration

The `Univer Artifact Header` SHALL render cowork content state through distinct route, view, status, workflow action, overflow action, and file fallback zones.

#### Scenario: Content view selector owns content scopes

- **WHEN** cowork content surface state is available
- **THEN** the header SHALL render current version, original worktree changes, and merge preview as content view choices
- **AND** these choices SHALL NOT be rendered as breadcrumb path segments
- **AND** choosing a content view SHALL change the Univer Surface Route without changing Primary Univerfile or Session Univer Worktree ownership

#### Scenario: Edit gate is a status indicator

- **WHEN** cowork content surface state includes an edit gate
- **THEN** the header SHALL render the edit gate as a status indicator adjacent to the content view
- **AND** it MAY expose explanatory tooltip text for the status
- **AND** it SHALL NOT create an overflow menu solely to repeat static status text

#### Scenario: Review actions are scoped to pending-change views

- **WHEN** the active content view is current version
- **THEN** the header SHALL NOT show merge or discard review actions for a worktree
- **AND** direct trunk editing state MAY show only edit-related commands that apply to the current version

- **WHEN** the active content view is original worktree changes or merge preview for a ready review worktree
- **THEN** the header MAY show `合入当前版本` and `丢弃修改`
- **AND** those actions SHALL apply to the selected worktree rather than to the whole Univerfile

#### Scenario: Overflow menu contains actions only

- **WHEN** the header has no secondary commands to expose
- **THEN** it SHALL NOT show the overflow action menu

- **WHEN** the header shows the overflow action menu
- **THEN** every menu item SHALL represent an executable command or navigation action
- **AND** the menu SHALL NOT contain static-only groups such as `状态 / 可编辑`
- **AND** file fallback actions such as download, reveal, and close SHALL remain in the file fallback action zone rather than moving into the workflow overflow menu
