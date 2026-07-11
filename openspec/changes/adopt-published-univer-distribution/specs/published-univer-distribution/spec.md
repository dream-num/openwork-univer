## ADDED Requirements

### Requirement: OpenWork owns one exact Univer Compatibility Set

OpenWork SHALL maintain one checked-in, schema-versioned Univer Compatibility Set that binds the Published Cowork SDK, its complete Univer SDK Peer Cohort, the Published Univer CLI Runtime, the canonical skill source revision and tree digest, package integrity, and Supported Univer Desktop Platforms.

#### Scenario: Compatibility set identifies every input

- **WHEN** a maintainer or release job reads the compatibility manifest
- **THEN** it SHALL identify exact Cowork and CLI package names, versions, and integrity values
- **AND** it SHALL identify the exact Univer SDK peer cohort
- **AND** it SHALL identify the `dream-num/univer-cli` source tag, full commit, canonical skill path, and normalized skill tree digest
- **AND** it SHALL list every supported operating-system and architecture target

#### Scenario: Declared inputs drift from the set

- **WHEN** a package manifest, installed package, lockfile resolution, staged resource, skill tree, or supported-platform list disagrees with the compatibility manifest
- **THEN** validation SHALL fail with the mismatched component and expected value
- **AND** OpenWork SHALL NOT report that distribution as compatible or release-ready

#### Scenario: Tracked external local dependency is introduced

- **WHEN** release validation finds a Univer dependency using `link:`, `file:`, an adjacent checkout path, or another local external protocol
- **THEN** validation SHALL fail
- **AND** ordinary `workspace:` links between packages owned by this OpenWork workspace SHALL remain allowed

### Requirement: Published Cowork consumption respects the browser-safe package boundary

OpenWork SHALL consume Cowork UI and headless APIs from the exact Published Cowork SDK and SHALL NOT require an unpublished `./node` entry point or Cowork-owned CLI/skill resources.

#### Scenario: Renderer consumes Cowork

- **WHEN** OpenWork builds the application renderer
- **THEN** Cowork imports SHALL resolve from `@univerjs-pro/cowork` and its documented public subpaths
- **AND** no source import SHALL reference `@univer/cowork` or `@univerjs-pro/cowork/node`

#### Scenario: Server prepares local Univer runtime behavior

- **WHEN** the OpenWork server discovers Univerfiles, validates an open handoff, prepares a shim, starts a daemon, or inspects the distribution
- **THEN** it SHALL use OpenWork-owned host modules
- **AND** it SHALL NOT resolve those operations from the Published Cowork SDK

### Requirement: Cowork peers resolve as one explicit SDK cohort

OpenWork SHALL explicitly declare and resolve every required `@univerjs/*` and `@univerjs-pro/*` peer of the Published Cowork SDK as one compatible cohort without duplicate SDK versions.

#### Scenario: Peer cohort is valid

- **WHEN** dependency validation compares the installed Cowork peer manifest with OpenWork declarations and lock state
- **THEN** every required Univer peer SHALL be explicitly declared at the compatibility-set cohort
- **AND** React and RxJS SHALL satisfy their published peer ranges
- **AND** the resolved graph SHALL contain no second Univer SDK cohort

#### Scenario: Peer is missing or mixed

- **WHEN** a required Univer peer is absent, resolves only through implicit peer auto-install, or resolves to a different cohort
- **THEN** dependency and release validation SHALL fail before renderer packaging

### Requirement: Desktop distribution is offline-ready

OpenWork SHALL package the locked CLI production dependency closure and verified canonical skill as an Offline-Ready Univer Distribution outside `app.asar`.

#### Scenario: First use has no network

- **WHEN** a user opens the Univer CLI Extension for the first time with npm and GitHub unavailable
- **THEN** OpenWork SHALL resolve the packaged CLI and complete skill
- **AND** required setup health checks SHALL run without downloading or updating a component
- **AND** successful checks SHALL allow the extension to report Ready

#### Scenario: Packaged provenance is inspected

- **WHEN** OpenWork checks the packaged distribution
- **THEN** it SHALL verify the embedded compatibility identity, CLI package version and integrity, skill source commit and digest, and current platform
- **AND** it SHALL distinguish package corruption from a repairable writable shim or workspace skill projection

### Requirement: Canonical skill comes from the locked univer-cli source

