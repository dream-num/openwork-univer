---
status: superseded by ADR-0021
---

# Extract only Cowork host contracts

OpenWork will move only reusable Univer runtime contracts into `@univer/cowork`, such as visible Univerfile discovery, `univer open` handoff parsing, bundle health/shim preparation, and daemon startup retry behavior. OpenWork keeps session binding, artifact target derivation, sidebar hierarchy, settings UI, and Univer Artifact Header policy because those decisions belong to the OpenWork product model rather than the Univer cowork runtime.

**Consequences**

`@univer/cowork` should stay headless and host-neutral. It may return local file summaries, gateway origins, route fields, bundle status, and daemon results, but it must not return `OpenTarget`, OpenWork session metadata, sidebar rows, or user-facing OpenWork labels. OpenWork adapters consume those contracts and map errors, permissions, workspace-relative paths, and product states locally.
