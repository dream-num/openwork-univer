## Why

OpenWork now has a mature Univer integration: visible Univerfiles in the sidebar, Primary Univerfile session binding, session-owned worktrees, a native Cowork Content Viewer, a Univer Artifact Header, and a Univer CLI Extension that prepares the bundled runtime. Some of that code is product-specific OpenWork behavior, while some is reusable Univer runtime contract handling that every host embedding `@univer/cowork` would otherwise need to duplicate.

The current risk is abstraction drift in the wrong direction. Moving too much into `univer-cli` would make `@univer/cowork` know about OpenWork sessions, artifacts, and navigation. Moving nothing leaves OpenWork with duplicated runtime parsing and process orchestration that belongs next to the cowork package and CLI contract.

## What Changes

- Define a narrow Cowork Host Contract layer in `@univer/cowork`.
- Move host-neutral visible `.univer` discovery into `@univer/cowork/node`.
- Move `univer open --json` parsing and local gateway validation into a reusable Univer Open Handoff helper.
- Move or expose bundle runtime shim/health preparation so OpenWork does not duplicate bundled package integrity checks.
- Move daemon start retry behavior, including build-mismatch stop/retry and start de-duplication, into a reusable Node helper.
- Keep OpenWork session metadata, artifact extraction, sidebar hierarchy, settings UI, and Univer Artifact Header view models in OpenWork.
- Treat worktree status summaries and content-route fallback helpers as optional later extractions only if another consumer appears.

## Capabilities

### New Capabilities

- `univer-cowork-host-contracts`: OpenWork consumes reusable headless `@univer/cowork` host contracts for local Univer runtime facts while retaining OpenWork-specific product policy.

### Modified Capabilities

- `native-univer-office-surface`: Surface bootstrap uses a reusable Univer Open Handoff contract instead of OpenWork-only JSON parsing.
- `univer-target-session-workflow`: Visible Univerfile discovery may be delegated to `@univer/cowork/node`, while sidebar grouping and session binding remain OpenWork-owned.
- `univer-extension-installation`: Bundle health and shim preparation may be delegated to `@univer/cowork/node`, while setup status, repair actions, executable-source priority, and settings UI remain OpenWork-owned.

## Impact

- Affected upstream package:
  - `univer-cli/packages/cowork`: add or extend Node helpers for visible Univerfile discovery, open handoff parsing, bundle runtime preparation, and daemon startup.
- Affected OpenWork code:
  - `apps/server/src/univer-targets.ts`: consume discovery helper and keep workspace-relative mapping.
  - `apps/server/src/extensions/univer-cli.ts`: consume open handoff, bundle runtime, and daemon helpers while keeping OpenWork extension actions and errors.
  - `apps/app/src/react-app/domains/session/artifacts/open-target.ts`: consume open handoff recognition for ignored local gateway URLs while keeping OpenTarget derivation.
  - Existing tests around sidebar targets, open surface parsing, and artifact target derivation.
- Affected docs:
  - `CONTEXT.md`: `Cowork Host Contract`, `Univer Open Handoff`.
  - `docs/adr/0020-extract-only-cowork-host-contracts.md`.

## Out of Scope

- Moving `deriveOpenTargets` or `OpenTarget` into `@univer/cowork`.
- Moving `Univer Artifact Header` or its view model into `@univer/cowork`.
- Moving Primary Univerfile binding, `sessionUniverWorktreeId`, Overview Session, Done grouping, or sidebar rows into `@univer/cowork`.
- Moving OpenWork settings UI, extension action registry, read-only policy, API error mapping, or managed/system/override executable priority into `@univer/cowork`.
- Rewriting the Cowork Content Viewer, gateway data source, or cowork controller.
