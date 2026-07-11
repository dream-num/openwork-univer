## 1. Compatibility Set and Registry Dependencies

- [x] 1.1 Add schema-versioned `univer.compatibility.json` with Cowork `0.1.0`, SDK cohort `1.0.0-insiders.20260710-c16bf68`, CLI `0.3.1`, npm integrity values, `v0.3.1` source commit `e9066dc0f266a9ba7a109b21008c146b9473f616`, canonical skill path/digest, and supported targets.
- [x] 1.2 Add typed compatibility-manifest parsing and validation without `any` or unchecked casts.
- [x] 1.3 Add a validator that compares the installed Cowork peer manifest, OpenWork package declarations, lock resolutions, npm integrity, skill provenance, and platform list with the compatibility set.
- [x] 1.4 Replace `apps/app`'s `@univer/cowork` local dependency and source imports with exact `@univerjs-pro/cowork@0.1.0` public entry points.
- [x] 1.5 Explicitly declare all required Cowork Univer SDK peers at the locked cohort, preserve semver-compatible React/RxJS declarations, and prove the lock graph has one SDK cohort.
- [x] 1.6 Add release guards that reject external Univer `link:`, `file:`, adjacent-checkout paths, implicit peer-only declarations, or mixed SDK versions while allowing OpenWork-owned `workspace:` dependencies.
- [x] 1.7 Regenerate `pnpm-lock.yaml` with pnpm and verify no sibling `univer-cli` path remains.

## 2. OpenWork Univer Host Runtime

- [x] 2.1 Create `apps/server/src/univer-runtime/` as the OpenWork-owned filesystem, process, shim, handoff, and distribution boundary.
- [x] 2.2 Port deterministic Visible Univerfile discovery, ignore rules, depth/entry limits, unreadable-directory behavior, and focused tests into the host module.
- [x] 2.3 Port structured `univer open --json` validation, expected-file matching, loopback-origin checks, optional route fields, and focused rejection tests into the host module.
- [x] 2.4 Port ordinary Node/Electron-as-Node executable shim generation and filesystem-mode tests into the host module.
- [x] 2.5 Port daemon start de-duplication, timeout/build-mismatch recovery, stop-and-retry-once behavior, failure merging, and concurrency tests into the host module.
- [x] 2.6 Rewire `apps/server/src/univer-targets.ts` and `apps/server/src/extensions/univer-cli.ts` to the OpenWork host module while preserving workspace authorization, read-only policy, API errors, and existing timeout-recovery work.
- [x] 2.7 Remove the server `@univer/cowork` local dependency, every `@univer/cowork/node` import, and the old Cowork bundle helper types without changing renderer Cowork behavior.
- [x] 2.8 Keep renderer handoff URL suppression on the Published Cowork SDK and update its focused tests for the renamed package.

## 3. Offline CLI and Skill Distribution

- [x] 3.1 Add private workspace package `@openwork/univer-runtime-distribution` with exact `univer-cli@0.3.1` as its only production runtime dependency.
- [x] 3.2 Add a pnpm `deploy --prod` preparation step that creates a clean generated CLI production closure for the current supported target.
- [x] 3.3 Add source-archive retrieval/cache keyed by the locked full `dream-num/univer-cli` commit, with no sibling-checkout or `dream-num/skills` fallback.
- [x] 3.4 Implement safe extraction of only `packages/skills/skills/univer-cli`, rejecting traversal and symlink entries and verifying required skill/reference/inspect-tool files.
- [x] 3.5 Implement the normalized skill tree SHA-256 algorithm, populate the locked digest, and add deterministic/mismatch tests.
- [x] 3.6 Generate `univer-distribution/` with compatibility/provenance metadata, pnpm-deployed CLI closure, and verified canonical skill payload.
- [x] 3.7 Update the executable target from the local `dist/bin/univer.js` layout to the published `node_modules/univer-cli/bin/univer.js` layout.
- [x] 3.8 Replace Electron's Cowork vendor staging, curated native copy list, and compiled `@univer/cowork/node` import patching with the generated distribution resource.
- [x] 3.9 Add packaged-distribution inspection that distinguishes immutable payload corruption from repairable shim or workspace skill projection drift.

## 4. Setup, Resolution, Repair, and Version UX

