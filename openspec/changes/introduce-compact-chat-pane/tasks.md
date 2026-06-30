## 1. Domain and Design

- [x] 1.1 Add glossary entries for `Compact Chat Composer` and `Compact Chat Pane`.
- [x] 1.2 Confirm the compact chat pane is the default session layout, not a `.univer`-specific branch.
- [x] 1.3 Confirm transcript and composer should use available pane width with small refined padding and only a broad safety cap.
- [x] 1.4 Confirm the composer should have no rounded outer container and should be separated from the transcript by a divider.
- [x] 1.5 Confirm the composer should default to low height and grow from content or active workflow panels.
- [x] 1.6 Confirm message footer work is style-only and does not change action semantics.
- [x] 1.7 Record ADR `0011-compact-chat-pane`.
- [x] 1.8 Run initial `openspec validate introduce-compact-chat-pane --strict`.

## 2. Chat Pane Width Rhythm

- [x] 2.1 Replace narrow centered transcript width with compact full-width pane rhythm.
- [x] 2.2 Make composer content align to the transcript width rhythm.
- [x] 2.3 Keep a broad safety cap for extreme screens without returning to the current narrow chat-column feel.
- [x] 2.4 Verify ordinary desktop and `.univer` split-pane states both feel dense.

## 3. Composer Bottom Bar

- [x] 3.1 Convert the composer outer shell from a rounded card to a bottom input bar.
- [x] 3.2 Add a divider between transcript and composer.
- [x] 3.3 Reduce default empty-state height and vertical padding.
- [x] 3.4 Keep editor focus state visible without reintroducing large card chrome.
- [x] 3.5 Ensure long drafts scroll inside a controlled editor height.

## 4. Composer Controls

- [x] 4.1 Keep attach, tools, current model/behavior summary, and send available in idle state.
- [x] 4.2 Keep stop, steer, and queue available in busy state.
- [x] 4.3 Make busy hints compact and transient.
- [x] 4.4 Keep detailed model, tool, command, skill, MCP, plugin, extension, and agent choices in menus/popovers.
- [x] 4.5 Keep attachment chips compact and content-driven.
- [x] 4.6 Remove persistent default-agent selector from the bottom control row.

## 5. Message Footer Styling

- [x] 5.1 Tighten message footer action spacing.
- [x] 5.2 Keep copy, expand, revert, timestamp, and related action semantics unchanged.
- [x] 5.3 Verify footer actions remain accessible and do not overlap message content.

## 6. Validation

- [x] 6.1 Add focused tests for idle composer, busy composer, attachments, and accessory panels.
- [x] 6.2 Add or update focused tests for message footer actions if styling changes touch their DOM.
- [x] 6.3 Run `pnpm --filter @openwork/app typecheck`.
- [x] 6.4 Run focused UI/unit tests for the session surface/composer.
- [x] 6.5 Create fraimz evidence for the default session chat pane.
- [x] 6.6 Create fraimz evidence for a `.univer` artifact open with the widened artifact panel and compact chat pane.
- [x] 6.7 Run `openspec validate introduce-compact-chat-pane --strict` after implementation updates.

Fraimz evidence: `pnpm fraimz --flow compact-chat-pane --cdp-url http://127.0.0.1:9851` passed on 2026-06-30. Report: `evals/results/2026-06-30T12-49-04-474Z/report.md`; frame proof: `evals/results/2026-06-30T12-49-04-474Z/fraimz.html`.
