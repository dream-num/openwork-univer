## 1. Domain and Design

- [x] 1.1 Define `Composer Toolbar`, `Workspace Files`, and `Office Worktree` in `CONTEXT.md`.
- [x] 1.2 Confirm Files and Changes are separate toolbar entry points.
- [x] 1.3 Confirm Files is workspace-scoped and Changes is active `.univer` artifact-scoped.
- [x] 1.4 Confirm toolbar placement below higher-priority composer status/accessories.
- [x] 1.5 Confirm session header Files entry is removed.
- [x] 1.6 Confirm user-visible label `Changes` while internal concept remains `Office Worktree`.
- [x] 1.7 Record ADR `0012-composer-toolbar-context-entrypoints`.
- [x] 1.8 Run initial `openspec validate add-composer-toolbar-context-entrypoints --strict`.

## 2. Composer Toolbar Slot

- [x] 2.1 Add a `composerToolbar` slot to `SessionSurface`.
- [x] 2.2 Render the toolbar slot in `ReactSessionComposer` below higher-priority status/accessory strips.
- [x] 2.3 Keep the toolbar lightweight, single-row, and aligned with compact chat width rhythm.
- [x] 2.4 Ensure higher-priority status/accessories remain above the toolbar while the toolbar stays above the editor.

## 3. Split Files and Changes Entry Points

- [x] 3.1 Move the existing workspace file tree button out of the session header.
- [x] 3.2 Add a `Files` toolbar button for Workspace Files.
- [x] 3.3 Split the current combined file/worktree popover so Files renders only `WorkspaceFileTree`.
- [x] 3.4 Add a `Changes` toolbar button for active `.univer` artifacts.
- [x] 3.5 Render Office Worktree content separately from Files.
- [x] 3.6 Keep Files and Changes popovers mutually exclusive.

## 4. State and Selection Behavior

- [x] 4.1 Keep Files visible for available workspace sessions.
- [x] 4.2 Show Changes only when the active right-side artifact tab is `.univer`.
- [x] 4.3 Bind Changes content to active artifact tab state, not Files selection.
- [x] 4.4 Keep Files open after opening a `.univer` file; do not auto-switch to Changes.
- [x] 4.5 Close Changes when the active artifact changes to a non-`.univer` target.
- [x] 4.6 Keep existing Workspace Files search, expansion, refresh, selection, and artifact opening behavior.
- [x] 4.7 Keep existing Office Worktree section defaults and review actions.
- [x] 4.8 Show a Changes badge only for ready-for-review count greater than zero.
- [x] 4.9 Render ready-for-review worktree merge, discard, and refresh actions inline on the worktree row.
- [x] 4.10 Automatically load selected review worktree details without requiring a manual refresh click.

## 5. Validation

- [x] 5.1 Add focused tests for toolbar placement and visibility.
- [x] 5.2 Add focused tests or update existing tests for Files/Changes popover independence.
- [x] 5.3 Update `workspace-files-popover` fraimz to open Files from the Composer Toolbar.
- [x] 5.4 Update Univer collab surface fraimz to open Changes from the Composer Toolbar.
- [x] 5.5 Run `pnpm --filter @openwork/app typecheck`.
- [x] 5.6 Run focused UI/unit tests for the session surface/composer and panel popovers.
- [x] 5.7 Run `openspec validate add-composer-toolbar-context-entrypoints --strict` after implementation updates.

## Evidence

- `pnpm --filter @openwork/app exec bun test tests/composer-toolbar.test.tsx tests/workspace-cowork-panel.test.ts tests/panel-tab-store.test.ts tests/compact-chat-pane.test.tsx tests/univer-artifact-header.test.tsx`
- `pnpm --filter @openwork/app typecheck`
- `pnpm exec openspec validate add-composer-toolbar-context-entrypoints --strict`
- `pnpm fraimz --flow workspace-files-popover --cdp-url http://127.0.0.1:9852` -> `evals/results/2026-07-01T06-26-22-134Z/fraimz.html`
- `pnpm fraimz --flow univer-artifact-collab-surface --cdp-url http://127.0.0.1:9852` -> `evals/results/2026-07-01T06-26-25-227Z/fraimz.html`
