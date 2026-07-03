## MODIFIED Requirements

### Requirement: Univer surface owns office viewing and editing

OpenWork SHALL route `.univer` spreadsheet, document, and slide navigation, viewing, worktree review, merge preview, and supported editing through the `@univer/cowork` Cowork Content Viewer component backed by the collab gateway service, rather than iframe-embedding the gateway-served collab-client page or using OpenWork's generic artifact editor.

#### Scenario: User opens a native target

- **WHEN** a user opens a `.univer` artifact from OpenWork
- **THEN** OpenWork SHALL display it with the `Cowork Content Viewer` component from `@univer/cowork`
- **AND** OpenWork SHALL NOT render the gateway-served collab-client page in an iframe for that artifact body
- **AND** OpenWork SHALL keep the surface embedded inside the OpenWork artifact panel

#### Scenario: Surface bootstrap is structured

- **WHEN** OpenWork opens a `.univer` artifact through the Univer extension action
- **THEN** the returned surface bootstrap SHALL provide structured gateway connection fields including `origin` and `univerfile`
- **AND** OpenWork SHALL NOT require `surface.url` or `viewerUrl` to render the artifact body
- **AND** OpenWork SHALL NOT derive gateway origin by parsing a viewer URL

#### Scenario: Surface route preserves context

- **WHEN** OpenWork opens a `.univer` artifact with an optional worktree or unit selection
- **THEN** OpenWork SHALL preserve the native file path plus optional worktree and unit route state as structured artifact/cowork state
- **AND** it SHALL render the content body from the active `CoworkContentSurface.viewerRequest`

#### Scenario: Header remains OpenWork-owned

- **WHEN** a `.univer` artifact is rendered through the Cowork Content Viewer
- **THEN** OpenWork SHALL continue to render the `Univer Artifact Header` above the content body
- **AND** the header SHALL use `CoworkContentSurface` for unit title, scope, edit gate, and review actions
- **AND** the content viewer SHALL NOT own artifact tabs, file fallback actions, or header layout

#### Scenario: Merge preview renders through the component viewer

- **WHEN** a user views a ready-for-review worktree in merge preview scope
- **THEN** OpenWork SHALL pass a `mergePreview` viewer request to the Cowork Content Viewer
- **AND** the viewer SHALL use cowork review-unit preview data rather than the gateway-served embedded page
- **AND** the native viewer SHALL render the preview without falling back to the artifact error state

#### Scenario: Supported editing follows cowork edit gate

- **WHEN** the user changes direct trunk edit intent through the Univer Artifact Header
- **THEN** OpenWork SHALL recompute `CoworkContentSurface.viewerRequest.editable`
- **AND** the Cowork Content Viewer SHALL be recreated with the new editable value
- **AND** OpenWork SHALL NOT maintain a second independent editable state inside the artifact panel

#### Scenario: Viewer failure uses native error state

- **WHEN** surface bootstrap, viewer initialization, viewer sync, or merge-preview payload loading fails
- **THEN** OpenWork SHALL render a native artifact error state with retry
- **AND** OpenWork SHALL NOT fall back to an iframe-rendered gateway page

#### Scenario: Viewer lifecycle recreates on request changes

- **WHEN** the viewer request changes by origin, file path, unit, scope, worktree, or editable state
- **THEN** OpenWork SHALL dispose the previous viewer instance and create a new one
- **AND** stale async viewer creation results SHALL be ignored or disposed
- **AND** unmounting the artifact body SHALL dispose the current viewer instance

#### Scenario: Viewer styles are explicit

- **WHEN** OpenWork bundles the Cowork Content Viewer
- **THEN** OpenWork SHALL explicitly import the viewer styles entry from `@univer/cowork/viewer/styles.css`
- **AND** lightweight cowork entry points SHALL remain usable without importing the heavy viewer runtime or styles

#### Scenario: Browser page is not an OpenWork fallback

- **WHEN** the gateway-served collab-client page remains available for standalone or browser diagnostics
- **THEN** OpenWork MAY leave that page available outside the artifact surface
- **AND** OpenWork SHALL NOT expose it as the default or fallback renderer for the `.univer` artifact body
