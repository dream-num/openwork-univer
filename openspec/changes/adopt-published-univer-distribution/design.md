## Context

The linked development package currently collapses four different concerns into `@univer/cowork`:

- browser/headless Cowork state and viewer APIs;
- Node filesystem, process, shim, and handoff helpers;
- a locally built Univer CLI tree plus selected production dependencies;
- a skill snapshot reached through the sibling `univer-cli` checkout.

The stable artifacts no longer share that shape. `@univerjs-pro/cowork@0.1.0` deliberately publishes only browser-safe root, gateway, React, and viewer entry points. `univer-cli@0.3.1` publishes the `univer` bin and its runtime files, but not the source-owned skill tree. The canonical skill now lives in `dream-num/univer-cli/packages/skills/skills/univer-cli`; the `dream-num/skills` repository is updated later by the CLI release sync workflow.

The published Cowork package also requires one exact Univer SDK peer cohort (`1.0.0-insiders.20260710-c16bf68`). OpenWork currently declares 54 Univer peers from the older `20260629-12f2e44` cohort and omits 22 peers required by the published viewer. The CLI production graph now includes Doc Typst native bindings that the current curated desktop copy list does not stage.

The supported release targets for this change are macOS ARM64, Linux x64, Linux ARM64, and Windows x64. Required UEX and formula packages are not published for macOS x64, and the product decision is to remove that target instead of shipping a partial Univer experience.

## Goals / Non-Goals

**Goals:**

- Make every tracked Univer dependency registry-backed and exactly versioned.
- Define one reviewable source of truth for Cowork, SDK peers, CLI, skill, integrity, and supported platforms.
- Preserve the current Cowork Content Viewer and Univer worktree experience while changing dependency provenance.
- Ship a desktop distribution that reaches Ready and opens a `.univer` file without network access on first use.
- Stage the real `univer-cli` production dependency graph instead of a hand-maintained native package list.
- Keep filesystem and process ownership in an OpenWork server module and preserve current error, timeout, retry, and read-only behavior.
- Make upgrades and repair restore a tested compatibility set rather than independently updating one component.

**Non-Goals:**

- Add a `./node` export or runtime resources to the published Cowork SDK.
- Change `dream-num/skills` synchronization or make that mirror an OpenWork build input.
- Put the canonical skill into the `univer-cli` npm package as part of this change.
- Change `.univer` session binding, worktree ownership, header, viewer, merge, or discard semantics.
- Restore macOS x64 support through emulation or a partial feature set.
- Provide local-path overrides for Cowork or skill content.

## Decisions

### Decision 1: Add an OpenWork-owned compatibility manifest

Add a checked-in `univer.compatibility.json` with schema version 1. Its initial set records:

- `@univerjs-pro/cowork` version `0.1.0` and npm integrity;
- the expected Univer SDK peer cohort version and a digest of the Cowork peer manifest;
- `univer-cli` version `0.3.1` and npm integrity;
- source repository `dream-num/univer-cli`, source tag `v0.3.1`, and full commit `e9066dc0f266a9ba7a109b21008c146b9473f616`;
- skill path `packages/skills/skills/univer-cli` and a normalized SHA-256 tree digest;
- supported targets `darwin-arm64`, `linux-x64-gnu`, `linux-arm64-gnu`, and `win32-x64-msvc`.

The normalized skill digest hashes a sorted manifest of `<file sha256><two spaces><POSIX relative path>` entries, then hashes that manifest. Archive timestamps, owners, directory entries, and compression do not affect the result.

Release review validates that package manifests, installed package metadata, the pnpm lockfile, staged resources, and runtime status all agree with this file. The lockfile remains the package manager's resolution record; it is not the semantic compatibility source of truth.

Alternative considered: rely only on `package.json` and `pnpm-lock.yaml`. Those files cannot identify the canonical skill source revision/tree or the supported runtime matrix, and they do not express that independent update is forbidden.

### Decision 2: Consume Cowork only through its published browser-safe contract

`apps/app` changes all `@univer/cowork` imports to `@univerjs-pro/cowork` and declares version `0.1.0` exactly. It explicitly declares every required `@univerjs/*` and `@univerjs-pro/*` peer at the Cowork-required cohort; React and RxJS are validated semantically against their peer ranges. Release review rejects missing peers, mixed Univer cohorts, duplicate SDK instances, and peer auto-install as the only declaration source.

