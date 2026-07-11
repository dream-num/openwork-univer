# Exclude macOS x64 from desktop releases

OpenWork will remove macOS x64 from this repository's supported desktop platform and release matrix. It will not publish an Intel macOS artifact with a Univer CLI Extension that cannot reach Ready state, and accidental macOS x64 packaging must fail with an explicit unsupported-platform result.

The pinned `univer-cli` dependency closure publishes macOS ARM64, Linux x64/ARM64, and Windows x64 variants for required UEX and formula native components, but it does not publish the corresponding macOS x64 variants. Preserving an OpenWork-only Intel build would create a partially supported product contract and additional conditional setup behavior.

**Consequences**

Release workflows, updater/download asset selection, documentation, and validation matrices must stop advertising or expecting macOS x64 artifacts. macOS ARM64, Linux x64/ARM64, and Windows x64 remain Supported Univer Desktop Platforms and must each prove their complete packaged native dependency closure.
