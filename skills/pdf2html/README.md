# pdf2html


## Source table evidence

The read-only `decorations INPUT.pdf` JSON includes `tables` alongside borders, lists and horizontal rules. It recognizes closed ruled grids and tables whose horizontal row rules and adjacent cell fills establish complete column partitions, including unfilled alternating rows. Recognition requires text confined to every inferred column; decorative rectangles, crossing text and missing boundaries are rejected. Evidence includes source page width, cell text and spans, column widths, fills, individual border edges, vertical alignment and uniform typography. Mixed typography remains null and unsupported tables remain uncertified. The command flushes stdout before exit and performs no conversion, installation or rasterization.


Convert born-digital PDFs into source-positioned HTML books. The source PDF controls text, headings, emphasis, tables, images, links and typography. Each PDF page has a stable HTML anchor and retains its own dimensions and element coordinates.

Distribute the skill checkout. Runtime packages, tools, models, browsers and caches are installed locally and excluded by `.gitignore`. Retain notices and required source for the native binaries bundled with the skill.

## Installation

Use Node.js 22+ with npm. The first `convert` or `check` command automatically installs missing runtime components inside the skill and then continues. Internet and write access to the skill directory are required during installation. To prepare it in advance:

```sh
node /path/to/pdf2html/scripts/setup.mjs
/path/to/pdf2html/scripts/pdf2html doctor
```

The skill owns its Node.js packages, Docling.rs native engine, layout/table models and managed Chromium. The supplied binaries cover macOS arm64 and Linux arm64 with glibc. See [runtime installation](references/dependencies.md) for local tool packages, container prerequisites, other architecture builds and offline copying. See [dependencies](dependencies.md) for versions and licenses.

## Conversion

From the book folder:

```sh
/path/to/pdf2html/scripts/pdf2html convert
```

The command selects `book.pdf`, or the PDF present in the invocation folder, and publishes `index.html` plus `assets/` beside the source. Multiple PDFs in the same directory are rejected because they would target the same HTML file.

Pass files or directories to convert multiple editions. Directory inputs are searched recursively:

```sh
/path/to/pdf2html/scripts/pdf2html convert ../en/book.pdf ../ro/book.pdf
```

Language comes from a terminal filename marker such as `_RO`, then a supported parent folder (`en`, `ro`, `fr`, `de`, `es`, `pt`, `it`, `pl`), with `--lang` as fallback. `--title` sets the title for one PDF. `--image-scale` controls image raster scale, default 2.

For a separate output directory:

```sh
/path/to/pdf2html/scripts/pdf2html convert input.pdf --output output/document --lang en
```

Use `--overwrite` to replace converter-owned output. In-place publication preserves the source and unrelated files. A technical conversion failure retains diagnostics and stops output installation. JSON returns artifact paths, the source hash, runtime, technical checks and bookValidated=false. This is not approval to publish a book.

## Fidelity and reader controls

The converter aligns typography to each source occurrence, preserves available embedded fonts, repairs paragraph boundaries and indentation from source geometry, and derives table fills and individual borders from PDF drawings. Heading rules appear only when supported by an aligned source stroke. Fully ruled tables missed by region classification are recovered only when their existing text fits the closed source grid exactly, including merged cells.

Numbered lists retain their starting numbers and any explicit numbering gaps. Images remain local images, including text inside image pixels. Headings, paragraphs, lists, tables, captions and figures remain HTML elements positioned from PDF geometry. On a narrow screen, a page initially shrinks to fit; its contents keep their relative proportions.

Ruled chapter labels omitted by layout recognition are recovered from exact source text when their typography and position support the match. Heading weight follows the source so a medium font does not acquire browser-generated bold.

Source font sizes keep their measured values. Host readers can set `--reader-font-size`; local iframe readers can send `axiologic-reader-settings`. A−/A+ changes page zoom, so text, images, tables and spacing scale together without reflow. A zoomed page can require horizontal scrolling. The generated HTML contains its own iframe bridge and local assets.

## Technical output checks

```sh
/path/to/pdf2html/scripts/pdf2html check --html output/document/index.html
```

Conversion performs technical assembly checks only: nonempty generated content, complete page containers and serialized region counts, safe local assets, image decoding, font loading and browser loading errors. Reports use scope=conversion-technical and bookValidated=false. Text fidelity, punctuation, reading order, source-image correspondence, typography, positioning, clipping and overflow are book-validation responsibilities and never determine conversion acceptance. A successful conversion must be handed to validateBook before publication. Technical failures retain diagnostic output; installation checks the final path before discarding recovery copies.

## Development

```sh
node --test tests/*.test.mjs
RUN_PDF2HTML_INTEGRATION=1 node --test tests/*.test.mjs
```

Renderer fixtures check CSS and semantic DOM equivalence. Source, table-recovery and publication tests verify geometry, spans, image handling, ownership and rollback. The integration test converts a PDF and exercises proportional reader resizing. `tests/reader-contract.mjs` can test the actual host reader in both HTTP and local iframe modes.

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
