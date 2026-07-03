# Separate Univer content view from breadcrumb

OpenWork will keep the Univer Surface Breadcrumb to identity and unit navigation, rendered as `<Univerfile> / <Unit>`, and will move current version, original changes, merge preview, and worktree review choices into a separate Univer Content View Selector. This supersedes ADR-0017 because treating worktree/content scope as a breadcrumb segment made a view mode look like a path location and caused status and workflow controls to collapse into an awkward information menu.

**Consequences**

The Univer Artifact Header should read as a route bar first: file and unit identity on the left, content view and edit gate adjacent to that route, review actions only when viewing pending changes, and file fallback actions on the far right. Overflow menus contain actions only; they must not exist just to restate status such as editable or read-only.
