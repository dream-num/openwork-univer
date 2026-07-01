## Context

The current OpenWork artifact panel calls the Univer extension `open_surface` action, receives `url`, `viewerUrl`, and `univerfile`, and renders an iframe with `surface.url` or a generated embedded `viewerUrl`. Cowork worktree state is already handled separately through `@univer/cowork`, and the header already consumes `CoworkContentSurface`.

The desired change is not a rewrite of the office editor. The core content viewer behavior should be extracted from `collab-client` embedded mode into `@univer/cowork`, and OpenWork should embed that extracted component directly.

## Goals

- Make `.univer` artifact content render as an OpenWork-owned component, not an iframe page.
- Keep behavior aligned with current `collab-client` embedded mode.
- Keep the gateway as the data, websocket, SSE, worktree, and merge-preview service.
- Keep OpenWork responsible for artifact panel chrome, header, errors, retry, and routing.
- Avoid loading the heavy Univer runtime through lightweight `@univer/cowork` entry points.

## Non-Goals

- Do not modify `collab-client` consumption in this change.
- Do not remove the gateway itself.
- Do not move artifact header UI into `@univer/cowork`.
- Do not keep iframe fallback for OpenWork artifact rendering.
- Do not optimize viewer lifecycle beyond dispose-and-recreate.

## Decision 1: Component body, OpenWork header

OpenWork keeps this structure:

```tsx
<UniverArtifactHeader surface={contentSurface} />
<CoworkContentViewer request={contentSurface.viewerRequest} />
```

`@univer/cowork/viewer` owns the office content area only. `Univer Artifact Header` remains OpenWork-owned because it is tied to artifact tabs, file actions, and right-panel state.

## Decision 2: Structured bootstrap, no viewer URLs

`open_surface` should return structure required by the component viewer:

```ts
type UniverOpenSurface = {
  origin: string;
  univerfile: string;
  worktreeId?: string;
  unitId?: string;
};
```

OpenWork should not parse gateway URLs for `origin`, should not generate embedded viewer URLs, and should not treat `surface.url` or `viewerUrl` as the artifact rendering contract.

## Decision 3: No iframe fallback

OpenWork will not keep the gateway-served embedded page as a fallback. If the new component viewer fails to bootstrap, initialize, sync, or render a requested unit, OpenWork renders a native error state and a retry action.

This keeps the migration honest. The old iframe path remains useful for standalone gateway/browser use, but it is no longer the OpenWork artifact surface.

## Decision 4: Viewer request stays the render contract

`CoworkContentSurface.viewerRequest` remains the render contract between the header/worktree model and the content body.

OpenWork derives the active `CoworkContentSurface`, renders header controls from it, and passes `viewerRequest` to the component viewer. The viewer does not own header actions, scope toggles, or edit-gate UI.

## Decision 5: Dispose and recreate

The first component integration follows the existing embedded viewer lifecycle: dispose and recreate whenever the render request changes.

Recreate triggers:

- gateway `origin`
- `container.localPath`
- `unitId`
- `scope`
- `worktreeId`
- `editable`

Unmount also disposes. If an async create resolves after the request changed, OpenWork or the React wrapper must ignore the stale result and dispose it.

## Decision 6: Explicit styles entry

The heavy viewer styles are explicit. OpenWork must import `@univer/cowork/viewer/styles.css` where the artifact viewer is bundled. The light `@univer/cowork`, `@univer/cowork/react`, and `@univer/cowork/gateway` paths must not import viewer runtime or CSS.

## Error States

OpenWork owns user-visible errors. Expected error categories:

- extension `open_surface` bootstrap failure
- missing or unsupported viewer request
- viewer runtime initialization failure
- merge-preview payload failure
- collaboration sync timeout

Errors should render through the existing artifact preview error pattern with a retry action that retries the current bootstrap and viewer request. Errors should not silently open or display an iframe.

## Validation

- Focused unit tests should assert that OpenWork no longer renders `iframe[data-testid="univer-collab-surface"]`.
- Tests should assert `UniverOpenSurface` parses structured `origin` and rejects URL-only responses.
- Tests should assert `CoworkContentViewer` receives trunk, worktree, and merge-preview requests from `CoworkContentSurface`.
- Fraimz should prove a `.univer` artifact opens in the right panel through the component viewer and that Changes/Header workflows remain connected.
- Fraimz should prove there is no iframe fallback in the artifact body.

## Risks

- The extracted viewer brings heavy Univer dependencies into the OpenWork app bundle. Keep imports isolated to viewer subpaths.
- Removing iframe fallback makes viewer extraction correctness critical. Require the `univer-cli` package PR to land before OpenWork implementation.
- If `open_surface` keeps URL fields in the OpenWork contract, future changes may accidentally reintroduce iframe rendering.
- If lifecycle tries to patch a mounted Univer instance in the first slice, correctness risk rises. Start with dispose-and-recreate.
