## Context

OpenWork's Univer sidebar already has the right conceptual buckets: General Sessions, visible Univerfiles, and Unavailable Univerfiles. The problem is presentation. In the current UI, section headers and rows use similar row height, icon weight, selected outlines, and indentation, so the user cannot reliably tell which rows belong to which section.

The core product question from the grilling pass:

> Should the sidebar teach "workspace -> section -> row -> task" as a tree, or keep optimizing for a compact flat list?

Recommended answer: treat it as a shallow Session Navigation Tree. A flat list is compact, but it hides the ownership relationship that matters most for Univer work. A full filesystem-style tree is too heavy and conflicts with the existing rule that Univerfile Rows are not unit or worktree navigators.

## Goals

- Make the relationship between workspace, Session Navigation Sections, Univerfile Rows, unavailable rows, and task rows legible within two seconds.
- Preserve stable top-level sections so promotion, discovery, and unavailable history do not cause structural jumps.
- Keep the sidebar compact enough for daily agent work.
- Avoid teaching implementation terms such as target, hub, raw worktree id, or unit tree in first-level navigation.

## Non-Goals

- Do not turn the sidebar into a raw workspace file tree.
- Do not show `.univer` units or worktree choices as first-level sidebar children.
- Do not hide stable empty sections solely because their count is zero.
- Do not use color alone to distinguish hierarchy.
- Do not make the selected/focused section header stand in for the selected Univerfile or task.

## Decision 1: Use a shallow Session Navigation Tree

The sidebar hierarchy is:

1. Workspace header.
2. Session Navigation Section headers.
3. Section rows such as General Session rows, Univerfile Rows, and Unavailable Univerfile Rows.
4. Nested task rows under a Univerfile Row.
5. Nested Done rows under a Univerfile Row when terminal sessions exist.

This is a session/workstream tree, not a filesystem tree. `Workspace Files` remains the ordinary filesystem browser.

## Decision 2: Expanded section contents stay contiguous

When a Session Navigation Section is expanded, its body renders immediately after its header. Another top-level section must not appear between an expanded section header and that section's rows.

For the normal Univer navigation stack, this means:

1. `General Sessions`
2. General session rows, if expanded
3. `Univerfiles`
4. Visible Univerfile Rows, if expanded
5. `Unavailable Univerfiles`
6. Unavailable Univerfile Rows, if expanded

`Unavailable Univerfiles` is not a divider between `Univerfiles` and visible Univerfile Rows. Empty sections may render no body rows, but their headers stay in the same top-level order.

## Decision 3: Workspace identity gets its own visual grammar

The workspace header is a workspace switcher and boundary, not a session group. It should use stronger identity treatment than section headers: workspace icon/avatar, workspace name, workspace actions, and the workspace expand/collapse control.

Session Navigation Sections are quieter structural labels. They should read like stable categories with a count, not like selectable workspace rows.

## Decision 4: Univerfile Rows use file language, not workspace language

Visible Univerfile Rows and Unavailable Univerfile Rows use file-specific identity: a Univerfile/file icon, the `.univer` name, compact metadata, and a row action area. They should not reuse the same colored orb/avatar language as the workspace header, because that makes files look like sibling workspaces.

Color may indicate status or file type, but hierarchy must remain clear without color.

## Decision 5: Indentation communicates ownership

Each level has a stable indentation step:

- Section headers align under the workspace body.
- Section rows indent beyond section headers.
- Task rows indent beyond their owning Univerfile Row.
- Done rows indent as nested task history inside the owning Univerfile Row.

The implementation may use spacing, a subtle continuation guide, or both, but the row hit targets and text truncation must remain stable.

## Decision 6: Expanded, selected, hover, and focus states are separate

Expanded state is communicated by the disclosure chevron and optional soft section-body treatment. It should not look like the current selected file or selected task.

Selected state belongs to the active session, active Univerfile overview, or active task row. Hover state can be quiet. Keyboard focus uses focus-visible treatment only and should not permanently read as selection.

## Decision 7: Empty and unavailable sections stay quiet

`Unavailable Univerfiles` remains collapsed by default. When its count is `0`, it stays visually quiet: muted text, no empty filler rows, and no heavy selected or alert styling. It remains visible because stable section presence is already part of the Univer session workflow model.

## Validation Plan

- Focused source tests should prove section render order is `General Sessions`, then visible `Univerfiles` rows, then `Unavailable Univerfiles`.
- Focused tests should prove expanded section contents are contiguous and not interrupted by another top-level section.
- Focused tests should prove empty stable sections still render their headers without filler rows.
- Focused tests should prove `Unavailable Univerfiles` remains collapsed by default and does not render visible file rows when its count is zero.
- Screenshot or fraimz coverage should prove a workspace with General Sessions, visible Univerfiles, unavailable rows, and nested task rows shows a readable hierarchy.
- Fraimz for the core Univer sidebar path should be produced when implementation changes land, because this is observable UI behavior.
