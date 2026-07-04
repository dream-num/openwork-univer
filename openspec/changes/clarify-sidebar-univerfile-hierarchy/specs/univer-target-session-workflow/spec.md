## MODIFIED Requirements

### Requirement: Sidebar groups visible Univerfiles and general sessions

OpenWork SHALL auto-discover visible `.univer` files in the workspace and render each as a Univerfile Row with bound sessions underneath.

#### Scenario: Sidebar renders a shallow Session Navigation Tree

- **WHEN** the workspace sidebar renders Univer-capable session navigation
- **THEN** OpenWork SHALL render one workspace header above the session navigation for that workspace
- **AND** OpenWork SHALL render General Sessions, Univerfiles, and Unavailable Univerfiles as stable top-level Session Navigation Sections
- **AND** rows inside a Session Navigation Section SHALL appear visually subordinate to that section
- **AND** task rows under a Univerfile Row SHALL appear visually subordinate to the owning Univerfile Row
- **AND** the sidebar SHALL NOT present the Session Navigation Tree as a raw workspace file tree, unit tree, or worktree tree

#### Scenario: Expanded section body is contiguous

- **WHEN** a Session Navigation Section is expanded
- **THEN** its body rows SHALL render immediately after that section header
- **AND** another top-level Session Navigation Section SHALL NOT render between an expanded section header and that section's body rows

#### Scenario: Univerfiles rows precede unavailable section

- **WHEN** the Univerfiles section is expanded
- **AND** visible Univerfile Rows exist
- **THEN** those visible Univerfile Rows SHALL render before the Unavailable Univerfiles section header
- **AND** OpenWork SHALL NOT place the Unavailable Univerfiles section header between the Univerfiles section header and visible Univerfile Rows

#### Scenario: Workspace header is visually distinct from session sections

- **WHEN** a workspace has session navigation rows
- **THEN** the workspace header SHALL use distinct workspace identity treatment
- **AND** Session Navigation Section headers SHALL use quieter structural label treatment
- **AND** Univerfile Rows SHALL NOT reuse the same workspace/avatar-style identity treatment as the workspace header

#### Scenario: Expanded, selected, hover, and focus states are separate

- **WHEN** a Session Navigation Section is expanded
- **THEN** OpenWork SHALL communicate expansion with disclosure state or section-body treatment
- **AND** expanded state SHALL NOT imply that the section header is the selected session or selected Univerfile

- **WHEN** a session, Univerfile overview, or task row is selected
- **THEN** OpenWork SHALL apply selected state to that row rather than to an unrelated section header

- **WHEN** keyboard focus is visible
- **THEN** OpenWork SHALL show focus treatment without permanently making the focused section header read as selected

#### Scenario: Empty unavailable section stays quiet

- **WHEN** Unavailable Univerfiles has a count of `0`
- **THEN** OpenWork SHALL keep the stable Unavailable Univerfiles section header visible
- **AND** the section SHALL remain collapsed by default
- **AND** OpenWork SHALL NOT render unavailable file filler rows
- **AND** the header SHALL remain visually quiet rather than using selected or alert styling
