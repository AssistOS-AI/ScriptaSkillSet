# Design specification

## Purpose

Create a neutral, same-language HTML description containing 4–6 sentences about a document's theme. The description identifies subject, scope, context, central questions, and tensions while withholding the work's solutions and revelations.

## Pipeline

1. `prepare` snapshots immutable source bytes, detects marketing summary, comprehensive summary, or semantic HTML, extracts source units, excludes non-content, and creates chapter-aligned batches near 32,000 characters.
2. The active LLM analyzes every batch into safe themes and protected revelations. Each item cites source-unit IDs.
3. The active LLM writes 4–6 individually sourced thematic sentences from safe themes only.
4. A separate semantic review compares every sentence against the complete protected ledger. Any leak returns the job for revision.
5. `build` validates schemas, evidence, guard phrases, source hash, facts, and sentence count; publishes atomically; then removes the job. `validate` independently checks the artifact.

## Output

The default artifact is `shortDescription.html`. It is standalone UTF-8 HTML with minimal responsive styling and exactly one visible paragraph inside `article[data-short-description]`. There are no visible headings, links, scripts, controls, metrics, source IDs, or promotional elements.

## Safety

Only Beautiful Soup is a runtime dependency. Language tags receive conservative standard-library validation. Source HTML is never modified. Existing output is overwritten only when it carries this skill's ownership marker and `--overwrite` is explicit. Failed jobs remain available for repair; successful jobs are removed.