`apps/server` removes its local Cowork dependency. The OpenWork Univer CLI Adapter keeps or receives the small pure handoff validation it needs and no longer imports `@univer/cowork/node`. The renderer continues using the published root handoff recognizer where it already consumes the Cowork SDK.

Alternative considered: declare the published Cowork package in the server and use its root handoff parser. That parser is public and browser-safe, but making the compiled server load the full peer-bearing renderer package complicates Electron server dependency staging for one small pure contract. Keeping server validation local maintains a deeper host module and a smaller server runtime boundary.

### Decision 3: Move unpublished Node helpers into an OpenWork host module

Create a focused module under `apps/server/src/univer-runtime/` for:

- deterministic Visible Univerfile discovery and ignore/limit policy;
- `univer open --json` validation and loopback-origin enforcement;
- executable shim creation for ordinary Node and Electron-as-Node;
- daemon start de-duplication, timeout/build-mismatch recovery, stop, and one retry;
- compatibility manifest and staged distribution inspection.

`apps/server/src/extensions/univer-cli.ts` remains the product adapter: workspace authorization, read-only policy, extension action shapes, status copy, explicit override handling, API errors, and managed runtime environment injection stay there. The host module must not acquire session, sidebar, artifact, or settings concepts.

Alternative considered: wait for another Cowork release containing `./node`. The Cowork publisher explicitly verifies that the stable distribution is browser-only, so waiting would reverse the accepted package boundary and keep OpenWork linked in the meantime.

### Decision 4: Use a pnpm production deployment for the CLI closure

Add a small private workspace staging package, `@openwork/univer-runtime-distribution`, whose only runtime dependency is the exact `univer-cli` version from the compatibility manifest. Desktop preparation runs `pnpm deploy --prod` for that package into a generated staging directory and packages the resulting production `node_modules` outside `app.asar`.

The staged CLI entry is `node_modules/univer-cli/bin/univer.js`, matching the published package. The executable shim invokes that entry with the packaged Node runtime or Electron with `ELECTRON_RUN_AS_NODE=1`. The distribution includes the package-manager-resolved optional native dependency for the target platform and does not copy packages from sibling repository stores.

The existing curated functions for libsql, UEX, and formula packages are removed. Validation walks the deployed production graph and checks runtime entry points rather than maintaining a second dependency list. Focused assertions still require platform-native libsql, UEX, formula, and Doc Typst components because they are critical capabilities, but those assertions do not assemble the closure.

Alternative considered: keep copying a known package allowlist. That list already omits the Doc Typst binding introduced by `univer-cli@0.3.1` and must be edited whenever the CLI changes its production dependencies.

### Decision 5: Extract the skill from the locked CLI source commit

A preparation script downloads or reuses a cache of the public `dream-num/univer-cli` source archive addressed by the full compatibility-set commit. It extracts only `packages/skills/skills/univer-cli`, rejects symlinks and paths outside that tree, verifies required files (`SKILL.md`, references, and inspect tool manifest), computes the normalized tree digest, and stages the result beside the CLI runtime.

The release artifact records source repository, tag, commit, path, and digest. The build never reads `../univer-cli`, `../skills`, or `dream-num/skills`. A cached archive is acceptable only when it produces the locked digest; otherwise preparation fails with the exact prefetch command.

Alternative considered: extract from `dream-num/skills`. That repository is a release-synchronized mirror, so it can lag the source release and cannot prove that runtime code and guidance came from the same CLI revision.

### Decision 6: Package one offline distribution and repair from it

Electron packages one generated resource root, `univer-distribution/`, containing:

- a copy of the compatibility manifest plus resolved provenance;
- the pnpm-deployed CLI runtime and production dependency closure;
- the verified canonical skill tree.

On first use, setup verifies the packaged resource, writes or repairs only the writable executable shim and workspace skill projection, and runs the required health probes. It does not contact npm or GitHub. Repair restores the same packaged set; corruption of the immutable packaged payload is an application installation failure, not permission to fetch `latest`.

A standalone server distribution without embedded desktop resources may retrieve the exact npm package and exact source commit recorded in its shipped compatibility manifest during an explicit setup/repair action. It must verify the same integrity and tree digest and must not query or install registry `latest`.

