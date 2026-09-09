---
name: shortDescription
description: Create a same-language standalone HTML description of an HTML book or document in 4–6 sentences, describing only its subject, scope, central questions, and thematic tensions while withholding nonfiction answers, solutions, conclusions, recommendations, and fiction spoilers. Accept marketingSummary, comprehensiveSummary, or other semantic HTML; use chapter-aware batches, source-unit evidence, a protected-revelation ledger, and an independent semantic review with the active LLM.
---

# Short Description

Use this skill for a compact thematic description, not a summary of conclusions and not sales copy. Input must be `.html` or `.htm`. Output is `shortDescription.html` beside the source unless `--output` is supplied.

## Required workflow

1. Run `scripts/shortdescription doctor`.
2. Run `scripts/shortdescription prepare INPUT` and retain the returned job path.
3. Read `context.json`, `chapters.json`, and every ready batch. Analyze up to `recommendedParallelAnalyses` batches concurrently, writing the exact analysis schema from [references/job-format.md](references/job-format.md). Separate safe themes from protected revelations.
4. Repeat `status` until `draft_required`. Read all valid analyses and write `draft.json` with 4–6 individually sourced sentences.
5. When `review_required`, independently compare every sentence with every protected revelation and write `review.json`. Revise and repeat if any answer, solution, conclusion, recommendation, twist, resolution, or outcome leaks.
6. At `ready_to_build`, run `build JOB`, then independently run `validate SOURCE --html OUTPUT`. Repair failures without asking for per-batch confirmation.

## Editorial rules

- Write in the source language for a general reader, in a neutral and informative tone.
- Describe only the subject, scope, context, central questions, and thematic tensions.
- Do not explain what solution, answer, verdict, conclusion, prescription, or recommendation the work provides.
- For fiction, reveal only premise, setting, initial characters, and starting conflict; withhold twists, hidden identities, outcomes, fates, and ending.
- Do not use sales language, calls to action, reader promises, praise, ratings, testimonials, or invented facts.
- The visible output is exactly one paragraph containing 4–6 sentences. It has no visible heading.

## Source and output rules

- Prefer `article[data-marketing-summary]` for marketingSummary input and `article[data-summary-body]` for comprehensiveSummary input. Otherwise use the primary semantic content container.
- Exclude scripts, styles, navigation, source maps, bibliographies, references, legal boilerplate, hidden content, and page labels.
- Keep batches chapter-aligned and near 32,000 characters. Analyze every content chapter.
- Preserve the source byte-for-byte. Successful completion leaves only the requested HTML artifact; job files are removed after build.

## Completion standard

Deliver only after all batches are analyzed, every protected revelation is registered, each sentence passes independent semantic review, the source remains unchanged, and build plus independent validation pass.
