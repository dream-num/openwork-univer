## Context

The current artifact panel header is generic. It shows the artifact file name and size, then generic file actions: download, reveal in folder, open externally, and close. This works for PDFs, images, HTML, markdown, and other previews.

`.univer` artifacts are different. OpenWork has already defined `.univer` as the Native Office Target, and the normal user path is the Embedded Collab View. The existing ADRs also say external browser opening is useful for development, diagnostics, and fallback, but not the default product path.

The header above a `.univer` surface should become part of the Univer Office Surface, not remain a generic file-preview toolbar.

## Goals

- Introduce an OpenWork-owned `Univer Artifact Header` for `.univer` artifact tabs.
- Make the header follow the currently rendered office content: unit, scope, and worktree.
- Keep the `.univer` file visible as secondary context.
- Keep file-level actions secondary and remove normal `Open externally`.
- Preserve the generic artifact header for non-`.univer` artifacts.
- Stage the work so Step 1 can ship before full cowork content-surface integration.

## Non-Goals

- Do not change generic artifact titlebar behavior for other artifact types.
- Do not create a generic header action framework.
- Do not add an overflow menu only to preserve `Open externally`.
- Do not render placeholder controls for unavailable cowork state.
- Do not rebuild collab-client content controls inside OpenWork before the cowork content surface is wired.

## Decision 1: Header is `.univer`-specific

`Univer Artifact Header` applies only when the artifact target is a `.univer` Native Office Target, represented today by `target.preview === "univer"`.

Non-`.univer` artifacts continue using the generic artifact header. This avoids making every artifact pay for office-specific concepts like unit, scope, worktree, edit gate, merge preview, or review actions.

## Decision 2: Thin view model, no store

The header should be derived through a thin `Univer Artifact Header View Model`.

The view model combines:

- `OpenTarget`: artifact identity, path, size, route metadata, and file existence.
- `UniverOpenSurface`: embedded surface route/loading/error state.
- Future `Cowork Content Surface`: current unit, scope, edit gate, review actions, and viewer request.
- Workspace context: local/remote state that decides whether file fallback actions are available.

The view model is a pure derivation boundary. It should not persist state, subscribe to services, fetch data, or become a generic artifact header framework.

## Decision 3: Current unit is the primary title

When cowork content state is available, the header primary title is the currently rendered unit. The `.univer` file name is secondary context.

When the current unit is unavailable, loading, or not yet wired, the header falls back to the `.univer` file name as the primary title. This lets Step 1 ship before full cowork state exists without locking the final hierarchy to file-first.

Examples:

- Ready content state: `中国大陆工资表 · 当前版本`, secondary `工资表.univer`.
- Merge preview state: `中国大陆工资表 · 合并预览`, secondary `工资表.univer`.
- Loading or unknown unit: `工资表.univer`, secondary `Opening Univer surface...`.

## Decision 4: File actions are fallback actions

For `.univer`, file-level actions are not the main product actions.

- `Close` remains a panel/tab action.
- `Reveal in folder` remains available for local workspace file targets.
- `Download` remains available as a secondary fallback, especially for remote/sharing paths.
- `Open externally` is removed from the normal `.univer` header in Step 1.

External opening can return later through a debug/fallback menu if there is a concrete product need, but it should not be present as the normal header button.

## Decision 5: Layout reserves semantic zones

The first slice should use the same structural zones that the final header needs:

- Left: current unit/file identity.
- Middle or right content area: content actions from cowork state.
- Far right: file fallback actions and close.

Step 1 should not render empty buttons or "coming soon" copy. It only reserves structure so Step 2 can add content actions without redesigning the header.

## Step Plan

### Step 1: Header skeleton and action policy

- Add `UniverArtifactHeader` and `deriveUniverArtifactHeaderViewModel`.
- Render the dedicated header only for `.univer` artifacts.
- Fall back to file-first title until content state is available.
- Remove the default `.univer` `Open externally` action.
- Keep `Close`, `Reveal in folder`, and `Download` according to the fallback action policy.
- Keep non-`.univer` artifact header behavior unchanged.

### Step 2: Cowork content controls

- Feed `Cowork Content Surface` into the view model.
- Promote current unit and scope to the primary title.
- Render edit gate state.
- Render preview/original toggle when available.
- Render merge/discard for reviewable worktrees.
- Use viewer request state to keep the embedded collab-client route aligned.

## Risks

- If the view model becomes too broad, it can turn into a generic artifact header framework. Keep it `.univer`-specific.
- If Step 1 displays placeholder controls, users will see unavailable workflow affordances. Render only available actions.
- If `Open externally` remains visible, it contradicts the embedded-by-default office surface model.
- If non-`.univer` artifacts are touched, the change becomes much larger than the requested Office UX refinement.
