## MODIFIED Requirements

### Requirement: Univer Artifact Header title follows current content

The `Univer Artifact Header` SHALL present selected worktree source and unit identity through one surface selector, separately from view actions, editability, and review state.

#### Scenario: Current unit is available

- **WHEN** the header view model receives current unit state
- **THEN** the header SHALL show a `Univer Surface Selector` containing the selected source and current unit
- **AND** the selected source segment SHALL be `当前版本` or a concrete worktree display name
- **AND** the expanded selector's current unit row MAY show explicit unit change status
- **AND** the collapsed selector SHALL NOT include the `.univer` file name, worktree status, worktree id, or unit change status
- **AND** the expanded selector MAY show worktree status, worktree id, and unit change status as menu details
- **AND** the selector SHALL NOT render original changes or merge preview as peer source choices

#### Scenario: Current unit is unavailable

- **WHEN** the header view model does not have current unit state
- **THEN** the header SHALL fall back to the `.univer` file name as the visible route identity
- **AND** it SHALL NOT render placeholder content actions

### Requirement: Header supports staged cowork integration

The `Univer Artifact Header` SHALL render cowork content state through distinct surface selector, selected-worktree action, review decision, status, overflow action, and file fallback zones.

#### Scenario: Surface selector owns worktree and unit selection

- **WHEN** cowork content surface state is available
- **THEN** the header SHALL render one `Univer Surface Selector`
- **AND** the selector SHALL include `当前版本` and every viewable worktree for the same Primary Univerfile
- **AND** each collapsed worktree segment SHALL show the display name as the primary label
- **AND** each worktree SHALL expose compact state and worktree id as secondary information
- **AND** the expanded selector SHALL group worktrees with task-centered labels such as `当前任务` and `其他任务` when ownership is known
- **AND** each worktree SHALL expose its units with unit status when available
- **AND** secondary information and unit status SHALL appear in the expanded selector menu rather than the collapsed breadcrumb
- **AND** choosing a worktree/unit row SHALL change the Univer Surface Route without changing Primary Univerfile or Session Univer Worktree ownership
- **AND** choosing an `其他任务` worktree SHALL be view-only for the selected session
- **AND** the normal bar SHALL hide merge and discard review decisions for `其他任务` worktrees
- **AND** the normal bar MAY show a read-only status with tooltip text explaining that the selected source belongs to another task

#### Scenario: Selected worktree view actions inspect one worktree

- **WHEN** a reviewable worktree is selected
- **THEN** the header MAY show `查看修改` and `预览合入后` as selected-worktree view actions
- **AND** these actions SHALL apply to the selected worktree
- **AND** these actions SHALL NOT be rendered as worktree selector choices
- **AND** choosing merge preview SHALL keep the same worktree selected while changing only the rendered view mode

#### Scenario: Edit gate is a status indicator

- **WHEN** cowork content surface state includes an edit gate
- **THEN** the header MAY render the edit gate through the primary status chip
- **AND** it MAY expose explanatory tooltip text for the status
- **AND** it SHALL NOT create an overflow menu solely to repeat static status text

#### Scenario: Normal bar status is concise and prioritized

- **WHEN** the selected Univer Surface has one or more status conditions
- **THEN** the normal header bar SHALL render at most one primary status chip
- **AND** the primary status chip SHALL use a concise controlled label such as `冲突`, `基线有变`, `待处理`, `编辑中`, `只读`, or `可编辑`
- **AND** the selected label SHALL follow this priority order: conflict, diverged baseline, pending work, editing current version, read-only, editable
- **AND** longer explanations SHALL be available through tooltip text or expanded detail rather than the normal bar label
- **AND** the normal bar SHALL NOT show phrase-length status labels such as `最新版本有改动 · 可预览合入后`, `最新版本有改动 · 正在预览合入后`, `有待处理修改`, or `正在编辑当前版本`
- **AND** the header MAY hide the `可编辑` chip before higher-priority route, view, review, or file actions collapse

#### Scenario: View and review affordances are not duplicated as status

- **WHEN** merge preview is selected
- **THEN** the selected state of `预览合入后` SHALL communicate the view mode
- **AND** the header SHALL NOT add a separate normal-bar status chip just to say merge preview is currently shown

- **WHEN** a worktree can be merged
- **THEN** the `合入` review action SHALL communicate the merge availability in the normal bar
- **AND** `可合入` MAY appear in expanded worktree detail
- **AND** `可合入` SHALL NOT be rendered as a separate normal-bar status chip

#### Scenario: Unit change state uses explicit language

- **WHEN** the selected worktree has a unit-level diff state for the current unit
- **THEN** the header MAY show that state inside the expanded `Univer Surface Selector` unit list
- **AND** the status SHALL use clear language such as `已修改`, `新增`, `删除`, or `冲突`
- **AND** the header SHALL NOT rely on a standalone one-character badge such as `改` as the only explanation

#### Scenario: Review decisions are scoped to selected worktree

- **WHEN** the selected source is `当前版本`
- **THEN** the header SHALL NOT show merge or discard review actions for a worktree
- **AND** direct trunk editing state MAY show only edit-related commands that apply to the current version
- **AND** a ready worktree owned by the current task MAY be summarized as pending status, but its merge or discard decisions SHALL remain hidden until that worktree source is selected

- **WHEN** the selected source is a ready-review worktree
- **THEN** the header SHALL show `合入` and `丢弃` as first-line controls when the selected worktree can be reviewed
- **AND** those actions SHALL apply to the selected worktree rather than to the whole Univerfile
- **AND** those actions SHALL NOT be hidden inside the overflow menu

#### Scenario: Default source follows selected task state

- **WHEN** the selected task owns a working, conflict, or ready-review worktree
- **THEN** the header SHOULD default the selected source to that current task worktree

- **WHEN** the selected task is planning or has no Session Univer Worktree
- **THEN** the header SHOULD default the selected source to `当前版本`

- **WHEN** the selected task is merged
- **THEN** the header SHOULD default the selected source to `当前版本`

- **WHEN** the selected task is discarded
- **THEN** the header SHOULD default the selected source to a discarded read-only result when available
- **AND** it SHOULD fall back to `当前版本` when no discarded result is available

#### Scenario: Agents do not decide review outcome implicitly

- **WHEN** an agent finishes modifying a Session Univer Worktree
- **THEN** OpenWork SHALL treat the worktree as awaiting human review when cowork state indicates it is reviewable
- **AND** OpenWork SHALL NOT merge or discard the worktree automatically unless the user explicitly asks for that action

#### Scenario: Overflow menu contains actions only

- **WHEN** the header has no secondary commands to expose
- **THEN** it SHALL NOT show the overflow action menu

- **WHEN** the header shows the overflow action menu
- **THEN** every menu item SHALL represent an executable command or navigation action
- **AND** the menu SHALL NOT contain static-only groups such as `状态 / 可编辑`
- **AND** the menu SHALL NOT contain `合入` or `丢弃` when those review decisions are available for the selected worktree
- **AND** file fallback actions such as download, reveal, and close SHALL remain in the file fallback action zone rather than moving into the workflow overflow menu
