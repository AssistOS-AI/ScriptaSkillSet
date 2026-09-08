# AGENTS.md

## Scope

This directory is one portable Scripta DOC/DOCX-to-PDF skill. `SKILL.md` is the operational contract and `DS.md` records design boundaries.

## Reading order

1. Read `README.md` for setup and commands.
2. Read `SKILL.md` completely before converting a document or changing behavior.
3. Read `DS.md` and the relevant reference file.
4. Read each affected source module and its tests completely before editing.

## Repository rules

- Keep persistent documentation, descriptors, diagnostics, and code comments in English.
- Keep the skill self-contained; do not import host-project code.
- Preserve source documents and unrelated output files.
- Never install system software as a side effect of `convert`; installation requires the explicit `install-deps` command.
- Keep LibreOffice isolated in a temporary user profile and disable macro execution.
- Update public documentation, `skill.json`, references, and tests when interfaces change.
- Use Python 3.10 through 3.13, type hints, pathlib, atomic output, explicit subprocess arrays, and explicit errors.
- Run tests, compile checks, `doctor`, and an end-to-end conversion after substantive changes.
