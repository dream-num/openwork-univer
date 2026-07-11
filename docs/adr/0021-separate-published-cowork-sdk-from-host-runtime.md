# Separate the published Cowork SDK from the OpenWork host runtime

OpenWork will consume the version-pinned `@univerjs-pro/cowork` browser SDK and `univer-cli` runtime as independent npm packages. Node-specific filesystem discovery, executable resolution and shims, daemon lifecycle, CLI provisioning, and skill distribution remain responsibilities of the OpenWork Univer CLI Adapter because the published Cowork SDK deliberately excludes a `./node` entry point and bundled runtime resources.

This supersedes ADR-0020. Expanding the Cowork publication would preserve the old host-contract extraction, while keeping the local package link would preserve the current bundle, but either choice would make OpenWork depend on a distribution surface that the stable Cowork package does not provide.

**Consequences**

OpenWork no longer treats Cowork as the owner of a matched CLI-and-skill bundle. Cowork, CLI, and the source-owned `univer-cli` skill remain separate inputs but are pinned, verified, and upgraded together through the OpenWork-owned Univer Compatibility Set.
