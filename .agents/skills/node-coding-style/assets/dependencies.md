# Dependencies

## Scope and policy

Identify the project or skill covered by this record. Prefer Node.js `.mjs` modules with built-ins and no third-party dependencies. Keep a skill's dependency record and bundled external code inside that skill's folder. Include runtime, development, build, browser/CDN, vendored, and environment dependencies in the inventory.

## Runtime prerequisites

Record the supported Node.js version and the APIs that require it. Record Python or any other runtime only when it is actually used, with its justification and version check. For an instruction-only skill, state that no runtime is required.

## External dependencies

State "None" if the inventory is empty. Otherwise replace this guidance with one entry per accepted dependency, including transitive dependencies. Separate optional feature dependencies from prerequisites required for every startup.

### Dependency entry fields

- Name and purpose: identify the component and the behavior that requires it.
- Scope and status: runtime, development, build, browser, vendored, or environment; required or optional; affected commands.
- Version and location: exact version/revision, compatible runtime range, and local path or resolution method.
- Acceptance: why built-ins, elimination, or a lighter equivalent cannot meet the requirement; alternatives considered; actual user authorization or inherited project decision, with unresolved approval stated explicitly.
- Upstream source URL: canonical repository or release source.
- Update URL and procedure: how to obtain and verify a new pinned revision, preserve local patches, and validate the update.
- License: exact license/version, bundled license and notice paths, modification notices, and obligations for the actual use and redistribution. Record any LGPL-specific source or relinking requirements.
- Packaging: vendored source path under `external/`, included assets, build steps, local changes, transitive dependencies, and any remaining downloads or environment requirements.
- Startup check: availability/version/capability probe, entry points that run it, and expected missing/incompatible-dependency diagnostic and exit status.
- Installation: verified platform-specific commands or documented provisioning path, including authorization required for global installation. Do not install at startup.
- Removal opportunity: what would allow the dependency to be eliminated or replaced, or which requirement currently prevents that.

## Verification

Record relevant checks of normal operation, missing or incompatible required prerequisites, optional-feature isolation, and portability after copying the project or skill. Update this record alongside manifests, vendored source, startup checks, and documentation when dependencies change.