- [x] 4.1 Change executable resolution order to explicit `OPENWORK_UNIVER_EXECUTABLE`, then the installed compatibility set, then unresolved; remove implicit system `PATH` and adjacent-checkout resolution.
- [x] 4.2 Report explicit executable selection as a Development Univer Executable Override and keep it outside compatibility-set provenance while retaining capability health checks.
- [x] 4.3 Change desktop setup and repair to materialize the shim and complete workspace skill from packaged offline resources without registry or GitHub access.
- [x] 4.4 Change standalone explicit setup/repair to retrieve only the exact package and source commit in its shipped compatibility manifest and verify integrity/digest before use.
- [x] 4.5 Remove `univer-cli@latest` installation, registry-latest comparison, automatic component updates, and independent managed update actions.
- [x] 4.6 Update extension status and UI copy to display compatibility identity, Cowork/CLI versions, skill source commit, executable source/path, supported platform, health, and repair state.
- [x] 4.7 Preserve `OPENWORK_UNIVER_BIN` and managed OpenCode PATH injection so agents invoke the verified shim without shell startup changes.
- [x] 4.8 Update extension manifest resource descriptions from a Cowork-owned bundle to the Offline-Ready Univer Distribution and canonical source-owned skill.

## 5. Native Closure and Supported Release Matrix

- [x] 5.1 Replace native package assembly allowlists with validation of the pnpm-deployed production graph.
- [x] 5.2 Add supported-target probes for libsql, UEX, formula binding, and Doc Typst binding entry points plus CLI version/help, inspect tools, and SaC migration templates.
- [x] 5.3 Run packaged runtime probes with registry/GitHub access unavailable and prove first-use Ready does not spawn a package installation command.
- [x] 5.4 Update release review to validate compatibility-set agreement, complete native closure, exact provenance, peer cohort singleton resolution, and absence of local protocols.
- [x] 5.5 Remove macOS x64 from stable/alpha build matrices, artifact upload/expectation lists, release manifests, and release-status checks.
- [x] 5.6 Remove macOS x64 updater/download selection and migration documentation, and add an explicit unsupported-platform failure for attempted `darwin-x64` Univer packaging.
- [x] 5.7 Preserve and verify release jobs for macOS ARM64, Linux x64, Linux ARM64, and Windows x64.

## 6. Documentation and Superseded Planning

- [ ] 6.1 Update README, setup, packaging, release, and developer documentation to describe registry-backed packages, the compatibility set, offline first use, explicit override, and supported platforms.
- [ ] 6.2 Reconcile active/completed OpenSpec text that still names `@univer/cowork`, `@univer/cowork/node`, Cowork-owned bundle resources, `dream-num/skills` as SSOT, system fallback, or `univer-cli@latest` updates.
- [x] 6.3 Keep ADR-0002, ADR-0003, ADR-0004, and ADR-0020 marked superseded and verify ADR-0021 through ADR-0026 match the implemented result.
- [x] 6.4 Update package/release examples to use pnpm only and document exact prefetch/reproduction commands when a source archive is not cached.

## 7. Verification and Fraimz Evidence

- [x] 7.1 Run focused compatibility-manifest, peer-cohort, no-local-protocol, skill extraction/digest, production deployment, and platform-closure tests.
- [x] 7.2 Run focused OpenWork server tests for discovery, handoff security, shim generation, daemon timeout/build-mismatch retry, setup, repair, and explicit override behavior.
- [x] 7.3 Run focused renderer tests for Cowork controller/viewer behavior, handoff URL suppression, artifact header, worktree review, merge preview, and package rename.
- [x] 7.4 Run `pnpm --filter openwork-server typecheck`, `pnpm --filter openwork-server test`, `pnpm --filter @openwork/app typecheck`, and the applicable desktop package tests.
- [x] 7.5 Build the Electron app and run release review against the generated Offline-Ready Univer Distribution on the implementation platform.
- [ ] 7.6 Obtain green supported-platform CI evidence for macOS ARM64, Linux x64, Linux ARM64, and Windows x64 before publishing.
- [x] 7.7 Drive the packaged app through first-use Univer setup with package-network access disabled and open a real `.univer` target in the Cowork Content Viewer.
- [x] 7.8 Produce `evals/results/<run-id>/fraimz.html` with observable assertions and validated screenshots for offline Ready and the opened native Univer surface; report `Incomplete` unless every claim is backed.
- [ ] 7.9 Run `openspec validate adopt-published-univer-distribution --strict`, `openspec validate --all --strict`, and `git diff --check` after documentation reconciliation.
