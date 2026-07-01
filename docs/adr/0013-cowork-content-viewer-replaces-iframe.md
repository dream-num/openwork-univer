# Cowork content viewer replaces iframe surface

OpenWork will render `.univer` artifact content with a `Cowork Content Viewer` extracted from `collab-client` embedded mode into `@univer/cowork`, instead of iframe-embedding the gateway-served embedded page. The gateway remains the collaboration, worktree, SSE, websocket, and merge-preview data service, but OpenWork will not keep an iframe fallback for the artifact surface; viewer initialization or runtime failures should render native OpenWork error and retry states.
