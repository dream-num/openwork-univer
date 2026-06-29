# Wrap collab-gateway office surface

OpenWork will implement the native `.univer` office surface by wrapping `univer-cli`'s current `collab-gateway` / `collab-client` surface, not by rebuilding a spreadsheet/document/slide shell in OpenWork and not by targeting the legacy `univerfile-viewer` package.

The current Univer implementation already provides the relevant product surface: the daemon-owned gateway serves the browser client, the client uses the official `@univerjs-pro/collaboration-client`, URL state carries `file`, `worktree`, and `unit`, SSE keeps worktree/unit state current, and the worktree flow covers review, merge preview, merge, discard, and reset handling. OpenWork's job is to host that surface cleanly and connect it to OpenWork extension/artifact flows.

**Consequences**

The first OpenWork surface should embed the gateway-served collab-client view and pass the correct `.univer`, worktree, and unit route state. External-browser opening remains a development/fallback path, not the default product path. Component extraction into OpenWork can happen later, but it must preserve the existing collab-client navigation, viewing, editing gate, worktree review, merge preview, and SSE behavior. OpenWork must describe browser direct editing by current supported capability: agent edits happen through CLI/SaC/worktree commit paths; direct trunk editing is governed by the collab-client gate and should not be over-promised for unit types whose edit gate is not yet implemented.
