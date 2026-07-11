## Why

OpenWork currently resolves `@univer/cowork`, its Node host helpers, the Univer CLI runtime, and the canonical skill through a sibling `../univer-cli` checkout. Now that `@univerjs-pro/cowork@0.1.0` and `univer-cli@0.3.1` are published, the local links make clean installs, CI, release builds, and dependency provenance less reproducible than the available stable distribution path.

The published package boundaries also differ from the linked development bundle: Cowork is intentionally browser-only, the CLI is a separate npm package, and the canonical skill is source-owned by `dream-num/univer-cli` before being mirrored to `dream-num/skills`. OpenWork needs a release-owned compatibility contract instead of preserving the unpublished `@univer/cowork/node` and Cowork bundle assumptions.

## What Changes

- Replace tracked `@univer/cowork` local links and imports with the exact published `@univerjs-pro/cowork@0.1.0` browser SDK where Cowork UI/runtime APIs are consumed.
- Remove the server dependency on unpublished Cowork Node helpers and keep Univerfile discovery, executable shims, daemon lifecycle, handoff validation, provisioning, and OpenWork error policy inside the OpenWork Univer CLI Adapter.
- Introduce one checked-in Univer Compatibility Set that locks the Cowork version, its complete single-instance Univer SDK peer cohort, `univer-cli@0.3.1`, the matching `dream-num/univer-cli` source tag/full commit, and a normalized canonical skill tree digest.
- Build an Offline-Ready Univer Distribution from the compatibility set so desktop first use and required health checks do not access npm, GitHub, or `dream-num/skills`.
- Extract the canonical skill from `dream-num/univer-cli/packages/skills/skills/univer-cli` at the locked source commit and treat `dream-num/skills` only as a downstream release mirror.
- Replace the curated native-package copy list with production dependency-closure staging and platform-specific closure validation, including Doc Typst native dependencies.
- Make repair restore the installed OpenWork release's compatibility set and remove independent `univer-cli@latest` update behavior.
- Retain `OPENWORK_UNIVER_EXECUTABLE` as an explicit development-only override while removing implicit system `PATH`, adjacent checkout, `link:`, and `file:` fallbacks.
- **BREAKING**: remove macOS x64 from the supported and published desktop matrix; macOS ARM64, Linux x64/ARM64, and Windows x64 remain required release targets.
- **BREAKING**: retire the unpublished `@univer/cowork/node` Cowork Host Contract and the Cowork-owned CLI/skill bundle manifest.

## Capabilities

### New Capabilities

- `published-univer-distribution`: Lock, assemble, verify, repair, and release the published Cowork SDK, Univer SDK peer cohort, CLI runtime, canonical skill, and native dependency closure as one offline-ready distribution.

### Modified Capabilities

- `native-univer-office-surface`: Consume the Published Cowork SDK under `@univerjs-pro/cowork` while preserving the existing native viewer and review experience.
- `univer-extension-installation`: Prefer the offline compatibility-set distribution, source the skill from `dream-num/univer-cli`, constrain repair to the release lock, and allow only an explicit development executable override.
- `univer-cowork-host-contracts`: Remove the previously specified Cowork Node/bundle ownership and return those responsibilities to the OpenWork host adapter.

## Impact

- Dependency manifests and lock state: `apps/app/package.json`, `apps/server/package.json`, `apps/desktop/package.json`, `pnpm-lock.yaml`, and a new compatibility-set manifest.
- Renderer imports and tests under `apps/app` that currently reference `@univer/cowork`.
- Server Univer integration under `apps/server/src/extensions/univer-cli.ts`, `apps/server/src/univer-targets.ts`, and focused tests for discovery, handoff parsing, shim, daemon, setup, and repair behavior.
- Electron build resources and release validation under `apps/desktop`, `scripts/release`, and GitHub release workflows.
- Release/update behavior, including removal of macOS x64 assets and independent CLI updates.
- Domain vocabulary and decisions in `CONTEXT.md` and ADR-0021 through ADR-0026, including superseded ADR-0002, ADR-0003, ADR-0004, and ADR-0020.
- Existing OpenSpec artifacts that still describe `@univer/cowork`, `dream-num/skills` as the source of truth, managed `@latest` installation, or Cowork-owned Node host contracts.
