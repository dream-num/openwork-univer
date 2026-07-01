## Why

OpenWork currently renders `.univer` artifact content by iframe-embedding a gateway-served `collab-client` page. The embedded page is functionally correct, but it adds a full page bootstrap path inside the artifact panel and makes the right-side office surface feel slower than a native OpenWork component.

The `collab-client` embedded mode already contains the correct core content viewer behavior. Rather than rewriting the editor, OpenWork should consume that behavior after it is extracted into `@univer/cowork` as a reusable content viewer.

## What Changes

- Replace the `.univer` artifact iframe surface with `@univer/cowork/viewer/react`.
- Consume a structured `UniverOpenSurface` bootstrap with gateway `origin` and `univerfile`, not gateway-served viewer URLs.
- Keep the OpenWork-owned `Univer Artifact Header` above the content viewer.
- Keep `CoworkContentSurface` as the source of title, scope, edit gate, actions, and `viewerRequest`.
- Render native OpenWork loading, error, and retry states when viewer bootstrap or initialization fails.
- Remove the iframe fallback from the OpenWork artifact surface.

## Capabilities

### Modified Capabilities

- `native-univer-office-surface`: OpenWork renders `.univer` artifact content through the extracted Cowork Content Viewer component instead of iframe-embedding the gateway-served page.
- `univer-artifact-header`: The header remains OpenWork-owned and continues to consume cowork content state while the content body switches to the component viewer.

## Impact

- Affected code:
  - `apps/app/src/react-app/domains/session/artifacts/univer-surface.ts`: parse the structured surface bootstrap returned by the Univer extension action.
  - `apps/app/src/react-app/domains/session/artifacts/univer-cowork-session.ts`: stop deriving viewer URLs and keep origin/bootstrap state as structured data.
  - `apps/app/src/react-app/domains/session/artifacts/artifact-panel.tsx`: replace `iframe[data-testid="univer-collab-surface"]` with `CoworkContentViewer`.
  - App-level style imports: import the explicit `@univer/cowork/viewer/styles.css` entry required by the viewer package.
  - Focused tests and fraimz for native viewer rendering, error/retry behavior, header integration, and no iframe fallback.
- Affected docs:
  - `CONTEXT.md`: `Cowork Content Viewer`.
  - `docs/adr/0013-cowork-content-viewer-replaces-iframe.md`.
- Depends on:
  - `univer-cli` exposing `@univer/cowork/viewer`, `@univer/cowork/viewer/react`, and `@univer/cowork/viewer/styles.css`.
  - `univer-cli` updating `open_surface` to return structured bootstrap fields instead of OpenWork viewer URLs.
- Out of scope:
  - Changing `collab-client` to consume the new viewer package.
  - Rewriting the core viewer behavior.
  - Moving `Univer Artifact Header` into `@univer/cowork`.
  - Keeping iframe as a fallback path.
