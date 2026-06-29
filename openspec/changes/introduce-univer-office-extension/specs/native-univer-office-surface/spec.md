## ADDED Requirements

### Requirement: Univerfile is the native office artifact
OpenWork SHALL treat `.univer` files as native office artifacts for spreadsheet, document, and slide work.

#### Scenario: Univerfile appears in artifacts
- **WHEN** an agent creates or updates a `.univer` file in the workspace
- **THEN** OpenWork classifies it as an office artifact that can be opened through the Univer Office Surface

#### Scenario: User downloads native target
- **WHEN** a user downloads or shares the primary result of native office work
- **THEN** OpenWork offers the `.univer` file as the native distributable artifact

### Requirement: New office work creates native targets
OpenWork SHALL create `.univer` targets by default for new spreadsheet, document, and slide work unless the user explicitly asks for an external exchange format.

#### Scenario: User asks for a new spreadsheet
- **WHEN** a user asks OpenWork to create a new spreadsheet without specifying `.xlsx` or `.csv`
- **THEN** OpenWork creates a `.univer` native office target for the work

#### Scenario: User asks for a new document
- **WHEN** a user asks OpenWork to create a new document without specifying `.docx` or another external format
- **THEN** OpenWork creates a `.univer` native office target for the work

#### Scenario: User asks for a new presentation
- **WHEN** a user asks OpenWork to create a new slide deck without specifying `.pptx` or another external format
- **THEN** OpenWork creates a `.univer` native office target for the work

#### Scenario: Agent populates native target
- **WHEN** an agent creates new office work through `univer-cli` public surfaces
- **THEN** OpenWork treats the completed `.univer` artifact as the user-facing result and does not require the initial creation step to be the same operation that creates the typed unit

#### Scenario: Native creation returns route metadata
- **WHEN** native creation discovers a resulting unit or review worktree
- **THEN** OpenWork preserves the `.univer` artifact path plus optional `unit` and `worktree` route metadata for the embedded Univer Office Surface

#### Scenario: User asks for an Excel file
- **WHEN** a user explicitly asks for an `.xlsx` file
- **THEN** OpenWork may use Univer exchange export to produce `.xlsx` as the requested handoff format

### Requirement: Existing office files import into native targets
OpenWork SHALL treat `.xlsx`, `.docx`, `.pptx`, and `.csv` inputs as exchange sources that can be imported into `.univer` native office targets.

#### Scenario: User opens an Excel source
- **WHEN** a user asks OpenWork to work on an existing `.xlsx` file
- **THEN** OpenWork imports it into a `.univer` target and continues subsequent office operations against the `.univer` target

#### Scenario: User opens a CSV source
- **WHEN** a user asks OpenWork to work on an existing `.csv` file
- **THEN** OpenWork imports it into a `.univer` target and treats the `.csv` as source provenance rather than the primary work artifact

#### Scenario: User opens a Word source
- **WHEN** a user asks OpenWork to work on an existing `.docx` file
- **THEN** OpenWork imports it into a `.univer` target when the installed Univer capability supports that exchange path

#### Scenario: User opens a PowerPoint source
- **WHEN** a user asks OpenWork to work on an existing `.pptx` file
- **THEN** OpenWork imports it into a `.univer` target when the installed Univer capability supports that exchange path

#### Scenario: Exchange source remains available
- **WHEN** OpenWork imports an external source file into a `.univer` target
- **THEN** OpenWork preserves the original source file reference as provenance without making it the default editing target

### Requirement: External formats are exchange outputs
OpenWork SHALL use export to external office formats only when the user asks for an exchange handoff or another tool requires one.

#### Scenario: User asks to send a Word-compatible file
- **WHEN** a user asks for a Word-compatible output after native document work
- **THEN** OpenWork exports the relevant `.univer` document unit to an external handoff format when supported

#### Scenario: User asks to send an Excel-compatible file
- **WHEN** a user asks for an Excel-compatible output after native spreadsheet work
- **THEN** OpenWork exports the relevant `.univer` spreadsheet unit to an external handoff format when supported

#### Scenario: Export is secondary
- **WHEN** OpenWork produces an external exchange output from a `.univer` target
- **THEN** the exported file appears as a handoff artifact and the `.univer` target remains the primary office work artifact

#### Scenario: Exchange output is unsupported
- **WHEN** the requested exchange output is not supported by the installed Univer capability
- **THEN** OpenWork reports the unsupported handoff path clearly and preserves the `.univer` native target

### Requirement: Univer surface owns office viewing and editing
OpenWork SHALL route `.univer` spreadsheet, document, and slide navigation, viewing, worktree review, and supported editing through the current `collab-gateway` / `collab-client` office surface rather than OpenWork's generic artifact editor.

#### Scenario: User opens a native target
- **WHEN** a user opens a `.univer` artifact from OpenWork
- **THEN** OpenWork displays it using the gateway-backed Univer Office Surface rather than the lightweight generic spreadsheet editor
- **AND** the surface is embedded inside OpenWork by default rather than opened in an external browser

#### Scenario: Surface route preserves context
- **WHEN** OpenWork opens a `.univer` artifact with an optional worktree or unit selection
- **THEN** the Collab Surface Adapter passes the native file path plus `worktree` and `unit` route state to the collab-client surface

#### Scenario: Browser handoff is fallback
- **WHEN** the embedded surface cannot be used or a developer requests browser diagnostics
- **THEN** OpenWork may expose the gateway view URL as a fallback without making browser handoff the default open behavior

#### Scenario: Surface supports unit navigation
- **WHEN** a `.univer` file contains spreadsheet, document, or slide units supported by the installed collab contract
- **THEN** OpenWork preserves the collab-client unit navigation behavior instead of replacing it with a custom OpenWork unit picker

#### Scenario: Worktree review is visible
- **WHEN** an agent changes a `.univer` target through a collab worktree
- **THEN** OpenWork preserves the collab-client worktree review flow, including open/ready states, per-unit change badges, merge preview, merge, discard, and reset refresh behavior

#### Scenario: Browser direct editing follows collab capability
- **WHEN** a user directly edits the current `.univer` trunk through OpenWork
- **THEN** OpenWork uses the collab-client direct-edit path and editing gate for unit types supported by that path, and does not imply direct browser editing for unsupported unit types

### Requirement: Univer CLI owns semantic operations
OpenWork SHALL use `univer-cli` public surfaces for semantic reads, writes, verification, versioning, import, export, and handoff of `.univer` targets.

#### Scenario: Agent modifies a native spreadsheet
- **WHEN** an agent needs to make a durable semantic change to a `.univer` spreadsheet
- **THEN** it uses `univer-cli` public surfaces such as inspect, SaC authoring, apply, verify, status, commit, restore, import, export, or open instead of hand-patching the `.univer` file

#### Scenario: Agent modifies through a reviewable worktree
- **WHEN** an agent needs the user to review changes before they become the current version
- **THEN** it uses the collab worktree flow so OpenWork can show the resulting worktree and let the user merge or discard it
