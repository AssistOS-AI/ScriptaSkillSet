# PDF to semantic HTML design


## Source table evidence

The read-only `decorations INPUT.pdf` JSON includes `tables` alongside borders, lists and horizontal rules. It recognizes closed ruled grids and tables whose horizontal row rules and adjacent cell fills establish complete column partitions, including unfilled alternating rows. Recognition requires text confined to every inferred column; decorative rectangles, crossing text and missing boundaries are rejected. Evidence includes source page width, cell text and spans, column widths, fills, individual border edges, vertical alignment and uniform typography. Mixed typography remains null and unsupported tables remain uncertified. The command flushes stdout before exit and performs no conversion, installation or rasterization.


## Runtime and commands

Node.js ECMAScript modules implement the skill. The public launcher is `scripts/pdf2html`, with `doctor`, `convert` and `validate` commands. `convert` and `validate` run `scripts/setup.mjs --ensure` before importing conversion modules. Setup provisions missing pinned models, JavaScript packages, Chromium and local Poppler/QPDF packages under an installation lock, then checks the runtime in a fresh process. `doctor` remains read-only. Runtime paths resolve inside the skill directory; local command binaries take precedence over PATH. See `dependencies.md` for the complete inventory and licenses.

## Conversion

The input PDF is immutable. PDF.js extracts source glyphs, font names and sizes, colors, text matrices, page geometry, drawings, image regions and link annotations. QPDF checks encryption and extracts embedded font streams. Docling.rs supplies semantic regions, ordered body items, page provenance, pictures and TableFormer grids. CPU FP32 model files and sidecars are integrity-checked. The worker disables OCR and reports failed table inference before publication.

Serialization preserves native table spans, lists, captions, figures, source text and picture regions. Ordered lists are identified from list-item enumeration flags and numeric markers; HTML start and item value attributes retain starting numbers and discontinuities. A closed ruled grid omitted by region classification may become a table only when all existing semantic text fits unambiguous cells and its token multiset equals the source region. The algorithm rejects open grids, nonrectangular merged regions, overlapping recognized tables and incomplete text.

The renderer clears inferred inline emphasis and reapplies bold and italic to exact aligned source occurrences. It independently applies block size, font family and color, demotes headings unsupported by source size, repairs paragraph boundaries, preserves repeated first-line indentation and recognizes centering from source line geometry. Vertical display gaps apply only to adjacent centered blocks. Heading borders require aligned source strokes. Table fills and each border edge follow source drawings; responsive widths and margins are clamped to prevent rounding overflow. Exact source-line reconstruction can repair single-column rows. Contents entries preserve their structure, indentation, leaders and links.

Available font streams are local assets. Poppler crops picture and embedded-image regions, including occurrences omitted by layout classification. Caption placement follows source lines. Text inside images remains pixels.

A missing uppercase chapter label can be recovered from an exact bold source line above the first recognized block when an aligned horizontal rule supports it. Repeated running headers and image regions are excluded. Source display geometry preserves the label rule and its gap before the title. Headings whose aligned source words are not bold use normal CSS weight, avoiding browser-generated bold over the embedded source face.

## Reader presentation

Each PDF page has exactly one `page_N` anchor and a responsive sheet preserving source aspect ratio, margins and intentional blank area. Print CSS owns fixed page dimensions and page breaks. Source-derived font sizes are ratios of `--pdf-reader-size`, resolved from host `--reader-font-size`, local `--standalone-size`, or source body size. The inline `axiologic-reader-settings` bridge supports local iframes. A−/A+ scales headings, prose, captions and table text proportionally, with long-word reflow at the maximum reader size.

## Validation and publication

Token recall below 0.98 warns and below 0.95 fails. Adjacent-token recall below 0.95 warns and below 0.90 fails. The complete source-page anchor set, table/contents regions, expected images, local asset paths, image decoding, browser console errors and global overflow are checked. Chromium captures bounded segments across the complete document at 1440, 1024 and 390 CSS pixels. Poppler samples source pages at 120 DPI. Their visual comparison is informational because semantic reflow changes geometry.

Conversion stages output before validation and publication. Successful artifacts contain `index.html` and `assets/`. The JSON result contains source identity, options, document counts, runtime and validation. QA reports and previews are opt-in under `.pdf2html-qa/`. Failed validation retains a diagnostic folder and does not replace successful output. Overwrite requires converter ownership. In-place publication changes only owned HTML and assets and rolls back both on installation failure.

Batch conversion resolves files and recursive directory inputs, deduplicates paths, infers language from a filename suffix before its parent folder, and rejects competing PDFs in one output folder. Unrelated book files and the source remain untouched.

## Boundaries

The skill processes born-digital PDFs locally. Interactive form behavior, signatures, audio, video and PDF JavaScript are outside the output contract. Encrypted input is rejected. Reflow can differ from fixed PDF layout; unusual writing directions, complex equations and ambiguous source geometry remain subject to deterministic validation and source-specific review.

## Existing-book correction

Existing-book repair preserves the canonical reader path. Source typography, paragraph geometry, contents appearance and real reader behavior are acceptance requirements, even when automated text/layout checks pass. The exclusive-write CLI candidate remains temporary; the authorized host performs backup, original-hash verification, promotion and canonical-path revalidation. The CLI does not implement promotion. See references/repair.md.

Use `scripts/pdf2html repair --report REPORT_JSON` for localized fixes to an existing audited book. The active LLM proposes exact replacements; `--patches FILE --output NEW_HTML` creates a separate candidate and requires revalidation. No missing translations or whole chapters are generated. See [repair contract](references/repair.md).

## Source paragraph borders

The renderer merges collinear vertical PDF strokes and restores a left paragraph border only when source geometry and aligned text identify the complete paragraph. Width, color and horizontal insets come from the source; no quote wording is hard-coded. Table intersections and marginal rules are excluded. Ambiguous or split-paragraph matches remain unresolved.

Use `scripts/pdf2html decorations INPUT.pdf` to export source-hash-bound JSON with `borders` and `unresolved`. This read-only command reuses the existing PDF.js/QPDF extractor, performs no installation, conversion, rasterization or browser capture, and requires the already installed runtime. Consumers can validate and repair existing HTML without importing this skill's modules.

## Flattened source lists

The source presentation provider also returns numbered and bulleted list groups from PDF line geometry. Recognize consecutive markers and hanging continuation lines; exclude numbered contents rows. Recover a uniquely matched complete group from a flattened paragraph, preserving exact text, inline emphasis, page IDs and prose before/after it. Keep the original literal markers in semantic ol/ul/li elements, hide generated markers and measure their hanging inset. Ordered groups retain their starting number across source pages. Font size and leading follow list-specific source measurements, not the prose default. Missing or ambiguous matches are findings, never permission to rewrite text. The decorations JSON command now includes lists alongside paragraph borders, using the same extraction pass.

The read-only decorations JSON also includes `horizontalRules`: isolated interior horizontal strokes with page number, x0/x1, top/bottom, width and color from the PDF. Strokes intersecting vertical table edges are excluded. This evidence supports source-grounded display-page repair in consumers; no title wording or decorative style is inferred.
