## Why

OpenWork now embeds `.univer` artifacts through the Collab Gateway Office Surface, but the artifact panel still uses the generic artifact titlebar. That titlebar optimizes for ordinary file preview actions: file name first, download, reveal in folder, open externally, and close.

For `.univer`, that hierarchy is wrong. A `.univer` file is a Native Office Target, not a generic preview file. The normal product path is the embedded Univer Office Surface inside OpenWork; opening the gateway URL externally is a development or fallback path. The header above the embedded surface should therefore present the current office content and its workflow controls, not lead with generic file-preview affordances.

## What Changes

- Add a dedicated `Univer Artifact Header` for `.univer` artifact tabs.
- Drive that header through a thin `Univer Artifact Header View Model`, not a generic artifact header framework or persisted store.
- Make the currently rendered unit the primary title when known, with the `.univer` file as secondary context.
- Keep file-level actions such as download and reveal as secondary or fallback actions.
- Remove `Open externally` from the normal `.univer` artifact header path in the first implementation slice.
- Reserve header structure for future `@univer/cowork` content surface controls without rendering empty controls in the first slice.
- Later wire cowork content state into the header for scope, edit gate, preview/original toggle, merge, and discard controls.

## Capabilities

### New Capabilities

- `univer-artifact-header`: Render `.univer` artifacts with an OpenWork-owned header that combines artifact identity, current content context, and office workflow controls.

### Modified Capabilities

- None.

## Impact

- Affected code:
  - `apps/app/src/react-app/domains/session/artifacts/artifact-panel.tsx`: route `.univer` artifacts to a dedicated header instead of the generic artifact titlebar actions.
  - `apps/app/src/react-app/domains/session/artifacts/univer-surface.ts`: expose or consume embedded surface state needed by the header.
  - New focused view-model module under `apps/app/src/react-app/domains/session/artifacts/`.
  - Focused UI/unit tests and fraimz coverage for the `.univer` artifact panel.
- Affected docs:
  - `CONTEXT.md`: `Univer Artifact Header` and `Univer Artifact Header View Model`.
  - `docs/adr/0010-univer-artifact-header.md`.
- Out of scope:
  - Changing the generic artifact titlebar for non-`.univer` artifacts.
  - Adding a generic artifact header framework.
  - Reintroducing `Open externally` as a normal `.univer` header button.
  - Building a replacement office editor or bypassing the embedded collab-client runtime.
