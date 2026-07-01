## Why

The current workspace file tree entry point lives in the session header next to notifications and opens a combined popover: workspace files on top and Univer cowork/worktree state below. That placement is no longer right for the compact chat pane.

Files and office changes are contextual session-work controls. They are used while composing, reviewing agent output, and opening artifacts. Placing them in the composer area keeps them close to the work loop, while splitting them prevents two different concepts from sharing one ambiguous `Files` entry point.

## What Changes

- Introduce a stable `Composer Toolbar` in the Compact Chat Composer stack.
- Move the workspace file tree entry from the session header into the Composer Toolbar.
- Split the existing combined popover into two user-visible entry points:
  - `Files` for ordinary Workspace Files.
  - `Changes` for the active `.univer` artifact's Office Worktree.
- Bind `Changes` to the current right-side active artifact tab, not to the file selected inside Files.
- Remove the header Files button so Files/Changes have a single primary home.
- Update fraimz coverage to prove the toolbar entry points and the split behavior.

## Capabilities

### New Capabilities

- `composer-toolbar-context-entrypoints`: Render durable workspace and office context entry points in the Composer Toolbar.

### Modified Capabilities

- `compact-chat-pane`: The compact composer receives a stable toolbar slot below higher-priority status and blocking workflow accessories.
- `workspace-files-popover`: The workspace file tree opens from the Composer Toolbar instead of the session header.
- `native-univer-office-surface`: The active `.univer` artifact can expose its Office Worktree from the Composer Toolbar as `Changes`.

## Impact

- Affected code:
  - `apps/app/src/react-app/domains/session/surface/session-surface.tsx`: add a composer toolbar slot and pass it to the composer.
  - `apps/app/src/react-app/domains/session/surface/composer/composer.tsx`: render the toolbar below higher-priority status and blocking workflow accessories.
  - `apps/app/src/react-app/domains/session/chat/session-page.tsx`: assemble Files and Changes toolbar actions from session, workspace, and active artifact state.
  - `apps/app/src/react-app/domains/session/panel/workspace-file-tree-popover.tsx`: split the current combined popover into independent Files and Changes popovers or equivalent components.
  - `apps/app/src/react-app/domains/session/panel/workspace-file-tree.tsx` and `workspace-cowork-panel.tsx`: preserve existing state and selection behavior while moving entry points.
  - Focused tests and fraimz flows for the toolbar entry points.
- Affected docs:
  - `CONTEXT.md`: `Composer Toolbar`, `Workspace Files`, and `Office Worktree`.
  - `docs/adr/0012-composer-toolbar-context-entrypoints.md`.
- Out of scope:
  - Moving notifications into the composer.
  - Adding a generic plugin toolbar framework.
  - Changing the artifact panel tab model.
  - Changing workspace file session APIs.
  - Changing Univer cowork controller semantics.
