---
name: comprehensiveSummary
description: Create a comprehensive, same-language HTML summary of a large semantic HTML book for a requested reading duration. Analyze every content chapter, identify the central message, semantically recurring themes and distinctive original ideas, then synthesize a source-traceable unified essay with a collapsible chapter map. Use chapter-aligned approximately 32k-character batches, parallel analysis, strict word-budget and evidence validation, and the active LLM. Do not use for direct PDF input or translation.
---

# Comprehensive Summary

Use this skill when the user wants a book summarized to a requested reading time. Input must be a complete semantic HTML document. If the source is a PDF, use a PDF-to-HTML workflow first; this skill itself accepts HTML only. The workflow runs end to end without intermediate questions. If permission is required, request one combined approval before starting.

## Required workflow

1. Run `scripts/comprehensivesummary doctor`.
2. Run `scripts/comprehensivesummary prepare INPUT --minutes N`. Pass `--wpm`, `--output`, or `--job-dir` only when requested or necessary. Keep the returned job path.
3. Read all of `context.json`, `chapters.json`, and each ready batch. Analyze up to `recommendedParallelAnalyses` batches concurrently and write the exact analysis schema from [references/job-format.md](references/job-format.md). Do not ask for per-batch confirmation.
4. Repeat `status` until it returns `synthesis_required`. Read every analysis, merge split chapters, identify the book's central message, cluster semantic recurrence, preserve distinctive ideas, and write `synthesis.json` with the exact schema.
5. Run `status` again. When it returns `draft_required`, read the synthesis and relevant analyses, then write `draft.json`. Produce a thematic, unified essay for an educated general reader, not a list of chapter summaries.
6. Respect the word range in `job.json`. Count the title, dek, thematic headings, paragraphs, and conclusion; exclude the generated source map. If short, add only supported nuance or evidence. If long, remove redundancy before removing central or original ideas.
7. Run `scripts/comprehensivesummary build JOB`, then independently run `scripts/comprehensivesummary validate SOURCE --html OUTPUT`. Repair only rejected artifacts and retry without asking the user.

## Selection rules

- Analyze every content chapter, even when the final duration cannot represent each one visibly.
- Treat the central message and indispensable reasoning as non-negotiable.
- Rank clusters with 50% centrality, 25% recurrence, and 25% originality.
- Merge repeated ideas into a stronger synthesis instead of repeating them.
- Preserve rare ideas when they materially change the thesis, method, implications, objections, or conclusion.
- Prefer representative evidence over inventories of examples.
- Preserve uncertainty and disagreement. Do not turn a conditional argument into a conclusion.

## Source and language rules

- Stay in the source language from `<html lang>`; `--language` only corrects missing or wrong metadata and never requests translation.
- Never invent claims, facts, quotations, examples, citations, names, dates, numbers, URLs, or DOI values.
- Every analysis idea and every final paragraph must cite valid source-unit IDs.
- Exclude copyright/legal boilerplate, duplicate contents pages, navigation, page labels, and unannotated bibliography entries from idea ranking, while recording their exclusion.
- Do not reproduce source scripts, styles, navigation, or reader integrations. The summary is a new self-contained HTML document.

## Completion standard

Deliver only after every content chapter has a valid analysis, the evidence graph is complete, all source-bound factual tokens are supported, the main essay is within ±10% of the requested reading time, and the generated HTML passes structural validation. Keep the actual word count and estimated reading time in the technical report and hidden document metadata; do not render them in the user-facing page or handoff. LLM review and deterministic checks improve traceability but cannot guarantee perfect factual or interpretive accuracy.
