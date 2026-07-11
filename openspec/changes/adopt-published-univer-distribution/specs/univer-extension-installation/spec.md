## MODIFIED Requirements

### Requirement: Extension actions keep setup and surface handoff narrow

OpenWork SHALL expose setup status, materialization, retry, repair, and native surface handoff actions without exposing independent component update or semantic office workflow actions as generic extension actions.

#### Scenario: Setup actions are listed

- **WHEN** OpenWork lists setup-oriented Univer CLI Extension actions
- **THEN** the listed actions SHALL cover setup status, materialization, retry, or repair of the installed compatibility set
- **AND** they SHALL NOT offer an independent Cowork, SDK, CLI, or skill update action

#### Scenario: Surface handoff is listed

- **WHEN** OpenWork needs to embed a native `.univer` artifact
- **THEN** the extension SHALL expose an `open_surface` handoff action that returns structured local collab gateway fields for the embedded host

#### Scenario: Workflow actions are deferred

- **WHEN** setup and embedded surface implementation is complete
- **THEN** OpenWork SHALL NOT expose `univer` import, export, inspect, apply, verify, or arbitrary open workflow actions as extension setup actions

### Requirement: Extension readiness requires complete setup

OpenWork SHALL report the Univer CLI Extension as Ready only when the complete canonical skill is available, the resolved `univer` executable is available, and required health checks pass for the active workspace/runtime.

#### Scenario: Compatibility-set setup is ready

- **WHEN** packaged or managed inputs match the installed Univer Compatibility Set, the complete skill is available, the executable is resolved, and required health checks pass
- **THEN** OpenWork SHALL report the extension as Ready with compatibility-set provenance

#### Scenario: Development override is healthy

- **WHEN** an explicit Development Univer Executable Override and complete skill pass required health checks
- **THEN** OpenWork MAY report the extension as operational for development
- **AND** it SHALL identify that the executable is outside compatibility-set provenance

#### Scenario: Partial setup stays incomplete

- **WHEN** only some required setup parts or health checks succeed
- **THEN** OpenWork SHALL report successful parts as diagnostics and keep the extension incomplete

### Requirement: Extension installs complete skill package

OpenWork SHALL materialize the complete canonical `univer-cli` skill extracted from the locked `dream-num/univer-cli` source revision, preserving `SKILL.md`, references, managed inspect tool resources, and other required package files.

#### Scenario: Packaged skill is materialized

- **WHEN** desktop setup prepares the skill for a workspace
- **THEN** `.opencode/skills/univer-cli/SKILL.md` SHALL exist
- **AND** package-local references and inspect tools SHALL be preserved under the same skill directory
- **AND** setup SHALL use the skill payload verified by the packaged compatibility manifest

#### Scenario: Standalone skill is retrieved

- **WHEN** an explicit standalone setup retrieves the canonical skill
- **THEN** it SHALL use the exact `dream-num/univer-cli` full commit, source path, and tree digest in the shipped compatibility manifest
- **AND** it SHALL NOT retrieve from `dream-num/skills`, an adjacent checkout, or a generic hub mirror

#### Scenario: Single-file skill installation is insufficient

- **WHEN** a setup path can write only a single `SKILL.md`
- **THEN** OpenWork MUST NOT report the Univer skill package as complete

### Requirement: Extension provisions executable

OpenWork SHALL resolve the `univer` executable from the installed OpenWork release's Offline-Ready Univer Distribution by default, with an explicitly configured Development Univer Executable Override as the only alternate source.

#### Scenario: Packaged executable is preferred

- **WHEN** desktop setup runs without an explicit override
- **THEN** OpenWork SHALL prepare a writable shim targeting the packaged `univer-cli` bin from the installed compatibility set
- **AND** it SHALL NOT run a first-use registry installation

#### Scenario: Standalone executable is prepared

- **WHEN** a standalone server explicitly prepares an absent managed executable
- **THEN** it SHALL retrieve and verify the exact `univer-cli` package recorded in its compatibility manifest
- **AND** it SHALL record a shim to that verified package bin

#### Scenario: Explicit override is selected

- **WHEN** `OPENWORK_UNIVER_EXECUTABLE` identifies an existing executable
- **THEN** OpenWork SHALL use it as a Development Univer Executable Override
- **AND** it SHALL report its path, detected version, and health without overwriting it

#### Scenario: No implicit fallback is available

- **WHEN** neither the compatibility-set executable nor an explicit override resolves
- **THEN** OpenWork SHALL report setup as incomplete
- **AND** it SHALL NOT search system `PATH` or an adjacent `univer-cli` checkout

### Requirement: Extension reports compatibility and repairs locked versions

OpenWork SHALL show the resolved executable source, component versions, skill revision, compatibility-set identity, and health, and SHALL repair only the set selected by the installed OpenWork release.

#### Scenario: Compatibility metadata is displayed

- **WHEN** OpenWork checks Univer CLI setup
- **THEN** the extension page SHALL show the executable source and path, detected CLI version, expected CLI and Cowork versions, skill source commit, supported platform, and compatibility status

#### Scenario: User repairs setup

- **WHEN** the user requests repair
- **THEN** OpenWork SHALL restore writable runtime and skill projections from the installed compatibility set or its exact verified standalone inputs
- **AND** it SHALL rerun required health checks

#### Scenario: Independent update is requested

- **WHEN** a caller attempts to update only the CLI, Cowork SDK, SDK peers, or skill to an upstream latest version
- **THEN** OpenWork SHALL reject or omit that action
- **AND** it SHALL direct upgrades through an OpenWork compatibility-set release

### Requirement: Installer verifies runtime capabilities

OpenWork SHALL verify package provenance and key Univer runtime capabilities after setup.

#### Scenario: Health check succeeds

- **WHEN** OpenWork runs the Univer health check after compatibility-set setup
- **THEN** it SHALL verify the executable responds to version or help
- **AND** it SHALL verify the complete skill package and expected provenance
- **AND** it SHALL verify `univer inspect tools list --json` and `univer sac migration templates --json` succeed

#### Scenario: Health check fails

- **WHEN** provenance, package integrity, skill completeness, executable capability, inspect tools, or migration templates fail validation
- **THEN** OpenWork SHALL report the failed capability with repair detail and keep the extension incomplete

#### Scenario: Installer health check stays lightweight

- **WHEN** OpenWork evaluates installer readiness
- **THEN** it MUST NOT require creating a real `.univer` target or running SaC apply/verify as part of the installer health check
