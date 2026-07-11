## REMOVED Requirements

### Requirement: Cowork host contracts stay headless and host-neutral

**Reason**: The stable `@univerjs-pro/cowork` publication is intentionally browser-safe and does not publish the former Node host-contract entry point.

**Migration**: Consume published Cowork UI/headless APIs in the renderer and keep filesystem, process, packaging, and OpenWork policy in the OpenWork Univer CLI Adapter.

### Requirement: Visible Univerfile discovery is reusable but navigation is OpenWork-owned

**Reason**: `@univerjs-pro/cowork@0.1.0` does not publish `./node`, and Visible Univerfile discovery is currently needed only by OpenWork.

**Migration**: Port the deterministic discovery and ignore/limit tests into `apps/server/src/univer-runtime/`, while preserving workspace-relative mapping and navigation behavior.

### Requirement: Univer Open Handoff parsing is shared

**Reason**: The former requirement coupled server host ownership to an unpublished Cowork Node contract even though the published renderer SDK and OpenWork server have different packaging boundaries.

**Migration**: Keep renderer handoff recognition on the Published Cowork SDK and keep server handoff validation in the OpenWork host module with equivalent loopback and expected-file tests.

### Requirement: Bundle and daemon runtime behavior is reusable

**Reason**: The published Cowork SDK contains neither the former Cowork bundle resources nor Node daemon/shim helpers; the CLI and skill are independent compatibility-set inputs.

**Migration**: Replace Cowork bundle resolution with the OpenWork compatibility manifest and offline distribution, and port daemon/shim behavior into the OpenWork host module.

### Requirement: Optional convenience helpers wait for real duplication

**Reason**: This requirement governed future extraction into the retired Cowork Host Contract capability and no longer defines current product behavior.

**Migration**: Keep OpenWork-specific convenience helpers local unless a future published package proposal establishes a new cross-host contract.
