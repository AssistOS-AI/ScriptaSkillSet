# Design specification

## Purpose

Create a coherent summary essay that covers a book's message rather than concatenating chapter abstracts. The source is semantic HTML. The active LLM analyzes each chapter, discovers semantic recurrence and distinctive ideas, then writes a same-language synthesis for an educated general reader.

## Pipeline

1. `prepare` snapshots the source, extracts content-bearing semantic units, classifies structural/non-content chapters, and creates chapter-segment batches no larger than approximately 32,000 characters.
2. Up to four batches are analyzed concurrently. Every content chapter receives a thesis, role, sourced ideas, evidence/examples, objections, and qualifications.
3. One synthesis clusters related ideas across the complete set of analyses. Ranking is 50% centrality, 25% recurrence, and 25% originality, with redundant clusters merged rather than repeated.
4. A draft turns the selected clusters into one thematic essay. When the requested duration is short, message coverage wins over chapter-by-chapter visibility. Every paragraph cites internal cluster and source-unit IDs.
5. `build` validates the exact schemas and evidence graph, renders a responsive standalone HTML document, appends a collapsible chapter/idea map, validates again, and publishes atomically.

## Reading budget

The default speed is 200 words per minute. The target is `minutes × wordsPerMinute`; build accepts 90–110% of that count. All reader-facing text inside the main summary article counts, including headings and the title. Word-count and estimated-duration metrics are retained only in the technical report and hidden document metadata; the HTML must not render a reading-time badge or similar user-facing statistics. The collapsible source map does not count. Requested lower bounds at or above the extracted source word count are rejected because the result would not be a summary.

## Safety and quality

The source is immutable. All content chapters must be analyzed even when the final essay omits low-priority material. Sparse title-only sections without substantial prose are recorded as structural rather than treated as chapters. Any number, date, percentage, URL, email, or DOI used in the essay must exist in the source. Final claims retain source-unit references, but semantic faithfulness still relies partly on LLM review and is reported as such.

The output contains no copied scripts or application behavior from the source. It is a new, self-contained semantic document with embedded CSS, stable hidden metadata, a unified thematic essay, and a separate source map. Internal budget metrics are never displayed to readers. Failed validation retains a candidate inside the job and never publishes it.
