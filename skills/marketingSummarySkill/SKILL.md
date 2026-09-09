---
name: marketingSummary
description: Turn a comprehensive summary or another semantic HTML document into a concise, same-language editorial sales page that builds curiosity by explaining the book's questions, stakes, distinctive approach, and reader fit without revealing answers, conclusions, twists, resolutions, or outcomes. Use chapter-aware approximately 32k-character batches, explicit safe-hook and protected-revelation ledgers, adaptive 250–650-word output, an independent semantic spoiler review, and the active LLM. Do not use for direct PDF, DOCX, plain-text, Markdown, translation, fabricated endorsements, or aggressive ad copy.
---

# Marketing Summary

Use this skill when the user wants persuasive editorial copy for a book or document while withholding its answers and spoilers. Input must be `.html` or `.htm`. A `comprehensiveSummary` output is supported directly; its visible essay is extracted while its source map and technical metadata are ignored. Convert other formats with the appropriate skill first.

## Required workflow

1. Run `scripts/marketingsummary doctor`.
2. Run `scripts/marketingsummary prepare INPUT`. Pass `--language`, `--output`, or `--job-dir` only when necessary. Keep the returned job path.
3. Read all of `context.json`, `chapters.json`, and every ready batch. Analyze up to `recommendedParallelAnalyses` batches concurrently. Write the exact analysis schema in [references/job-format.md](references/job-format.md), explicitly separating safe hooks from protected revelations. Never ask for per-batch confirmation.
4. Repeat `status` until `synthesis_required`. Read every analysis and write `synthesis.json`. Detect `fiction`, `nonfiction`, or `hybrid`; select only safe hooks; register every protected revelation; and create a sales-page outline within the adaptive budget.
5. When `status` returns `draft_required`, write `draft.json` as concise editorial sales copy. Explain the central questions, tension, stakes, approach, and reader fit without giving the answers. End with a subtle open loop, not a direct purchase command.
6. When `status` returns `review_required`, compare every draft paragraph against every protected revelation and write `review.json`. If any answer, conclusion, recommendation, twist, resolution, or outcome leaks, revise only the affected draft text and repeat the review without asking the user.
7. Continue until `ready_to_build`, then run `scripts/marketingsummary build JOB` followed independently by `scripts/marketingsummary validate SOURCE --html OUTPUT`. Repair rejected artifacts and retry automatically.

## Editorial rules

- Write in the source language for a general educated reader.
- Use a text-first sales-page shape: headline, dek, stakes, central questions, distinctive approach, reader fit, and a subtle invitation created through an unresolved tension.
- For nonfiction, reveal subject, premise, method, tensions, and why the questions matter; withhold conclusions, verdicts, solutions, prescriptions, and final recommendations.
- For fiction, reveal only the initial setup, atmosphere, characters, and starting conflict; withhold twists, hidden identities, major revelations, relationship outcomes, character fates, and the ending.
- In hybrid work, apply the stricter rule to each claim or plot element.
- Do not add buttons, prices, testimonials, ratings, invented benefits, purchase links, or unsupported author claims.
- If the source lacks enough safe material, fail explicitly rather than inventing copy or exposing a protected revelation.

## Size and source rules

- The length is automatic and has no user-facing length option: sources up to 5,000 words produce 250–300 words; 5,001–20,000 produce 375–475; longer sources produce 550–650.
- Keep batches chapter-aligned and near 32,000 model characters; split only between semantic units.
- Analyze every content chapter. Exclude navigation, scripts, styles, legal boilerplate, page labels, visible source maps, and unannotated bibliography material while recording exclusions.
- Every hook and final paragraph must cite valid internal source-unit IDs. Never invent facts, names, dates, numbers, URLs, DOI values, or examples.
- The original file is immutable. The result is a new self-contained HTML page.

## Completion standard

Deliver only after all content batches are analyzed, every protected revelation is registered, every visible paragraph passes the independent spoiler review, the adaptive word range is met, and build plus independent validation pass. Keep metrics, source IDs, spoiler ledgers, and validation details in the job and report only; never render them in the user-facing page or handoff.
