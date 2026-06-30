## ADDED Requirements

### Requirement: OpenWork renders Compact Chat Pane by default

OpenWork SHALL render the standard session conversation using the `Compact Chat Pane` layout by default.

#### Scenario: Standard session uses compact layout

- **WHEN** a user opens an OpenWork session
- **THEN** the transcript and composer SHALL use the Compact Chat Pane layout
- **AND** the layout SHALL NOT require a `.univer` artifact to be active

#### Scenario: Univer artifact does not create a separate composer mode

- **WHEN** a `.univer` artifact is open in the right-side artifact panel
- **THEN** the session chat pane SHALL keep using the same Compact Chat Pane layout
- **AND** OpenWork SHALL NOT switch to a `.univer`-specific composer branch

### Requirement: Compact Chat Pane uses dense full-width rhythm

The Compact Chat Pane SHALL let transcript content and the composer use the available chat pane width with small refined padding and a broad safety cap for extreme displays.

#### Scenario: Transcript avoids narrow centered column

- **WHEN** the chat pane has ordinary desktop width
- **THEN** transcript content SHALL no longer be constrained to a narrow centered chat column
- **AND** it SHALL keep only compact horizontal padding from the pane edges

#### Scenario: Composer aligns with transcript rhythm

- **WHEN** the composer is visible
- **THEN** the composer content SHALL follow the same width rhythm as the transcript
- **AND** it SHALL NOT be visibly wider or heavier than the message area

#### Scenario: Extreme width remains readable

- **WHEN** the chat pane is extremely wide
- **THEN** OpenWork MAY apply a broad content width cap
- **AND** that cap SHALL preserve the dense full-width feel for ordinary desktop and split-pane layouts

### Requirement: Composer is a bottom input bar

The Compact Chat Composer SHALL render as a bottom input bar separated from the transcript by a divider instead of a rounded floating card.

#### Scenario: Empty composer has compact chrome

- **WHEN** the composer has no draft, attachments, queued messages, questions, permissions, or todos
- **THEN** it SHALL use a low-height input-bar presentation
- **AND** the outer container SHALL have no rounded card treatment
- **AND** the transcript/composer boundary SHALL be communicated by a divider

#### Scenario: Composer keeps focus affordance

- **WHEN** the editor is focused
- **THEN** the compact composer SHALL provide a visible focus affordance
- **AND** that affordance SHALL NOT reintroduce a large floating-card layout

### Requirement: Composer height grows only for active content

The Compact Chat Composer SHALL grow from content and workflow state rather than reserving large empty space by default.

#### Scenario: Empty draft stays low

- **WHEN** the draft is empty and no accessory panels are active
- **THEN** the composer SHALL remain at its compact default height

#### Scenario: Multi-line draft grows within limits

- **WHEN** the user enters a multi-line draft
- **THEN** the composer SHALL grow enough to edit the content
- **AND** long drafts SHALL scroll within a controlled editor region instead of pushing the transcript offscreen

#### Scenario: Attachments use compact rows

- **WHEN** the user attaches files or images
- **THEN** attachment chips SHALL appear only when attachments exist
- **AND** they SHALL use compact rows that grow or wrap from content

#### Scenario: Workflow accessories grow the bar

- **WHEN** queued messages, active questions, todos, or permissions are present
- **THEN** the composer MAY grow to show those workflow panels
- **AND** it SHALL return to the compact default height when those panels are gone

### Requirement: Composer controls remain compact and available

The Compact Chat Composer SHALL preserve current high-frequency controls in compact form and keep detailed configuration in menus or popovers.

#### Scenario: Idle controls remain available

- **WHEN** the agent is idle
- **THEN** attach, tools, current model and behavior summary, and send SHALL remain available from the composer
- **AND** the send control MAY use an icon-first compact presentation while preserving accessible label text

#### Scenario: Busy controls remain available

- **WHEN** the agent is busy
- **THEN** stop, steer, and queue controls SHALL remain available
- **AND** busy hints such as escape-to-stop SHALL NOT permanently reserve a full extra row

#### Scenario: Detailed choices stay in menus

- **WHEN** the user needs to change agents, models, behavior, commands, skills, MCP servers, plugins, or extension actions
- **THEN** the compact composer SHALL expose those choices through menus or popovers
- **AND** it SHALL NOT render the detailed choices as permanent bottom chrome

#### Scenario: Default agent is not permanent bottom chrome

- **WHEN** the default agent is active
- **THEN** the compact composer SHALL NOT render a persistent default-agent selector in the bottom control row
- **AND** agent choice SHALL remain reachable through the tools/agents menu

### Requirement: Message footer density changes are style-only

OpenWork SHALL compact message footer actions visually without changing their behavior.

#### Scenario: Existing message actions keep semantics

- **WHEN** a message exposes actions such as copy, expand, revert, or timestamp
- **THEN** those actions SHALL keep their existing semantics and availability
- **AND** the change SHALL only adjust spacing, placement, and visual density

### Requirement: Compact Chat Pane is validated as a user-visible experience

OpenWork SHALL validate the Compact Chat Pane through focused tests and fraimz evidence when implemented.

#### Scenario: Focused tests cover compact states

- **WHEN** the Compact Chat Pane implementation is complete
- **THEN** focused tests SHALL cover idle composer, busy composer, attachments, and accessory panels

#### Scenario: Fraimz proves the visible flow

- **WHEN** the Compact Chat Pane implementation is ready for review
- **THEN** fraimz evidence SHALL show the default session chat pane
- **AND** fraimz evidence SHALL show a `.univer` artifact open with the widened artifact panel while the chat pane remains compact and usable