Alternative considered: keep the current first-use managed install and update buttons. That violates offline first use and permits a CLI version that was not tested with the shipped Cowork SDK and skill.

### Decision 7: Allow only an explicit executable development override

Resolution order becomes:

1. `OPENWORK_UNIVER_EXECUTABLE`, when explicitly set;
2. the packaged or managed copy of the current Univer Compatibility Set;
3. unresolved.

There is no implicit system `PATH` or adjacent-checkout fallback. Status identifies the explicit path as a development override, runs normal capability probes, and does not claim compatibility-set provenance. Release validation runs with override variables cleared and rejects tracked external `link:` or `file:` dependency protocols.

### Decision 8: Make the platform matrix a release contract

Each supported target assembles its own pnpm deployment so optional native packages match the target. Release validation requires CLI version/help, inspect tool listing, SaC migration template listing, and focused native loading probes from the packaged resource with network access unavailable.

macOS x64 is removed from workflow matrices, artifact expectations, updater/download selection, migration documentation, and release review. An attempted `darwin-x64` Univer distribution build exits with an explicit unsupported-platform error instead of emitting an incomplete artifact.

### Decision 9: Upgrade only through an OpenWork compatibility-set change

The Univer extension reports the installed compatibility-set identity and component versions. It may report that a newer OpenWork release exists, but it does not offer independent Cowork, CLI, SDK, or skill updates. A future upstream release is adopted by changing the manifest, package declarations, lockfile, peer cohort, source/digest, tests, and platform evidence in one PR.

## Risks / Trade-offs

- [Risk] Explicitly declaring the full SDK peer cohort increases manifest size and upgrade diff size. → Validate/generate the declarations from the installed Cowork peer manifest and review the cohort as one mechanical block.
- [Risk] Source archive availability can block release preparation. → Cache by full commit, verify the normalized skill digest, and make prefetch a distinct release step; runtime first use remains offline.
- [Risk] `pnpm deploy` is experimental in pnpm 11.4.0. → Pin pnpm through the repository packageManager field, cover the deployed layout with contract tests, and fail if the CLI bin or production closure shape changes.
- [Risk] Packaged runtime size grows when the full real dependency closure replaces pruning. → Measure the artifact delta, rely on target-specific optional dependency resolution, and optimize only after correctness evidence identifies removable files.
- [Risk] Porting Node helpers can regress timeout, retry, or path security behavior. → Port focused upstream tests before deleting the linked entry point and retain workspace containment and loopback-origin tests in OpenWork.
- [Risk] Removing macOS x64 can leave stale updater or documentation paths. → Treat x64 asset absence as a release-review assertion and search workflow, updater, migration, and documentation surfaces as an explicit task.
- [Risk] Existing completed OpenSpec changes describe the retired package boundary. → Reconcile those artifacts and supersede their ADRs in the same change so future work does not revive `@univer/cowork/node` or `@latest` installation.

## Migration Plan

1. Add and validate the compatibility manifest, peer-cohort checks, skill digest algorithm, and no-local-protocol guard without changing runtime selection.
2. Pin the published Cowork SDK and full peer cohort, rename renderer imports, and verify the existing viewer behavior.
3. Port Node host helpers and focused tests into the OpenWork server, then remove the server local Cowork dependency and `./node` imports.
4. Add the exact CLI staging package, pnpm deployment, source-commit skill extraction, and generated offline resource layout.
5. Switch setup/status/shim logic from the Cowork bundle manifest to the OpenWork distribution manifest; remove system fallback and independent updates.
6. Update Electron packaging, release review, supported workflow matrix, updater assets, and docs; delete the old Cowork vendor/patch path.
7. Run package, server, renderer, packaged-runtime, supported-platform, and fraimz validation before marking the change complete.

Rollback is an OpenWork release rollback: reinstall the prior application artifact and its prior compatibility set. The change does not migrate `.univer` files, worktrees, sessions, or runtime databases. Rollback must not restore a sibling-repository link on a release branch.

## Open Questions

None. Package ownership, offline behavior, atomic upgrades, skill source, extraction method, supported platforms, peer cohort, and development overrides were resolved during the design grilling session.
