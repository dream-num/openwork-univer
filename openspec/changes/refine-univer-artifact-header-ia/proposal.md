## Why

The dedicated Univer Artifact Header now carries several different concepts in one narrow bar: Univerfile identity, unit navigation, content scope, editability, review actions, and file fallback actions. Recent UI review showed that this makes the header feel structurally confused. In particular, rendering `当前版本` as a breadcrumb segment makes a view mode look like a path location, and the overflow menu can open to static status content that repeats the visible `可编辑` chip.

The header needs a sharper information architecture before further visual polish. It should first answer where the user is in the Univer Surface, then show which content view is active, then expose only the actions that apply to that view.

## What Changes

- Treat the Univer Surface Breadcrumb as identity and unit navigation only: `<Univerfile> / <Unit>`.
- Introduce the Univer Content View Selector as the separate control for `当前版本`, `原始修改`, and `合并后`.
- Treat the Univer Edit Gate as a status chip, not as an overflow menu section.
- Scope merge/discard review actions to pending-change views instead of showing them on the default current-version view.
- Treat the `...` control as an action overflow menu that appears only when there are real secondary actions.

## Capabilities

### Modified Capabilities

- `univer-artifact-header`: Refine the header IA so breadcrumb, content view, edit gate, review actions, overflow actions, and file fallback actions have distinct roles.

## Impact

- Affected docs:
  - `CONTEXT.md`: update `Univer Surface Breadcrumb`; add `Univer Content View Selector` and `Univer Edit Gate`.
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
