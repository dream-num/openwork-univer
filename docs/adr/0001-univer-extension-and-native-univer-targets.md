# Univer extension and native Univer targets

OpenWork will integrate Univer as an installable OpenWork extension that provisions the `univer` executable and the complete `univer-cli` skill package. OpenWork will treat `.univer` as the native Univer target for spreadsheet, document, and slide work; import and export of `.xlsx`, `.docx`, `.pptx`, and `.csv` are exchange capabilities, not the default authoring model.

**Considered Options**

- Use OpenWork's existing artifact spreadsheet editor as the primary Univer surface.
- Treat `.xlsx` / `.docx` / `.pptx` as the primary artifacts and convert through `.univer` only during agent work.
- Treat `.univer` as the primary artifact and use external formats only for exchange.

**Consequences**

OpenWork must install a full skill package rather than only a `SKILL.md`, expose a reliable `univer` executable to managed OpenCode sessions, register `.univer` as a first-class artifact, and embed Univer UI surfaces instead of duplicating spreadsheet, document, or slide semantics inside OpenWork.
