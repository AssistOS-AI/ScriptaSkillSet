# Design specification

## Purpose

Humanise prose in book-length HTML through a same-language, conservative editorial pass. The active LLM owns language-sensitive judgment. Deterministic code guarantees resumability, bounded context, markup preservation, paragraph coverage, and validation.

## Pipeline

1. `prepare` snapshots the original HTML, discovers its language, assigns chapter boundaries, extracts every human-facing text node and attribute, identifies verify-only factual material, protects markup and factual tokens, applies exact-match memory, and creates chapter-aligned batches near 32,000 model characters.
2. The active LLM reads `bootstrap.json`, writes a shared style profile to `context.json`, and sets `profileReviewed` to true. This freezes the editorial policy before parallel work begins.
3. Up to four ready chapter batches may be processed in parallel. Each required unit receives exactly one `keep` or `rewrite` result and four affirmative audit checks. Verify-only units must be returned unchanged with `keep`.
4. `build` verifies source integrity and result schemas, restores protected markup, expands exact matches, validates the candidate against the original snapshot, then publishes atomically.
5. `validate` can compare any candidate independently.

## Editorial policy

Prefer small, defensible changes. Remove canned openings and conclusions, redundant signposting, inflated abstractions, repetitive triads, artificial antitheses, needless hedging, mechanical transitions, and monotonous sentence rhythm. Preserve the author's meaning, register, terminology, uncertainty, examples, citations, and argument.

Never translate, invent facts, add citations or anecdotes, introduce first-person experience, change the thesis, or force quirky variation. Bibliographies, references, copyright/legal text, citation-only blocks, identifier-heavy metadata, and page accessibility labels are audited but not rewritten.

## Safety properties

- No source mutation without explicit `--in-place`.
- No intermediate approval prompts.
- No paragraph or inline element may disappear.
- Scripts, styles, code, links, resource paths, structural attributes, and protected factual tokens remain stable.
- Every model-required unit is accounted for exactly once.
- Failed validation leaves `candidate.html` and does not publish it.
- The report states that deterministic checks and LLM self-audit do not prove authorship or factual correctness.

## Coding style and runtime

Write executable modules as .mjs ECMAScript modules with explicit relative imports,
node: imports for built-ins and async/await. Keep functions focused and all skill
resources inside this folder. Resolve resources with import.meta.url. Node.js 22
or newer runs commands and the node:test suite. Bundled dependency exceptions,
licenses and update procedures are recorded in dependencies.md.

Preserve command arguments, JSON schemas and ownership checks. Doctor reports
Node.js and htmlparser2 versions. Tests compare reference fixtures and exercise
publication safeguards, language handling and portable startup.

Language is read from `<html lang>` unless `--language` is supplied. Tags use
hyphenated BCP 47 syntax and are normalized by Node.js `Intl.Locale`.
