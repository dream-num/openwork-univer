# Compact chat pane

OpenWork will make the compact chat pane the default session conversation layout. The transcript and composer share a dense, full-width rhythm with small refined padding and only a broad safety cap for extreme displays. The composer becomes a bottom input bar separated from the transcript by a divider instead of a rounded floating card.

This is not a `.univer`-specific layout branch. Wide `.univer` artifact review is the forcing scenario, because the chat pane should not compete with a Native Univer Target for attention or vertical space, but the agent chat model remains the same across sessions.

**Consequences**

The implementation must preserve existing composer capabilities while making their presentation denser: attachments, tools, model and behavior summary, send, stop, steer, and queue remain available from compact chrome. Agent selection stays available through the tools/agents menu rather than as a persistent default-agent selector. Detailed configuration stays in menus or popovers. Message footer actions may become visually tighter, but their semantics remain unchanged. User-visible implementation work needs focused tests and fraimz evidence, including a `.univer` artifact open beside the compact chat pane.
