## Context

The previous header direction correctly moved `.univer` artifacts away from the generic artifact titlebar, but the first integrated version still mixed route, worktree source, view mode, status, and review decisions. The visible result could read as:

`工资表.univer / 中国大陆工资表    当前版本    只读    ...`

or as a dropdown containing:

- `当前版本`
- `原始修改`
- `合并后`

That model is still confusing because `原始修改` and `合并后` are not peer worktrees. They are ways to inspect one selected worktree. The user needs to first choose the source they are viewing: trunk/current version or a concrete worktree with a display name and worktree id. After that, the header can expose view actions and human review decisions for that selected worktree.

## Decisions

### Decision 1: Surface selector owns worktree/unit route context

`Univer Surface Selector` is the single header control for what the user is looking at inside the current Univerfile. It renders selected worktree source and unit in one path-like control, because the practical mental model is "this unit inside this worktree." The `.univer` file is surrounding artifact/session context, not the first breadcrumb segment.

Recommended shape:

`当前版本 / 中国大陆工资表`

Ready-review shape:

`季度汇总表 / 中国大陆工资表`

The worktree segment chooses `当前版本` or a concrete worktree. The unit segment chooses a unit inside that selected source. The collapsed selector must not include worktree status, worktree id, or unit change status; those details are visible after opening the selector.

### Decision 2: Worktree is the primary axis inside the selector

The worktree segment lists:

- `当前版本`
- every viewable `Univer Worktree` under the same Primary Univerfile, grouped as `当前任务` and `其他任务` when ownership is known

`当前版本` is always first. Worktree rows show the task-friendly display name as the primary label and compact state plus worktree id as secondary text, for example:

`季度汇总表`
`可合入 · fk-mr4lrh51-gx8dc0`

Each worktree row exposes its units with unit status where available, so the user can inspect which units are modified, created, deleted, conflicted, or unchanged within that worktree. Selecting a worktree/unit row changes only the `Univer Surface Route`. It must not mutate Primary Univerfile ownership or Session Univer Worktree ownership.

The collapsed selector continues to show the concrete source display name and unit. It does not replace the source with relationship labels such as `当前任务` or `其他任务`; those labels are grouping and context in the expanded selector. A worktree owned by another task is view-only from the selected session and must not expose merge or discard decisions in that session. The header should hide those review decisions rather than showing disabled controls, and use a concise read-only status with tooltip text explaining that the selected source belongs to another task.

Default source selection follows the selected task state. Ready, conflict, and working tasks open on the current task's worktree source. Planning or no-worktree tasks open on `当前版本`. Merged tasks open on `当前版本`. Discarded tasks open on a discarded read-only result when available, otherwise `当前版本`.

### Decision 3: View actions belong to the selected worktree

`修改` and `合入后` are `Selected Worktree View Action`s. They apply to the selected worktree and change how that worktree is inspected. They are not rows in the surface selector and not path segments.

Recommended ready-review shape:

`季度汇总表 / 中国大陆工资表    修改 | 合入后`

When the user chooses `合入后`, the selected worktree remains `季度汇总表`; only the rendered view mode changes.

### Decision 4: Merge and discard are first-line human review decisions

`合入` and `丢弃` are `Selected Worktree Review Action`s for the selected reviewable worktree. They are human decisions, not agent completion states. The agent may produce a worktree and mark it ready for review, but it must not merge or discard that worktree unless the user explicitly asks.

Reviewable worktree shape:

`季度汇总表 / 中国大陆工资表    修改 | 合入后    合入    丢弃`

These review decisions must be visible as first-line controls when available. They must not be hidden inside `...`.

Review decisions are scoped to the selected worktree source. If the current task owns a ready worktree but the selector is currently on `当前版本`, the header should hide `合入` and `丢弃` and may show a concise pending-work status instead. This keeps every first-line review action attached to the source currently shown in the selector.

That pending state must still bridge to the next step. When `当前版本` is selected and OpenWork can resolve the pending worktree, the normal bar should expose a first-line `查看待处理` action that takes the user directly to the place where that worktree can be handled. If the worktree belongs to the current task, the action switches the Univer Surface Route to that worktree. If the worktree belongs to another known task, the action opens that owning task and preselects the same Univerfile/worktree route there. Only after the owning source is selected should `合入` and `丢弃` appear. The user should not have to infer that the status chip is clickable, open a separate panel, or manually click `打开所属任务` after viewing a read-only source.

The bridge action belongs visually with the status that creates it. `待处理` and `查看待处理` should appear as one readable cluster next to the surface selector. The action must not be placed in the far-right file fallback zone, because that zone is for download, reveal, and close. The same rule applies to `只读` plus `打开所属任务` for other-task sources.

