## 1. Domain and Spec

- [x] 1.1 Define `Cowork Content Viewer` in `CONTEXT.md`.
- [x] 1.2 Record ADR `0013-cowork-content-viewer-replaces-iframe`.
- [x] 1.3 Confirm the viewer replaces iframe rendering with no iframe fallback.
- [x] 1.4 Confirm `Univer Artifact Header` remains OpenWork-owned.
- [x] 1.5 Confirm `collab-client` is not modified by this OpenWork integration change.
- [x] 1.6 Run `openspec validate use-cowork-content-viewer --strict`.

## 2. Upstream Dependency

- [x] 2.1 Wait for or consume the `univer-cli` change that exports `@univer/cowork/viewer`.
- [x] 2.2 Consume `@univer/cowork/viewer/react` for the React component.
- [x] 2.3 Consume `@univer/cowork/viewer/styles.css` explicitly.
- [x] 2.4 Consume structured `open_surface` bootstrap with `origin` and `univerfile`.

## 3. OpenWork Surface Contract

- [x] 3.1 Update `UniverOpenSurface` to remove URL fields and include `origin`.
- [x] 3.2 Update `readUniverOpenSurface` to reject URL-only responses.
- [x] 3.3 Remove `originFromSurface` URL parsing.
- [x] 3.4 Remove `buildUniverEmbeddedViewerUrl`.
- [x] 3.5 Keep target route metadata as structured `worktreeId` and `unitId` fields.

## 4. Artifact Panel Integration

- [x] 4.1 Replace `UniverCollabSurface` iframe rendering with a component viewer body.
- [x] 4.2 Pass `contentSurface.viewerRequest` to `CoworkContentViewer`.
- [x] 4.3 Pass the cowork data source needed for merge-preview payload loading.
- [x] 4.4 Keep `UniverArtifactHeader` above the viewer body.
- [x] 4.5 Recompute and recreate viewer when edit gate changes `viewerRequest.editable`.
- [x] 4.6 Render native loading, error, and retry states.
- [x] 4.7 Ensure no iframe fallback is present in the `.univer` artifact body.

## 5. Validation

- [x] 5.1 Add focused tests for structured `UniverOpenSurface` parsing.
- [x] 5.2 Add focused tests that `.univer` artifact body renders `CoworkContentViewer`, not iframe.
- [x] 5.3 Add focused tests for trunk, worktree, and merge-preview viewer request wiring.
- [x] 5.4 Add focused tests for native error/retry and no iframe fallback.
- [x] 5.5 Run `pnpm --filter @openwork/app typecheck`.
- [x] 5.6 Run focused app tests for artifact panel, cowork content surface, and Univer header.
- [x] 5.7 Run fraimz proving `.univer` opens through the component viewer.
- [x] 5.8 Run fraimz proving Changes/Header workflows still drive the right content.
- [x] 5.9 Run fraimz or DOM assertion proving no `iframe[data-testid="univer-collab-surface"]` remains.
