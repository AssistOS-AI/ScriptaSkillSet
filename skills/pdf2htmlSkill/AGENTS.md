# AGENTS.md

## Scope

This repository is one portable `pdf2html` skill. The root `SKILL.md` is the operational entry point and `DS.md` is the design contract.

## Reading order

1. Read `README.md` for setup and user-facing commands.
2. Read `SKILL.md` completely before converting a PDF or changing the workflow.
3. Read `DS.md` for boundaries and invariants.
4. Read the relevant file under `references/`.
5. Read the complete affected source module and its tests before editing.

## Repository rules

- Keep persistent documentation, descriptors, code comments, and diagnostics in English.
- Keep the skill self-contained and use no host-project source imports.
- Do not add OCR, remote document upload, or LLM validation without an explicit contract change.
- Preserve input PDFs and unknown files in output directories.
- Update `README.md`, `SKILL.md`, `DS.md`, `skill.json`, references, and tests when interfaces or behavior change.
- Use Python 3.10 through 3.13, type hints, focused modules, pathlib, and explicit subprocess argument arrays.
- Run unit tests, syntax checks, `doctor`, and at least one opted-in integration conversion after substantive implementation changes.

