# Validation contract


## Source table evidence

The read-only `decorations INPUT.pdf` JSON includes `tables` alongside borders, lists and horizontal rules. It recognizes closed ruled grids and tables whose horizontal row rules and adjacent cell fills establish complete column partitions, including unfilled alternating rows. Recognition requires text confined to every inferred column; decorative rectangles, crossing text and missing boundaries are rejected. Evidence includes source page width, cell text and spans, column widths, fills, individual border edges, vertical alignment and uniform typography. Mixed typography remains null and unsupported tables remain uncertified. The command flushes stdout before exit and performs no conversion, installation or rasterization.


Validation separates correctness gates from diagnostic evidence.

For an existing-book repair, references/repair.md additionally requires source-specific typography/layout comparisons and actual host-reader testing. Token recall, no overflow and the informational pixel score do not establish visual fidelity. Record fallback fonts, invented contents grids, altered paragraph spacing and lost reader styling as unresolved defects, not acceptable consequences of reflow.

## Correctness gates

- Normalized source-token recall measures content coverage. Scores below 0.98 warn and scores below 0.95 fail.
- Adjacent-token pair recall measures local reading order. Scores below 0.95 warn and scores below 0.90 fail.
- Stable `page_N` anchors must cover every PDF page exactly, including pages without extracted text.
- During conversion, the number of native HTML tables must equal the number of Docling table items.
- HTML must contain at least one valid local image for every Docling picture item and every independently recovered embedded-image occurrence.
- Every referenced local image must exist, decode successfully, and have nonzero dimensions.
- Chromium must load the HTML at 1440, 1024, and 390 CSS pixels without console errors, broken images, or global horizontal overflow. Source-derived table geometry is clamped to its responsive content box; only genuinely wide native tables may scroll inside their dedicated wrapper.
- Centered display spacing may preserve large source gaps only between adjacent centered flow blocks; ordinary intervening prose terminates that spacing sequence.
- Reader resizing must preserve text proportions and reflow long words in headings, paragraphs, lists, table cells, and captions. Test both the reader's extracted HTML view and its local iframe at 1440, 1024, and 390 pixels, including the largest supported text size.

## Structural comparison tools

Run the Node.js checks with:

```bash
node --test tests/document-equivalence.test.mjs
node tests/document-equivalence.mjs reference.json candidate.json
```

The comparator accepts DoclingDocument JSON and checks ordered body items, page provenance, text, table spans and headers, attached captions, and image references. It selects the BODY content layer used by the HTML serializer, ignores exporter metadata, and normalizes whitespace. Exit status is 0 for equivalent structures, 1 for differences, and 2 for invalid input. The command displays the first 25 differences and the total count. Intermediate JSON differences require inspection against the HTML serialization contract. A matching structure still requires the source-typography, asset, and browser checks.

`tests/reader-contract.mjs` exports `verifyReaderControls(page, readerUrl, { width })`. Supply a Playwright Page in a fresh browser context and the actual reader URL. The helper clicks `[data-reader-text-larger]` and `[data-reader-text-smaller]`, checks proportional scaling and restoration, reaches the maximum size, loads lazy images, and rejects clipping or document horizontal overflow. Run each viewport in both extracted HTML and iframe views.

## Diagnostic evidence

Renderer regression tests cover a title page both with and without a source stroke: the former retains its measured border and spacing, while the latter receives neither. Shared heading CSS must not introduce a decorative rule.

Chapter-label tests cover exact source recovery, duplicate prevention, rejection of repeated headers and image regions, and 18pt medium headings without implicit bold. Compare displayed glyph width at the same PDF-to-CSS scale; reader font-size preferences must be accounted for separately.

Poppler renders the first, middle, and last source pages at 120 DPI. Chromium validates the complete semantic document in bounded-height screenshot segments at every viewport, so long books never become one oversized bitmap. The first, middle, and last HTML segments are retained as representative previews when detailed QA artifacts are enabled. The tool produces a side-by-side contact image and records a normalized pixel-distance score from these samples.

The visual score is informational. Reflow, page-break movement, browser font substitution, and different rasterizers can lower it without indicating content loss. Browser and operating-system versions are recorded because screenshot output varies across environments.

Validation status and metrics are returned directly to the caller. They are not added to the generated book artifact. When detailed QA artifacts are explicitly retained for an in-place conversion, they are written to a hidden `.pdf2html-qa/` directory beside `index.html`.

## Limitations

The checks prove that the recognized structure was serialized consistently; they cannot prove that a layout model classified every source region correctly. Formatting is applied only when an exact occurrence aligns between the PDF page and the HTML page. Repeated first-line indentation additionally requires a stable document-wide body edge and indent offset; table borders require matching source strokes along each cell edge. Ambiguous or unmatched formatting is deliberately omitted rather than guessed. Table rows are repaired only after exact normalized line reconstruction. Complex equations, unusual writing directions, overlapping decorations, unresolved PDF destinations, and non-redistributable fonts can require manual source-specific review outside this deterministic contract.

## Source paragraph borders

The renderer merges collinear vertical PDF strokes and restores a left paragraph border only when source geometry and aligned text identify the complete paragraph. Width, color and horizontal insets come from the source; no quote wording is hard-coded. Table intersections and marginal rules are excluded. Ambiguous or split-paragraph matches remain unresolved.

Use `scripts/pdf2html decorations INPUT.pdf` to export source-hash-bound JSON with `borders` and `unresolved`. This read-only command reuses the existing PDF.js/QPDF extractor, performs no installation, conversion, rasterization or browser capture, and requires the already installed runtime. Consumers can validate and repair existing HTML without importing this skill's modules.

## Flattened source lists

The source presentation provider also returns numbered and bulleted list groups from PDF line geometry. Recognize consecutive markers and hanging continuation lines; exclude numbered contents rows. Recover a uniquely matched complete group from a flattened paragraph, preserving exact text, inline emphasis, page IDs and prose before/after it. Keep the original literal markers in semantic ol/ul/li elements, hide generated markers and measure their hanging inset. Ordered groups retain their starting number across source pages. Font size and leading follow list-specific source measurements, not the prose default. Missing or ambiguous matches are findings, never permission to rewrite text. The decorations JSON command now includes lists alongside paragraph borders, using the same extraction pass.

Source display-rule evidence is tested independently from paragraph borders. The decorations provider returns isolated horizontal strokes and excludes table intersections. Consumers must match the rule to source display groups before applying a border; a stroke count alone cannot certify a title page.
