## ADDED Requirements

### Requirement: Extension exposes Univer setup
OpenWork SHALL provide a Univer CLI Extension that presents Univer setup, status, and retry actions as part of the extension installation experience.

#### Scenario: Extension id and display name are stable
- **WHEN** OpenWork registers the built-in Univer integration
- **THEN** the extension id is `univer-cli` and the display name is `Univer CLI`

#### Scenario: User opens the Univer extension
- **WHEN** a user views the Univer CLI Extension in OpenWork
- **THEN** OpenWork displays whether the `univer` executable and `univer-cli` skill package are installed for the active workspace

#### Scenario: User retries setup
- **WHEN** a previous Univer setup attempt fails and the user retries from the extension
- **THEN** OpenWork runs the setup checks again and reports the current executable and skill package status

### Requirement: Extension actions keep setup and surface handoff narrow
OpenWork SHALL expose setup status, install, retry, repair, managed update, and native surface handoff actions without exposing semantic office workflow actions as generic extension actions.

#### Scenario: Setup actions are listed
- **WHEN** OpenWork lists setup-oriented Univer CLI Extension actions
- **THEN** the listed actions cover setup status, install, retry, repair, or managed update

#### Scenario: Surface handoff is listed
- **WHEN** OpenWork needs to embed a native `.univer` artifact
- **THEN** the extension exposes an `open_surface` handoff action that returns a local collab-client URL for the embedded host

#### Scenario: Workflow actions are deferred
- **WHEN** the setup and embedded surface implementation is complete
- **THEN** OpenWork does not expose `univer` import, export, inspect, apply, verify, or arbitrary open workflow actions as extension actions

### Requirement: Extension readiness requires complete setup
OpenWork SHALL report the Univer CLI Extension as ready only when the complete skill package is installed, the resolved `univer` executable is available, and required health checks pass for the active workspace/runtime.

#### Scenario: Complete setup is ready
- **WHEN** the complete skill package is installed, the resolved executable is available, and required health checks pass
- **THEN** OpenWork reports the Univer CLI Extension as ready

#### Scenario: Partial setup stays incomplete
- **WHEN** only some setup parts succeed
- **THEN** OpenWork reports the successful parts as diagnostics and keeps the Univer CLI Extension incomplete

### Requirement: Extension installs complete skill package
OpenWork SHALL install the `univer-cli` skill from `dream-num/skills` as a complete skill package, preserving `SKILL.md`, references, managed inspect tool resources, and other package files needed by the skill.

#### Scenario: Skill package is installed
- **WHEN** the Univer CLI Extension installs the `univer-cli` skill
- **THEN** `.opencode/skills/univer-cli/SKILL.md` exists and package-local reference/resource files are preserved under the same skill directory

#### Scenario: Canonical source is used
- **WHEN** OpenWork installs or updates the `univer-cli` skill package
- **THEN** the installer resolves the package from `dream-num/skills` rather than from a local `univer-cli/packages/skills` checkout or a generic hub mirror

#### Scenario: Single-file skill installation is insufficient
- **WHEN** a setup path can only write a single `SKILL.md`
- **THEN** OpenWork MUST NOT report the Univer skill package as fully installed

### Requirement: Extension provisions executable
OpenWork SHALL provide a `univer` executable for the active workspace through an OpenWork-managed npm package install by default, with detected compatible executables or user-approved executable paths available only as fallback or development override paths.

#### Scenario: Managed executable is preferred
- **WHEN** the user installs the Univer CLI Extension without choosing an override
- **THEN** OpenWork provisions and uses a `univer` executable resolved from an OpenWork-managed `univer-cli` npm package install for that workspace/runtime

#### Scenario: Managed npm install resolves bin
- **WHEN** OpenWork completes the managed npm package install
- **THEN** OpenWork records the resolved `univer` bin path from the managed install directory rather than relying on a global npm bin path

#### Scenario: Executable is available
- **WHEN** Univer setup completes successfully
- **THEN** OpenWork can run the resolved executable and obtain a successful version or help response

#### Scenario: Override executable is selected
- **WHEN** the user or developer selects an existing compatible `univer` executable path
- **THEN** OpenWork uses that executable as the resolved override and still reports its version and health status

#### Scenario: Executable is missing
- **WHEN** OpenWork cannot resolve a usable `univer` executable for the workspace
- **THEN** OpenWork reports setup as incomplete and does not imply that Univer office automation is ready

### Requirement: Extension reports and updates Univer CLI versions
OpenWork SHALL show the resolved Univer CLI executable source and version metadata in the Univer CLI Extension page and SHALL update OpenWork-managed executable installs from the npm registry.

#### Scenario: Version metadata is displayed
- **WHEN** OpenWork checks Univer CLI setup
- **THEN** the Univer CLI Extension page shows the resolved executable source, executable path, detected command version, managed package version when present, and managed install root

#### Scenario: Registry version is checked
- **WHEN** the user checks for Univer CLI updates
- **THEN** OpenWork queries the npm registry for the latest `univer-cli` version and reports whether the managed package is up to date

#### Scenario: Managed executable is updated manually
- **WHEN** the user updates the managed Univer CLI executable
- **THEN** OpenWork installs `univer-cli@latest` from npm registry into the OpenWork-managed install directory and reruns setup health checks

#### Scenario: Managed executable is auto-updated
- **WHEN** the user enables automatic Univer CLI updates for a managed install
- **THEN** OpenWork checks npm registry and updates the managed executable when a newer version is available

#### Scenario: Development override is not overwritten
- **WHEN** a development override executable or system executable is the resolved source
- **THEN** OpenWork reports that source and does not replace it during managed update checks

### Requirement: Managed agents can invoke Univer
OpenWork SHALL make the resolved `univer` executable available to managed OpenCode sessions launched for the workspace.

#### Scenario: Managed session starts after setup
- **WHEN** OpenWork starts a managed OpenCode session for a workspace with successful Univer setup
- **THEN** that session can invoke `univer` without requiring the user to manually alter shell startup files

### Requirement: Installer verifies runtime capabilities
OpenWork SHALL verify key Univer runtime capabilities after installation.

#### Scenario: Health check succeeds
- **WHEN** OpenWork runs the Univer health check after setup
- **THEN** it verifies the resolved executable responds to version or help, the complete skill package exists, `univer inspect tools list --json` succeeds, and `univer sac migration templates --json` succeeds

#### Scenario: Health check fails
- **WHEN** one of the required Univer capabilities is unavailable
- **THEN** OpenWork reports the failed capability with enough detail for repair and keeps the extension in an incomplete state

#### Scenario: Installer health check stays lightweight
- **WHEN** OpenWork evaluates Univer installer readiness
- **THEN** it MUST NOT require creating a real `.univer` target or running SaC apply/verify as part of the installer health check
