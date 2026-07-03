## Why

The dedicated Univer Artifact Header now carries several different concepts in one narrow bar: Univerfile identity, unit navigation, worktree selection, editability, review actions, and file fallback actions. Recent UI review showed that this makes the header feel structurally confused. In particular, rendering `当前版本`, worktree changes, and merge preview as peer "views" makes users ask what object they are looking at and where to merge or discard it.

The header needs a sharper information architecture before further visual polish. It should first answer where the user is in the Univer Surface, then show which worktree source is active, then expose the actions that apply to that selected worktree.

## What Changes

- Replace the split breadcrumb plus worktree chip with one Univer Surface Selector: `<Worktree source> / <Unit>`.
- Let the selector expose `当前版本` plus all viewable worktrees, with worktree id, worktree status, and unit status visible in the expanded menu where available.
- Treat `查看修改` and `预览合入后` as view actions for the selected worktree, not as sibling worktree choices.
- Make `合入` and `丢弃` first-line review decision actions whenever a selected worktree can be reviewed.
- Treat the Univer Edit Gate as a status chip, not as an overflow menu section.
- Keep the normal bar to one concise primary status chip, chosen by risk/action priority, with long explanations moved to tooltip or expanded detail.
- Treat terse unit status badges such as `改` as unclear; use plain status such as `已修改` or move the status into worktree detail.
- Treat the `...` control as an action overflow menu for low-priority secondary actions only.

## Capabilities

### Modified Capabilities

- `univer-artifact-header`: Refine the header IA so the unified surface selector, selected-worktree view actions, review decisions, edit gate, overflow actions, and file fallback actions have distinct roles.

## Impact

- Affected docs:
  - `CONTEXT.md`: add or update `Univer Surface Selector`, selected-worktree actions, unit change status, and `Univer Edit Gate`.
  - `docs/adr/0017-univer-surface-breadcrumb-route.md`: superseded by ADR-0018.
  - `docs/adr/0018-separate-univer-content-view-from-breadcrumb.md`: record the new IA decision.
- Expected affected code:
  - `apps/app/src/react-app/domains/session/artifacts/univer-artifact-header-view-model.ts`
  - `apps/app/src/react-app/domains/session/artifacts/artifact-panel.tsx`
  - Focused header tests and fraimz coverage.
- Out of scope:
  - Changing generic non-`.univer` artifact headers.
  - Reworking the far-right download, reveal, and close fallback actions.
  - Rebuilding the Univer content viewer or Current Target Panel.
