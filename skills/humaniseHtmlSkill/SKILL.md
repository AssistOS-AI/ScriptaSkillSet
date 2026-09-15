---
name: humaniseHtml
description: Conservatively edit large same-language semantic HTML documents and books so prose reads naturally and avoids generic LLM mannerisms, while preserving DOM structure, formatting, scripts, styles, links, assets, citations, numbers, and meaning. Use chapter-aligned approximately 32k-character batches, a shared style profile, exact-match memory, parallel batch work, and deterministic paragraph-by-paragraph validation. Do not use for translation or for claims about defeating AI detectors.
---

# Humanise HTML

Use this skill when the user wants existing HTML prose made more natural, less formulaic, or less recognizably machine-styled without changing its language or structure. Reuse authorization from the parent correction workflow, including on resume. Do not restart its permission preflight or ask for stage, batch, retry or local-installation confirmation. Run allowed workspace operations in the default sandbox. Use actual approved launcher rules, not merely proposed prefixes, and do not immediately repeat an interrupted approval request. Request only genuinely missing platform permissions required for the work; never bypass them or promise the skill can suppress them. Keep job artifacts in the approved workspace.

## Required workflow

1. Run `scripts/humanisehtml doctor`.
2. Run `scripts/humanisehtml prepare INPUT [--language BCP47] [--output PATH | --in-place]`. Keep the returned job path.
3. Read `bootstrap.json` and all of `context.json`. Write a compact, language-appropriate style profile, preserve-term list, avoidance patterns, and notes to `context.json`, then set `profileReviewed` to true. This common profile is frozen before chapter work.
4. Run `scripts/humanisehtml status JOB`. Process all returned `readyBatches`, up to `recommendedParallelBatches` concurrently when parallel agents or workers are available. Never ask the user to confirm individual batches.
5. For every batch, read the entire batch and frozen context. Write the exact result schema described in [references/job-format.md](references/job-format.md) to the matching `rewrites/` path. Return one audited entry for every required unit, including unchanged and verify-only units. Preserve all tokens exactly.
6. Repeat status and batch processing until `ready_to_build`.
7. Run `scripts/humanisehtml build JOB`. Use `--overwrite` only for an existing skill-owned separate output. An in-place job already records the user's explicit source-replacement intent.
8. Run `scripts/humanisehtml validate SOURCE --html OUTPUT` as an independent final check. If a deterministic check rejects a unit, repair only that result and retry without asking the user.

## Editorial rubric

Use a conservative editorial pass. Remove generic introductions and summaries, repeated conclusions, mechanical transitions, excessive signposting, inflated abstractions, artificial antitheses, repetitive three-part constructions, uniform sentence rhythm, needless hedging, and canned phrases. Vary syntax only where it improves the existing voice.

Preserve meaning, factual claims, uncertainty, terminology, tone, chronology, examples, quotations, and citations. Never translate. Never invent facts, sources, opinions, personal experiences, examples, or anecdotes. Do not make the text artificially colloquial or quirky. A good paragraph may be returned unchanged.

Units marked `verify-only` must use `action: "keep"` with exact source text. This includes bibliographies and reference lists, copyright/legal text, citation-only blocks, identifier-heavy metadata, and page accessibility labels.

Document declarations and processing instructions are protected markup, never editorial units. Preserve their presence without converting an XML declaration or doctype into visible prose. If an older prepared job exposed a declaration as a text unit, retain its evidence and prepare a fresh job; transfer only reviewed units whose complete source and protection data still match.

## Large-document rules

- Treat `<h1>` boundaries as chapters when meaningful headings exist. Otherwise use top-level articles/sections, then a single virtual chapter.
- Keep batches chapter-aligned and near 32,000 model characters. Split oversized chapters only between units; never split a paragraph.
- Use the shared frozen document profile for every chapter. Batches can finish out of order after the profile gate.
- Exact repeated units use deterministic memory. Do not spend another model pass on them.
- Inspect and account for every human-facing paragraph, heading, list item, table cell, caption, and supported accessibility/metadata attribute.

## Completion standard

Deliver only after structural, token, factual-protection, paragraph-coverage, asset, duplicate, and style-signal checks pass. Report warnings honestly. LLM self-audit and deterministic heuristics improve editorial consistency but do not prove human authorship or guarantee factual correctness, and this skill makes no detector-evasion claim.

## Runtime

Use scripts/humanisehtml with Node.js 22 or newer. The HTML parser is bundled inside this skill;
language normalization uses Node.js Intl.Locale. See
[dependencies.md](dependencies.md).

Language is read from `<html lang>` unless `--language` is supplied. Tags use
hyphenated BCP 47 syntax and are normalized by Node.js `Intl.Locale`.

## Existing-book correction

In complete book maintenance, humanise the accepted PDF-faithful English baseline
once. Existing translations receive translation correction against final accepted
English and inherit its presentation; do not run separate target humanisation.
An explicitly requested independent same-language editorial pass remains supported.
Preserve baselines privately. Return chapter-level before/after evidence so the host can review every
affected chapter in all existing translations, including changes caused by English
humanisation. Recheck full chapter meaning and terminology, not only edited sentences.
Do not generate translations from English humanised prose or modify fonts/layout as
an editorial rewrite. Short readers and metadata are reviewed after final full editions.
Temporary humanised outputs are promoted by the authorized host to existing canonical
paths only after all complete-workflow gates pass; they are not new published editions.

Use `scripts/humanisehtml repair --report REPORT_JSON` for localized fixes to an existing audited book. The active LLM proposes exact replacements; `--patches FILE --output NEW_HTML` creates a separate candidate and requires revalidation. No missing translations or whole chapters are generated. See [repair contract](references/repair.md).
