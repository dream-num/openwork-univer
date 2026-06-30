## Context

OpenWork's current session layout centers messages in a narrow chat column and renders the composer as a rounded, padded panel at the bottom. The composer supports a substantial set of capabilities: prompt drafting, mentions, slash commands, attachments, pasted-text chips, tool selection, agent selection, model selection, behavior selection, queueing, steering, stopping, questions, permissions, todos, and queued messages.

The problem is not only the composer padding. The transcript and composer use different width rhythms, and the whole bottom area feels like a large task box. When a `.univer` artifact is open in a wide right-side panel, the chat pane needs to remain useful without stealing attention or vertical space from the Native Office Target.

The new shape is therefore a default `Compact Chat Pane`, not a Univer-only branch.

## Goals

- Make the OpenWork session conversation more compact and refined by default.
- Let the transcript and composer use the available pane width with only small polished padding.
- Keep a broad safety cap for extreme displays without returning to a narrow centered chat column.
- Render the composer as a bottom input bar with a top divider, no rounded floating card.
- Keep the default composer height low and grow only for real content or active workflow panels.
- Preserve all current composer behaviors and accessibility affordances.
- Ensure `.univer` split-work scenarios benefit from the default compact layout without custom artifact-specific logic.

## Non-Goals

- Do not add a `.univer`-specific composer condition.
- Do not remove attach, tools, agent, model, behavior, send, stop, steer, or queue capabilities.
- Do not redesign the command/skill/MCP/plugin menus beyond making their triggers fit the compact hierarchy.
- Do not change message action semantics; only visual spacing and density are in scope.
- Do not change the right-side artifact rail, Univer Artifact Header, or Collab Gateway Office Surface.

## Decision 1: Compact Chat Pane is the default

The compact layout applies to the standard session chat pane. It is not gated by `.univer` artifact state, session type, or a separate composer mode.

The `.univer` case is still an important acceptance scenario because wide Native Office Targets make the old large chat layout especially costly. The implementation should validate that opening a `.univer` artifact with the widened artifact panel leaves the chat pane dense, usable, and visually subordinate to the office surface.

## Decision 2: Transcript and composer share a full-width rhythm

The transcript and composer should stop using separate narrow centered widths. They should use the available chat pane width with small refined padding.

A broad maximum width may remain for extreme displays to avoid unreadably long lines, but it should be high enough that ordinary desktop and split-pane scenarios feel full-width. The specific token can be chosen during implementation; the important contract is that the layout no longer feels like a narrow 720/800px chat column inside a larger workspace.

## Decision 3: Composer becomes a bottom input bar

The composer should not look like a floating card.

The default visual form is:

- no rounded outer container,
- no large panel shadow,
- a top divider separating it from the transcript,
- compact vertical padding,
- a calm surface background that belongs to the session pane.

The input can still have internal focus affordances, but the outer composer should read as the bottom input area of the conversation, not as a separate large task object.

## Decision 4: Height grows from content

The empty composer should default to a low one-line/two-line height. It grows when there is a real reason:

- multi-line draft content,
- attachments,
- pasted-text chips,
- queued messages,
- an active question,
- todos,
- a permission approval,
- busy-state steering and queue controls.

Long drafts should scroll within a controlled editor height instead of pushing the entire transcript offscreen.

## Decision 5: Controls are compact but available

The primary row should keep high-frequency controls visible:

- attach,
- tools,
- current model and behavior summary,
- send when idle,
- stop, steer, and queue when busy.

Agent choice and other detailed choices remain in menus or popovers. The compact layout should not make model/provider/tool state invisible, but it should stop presenting every capability as permanent bottom chrome.

## Decision 6: Message footer actions are style-only

Message footer actions such as copy, expand, revert, and timestamp should be visually tighter and closer to the message they belong to. Their behavior, ordering, availability, and meaning are not part of this change.

This keeps the OpenSpec focused on density and hierarchy rather than a broader message interaction redesign.

## Step Plan

### Step 1: Layout Tokens and Shell

- Add or reuse local layout tokens for compact chat padding and broad content width.
- Make the transcript and composer shell use the same width rhythm.
- Remove the narrow centered chat-column feeling from ordinary desktop and `.univer` split-pane states.

### Step 2: Composer Visual Shape

- Convert the composer outer shell into a bottom input bar.
- Remove the rounded floating card treatment.
- Add a top divider between transcript and composer.
- Reduce default vertical padding and empty-state height.

### Step 3: Control Density

- Preserve high-frequency controls in compact form.
- Keep detailed configuration in existing menus/popovers.
- Ensure idle and busy states remain understandable without expanding into a large console.
- Keep attachments compact and content-driven.

### Step 4: Message Footer Density

- Tighten message footer action spacing.
- Keep action semantics unchanged.
- Verify copy, expand, revert, and timestamp remain accessible.

## Risks

- If controls are hidden too aggressively, the composer becomes compact but less capable. Preserve the current action set.
- If the full-width rhythm has no broad safety cap, extremely wide displays can become hard to read.
- If the composer still has rounded-card styling, the core visual problem remains even if padding is reduced.
- If `.univer` receives a special composer branch, OpenWork will have two chat layouts to maintain for the same agent session model.
