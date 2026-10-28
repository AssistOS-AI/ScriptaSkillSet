# PDF to semantic HTML design


## Source table evidence

The read-only `decorations INPUT.pdf` JSON includes `tables` alongside borders, lists and horizontal rules. It recognizes closed ruled grids and tables whose horizontal row rules and adjacent cell fills establish complete column partitions, including unfilled alternating rows. Recognition requires text confined to every inferred column; decorative rectangles, crossing text and missing boundaries are rejected. Evidence includes source page width, cell text and spans, column widths, fills, individual border edges, vertical alignment and uniform typography. Mixed typography remains null and unsupported tables remain uncertified. The command flushes stdout before exit and performs no conversion, installation or rasterization.


## Runtime and commands

Node.js ECMAScript modules implement the skill. The public launcher is `scripts/pdf2html`, with `doctor`, `convert` and `check` commands. `convert` and `check` run `scripts/setup.mjs --ensure` before importing conversion modules. Setup provisions missing pinned models, JavaScript packages, Chromium and local Poppler/QPDF packages under an installation lock, then checks the runtime in a fresh process. `doctor` remains read-only. Runtime paths resolve inside the skill directory; local command binaries take precedence over PATH. See `dependencies.md` for the complete inventory and licenses.

## Conversion

The input PDF is immutable. PDF.js extracts source glyphs, font names and sizes, colors, text matrices, page geometry, drawings, image regions and link annotations. QPDF checks encryption and extracts embedded font streams. Docling.rs supplies semantic regions, ordered body items, page provenance, pictures and TableFormer grids. CPU FP32 model files and sidecars are integrity-checked. The worker disables OCR and reports failed table inference before publication.

Serialization preserves native table spans, lists, captions, figures, source text and picture regions. Ordered lists are identified from list-item enumeration flags and numeric markers; HTML start and item value attributes retain starting numbers and discontinuities. A closed ruled grid omitted by region classification may become a table only when all existing semantic text fits unambiguous cells and its token multiset equals the source region. The algorithm rejects open grids, nonrectangular merged regions, overlapping recognized tables and incomplete text.

The renderer clears inferred inline emphasis and reapplies bold and italic to exact aligned source occurrences. It independently applies block size, font family and color, demotes headings unsupported by source size, repairs paragraph boundaries, preserves repeated first-line indentation and recognizes centering from source line geometry. Vertical display gaps apply only to adjacent centered blocks. Heading borders require aligned source strokes. Table fills and each border edge follow source drawings; responsive widths and margins are clamped to prevent rounding overflow. Exact source-line reconstruction can repair single-column rows. Contents entries preserve their structure, indentation, leaders and links.

Available font streams are local assets. Poppler crops picture and embedded-image regions, including occurrences omitted by layout classification. Caption placement follows source lines. Text inside images remains pixels.

A missing uppercase chapter label can be recovered from an exact bold source line above the first recognized block when an aligned horizontal rule supports it. Repeated running headers and image regions are excluded. Source display geometry preserves the label rule and its gap before the title. Headings whose aligned source words are not bold use normal CSS weight, avoiding browser-generated bold over the embedded source face.

## Reader presentation

Each PDF page has exactly one `page_N` anchor and a fixed-size HTML sheet using its PDF dimensions. Text blocks, certified tables and figures use source coordinates; unresolved content retains data-pdf-position-unresolved for the book validator. The reader fits the page to the available width, then applies A−/A+ as one page-scale factor. Local iframe settings arrive through `axiologic-reader-settings`; host readers may set `--reader-font-size`. Zoom can introduce horizontal scrolling while preserving page composition.

## Technical checks and output installation

Conversion performs technical assembly checks only: nonempty generated content, complete page containers and serialized region counts, safe local assets, image decoding, font loading and browser loading errors. Reports use scope=conversion-technical and bookValidated=false. Text fidelity, punctuation, reading order, source-image correspondence, typography, positioning, clipping and overflow are book-validation responsibilities and never determine conversion acceptance. A successful conversion must be handed to validateBook before publication. Technical failures retain diagnostic output; installation checks the final path before discarding recovery copies.

