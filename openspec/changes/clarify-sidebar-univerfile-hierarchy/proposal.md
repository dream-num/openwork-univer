## Why

The current sidebar has the right domain model but a weak visual grammar. Workspace identity, Session Navigation Sections, Univerfile rows, unavailable history, and task rows read as one flat list because their order, indentation, icon language, and selected/focus states are too similar.

That makes users ask whether the visible `.univer` rows belong to the workspace, to `Univerfiles`, or to `Unavailable Univerfiles`. The sidebar should make the hierarchy obvious without forcing users to understand the implementation model.

## What Changes

- Define the sidebar as a Session Navigation Tree: workspace header, top-level Session Navigation Sections, section rows, and nested task rows.
- Keep `General Sessions`, `Univerfiles`, and `Unavailable Univerfiles` as stable top-level sections, but make their bodies visually and structurally contiguous.
- Require expanded section contents to render immediately after the owning section header before the next top-level section appears.
- Make `Univerfiles` rows visibly subordinate to the `Univerfiles` section through indentation, continuation spacing, and file-specific icon language.
- Make workspace identity visually distinct from section headers and file rows.
- Separate expanded, selected, hover, and keyboard focus states so a section header does not look like the selected file or task.
- Keep `Unavailable Univerfiles` collapsed and visually quiet when empty, while preserving its stable section presence.

## Capabilities

### Modified Capabilities

- `univer-target-session-workflow`: Clarify the sidebar hierarchy, order, and visual semantics for General Sessions, Univerfiles, Unavailable Univerfiles, Univerfile Rows, and nested task rows.

## Impact

- Affected product surfaces:
  - Workspace sidebar session navigation.
  - Univerfile row grouping and unavailable Univerfile grouping.
  - Sidebar hover, selected, expanded, and keyboard focus states.
  - Sidebar accessibility labels and row structure.
- Affected code areas likely include:
  - `apps/app/src/react-app/domains/session/sidebar/app-sidebar.tsx`
  - `apps/app/tests/sidebar-univer-targets.test.ts`
  - sidebar fraimz flows for Univer session navigation.
- Out of scope:
  - Changing Primary Univerfile binding semantics.
  - Changing General-to-Univer Task Promotion lifecycle rules.
  - Adding unit trees or worktree trees to the sidebar.
  - Replacing Workspace Files with a filesystem navigator in this sidebar area.
