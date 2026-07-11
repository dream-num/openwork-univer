# Allow only an explicit Univer CLI development override

OpenWork will use the Univer Compatibility Set for normal development and every release. Developers may opt into an unreleased local CLI only by setting `OPENWORK_UNIVER_EXECUTABLE`; OpenWork reports that source as a development override and excludes it from compatibility-set and release claims.

This supersedes ADR-0002's allowance for an implicit system `PATH` fallback. Automatic system discovery and adjacent `../univer-cli` detection can silently select an unverified version, while checked-in `link:` or `file:` dependencies would recreate the repository coupling this migration removes.

**Consequences**

Tracked manifests and lockfiles contain registry versions only. Cowork and skill inputs have no local-path fallback, and release validation fails if local dependency protocols or an implicit executable source are present.
