# Univer installer health checks

The v1 Univer CLI Extension health check requires four probes: the resolved `univer` executable responds to version or help, the complete `univer-cli` skill package is installed, `univer inspect tools list --json` succeeds, and `univer sac migration templates --json` succeeds. The installer does not run a real `.univer` create/apply/verify smoke in readiness because that would make setup heavier than necessary and blur install health with office workflow validation.

**Consequences**

Readiness proves that the executable, agent knowledge package, inspect evidence layer, and SaC authoring discovery are available. End-to-end `.univer` creation, editing, viewing, and verification still require separate product-flow validation such as tests or fraimz.