OpenWork SHALL stage the canonical skill only from `dream-num/univer-cli/packages/skills/skills/univer-cli` at the full source commit locked by the Univer Compatibility Set.

#### Scenario: Build extracts the skill

- **WHEN** release preparation assembles the skill payload
- **THEN** it SHALL retrieve or reuse a cached source archive addressed by the locked full commit
- **AND** it SHALL extract only the canonical skill subtree
- **AND** it SHALL reject traversal paths and symlinks
- **AND** it SHALL verify required files and the normalized tree digest before staging

#### Scenario: Mirror differs or is unavailable

- **WHEN** `dream-num/skills` is unavailable, has not merged the release sync, or contains different content
- **THEN** OpenWork build and runtime behavior SHALL remain determined by the locked `dream-num/univer-cli` source
- **AND** the mirror SHALL NOT be used as a fallback build input

### Requirement: Runtime staging follows the production dependency closure

OpenWork SHALL assemble the Published Univer CLI Runtime from a lockfile-driven pnpm production deployment instead of copying a curated transitive dependency allowlist.

#### Scenario: CLI gains a production dependency

- **WHEN** the locked `univer-cli` package declares a new production or target-applicable optional dependency
- **THEN** the deployed runtime SHALL include it without adding the package name to a manual copy list
- **AND** release validation SHALL exercise its required runtime entry point

#### Scenario: Native capability closure is checked

- **WHEN** a supported-platform distribution is prepared
- **THEN** validation SHALL prove that target-native libsql, UEX, formula, and Doc Typst components load from the packaged resource
- **AND** it SHALL prove that `univer` version/help, inspect tool listing, and SaC migration template listing succeed from that resource

### Requirement: Supported platform matrix is explicit

OpenWork SHALL publish the Offline-Ready Univer Distribution for macOS ARM64, Linux x64, Linux ARM64, and Windows x64, and SHALL exclude macOS x64.

#### Scenario: Supported target is released

- **WHEN** a release job builds a Supported Univer Desktop Platform
- **THEN** it SHALL assemble that target's optional native dependency closure
- **AND** the target-specific packaged runtime checks SHALL pass before its artifact is published

#### Scenario: macOS x64 build is requested

- **WHEN** release or packaging configuration requests a macOS x64 Univer distribution
- **THEN** the build SHALL fail with an explicit unsupported-platform result
- **AND** no macOS x64 desktop artifact or updater entry SHALL be published

### Requirement: Repair and upgrades preserve compatibility-set atomicity

OpenWork SHALL repair the installed release's Univer Compatibility Set as a unit and SHALL NOT update Cowork, SDK peers, CLI, or skill independently on a user machine.

#### Scenario: User repairs desktop setup

- **WHEN** the packaged distribution is valid but the writable shim or workspace skill projection is missing or damaged
- **THEN** repair SHALL restore those files from the packaged compatibility set
- **AND** it SHALL NOT query registry `latest` or the skill mirror

#### Scenario: Standalone server retrieves missing inputs

- **WHEN** a standalone server has no embedded desktop resource and the user explicitly requests setup or repair
- **THEN** it MAY retrieve only the exact package and source inputs recorded in its shipped compatibility manifest
- **AND** it SHALL verify package integrity and the skill tree digest before use

#### Scenario: Developer selects an override

- **WHEN** `OPENWORK_UNIVER_EXECUTABLE` explicitly names an existing CLI executable
- **THEN** OpenWork SHALL identify it as a Development Univer Executable Override
- **AND** it SHALL run capability health checks without claiming compatibility-set provenance
- **AND** no implicit system `PATH` or adjacent-checkout fallback SHALL be attempted

#### Scenario: Maintainer adopts an upstream release

- **WHEN** OpenWork upgrades Cowork, its SDK peers, CLI, or the canonical skill revision
- **THEN** the manifest, package declarations, lockfile, integrity, digest, tests, and supported-platform evidence SHALL be updated and validated in one OpenWork change

### Requirement: Observable packaged experience has fraimz proof

OpenWork SHALL validate the user-visible packaged Univer experience with fraimz in addition to package and process checks.

#### Scenario: Packaged flow is accepted

- **WHEN** the migration is reported as Passed
- **THEN** `evals/results/<run-id>/fraimz.html` SHALL show first-use setup becoming Ready without network package retrieval
- **AND** it SHALL show a real `.univer` target opening in the Cowork Content Viewer
- **AND** every frame claim SHALL have an observable assertion and validated screenshot
