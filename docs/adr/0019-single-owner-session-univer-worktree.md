# Single owner for each Session Univer Worktree

OpenWork will treat a live Session Univer Worktree as owned by exactly one non-terminal Univer Task Session. Other sessions may view that worktree through the Univer Surface Route, but viewing must not make them owners and must not overwrite `sessionUniverWorktreeId`.

This mirrors the useful part of Git worktree behavior: multiple work areas can exist, but one mutable branch identity is not silently checked out as the active work area in several places. For Univer work, the same boundary keeps review, merge, discard, and follow-up task history attached to one task.

**Considered Options**

- Allow several sessions to share the same `sessionUniverWorktreeId`.
- Rely on agent/system prompt guidance to avoid duplicate worktree ownership.
- Enforce one owning task per live worktree while allowing other sessions to view it.

**Decision**

OpenWork chooses single ownership. The server/API layer should reject or flag duplicate ownership for the same Primary Univerfile and worktree id among non-terminal task sessions. Client-side auto-binding from tool output should not claim a worktree that already has an owning task. System prompt guidance should still tell agents to continue the current session-owned worktree or create a new one for a new task, but prompt guidance is not the source of truth.

If duplicate ownership is detected, the earliest successfully bound non-terminal task is the owning task. If the live worktree is ready for review, the owning task still shows `Review`; later sessions that point at the same live worktree surface a Worktree Ownership Conflict instead. In the sidebar, those non-owning sessions show `Attention`, not `Review`, because they cannot safely merge or discard that worktree. The Worktree Panel explains the owning task and makes Open owning task the primary recovery action. Create new task from here remains available as a secondary recovery path when the current task needs to continue separately. Manual reassociation remains advanced because it can mis-associate task history.

**Consequences**

Sidebar remains a task queue under each Univerfile, not a worktree navigator. File-level summaries count task states, not raw worktrees, and should distinguish reviewable tasks from issue tasks. A file with two reviewable tasks can show `2 reviews`; a file with two ownership or missing-worktree issues can show `2 issues`; mixed state should read like `1 review · 1 issue` rather than a generic pending count. The selected task's Worktree Panel and the Univer Artifact Header are responsible for explaining which worktree is owned by the selected task, which worktree is only being viewed, and where review actions will apply.

Session row labels should be task state words, not implementation nouns. `Review` and `Conflict` are actionable review states. `Attention` is the recovery bucket for missing/stale worktrees, ownership conflicts, or multiple worktrees in one task. `Working`, `Merged`, and `Discarded` are non-actionable progress or history states. The detailed reason for `Attention` belongs in the Worktree Panel, not in a crowded sidebar chip.

The Worktree Panel should present one selected task at a time in this order: task state, ownership, source identity, primary action, secondary recovery actions, then unit/change details. Ready owner tasks can expose review, merge, and discard decisions. Non-owner ownership conflicts make Open owning task the primary action. Missing/stale worktrees make Refresh status primary. Create new task from here and Manual reassociation are secondary recovery actions, not default review actions.

The Univer Artifact Header follows the Univer Surface Selector IA from ADR-0018. The collapsed selector should continue to show the selected worktree source display name and unit, such as `季度汇总表 / 中国大陆工资表`; it should not replace the worktree source label with `This task` or `Other task`. Ownership relationship belongs in expanded selector grouping, status, and available actions. Expanded selector grouping should use task-centered labels: `当前版本`, `当前任务`, and `其他任务`. A current-task owned ready worktree can show first-line review decisions only while that reviewable worktree source is selected. When `当前版本` is selected, merge and discard stay hidden even if the current task has a ready worktree; status may indicate pending task modifications instead. A worktree owned by another task is view-only from the selected session: the header hides merge and discard rather than showing disabled review decisions, and uses a concise read-only status with tooltip text explaining that the source belongs to another task.

Default source selection should follow the selected task state. Ready, conflict, and working tasks default to the current task's worktree source. Planning or no-worktree tasks default to `当前版本`. Merged tasks default to `当前版本` because the result is now trunk. Discarded tasks default to a discarded read-only result when available, otherwise `当前版本`.

Merge and discard decisions stay attributable to a single task session. After a worktree is merged or discarded, its owning session becomes terminal and no longer blocks the same worktree id from appearing in historical views. New modifying work should use a new task session and a new live worktree rather than reusing a terminal worktree.
