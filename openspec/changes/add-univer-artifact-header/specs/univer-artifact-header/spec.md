## ADDED Requirements

### Requirement: OpenWork renders a dedicated Univer Artifact Header

OpenWork SHALL render `.univer` artifact tabs with a dedicated `Univer Artifact Header` instead of reusing the generic artifact titlebar action priority.

#### Scenario: Univer artifact uses the dedicated header

- **WHEN** an artifact target has preview type `univer`
- **THEN** OpenWork SHALL render the `Univer Artifact Header`
- **AND** the header SHALL be scoped to that Native Office Target
- **AND** the header SHALL NOT require changes to generic artifact header behavior

#### Scenario: Non-Univer artifacts keep the generic header

- **WHEN** an artifact target has a preview type other than `univer`
- **THEN** OpenWork SHALL keep rendering the existing generic artifact header
- **AND** the Univer-specific header view model SHALL NOT be required for that artifact

### Requirement: Univer Artifact Header title follows current content

The `Univer Artifact Header` SHALL make the currently rendered unit the primary title when unit state is available and SHALL treat the `.univer` file as secondary context.

#### Scenario: Current unit is available

- **WHEN** the header view model receives current unit and scope state
- **THEN** the header SHALL show the unit as the primary title
- **AND** it SHALL include the scope as content context
- **AND** it SHALL show the `.univer` file as secondary context

#### Scenario: Current unit is unavailable

- **WHEN** the header view model does not have current unit state
- **THEN** the header SHALL fall back to the `.univer` file name as the primary title
- **AND** it SHALL NOT render placeholder content actions

### Requirement: Univer Artifact Header uses a thin view model

OpenWork SHALL derive the header through a `Univer Artifact Header View Model` that combines artifact, embedded surface, workspace, and future cowork content state without becoming a store.

#### Scenario: View model derives render data

- **WHEN** OpenWork builds header state for a `.univer` artifact
- **THEN** it SHALL derive render data from the artifact target, workspace context, embedded surface state, and optional cowork content state
- **AND** it SHALL NOT persist header state
- **AND** it SHALL NOT fetch gateway or filesystem state directly
- **AND** it SHALL NOT become a generic artifact header framework

### Requirement: File actions are secondary fallback actions

The `Univer Artifact Header` SHALL treat file-level actions as secondary or fallback actions and SHALL NOT expose normal external opening as the default `.univer` path.

#### Scenario: Normal Univer header does not expose Open externally

- **WHEN** a local `.univer` artifact is open in the embedded Univer Office Surface
- **THEN** the header SHALL NOT show a normal `Open externally` button
- **AND** the embedded surface SHALL remain the default product path

#### Scenario: File fallback actions remain available

- **WHEN** a `.univer` artifact is open
- **THEN** the header SHALL keep panel close available
- **AND** it MAY expose download as a secondary fallback action
- **AND** it MAY expose reveal-in-folder for local workspace file targets

### Requirement: Header supports staged cowork integration

The `Univer Artifact Header` SHALL support a first skeleton slice before full cowork content surface integration.

#### Scenario: Step 1 reserves structure without empty controls

- **WHEN** cowork content state is not wired
- **THEN** the header SHALL render artifact identity and available file fallback actions
- **AND** it SHALL reserve a content-action zone in structure
- **AND** it SHALL NOT render disabled placeholder controls for edit gate, merge, discard, or scope toggles

#### Scenario: Step 2 adds content controls from cowork state

- **WHEN** cowork content surface state is available
- **THEN** the header SHALL be able to render current scope, edit gate, preview/original toggle, merge, and discard controls from that state
- **AND** those controls SHALL remain outside the embedded collab-client iframe
