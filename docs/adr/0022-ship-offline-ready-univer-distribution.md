# Ship an offline-ready Univer distribution

OpenWork desktop releases will include the exact pinned `univer-cli` npm package and a revision-pinned canonical `univer-cli` skill snapshot extracted from `dream-num/univer-cli`. Required setup health checks must succeed on first use without downloading packages or consulting the npm registry; network access is reserved for explicit repair or upgrade operations.

This supersedes ADR-0004, which made a managed npm install the default setup path. A first-use install would keep release artifacts smaller, but it would make the local-first desktop experience depend on registry and GitHub availability.

**Consequences**

The OpenWork release process must resolve, stage, and verify both pinned inputs, including their versions, skill revision, required files, and runtime capabilities. Standalone server distributions without embedded resources may retrieve the same locked inputs during explicit setup or repair, but they must not silently float to `latest`.
