# Managed npm install for univer-cli

The first Univer CLI Extension implementation will provision `univer-cli` through an OpenWork-managed npm package install. OpenWork will install the package into its own managed directory, resolve the package `univer` bin, and inject that bin into managed OpenCode sessions; bundled binaries are deferred until the npm path proves insufficient.

**Consequences**

This keeps v1 close to the current Node CLI distribution model and avoids early packaging/signing complexity. OpenWork must still own the install directory, npm command execution, version status, repair flow, and bin-path resolution instead of relying on the user's global npm environment.
