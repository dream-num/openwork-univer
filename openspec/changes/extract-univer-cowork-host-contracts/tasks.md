## 1. Domain and Spec

- [x] 1.1 Define `Cowork Host Contract` in `CONTEXT.md`.
- [x] 1.2 Define `Univer Open Handoff` in `CONTEXT.md`.
- [x] 1.3 Record ADR `0020-extract-only-cowork-host-contracts`.
- [x] 1.4 Run `pnpm exec openspec validate extract-univer-cowork-host-contracts --strict`.

## 2. Upstream Cowork Package

- [x] 2.1 Add a `@univer/cowork/node` visible Univerfile discovery helper with depth, entry, and ignore-policy options.
- [x] 2.2 Add tests for discovery ordering, hidden/generated path filtering, depth limits, and unreadable directories.
- [x] 2.3 Add a Univer Open Handoff parser for `univer open --json` output.
- [x] 2.4 Add local handoff validation for required `origin`, required `univerfile`, optional `worktreeId`/`unitId`, expected file matching, and loopback HTTP origins.
- [x] 2.5 Add a handoff recognizer usable by hosts that need to ignore gateway URLs embedded inside valid open handoff envelopes.
- [x] 2.6 Extend or add bundle runtime preparation so hosts can validate package integrity and prepare executable shims without duplicating cowork bundle checks.
- [x] 2.7 Add daemon startup helper with build-mismatch stop/retry and scoped concurrent-start de-duplication.
- [x] 2.8 Keep all new helpers headless and free of OpenWork session, sidebar, artifact, settings, and UI label concepts.

## 3. OpenWork Adapter Consumption

- [x] 3.1 Replace the core walk in `apps/server/src/univer-targets.ts` with the cowork discovery helper while preserving OpenWork workspace-relative output.
- [x] 3.2 Keep OpenWork-side workspace-root containment, remote-workspace handling, and visible/unavailable sidebar grouping local.
- [x] 3.3 Replace `parseOpenSurface` internals with the cowork Univer Open Handoff parser/validator while preserving OpenWork API errors and response fields.
- [x] 3.4 Replace app-side Univer open URL ignoring with the cowork handoff recognizer while keeping `deriveOpenTargets` and `OpenTarget` local.
- [x] 3.5 Consume bundle health/shim preparation helpers while keeping setup actions, read-only handling, executable-source priority, and `OPENWORK_UNIVER_BIN` local.
- [x] 3.6 Consume daemon startup helper while preserving OpenWork `open_surface` error mapping.
- [x] 3.7 Do not move `Univer Artifact Header`, session metadata, sidebar hub building, Worktree Panel, or settings UI into cowork.

## 4. Validation

- [x] 4.1 Run `pnpm --filter @univer/cowork test` in `univer-cli`.
- [x] 4.2 Run `pnpm --filter @univer/cowork typecheck` in `univer-cli`.
- [x] 4.3 Run focused OpenWork tests for Univer target discovery and sidebar grouping.
- [x] 4.4 Run focused OpenWork tests for `open_surface` parsing and untrusted-origin rejection.
- [x] 4.5 Run focused OpenWork tests for artifact target derivation, including valid Univer handoff gateway URL suppression.
- [x] 4.6 Run focused OpenWork tests for bundle setup status and repairable/fatal bundle states.
- [x] 4.7 Run `pnpm --filter @openwork/app typecheck`.
- [x] 4.8 Run fraimz proving the core visible Univerfile discovery and open-surface flow remains unchanged from the user's perspective.
