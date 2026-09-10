---
name: node-coding-style
description: Apply the default coding style when creating or changing project code, scripts, or portable skills and this skill is available, unless explicit user or project instructions specify another style. Generate dependency-free Node.js ECMAScript modules in .mjs files, document justified dependency exceptions, and ask before converting existing Python skills.
---

# Node coding style

## Apply the default

Use this style for code generation and maintenance whenever this skill is available and no explicit user instruction or project coding-style rule selects another approach. Read the project's agent guidance, coding-style specification, manifests, and relevant scripts first. Explicit instructions take precedence, including instructions limited to one component. Apply the default to the remaining scope.

When initializing or updating project guidance as part of the task, record the effective rules in its existing coding-style document and point to that document from `AGENTS.md`. If neither exists, add a concise default-style rule to `AGENTS.md`. In projects with design specifications, use `docs/specs/DS001-coding-style.md`. Do not depend on this catalog's filesystem path or require another skill to apply these rules. Availability supplies an agent instruction; copying a folder does not itself configure every agent runner.

## Generate Node.js modules

- Write executable code as Node.js ECMAScript modules in `.mjs` files. Use explicit exports, relative imports with file extensions, `node:` imports for built-ins, and async/await for asynchronous work.
- Use Node.js built-ins and local code by default. Do not add npm packages, Python, a transpiler, a bundler, or an external test framework for convenience. Use `node --test` and `node:assert/strict` when tests are needed.
- Keep functions focused and code portable. Resolve bundled resources relative to the module using `import.meta.url`, not a developer's working directory or home folder.
- Preserve public behavior and existing explicit platform constraints. This default governs new and changed code; it does not authorize a repository-wide rewrite or renaming unrelated legacy files.
- Keep a skill's scripts, references, templates, tests, vendored code, and dependency records inside its own folder. Copying that folder must retain everything it owns. Avoid runtime imports from the catalog root, sibling skills, or undeclared machine-local packages.

## Choose exceptions deliberately

First try to eliminate the dependency, implement a small maintainable solution with Node.js built-ins, or reuse an already available equivalent library or tool whose dependency cost is understood. Do not replace a sound specialized implementation with an unsafe or impractical homemade one merely to claim zero dependencies.

If no suitable equivalent meets the actual requirement, Python or an external library or CLI tool may be justified. Prefer Python's standard library when Python is necessary. Prefer a small standalone library or tool with no transitive dependencies over a package ecosystem, native build chain, or large runtime. An already installed tool still counts as a dependency and needs a record.

Prefer including accepted external source in `external/<component>/` under the current project, or under the owning skill folder when building a skill. Pin an upstream release or commit and retain the source, license, notices, and required assets. A local clone or source snapshot must be usable after copying the project or skill, without a hidden checkout, symlink outside the folder, missing submodule, or unrecorded download. Vendored code remains a dependency. Record any transitive or build requirements it retains.

Before adding an exception, establish the concrete need, rejected alternatives, footprint, license, and installation/update method. Honor approval requirements in the project and the current session. Reuse explicit authorization already given; do not ask again for the same accepted choice. Global installation of an unavoidable heavy dependency requires user authorization for that installation. A style preference alone does not authorize installing it.

## Record dependencies

Create or update `dependencies.md` at the project root, or at the owning skill root for a skill task. Keep a skill's full dependency record local; a catalog-level inventory may link to it. Start from [assets/dependencies.md](assets/dependencies.md) when no record exists, adapting its fields to verified facts. Keep this file even when there are no external dependencies, and state that explicitly. Distinguish the Node.js runtime prerequisite from third-party dependencies.

For every accepted direct or transitive dependency, including vendored code, Python, development/build tools, browser/CDN libraries, and globally installed CLIs, record:

- Its purpose, scope, required or optional status, version or immutable revision, and location or resolution method.
- Why it was accepted, which dependency-free or lighter alternatives were rejected and why, and the applicable approval or inherited project decision. Mark unresolved facts as unresolved rather than inventing approval.
- Its upstream source URL, update URL and procedure, local changes, and any build or transitive requirements.
- Its exact license and version, the location of bundled license/notice files, and applicable redistribution or modification obligations.
- Its startup check, missing/incompatible-dependency error, supported installation steps, and a concrete removal or replacement opportunity, or the requirement that currently prevents removal.

Reassess dependencies when changing the code that uses them. Remove unused dependencies and their obsolete setup steps within the authorized scope. Update the record, manifests, startup checks, and relevant documentation together. Do not silently remove a dependency required by another workflow.

## License choices

For exceptional third-party additions, prefer permissive licenses such as [MIT](https://opensource.org/license/mit) and [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0). Verify the license of the exact source revision and its bundled dependencies; retain required copyright, license, and attribution notices and document local modifications.

LGPL is an allowed exceptional choice requested by this policy, but it is a limited copyleft license, not a permissive license. Check its exact version and the intended use and distribution. Record applicable library-source, modification, notice, and replacement or relinking obligations. See the [LGPL-3.0 text](https://opensource.org/license/lgpl-3-0) for that version. Do not infer that all LGPL versions or integration methods impose identical obligations. Unknown or incompatible licensing does not qualify as an accepted exception; select another option or explain the blocker.

## Existing Python skills

When inspecting a project's skills, look for Python entry points, `.py` files, Python commands in descriptors, and Python dependency manifests. Read enough to distinguish executable skill logic from illustrative snippets or bundled third-party code. Ask whether the user wants the affected Python skills converted to this standard, unless a conversion decision or explicit Python requirement already exists in the session or project guidance. Name the relevant skills and describe the expected dependency reduction and known functional limits.

Ask once for the relevant set. Continue independent authorized work while awaiting the answer. Do not interpret silence as consent. If conversion is declined or Python is explicitly required, preserve it and record the exception; do not repeatedly prompt. If conversion is accepted, preserve the interfaces and outputs, validate representative behavior, update invocations and dependency records, and remove obsolete Python requirements only after checking that no remaining workflow needs them.

## Unavoidable environment dependencies

Use a global/environment installation only when the required capability cannot reasonably be made self-contained. Before requesting installation, prepare the exact package/tool, supported version, platform-specific command, reason local packaging is unsuitable, and entry in `dependencies.md`. Use existing authorization where it covers that installation. Do not install globally or modify the environment silently.

Implement a prerequisite check at application startup for required system dependencies, and at each affected standalone skill script's entry point. Run it before starting listeners, creating outputs, or doing substantive work. Check availability and the required version/capability, including the Python interpreter and required modules when applicable. For external commands use bounded probes with argument arrays rather than shell interpolation. Catch failed dynamic imports or tool launches so missing packages produce a useful diagnostic rather than an opaque stack trace.

If a required dependency is missing or incompatible, write a clear error to stderr naming the dependency, required version/capability, affected command, and documented installation/remediation steps, then exit with a nonzero status. Check optional dependencies when their feature is selected; unrelated commands must remain usable. Do not download or install dependencies during startup. Check the application's own startup, not the operating system's boot configuration.

## Verify the result

Run Node.js syntax checks and focused behavioral checks appropriate to the change. If an exception has a startup check, exercise both a working environment and a missing or incompatible prerequisite and confirm failure occurs before side effects. For portable skills, verify resource resolution from another working directory and inspect the copied folder for undeclared imports or external paths. Keep outputs plain text unless the project's interface explicitly requires a serialized format.

This instruction-only skill has no executable or third-party dependencies. Its own inventory is [dependencies.md](dependencies.md).
