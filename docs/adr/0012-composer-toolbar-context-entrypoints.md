# Composer toolbar context entrypoints

OpenWork will move durable workspace context entry points into a Composer Toolbar in the Compact Chat Composer stack. The toolbar will expose `Files` for ordinary Workspace Files and `Changes` for the active `.univer` artifact's Office Worktree.

The previous header button combined Workspace Files and Office Worktree into one Files popover near notifications. That made a workspace navigation task and an office review task look like one concept. The new toolbar keeps these controls near the agent work loop while splitting them into two user tasks: find files and review changes.

`Changes` follows the active right-side `.univer` artifact tab, not the selected row inside Files. Opening a `.univer` file from Files opens or selects the artifact, but Files remains open until the user closes it or chooses another toolbar popover.

**Consequences**

The compact composer needs a stable toolbar slot below higher-priority status and blocking accessories such as queued messages, questions, permissions, and todo progress. `SessionPage` assembles Files and Changes from workspace, session, and active artifact state; the composer only owns placement and visual integration. The session header should no longer show the Files button. User-visible implementation work needs focused tests and fraimz evidence for Files from the toolbar and Changes for an active `.univer` artifact.
