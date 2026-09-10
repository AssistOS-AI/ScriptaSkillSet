# AGENTS.md

## Scope

This repository subtree is the portable, LLM-driven `translateHtml` skill. `SKILL.md` is the operational contract and `DS.md` records its design decisions.

## Rules

- Keep the skill independent of any host, translation provider, or model name. The active LLM translates prepared units.
- Never mutate the source HTML or copy its assets.
- Preserve scripts, styles, element topology, identifiers, classes, data attributes, links, and inline markup.
- Keep persistent documentation, diagnostics, descriptors, and code comments in English.
- Use the launcher as the only runtime entry point in normal operation.
- Update documentation, descriptors, lockfile, and tests when behavior or interfaces change.
- Run unit tests, compile checks, `doctor`, and an end-to-end prepare/build/validate fixture after substantive changes.

## Implementation rules

Follow the coding style and runtime section in [DS.md](DS.md). Use .mjs modules
and Node.js built-ins; document bundled dependency exceptions in dependencies.md.
Run `node --test tests/*.test.mjs`, syntax checks and `scripts/translatehtml doctor`.
