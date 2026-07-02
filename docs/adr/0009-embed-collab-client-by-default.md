# Embed collab-client by default

OpenWork will present `.univer` artifacts by embedding the gateway-served `collab-client` view inside OpenWork by default. Opening the same gateway view URL in an external browser remains useful for development, diagnostics, and fallback, but it is not the normal product experience.

**Consequences**

OpenWork must own an embedded web-view host for the Collab Gateway Univer Surface, keep the `file`, `worktree`, and `unit` route state in sync with OpenWork artifact/session state, and surface gateway startup or connectivity errors inside OpenWork. This preserves the existing collab-client implementation while keeping navigation, viewing, editing, review, merge, and discard in the OpenWork experience instead of handing the user to a browser tab.
