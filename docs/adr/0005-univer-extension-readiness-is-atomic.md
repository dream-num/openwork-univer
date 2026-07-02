# Univer extension readiness is atomic

The Univer CLI Extension is ready only when the complete `univer-cli` skill package is installed from `dream-num/skills`, the OpenWork-managed npm `univer` executable is resolved, and required health checks pass for the active workspace/runtime. Partial success is reported as detailed setup status, but it must not enable the extension as ready because users need the full agent skill plus executable runtime to complete Univer work.

**Consequences**

The installer must preserve per-part diagnostics while exposing a single incomplete/ready result. OpenWork can show that the skill or executable installed successfully, but managed agent sessions and Univer actions should treat the extension as incomplete until every required part is healthy.
