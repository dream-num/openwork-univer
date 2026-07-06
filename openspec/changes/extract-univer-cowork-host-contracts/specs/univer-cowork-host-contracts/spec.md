## ADDED Requirements

### Requirement: Cowork host contracts stay headless and host-neutral

OpenWork SHALL consume reusable `@univer/cowork` host contracts only for Univer runtime facts, and SHALL keep OpenWork product policy in OpenWork adapters.

#### Scenario: Contract returns runtime facts, not OpenWork state

- **WHEN** `@univer/cowork` exposes a host contract for local Univer integration
- **THEN** the contract SHALL return Univer runtime facts such as local Univerfile summaries, gateway origin, Univerfile path, optional worktree/unit route fields, bundle health, executable shim information, or daemon start results
- **AND** it SHALL NOT return OpenWork `OpenTarget` objects, OpenWork session metadata, sidebar rows, settings view models, or user-facing OpenWork labels

#### Scenario: OpenWork maps runtime facts into product state

- **WHEN** OpenWork consumes a cowork host contract
- **THEN** OpenWork SHALL map the result into workspace-relative paths, API errors, session metadata, artifact targets, sidebar navigation, settings status, and UI labels locally
- **AND** OpenWork SHALL keep workspace authorization and remote-workspace restrictions outside `@univer/cowork`

### Requirement: Visible Univerfile discovery is reusable but navigation is OpenWork-owned

`@univer/cowork/node` SHALL provide a reusable local discovery helper for visible `.univer` files, and OpenWork SHALL keep Univerfile navigation semantics local.

#### Scenario: Host discovers visible Univerfiles

- **WHEN** OpenWork scans a local workspace for visible `.univer` files
- **THEN** it MAY delegate the filesystem walk, default ignore rules, depth limit, entry limit, and file summary collection to `@univer/cowork/node`
- **AND** the helper SHALL ignore generated, dependency, hidden, and runtime directories by default
- **AND** the helper SHALL return deterministic results

#### Scenario: OpenWork preserves its sidebar model

- **WHEN** OpenWork receives discovered Univerfile facts
- **THEN** it SHALL still build `Univerfile Row`, `Unavailable Univerfiles`, session grouping, actionability sorting, and sidebar badges inside OpenWork
- **AND** `@univer/cowork` SHALL NOT own Primary Univerfile binding or Session Navigation Tree structure

### Requirement: Univer Open Handoff parsing is shared

OpenWork SHALL consume a shared Univer Open Handoff parser and validator for `univer open --json` output.

#### Scenario: Open surface validates CLI output

- **WHEN** the OpenWork Univer CLI Extension runs `univer open <file> --json`
- **THEN** OpenWork SHALL parse the result through the shared handoff parser
- **AND** the parser SHALL require a structured object with `origin` and `univerfile`
- **AND** the validator SHALL preserve optional `worktreeId` and `unitId`
- **AND** OpenWork SHALL reject responses whose `univerfile` does not match the requested local Univerfile
- **AND** OpenWork SHALL reject non-loopback local gateway origins by default

#### Scenario: Artifact extraction ignores valid handoff URLs

- **WHEN** an agent or tool output contains a valid Univer Open Handoff envelope
- **THEN** OpenWork MAY use the shared handoff recognizer to ignore embedded local gateway URLs
- **AND** OpenWork SHALL continue to derive the `.univer` artifact target from the handoff file fields
- **AND** OpenWork SHALL NOT move `deriveOpenTargets`, artifact confidence scoring, or `OpenTarget` preview selection into `@univer/cowork`

### Requirement: Bundle and daemon runtime behavior is reusable

`@univer/cowork/node` SHALL expose reusable helpers for cowork bundle runtime preparation and local daemon startup behavior while OpenWork keeps setup policy local.

#### Scenario: Host checks or prepares a bundled runtime

- **WHEN** OpenWork reports Univer CLI setup status or performs an explicit repair
- **THEN** it MAY use `@univer/cowork/node` to validate bundle manifest, executable access, command version, skill package completeness, skill revision, and executable shim readiness
- **AND** OpenWork SHALL keep setup action names, read-only decisions, settings status shape, executable-source priority, and environment variable naming local

#### Scenario: Host starts the daemon

- **WHEN** OpenWork opens a local Univer Surface
- **THEN** it MAY use a shared daemon startup helper that runs `univer daemon start`
- **AND** the helper SHALL detect a daemon build mismatch, stop the stale daemon, and retry start once
- **AND** the helper SHALL de-duplicate concurrent starts for the same executable and runtime environment
- **AND** OpenWork SHALL translate daemon failures into OpenWork API errors locally

### Requirement: Optional convenience helpers wait for real duplication

OpenWork SHALL NOT extract small cowork convenience helpers until they reduce meaningful duplication or serve another host.

#### Scenario: Status summary has only one consumer

- **WHEN** only OpenWork sidebar or panel code needs compact worktree status summaries
- **THEN** OpenWork SHOULD keep the summary helper local
- **AND** it MAY move the helper to `@univer/cowork` only after another consumer needs the same summary contract or duplication appears inside OpenWork

#### Scenario: Content route fallback remains OpenWork-specific

- **WHEN** content view fallback depends on OpenWork artifact routes or session target metadata
- **THEN** OpenWork SHALL keep that fallback local
- **AND** `@univer/cowork` MAY expose a route fallback helper only after the contract can be expressed without OpenWork `OpenTarget` or session metadata
