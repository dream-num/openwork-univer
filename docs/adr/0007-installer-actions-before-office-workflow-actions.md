# Installer actions before office workflow actions

The first Univer CLI Extension slice will expose only installer-scoped actions such as setup status, install, retry, and repair. Office workflow actions such as import, export, inspect, apply, verify, and open belong to the later native `.univer` office surface and CLI adapter work, not the installer PR.

**Consequences**

The first implementation can prove extension setup, executable provisioning, skill installation, and readiness without committing to the full office action interface too early. Agents can still use `univer-cli` directly through the installed skill and executable while the product-level workflow actions are designed behind the `.univer` native surface.
