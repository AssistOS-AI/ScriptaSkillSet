# Node Coding Style Design Summary

## Introduction

`node-coding-style` supplies default coding instructions for projects and portable skills when it is available and no explicit user or project rule chooses another style.

## Core Content

Generated executable code uses Node.js ECMAScript modules in `.mjs` files, async/await, built-ins, and local resources. The style preserves explicit instructions and does not authorize unrelated migrations. Project guidance records the effective rules so subsequent work can follow them.

Dependencies are eliminated or avoided by default. A requirement with no suitable equivalent may justify Python, a library, or a CLI tool. Small standalone components are preferred, with accepted source pinned and retained under the project's or owning skill's `external/` folder. Every dependency, including transitive, vendored, build, and environment requirements, has a local `dependencies.md` record of justification, alternatives, authorization, version, source/update URLs, license obligations, startup checks, and removal opportunities. MIT and Apache-2.0 are preferred; LGPL is permitted as an exceptional limited-copyleft choice after its actual obligations are established.

Discovery of executable Python skills triggers one conversion question unless the project or session already records the decision. Conversion requires authorization and preserves public behavior. Unavoidable heavy dependencies may be installed in the environment only with installation authorization. Required dependencies are checked before application or affected skill-script work, with actionable stderr diagnostics and nonzero exit on missing or incompatible prerequisites. Optional dependencies are checked only for their selected feature.

The complete folder is portable and has no executable or third-party dependencies. `assets/dependencies.md` supplies the record structure for consumers; `dependencies.md` describes this skill itself.

## Decisions & Questions

### Question #1: When does the default apply?

Response: The default applies when the skill is available and no explicit user or project rule chooses another style. Explicit instructions govern their applicable scope.
