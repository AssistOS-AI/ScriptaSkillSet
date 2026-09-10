# Validation contract

Validation separates correctness gates from diagnostic evidence.

## Correctness gates

- Normalized source-token recall measures content coverage. Scores below 0.98 warn and scores below 0.95 fail.
- Adjacent-token pair recall measures local reading order. Scores below 0.95 warn and scores below 0.90 fail.
- Stable `page_N` anchors must cover every PDF page exactly, including pages without extracted text.
- During conversion, the number of native HTML tables must equal the number of Docling table items.
- HTML must contain at least one valid local image for every Docling picture item and every independently recovered embedded-image occurrence.
- Every referenced local image must exist, decode successfully, and have nonzero dimensions.
- Chromium must load the HTML at 1440, 1024, and 390 CSS pixels without console errors, broken images, or global horizontal overflow. Source-derived table geometry is clamped to its responsive content box; only genuinely wide native tables may scroll inside their dedicated wrapper.
- Centered display spacing may preserve large source gaps only between adjacent centered flow blocks; ordinary intervening prose terminates that spacing sequence.

## Diagnostic evidence

Renderer regression tests cover a title page both with and without a source stroke: the former retains its measured border and spacing, while the latter receives neither. Shared heading CSS must not introduce a decorative rule.

Poppler renders the first, middle, and last source pages at 120 DPI. Chromium validates the complete semantic document in bounded-height screenshot segments at every viewport, so long books never become one oversized bitmap. The first, middle, and last HTML segments are retained as representative previews when detailed QA artifacts are enabled. The tool produces a side-by-side contact image and records a normalized pixel-distance score from these samples.

The visual score is informational. Reflow, page-break movement, browser font substitution, and different rasterizers can lower it without indicating content loss. Browser and operating-system versions are recorded because screenshot output varies across environments.

Validation status and metrics are returned directly to the caller. They are not added to the generated book artifact. When detailed QA artifacts are explicitly retained for an in-place conversion, they are written to a hidden `.pdf2html-qa/` directory beside `index.html`.

## Limitations

The checks prove that the recognized structure was serialized consistently; they cannot prove that a layout model classified every source region correctly. Formatting is applied only when an exact occurrence aligns between the PDF page and the HTML page. Repeated first-line indentation additionally requires a stable document-wide body edge and indent offset; table borders require matching source strokes along each cell edge. Ambiguous or unmatched formatting is deliberately omitted rather than guessed. Table rows are repaired only after exact normalized line reconstruction. Complex equations, unusual writing directions, overlapping decorations, unresolved PDF destinations, and non-redistributable fonts can require manual source-specific review outside this deterministic contract.
