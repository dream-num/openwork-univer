## Why

OpenWork's current session chat area still reads like a large centered task form. The transcript is constrained to a narrow reading column, while the composer is wider, rounded, padded, and visually heavy. That was acceptable when the chat pane was the main surface, but it feels inefficient now that `.univer` artifacts can occupy a larger right-side panel for spreadsheet, document, and slide work.

The chat pane should become a compact, refined agent chat surface by default. It should keep all agent controls available, but the bottom input area should not dominate the workspace or consume vertical space when the user is mostly reviewing content in the artifact panel.

## What Changes

- Introduce `Compact Chat Pane` as the default OpenWork session conversation layout.
- Make transcript content and the composer share a dense full-width rhythm with small refined padding and only a broad safety cap for extreme screens.
- Replace the floating rounded composer card with a bottom input bar separated from the transcript by a divider.
- Make the composer default to a low one-line/two-line height and grow only when draft content, attachments, queued messages, questions, permissions, or todos require more space.
- Keep high-frequency controls visible in compact form: attach, tools, current model/behavior summary, send, stop, steer, and queue.
- Keep detailed model, tool, command, skill, MCP, plugin, and agent choices in menus or popovers instead of turning the bottom area into a permanent control console.
- Compact message footer actions visually without changing their semantics.

## Capabilities

### New Capabilities

- `compact-chat-pane`: Render the default session conversation and composer with a dense, full-width, low-height layout suitable for split work with large artifact panels.

### Modified Capabilities

- None.

## Impact

- Affected code:
  - `apps/app/src/react-app/domains/session/surface/session-surface.tsx`: adjust transcript and composer shell spacing/width rhythm.
  - `apps/app/src/react-app/domains/session/surface/composer/composer.tsx`: restyle the composer from a rounded card into a compact bottom input bar while preserving behavior.
  - Message action styling under the session surface/message list, limited to spacing and visual density.
  - Focused UI/unit tests and fraimz coverage for the session chat pane.
- Affected docs:
  - `CONTEXT.md`: `Compact Chat Composer` and `Compact Chat Pane`.
  - `docs/adr/0011-compact-chat-pane.md`.
- Out of scope:
  - Adding a `.univer`-specific composer mode or artifact-type layout fork.
  - Removing existing composer capabilities.
  - Redesigning the message action semantics.
  - Changing the Univer Artifact Header or right-side artifact panel behavior.
  - Changing model, agent, MCP, skill, command, or plugin data flows.
