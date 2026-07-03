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
- **THEN** the header MAY show a compact worktree view switch with `修改` and `合入后` options
- **AND** these actions SHALL apply to the selected worktree
- **AND** these actions SHALL NOT be rendered as worktree selector choices
- **AND** when review decision controls are also visible, these view actions SHALL appear to the left of the review decision controls
- **AND** choosing merge preview SHALL keep the same worktree selected while changing only the rendered view mode
- **AND** the worktree view switch SHALL NOT use the current-version bridge label `查看待处理`

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
- **THEN** the selected state of `合入后` SHALL communicate the view mode
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
- **AND** when a pending worktree route can be resolved, the header SHALL expose a first-line `查看待处理` action that routes directly to the task/session where that worktree can be handled
- **AND** if the pending worktree belongs to the current task, invoking `查看待处理` SHALL switch the current Univer Surface Route to that worktree source
- **AND** if the pending worktree belongs to another known task, invoking `查看待处理` SHALL open that owning task session and preselect the same Univerfile/worktree route there without mutating the current session's `sessionUniverWorktreeId`
- **AND** if no owning task is known, invoking `查看待处理` MAY switch the current Univer Surface Route to that worktree source as a view-only fallback
- **AND** `查看待处理` SHALL be displayed adjacent to the primary status chip rather than hidden in the far-right file action zone or overflow menu
- **AND** `查看待处理` SHALL be shown whenever the primary status indicates pending current-version work and a pending worktree route can be resolved, even if aggregate pending counts have not refreshed yet
- **AND** edit gate commands such as `继续编辑` and `退出编辑` SHALL be displayed in the same state cluster as `待处理` or `编辑中`
- **AND** after the owning worktree source is selected, review decisions SHALL become available according to the selected worktree state

- **WHEN** the selected source is a ready-review worktree
- **THEN** the header SHALL show `合入` and `丢弃` as first-line icon controls when the selected worktree can be reviewed
- **AND** those actions SHALL apply to the selected worktree rather than to the whole Univerfile
- **AND** those icon controls SHALL keep accessible names and tooltips while omitting visible text labels in the normal bar
- **AND** those actions SHALL NOT be hidden inside the overflow menu

#### Scenario: Status bridges to the owning task

- **WHEN** the selected source belongs to another task
- **THEN** the header SHALL keep the selected source view-only for the current session
- **AND** the header SHALL NOT show merge or discard review decisions for that source
- **AND** when the owning task is known, the header SHALL expose `打开所属任务` as a first-line navigation action
- **AND** `打开所属任务` SHALL be displayed adjacent to the primary read-only status chip rather than hidden in file fallback actions
- **AND** invoking `打开所属任务` SHALL open the owning task session without changing the current session's `sessionUniverWorktreeId`

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

#### Scenario: Workflow actions stay inline

- **WHEN** the header has secondary workflow commands such as `继续编辑`, `退出编辑`, `修改`, or `合入后`
- **THEN** it SHALL render those commands directly in the header
- **AND** it SHALL NOT collapse them into a workflow overflow or more menu at any container width
- **AND** it SHALL NOT show an overflow menu for static-only status such as `可编辑`
- **AND** file fallback actions such as download, reveal, and close SHALL remain in the file fallback action zone
