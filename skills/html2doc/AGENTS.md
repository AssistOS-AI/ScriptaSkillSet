# AGENTS.md

## Scope

This directory is one portable Scripta HTML-to-DOCX skill. `SKILL.md` is the operational contract and `DS.md` records design boundaries.

## Reading order

1. Read `README.md` for setup and commands.
2. Read `SKILL.md` completely before converting a document or changing behavior.
3. Read `DS.md` and the relevant reference file.
4. Read each affected source module and its tests completely before editing.

## Repository rules

- Keep persistent documentation, descriptors, diagnostics, and code comments in English.
- Keep the skill self-contained; do not import host-project code.
- Do not add arbitrary-web support, LLM calls, remote resources, visual rendering, or office-suite dependencies without a contract change.
- Never rewrite source prose or infer footnotes from presentation alone.
- Preserve input HTML, assets, and unrelated output files.
- Update public documentation, `skill.json`, references, and tests when interfaces change.
- Use Node.js >=22 ECMAScript modules in `.mjs` files, `node:` built-ins, explicit subprocess argument arrays, atomic publication, and useful errors. Keep dependency exceptions and license records in `dependencies.md`.
- Run tests, syntax checks, `doctor`, and an end-to-end conversion after substantive changes.
