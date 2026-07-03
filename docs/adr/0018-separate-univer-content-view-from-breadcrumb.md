# Use One Surface Selector for Univer header source

OpenWork will make one Univer Surface Selector the primary header control, rendered as `<Worktree source> / <Unit>`. The worktree source segment lists `当前版本` first and then every viewable worktree for the same Primary Univerfile. The collapsed selector text stays to those two route labels only; worktree status, worktree id, and unit change status appear in the expanded selector menu.

This supersedes ADR-0017 because treating worktree/source state as a breadcrumb segment made a view choice look like a path location. It also replaces the weaker content-view model where `当前版本`, `原始修改`, and `合并后` appeared as peer selector choices. `原始修改` and `合并后` are views of a selected worktree, not worktrees themselves.

**Consequences**

The Univer Artifact Header should read as a single surface selector first: selected worktree source and selected unit. The `.univer` file remains surrounding artifact/session context, not the first breadcrumb segment. Selected-worktree view actions such as `查看修改` and `预览合入后` sit after that selector, followed by human review decisions such as `合入` and `丢弃` when the selected worktree is reviewable. Merge and discard must not be hidden inside `...`.

Editability is status, not navigation. Unit change state belongs in the expanded selector's unit list, using plain labels such as `已修改`, `新增`, `删除`, or `冲突`, rather than a standalone `改` badge in the collapsed breadcrumb. Overflow menus contain secondary actions only; they must not exist just to restate status such as editable or read-only.
