# Repository guidance

This directory contains one portable HTML audiobook skill. Read `SKILL.md`,
`README.md`, `DS.md` and the relevant reference before changing its public behavior.

- Keep documentation, comments and diagnostics in English.
- Keep the skill independent of host-project imports. Its external speech runtime
  is separate and belongs under ignored `runtime/` or a configured existing checkout.
- Preserve input files and unrelated outputs. Never weaken ownership checks,
  text-audit failures, or staged publication to force a conversion through.
- Every conversion option must retain a usable default; only the source is required.
- Do not add cloud speech, cloning, translation, OCR or automatic image descriptions
  without an explicit contract change.
- Update the skill, descriptor, references and tests when behavior changes.
- Run unit tests and real FFmpeg packaging tests after substantive edits. Run the
  opt-in speech integration tests when changing the engine adapter and a usable
  runtime is available. Report skipped or blocked speech tests explicitly.
- Distinguish preparation/decoding tests from human listening review. Do not mark
  pronunciation quality or offline operation verified without actual evidence.

The supported host platforms are macOS and Linux. Use type hints, pathlib,
structured JSON diagnostics, subprocess argument arrays and recoverable output
replacement.
