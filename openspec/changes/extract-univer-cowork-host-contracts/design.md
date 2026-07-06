## Context

`@univer/cowork` already owns the core Univer cowork model: containers, units, active and reviewable worktrees, review summaries, content surfaces, gateway data sources, viewer requests, and bundle resolution. Its README explicitly keeps styled UI and filesystem scanning outside the package today, while also positioning `@univer/cowork/node` as the server/desktop entry point for local containers and matched runtime bundle resources.

OpenWork currently owns several pieces that sit close to that seam:

- `apps/server/src/univer-targets.ts` discovers visible `.univer` files under a workspace.
- `apps/server/src/extensions/univer-cli.ts` parses `univer open --json`, validates local gateway origins, prepares bundled executable shims, checks bundle integrity, and starts the daemon with build-mismatch retry.
- `apps/app/src/react-app/domains/session/artifacts/open-target.ts` identifies Univer open handoff envelopes so local gateway URLs are not shown as ordinary browser artifacts.

Those pieces are not all equal. Some are reusable Univer runtime contracts. Others encode OpenWork product policy and should remain local.

## Goals

- Keep `@univer/cowork` as the Module for headless Univer cowork and local runtime contracts.
- Keep OpenWork as the Adapter that maps cowork/runtime facts into sessions, artifacts, sidebar rows, settings, and user-facing errors.
- Reduce duplicated parsing and runtime orchestration in OpenWork.
- Preserve current OpenWork product behavior while making future hosts consume the same stable cowork contracts.
- Make each extraction small enough to test in `univer-cli` before OpenWork consumes it.

## Non-Goals

- Do not move OpenWork session or navigation concepts into `@univer/cowork`.
- Do not make `@univer/cowork` depend on OpenWork packages or `OpenTarget` shapes.
- Do not move installer/update product policy into `@univer/cowork`.
- Do not change user-visible sidebar, header, settings, or artifact behavior as part of the abstraction.
- Do not extract optional convenience helpers until there is real duplication or a second consumer.

## Decision 1: Treat `@univer/cowork` as the host contract owner

`@univer/cowork` should own stable facts that come from Univer runtime semantics rather than OpenWork product state. The useful Interface returns local Univerfile summaries, validated gateway origins, route fields, bundle health, executable shim preparation results, and daemon start results.

OpenWork remains responsible for workspace authorization, workspace-relative path mapping, remote-workspace restrictions, API error codes, session metadata, sidebar grouping, artifact confidence, and UI labels.

Alternative considered: keep all integration code in OpenWork. That avoids cross-repo coordination but leaves runtime contract parsing duplicated and makes future hosts rediscover the same daemon and bundle edge cases.

Alternative considered: move the whole Univer integration into `@univer/cowork`. That would give a single package but would pull OpenWork product concepts into a runtime library and make the cowork package less reusable.

## Decision 2: Extract visible Univerfile discovery, not sidebar grouping

The discovery walk in `apps/server/src/univer-targets.ts` is host-neutral enough to move into `@univer/cowork/node` as a Node filesystem helper. It should find user-visible `.univer` files, apply configurable depth/entry limits, and ignore generated/dependency/runtime directories by default.

The helper should return local file facts such as absolute path, display name, size, and updated time. OpenWork should still convert to workspace-relative paths, enforce workspace-root containment, attach `unitCount` only when it has a reliable source, and build `Univerfile Row` / `Unavailable Univerfiles` navigation locally.

## Decision 3: Extract Univer Open Handoff parsing and validation

`univer open --json` is a CLI/runtime contract. Parsing the JSON envelope, requiring `origin` and `univerfile`, preserving optional `worktreeId` and `unitId`, and validating a loopback HTTP gateway origin should live next to the cowork Node helpers.

OpenWork should call that helper from the `open_surface` extension action and then map the validated result to its own response shape with `workspaceId` and workspace-relative `path`. The app-side artifact scanner may also use the same handoff recognizer to ignore local gateway URLs contained inside a valid `.univer` handoff envelope.

OpenWork must not move `deriveOpenTargets` itself. That function is an OpenWork artifact Adapter because it knows about `UIMessage`, `OpenTarget`, confidence, source documents, write tools, and user-facing preview types.

## Decision 4: Extend bundle health and shim preparation

OpenWork currently duplicates package integrity checks around the cowork bundle because it needs a writable local shim for packaged Electron/runtime execution. `@univer/cowork/node` already resolves the bundle and performs package health checks, so it should either expose a runtime preparation helper or extend health options enough for OpenWork to avoid duplicating skill-root, metadata, executable, and version checks.

The host-neutral helper may build or describe an executable shim and report healthy, repairable, or fatal bundle states. OpenWork keeps read-only handling, setup/repair actions, settings display, executable-source priority, and the `OPENWORK_UNIVER_BIN` environment variable.

## Decision 5: Extract daemon start retry orchestration

Starting the local Univer daemon and recovering from `Daemon build mismatch` is Univer runtime behavior. `@univer/cowork/node` should expose a helper that runs `univer daemon start`, detects the build-mismatch failure, runs `univer daemon stop`, retries start, and de-duplicates concurrent starts for the same executable/runtime environment.

The helper should stay process-oriented and not know about OpenWork workspaces or sessions. OpenWork passes `cwd`, environment, executable path, and timeout, then translates failure results into OpenWork API errors.

## Decision 6: Leave product policy in OpenWork

The following stay in OpenWork:

- Primary Univerfile, General Session, Univerfile Overview Session, and Session Univer Worktree ownership.
- Sidebar `Univerfiles` and `Unavailable Univerfiles` hierarchy and status chips.
- Univer Artifact Header and its view model.
- Worktree Panel, recovery actions, Done grouping, and ownership-conflict handling.
- Settings UI, extension actions, read-only setup policy, and executable source priority.
- OpenWork artifact extraction, `OpenTarget`, confidence scoring, and source-document/tool metadata parsing.

These are not reusable cowork runtime contracts. Moving them would decrease locality and make `@univer/cowork` responsible for OpenWork product semantics.

## Optional Later Extractions

Two helpers may become worthwhile later, but should not block this change:

- `summarizeCoworkWorktreeStatus(snapshot)`: a compact pure summary for rows or panels that need working/review/conflict counts.
- `resolveCoworkContentView(snapshot, route, preferredView)`: a host-neutral route fallback helper for trunk, worktree, and merge-preview content view state.

Both should wait for either duplication inside OpenWork or a second host consumer.

## Validation

- `univer-cli/packages/cowork` tests should cover discovery limits/ignore rules, open handoff parsing and untrusted-origin rejection, bundle health/shim behavior, and daemon build-mismatch retry.
- OpenWork tests should prove behavior is unchanged after consumption: visible Univerfile discovery, `open_surface` response parsing, ignored local gateway URLs, sidebar grouping, and bundle setup status.
- Fraimz should use the canonical core Univer flow to prove `.univer` discovery and opening still work from the user's perspective after implementation.

## Risks

- If discovery returns workspace-relative paths, `@univer/cowork` starts owning host authorization policy. Return local facts and let OpenWork map paths.
- If handoff parsing accepts arbitrary URLs, OpenWork may expose unsafe local browser targets. The helper should reject non-loopback origins by default for local open handoffs.
- If bundle preparation writes automatically from a health check, setup status becomes mutating. Keep read-only checks and repair writes explicit at the OpenWork action layer.
- If daemon de-duplication hides failures globally, unrelated hosts could affect each other. Key de-duplication by executable path and runtime environment, and allow callers to scope or bypass it if needed.