`查看待处理` is deliberately different from the selected-worktree view action. On `当前版本`, it is a bridge to pending work; on a selected worktree, the view switch should use short view-mode labels such as `修改` and `合入后`.

### Decision 5: Normal bar status is concise and priority-driven

The normal header bar should only show status that changes the user's next decision. It should render at most one primary status chip next to the surface selector, using a concise label and a tooltip for the longer explanation. Multiple phrase-length chips make the bar harder to scan and compete with the worktree/unit route and review actions.

Priority order for the normal bar:

1. `冲突`: selected worktree cannot be merged cleanly.
2. `基线有变`: the Primary Univerfile changed after the worktree was created, and merge preview may matter.
3. `待处理`: pending task modifications exist, so direct current-version editing is locked or risky.
4. `编辑中`: the current version is being edited while pending task modifications still exist.
5. `只读`: the selected source/unit cannot be directly edited.
6. `可编辑`: current version editing is available; this may be hidden first when width is constrained because it is a normal-ready state.

Longer copy such as `最新版本有改动 · 可预览合入后`, `最新版本有改动 · 正在预览合入后`, `有待处理修改`, or `正在编辑当前版本` belongs in tooltip text or expanded detail rather than as the normal bar label.

`合入后` selected state is view state, not a separate status chip. `可合入` is represented by the presence of the `合入` review action and by expanded worktree detail; it should not become a normal-bar status chip.

Read-only other-task state must also provide a bridge when OpenWork knows the owning task. The status may remain `只读`, but the normal bar should expose `打开所属任务` as the primary recovery/navigation action so the user can reach the session where merge or discard is allowed.

### Decision 6: Edit gate and unit change state are status, not navigation

`Univer Edit Gate` contributes to the primary status chip when no higher-priority worktree risk is present. It may explain itself through a tooltip, but it should not create an overflow menu that only repeats the status.

The current unit's worktree diff state is also status. If surfaced, it should use clear language such as `已修改`, `新增`, `删除`, or `冲突` in the expanded selector menu. A standalone one-character badge such as `改` is not acceptable because it does not explain which object changed, and any status badge in the collapsed breadcrumb creates clutter.

If an edit gate has a real command, such as `退出编辑`, that command may appear inline or in overflow. The status itself is not an action.

### Decision 7: Overflow contains secondary actions only

The `...` control is an overflow action menu. It should be hidden when there are no overflow actions. It must not exist only to show static state such as `状态 / 可编辑`.

Valid overflow items include:

- `退出编辑`
- copying a worktree id
- opening diagnostics
- other low-priority commands that do not decide review outcome

Invalid overflow content includes:

- `合入` or `丢弃` when the selected worktree can be reviewed
- `状态 / 可编辑`
- repeated breadcrumb values
- static read-only explanations without an action
- phrase-length status labels that should be tooltips, such as `最新版本有改动 · 正在预览合入后`
- download, reveal, and close fallback actions, which remain in the far-right file-action zone

## Layout Zones

The header should keep stable semantic zones:

1. Surface selector zone: one control for selected worktree source and unit.
2. State cluster zone: at most one concise primary status chip, selected by risk/action priority, plus the first-line bridge/edit action created by that status when one exists.
3. Worktree view switch zone: a compact segmented control for `修改` and `合入后`, shown only when the selected source is a worktree with switchable views.
4. Review decision zone: first-line human decisions such as `合入` and `丢弃`, scoped to the selected worktree.
5. File fallback zone: download, reveal, close.

In constrained width, protect the surface selector, state cluster, and first-line review decisions. Secondary details and lower-priority view actions may collapse before merge/discard. File fallback actions remain separate from review workflow actions.

## Rejected Alternatives

- Split breadcrumb and worktree selector into adjacent controls: rejected because it makes users reconcile two competing navigation models.
- Put the Univerfile into the selector as `<Univerfile> / <Worktree source> / <Unit>`: rejected because the file is surrounding artifact context and the selector should not become a three-part breadcrumb.
- Keep `<Univerfile> / <Unit> / <Worktree>` ordering: rejected because unit state is scoped by worktree; worktree should come before unit.
- Use a content view selector with `当前版本`, `原始修改`, and `合并后` as peer options: rejected because original changes and merge preview are views of a selected worktree, not worktrees themselves.
- Use overflow as a status details menu: rejected because it creates an affordance with no command and duplicates visible information.
- Show every available status in the normal bar: rejected because long or multiple chips collapse the worktree/unit route and primary review actions.
- Hide `合入` and `丢弃` in `...`: rejected because they are the primary human review decisions for a reviewable selected worktree.
- Use a standalone `改` badge: rejected because the object and meaning of the change are unclear.
