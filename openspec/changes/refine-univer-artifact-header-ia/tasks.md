## 1. Domain and Decisions

- [x] 1.1 Update glossary so `Univer Surface Selector` is `<Worktree source> / <Unit>`.
- [x] 1.2 Define `Univer Surface Selector` as the primary control for `<Worktree source> / <Unit>`, with status and id details only in the expanded menu.
- [x] 1.3 Define selected-worktree view actions for `查看修改` and `预览合入后`.
- [x] 1.4 Define selected-worktree review actions for human-only `合入` and `丢弃`.
- [x] 1.5 Define clear unit change status language and reject standalone `改`.
- [x] 1.6 Define primary status chip priority and concise normal-bar labels.
- [x] 1.7 Record ADR-0018 and supersede ADR-0017.

## 2. Spec

- [x] 2.1 Add OpenSpec proposal for the Univer Artifact Header IA refinement.
- [x] 2.2 Add design notes for the unified surface selector, selected-worktree actions, review decisions, status, overflow, and file fallback zones.
- [x] 2.3 Add spec scenarios for the surface selector, worktree/unit selection, selected-worktree view actions, review decisions, prioritized status chip, edit gate, unit change status, agent review boundaries, and overflow menu behavior.
- [x] 2.4 Validate the OpenSpec change with `pnpm exec openspec validate refine-univer-artifact-header-ia --strict`.

## 3. Implementation Plan

- [x] 3.1 Update the header view model so the surface selector lists `当前版本` plus all viewable worktrees for the current Primary Univerfile.
- [x] 3.2 Render worktree rows with display name as the primary label, compact state plus worktree id as secondary text, and units with status where available.
- [x] 3.3 Move `查看修改` and `预览合入后` out of source selection and render them as actions for the selected worktree.
- [x] 3.4 Render `合入` and `丢弃` as first-line review decision controls for a selected ready-review worktree.
- [x] 3.5 Keep merge/discard out of `...`; keep overflow limited to secondary executable actions.
- [x] 3.6 Replace or relocate standalone `改` with explicit unit change status text such as `已修改`, `新增`, `删除`, or `冲突`.
- [x] 3.7 Keep edit gate as lower-priority status, not a menu category or source option.
- [x] 3.8 Preserve far-right file fallback actions for download, reveal, and close.

## 4. Validation Plan

- [x] 4.1 Update focused header tests for unified surface selector source and unit selection.
- [x] 4.2 Add tests that merge preview keeps the same worktree selected.
- [x] 4.3 Add tests that merge/discard are first-line controls and not overflow-only actions.
- [x] 4.4 Add tests that `改` is not the only visible unit change explanation.
- [x] 4.5 Run `pnpm --filter @openwork/app typecheck`.
- [x] 4.6 Run focused app tests for Univer artifact header behavior.
- [x] 4.7 Run fraimz evidence for the updated header flow, or report why the observable flow could not be driven.