## Boundaries

The skill processes born-digital PDFs locally. Interactive form behavior, signatures, audio, video and PDF JavaScript are outside the output contract. Encrypted input is rejected. Browser font metrics can differ from PDF rasterization; unusual writing directions, complex equations and ambiguous source geometry remain subject to deterministic validation and source-specific review.

## Source paragraph borders

The renderer merges collinear vertical PDF strokes and restores a left paragraph border only when source geometry and aligned text identify the complete paragraph. Width, color and horizontal insets come from the source; no quote wording is hard-coded. Table intersections and marginal rules are excluded. Ambiguous or split-paragraph matches remain unresolved.

Use `scripts/pdf2html decorations INPUT.pdf` to export source-hash-bound JSON with `borders` and `unresolved`. This read-only command reuses the existing PDF.js/QPDF extractor, performs no installation, conversion, rasterization or browser capture, and requires the already installed runtime. Consumers can validate and repair existing HTML without importing this skill's modules.

## Flattened source lists

The source presentation provider also returns numbered and bulleted list groups from PDF line geometry. Recognize consecutive markers and hanging continuation lines; exclude numbered contents rows. Recover a uniquely matched complete group from a flattened paragraph, preserving exact text, inline emphasis, page IDs and prose before/after it. Keep the original literal markers in semantic ol/ul/li elements, hide generated markers and measure their hanging inset. Ordered groups retain their starting number across source pages. Font size and leading follow list-specific source measurements, not the prose default. Missing or ambiguous matches are findings, never permission to rewrite text. The decorations JSON command now includes lists alongside paragraph borders, using the same extraction pass.

The read-only decorations JSON also includes `horizontalRules`: isolated interior horizontal strokes with page number, x0/x1, top/bottom, width and color from the PDF. Strokes intersecting vertical table edges are excluded. This evidence supports source-grounded display-page repair in consumers; no title wording or decorative style is inferred.

## Prepared read-only execution

For RoboTeam or another read-only skill mount, prepare a complete, platform-specific copy outside the source tree before running documents. Set `PDF2HTML_RUNTIME_ROOT` to that prepared directory when invoking the selected skill's official launcher. The launcher verifies that its `src/`, `scripts/`, dependency lockfiles and native/model integrity manifest match the selected skill before executing the prepared copy. Missing or mismatched runtime directories fail explicitly; no fallback runtime is selected. Downloads still use declared SHA-256 values. Provision the native files, locked packages and models, then run `node <prepared-root>/scripts/setup.mjs` and verify `doctor` before use.

```sh
PDF2HTML_RUNTIME_ROOT="$HOME/.cache/roboteam-runtimes/pdf2html" <skill-directory>/scripts/pdf2html doctor
PDF2HTML_RUNTIME_ROOT="$HOME/.cache/roboteam-runtimes/pdf2html" <skill-directory>/scripts/pdf2html convert input.pdf --output output/document --lang en
```

When PDF2HTML_RUNTIME_ROOT is set, convert and check verify readiness and never run the installer; a missing component fails before document processing. The setting changes the execution runtime, not the input/output directory. The source skill remains read-only. `doctor` reports the actual runtime root and separate system-tool, package, native-asset, model and browser issues. A missing Playwright package does not imply a missing Chromium binary. Record detailed diagnostics separately from the human report and distinguish environment failures from invalid PDFs.

## Source punctuation alignment

Restore source punctuation on exactly aligned text. If a damaged or cross-page opening interrupts alignment, resume only at a unique exact six-token context in both streams within 32 tokens; preserve unmatched words. Restore a dropped internal compound hyphen to its exact source spelling. A lone numeric folio uses explicit extractor page provenance rather than ambiguous neighbouring text votes. These conversion operations do not certify manuscript fidelity.
