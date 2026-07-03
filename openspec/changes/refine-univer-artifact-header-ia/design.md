## Context

The previous header direction correctly moved `.univer` artifacts away from the generic artifact titlebar, but the first integrated version mixed route, view, status, and workflow actions. The visible result was a bar that could read as:

`工资表.univer / 中国大陆工资表 / 当前版本  可编辑  ...`

This is misleading. `当前版本` is not a path segment under the unit. It is the selected content view for that unit. Likewise, `可编辑` is not a menu category; it is an edit gate status.

## Decisions

### Decision 1: Breadcrumb stops at unit

`Univer Surface Breadcrumb` represents location and navigation within the surface identity: Univerfile and unit. It should not contain worktree, current version, original changes, merge preview, or review state.

Recommended shape:

`工资表.univer / 中国大陆工资表`

### Decision 2: Content view is a peer control

`Univer Content View Selector` sits adjacent to the breadcrumb and owns content scopes:

- `当前版本`
- `原始修改`
- `合并后`

The selector may be a dropdown or segmented control depending on available states, but it is not part of the breadcrumb.

### Decision 3: Edit gate is status, not navigation

`Univer Edit Gate` renders as a compact status chip near the content view selector. It may explain itself through a tooltip, but it should not create an overflow menu that only repeats the status.

Examples:

- `可编辑`
- `只读`
- `有待处理修改`
- `正在编辑当前版本`

If an edit gate has a real command, such as `退出编辑`, that command may appear inline or in overflow. The status itself is not an action.

### Decision 4: Review actions follow pending-change views

Review actions should not appear on the default current-version view. `合入当前版本` and `丢弃修改` apply when the user is looking at a specific pending-change content view, such as original worktree changes or merge preview.

Current-version default:

`工资表.univer / 中国大陆工资表    当前版本    可编辑`

Ready review view:

`工资表.univer / 中国大陆工资表    原始修改    只读    合入当前版本    ...`

### Decision 5: Overflow contains actions only

The `...` control is an overflow action menu. It should be hidden when there are no overflow actions. It must not exist only to show static state such as `状态 / 可编辑`.

Valid overflow items include:

- `退出编辑`
- `查看原始修改`
- `查看合并后`
- `丢弃修改`
- Future diagnostics such as copying a worktree id

Invalid overflow content includes:

- `状态 / 可编辑`
- repeated breadcrumb values
- static read-only explanations without an action
- download, reveal, and close fallback actions, which remain in the far-right file-action zone

## Layout Zones

The header should keep stable semantic zones:

1. Route zone: Univerfile and unit breadcrumb.
2. View/status zone: content view selector and edit gate chip.
3. Workflow action zone: actions for the active content view.
4. Overflow action zone: secondary actions only when present.
5. File fallback zone: download, reveal, close.

In constrained width, the route zone truncates first. The view/status zone keeps the active content view and status readable when possible. Workflow actions may collapse into overflow, but overflow must still contain real commands.

## Rejected Alternatives

- Keep `<Univerfile> / <Unit> / <Worktree>` as the breadcrumb: rejected because worktree/content scope is a view mode, not a path segment.
- Use overflow as a status details menu: rejected because it creates an affordance with no command and duplicates visible information.
- Always show merge/discard in the header: rejected because those actions only make sense while reviewing a concrete pending change.
