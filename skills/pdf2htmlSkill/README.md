# pdf2htmlSkill

Convert born-digital PDFs into semantic, responsive HTML books. The source PDF controls text, headings, emphasis, tables, images, links and typography. Each source page has a stable anchor and a responsive sheet with source-derived margins.

Distribute the skill checkout. Runtime packages, tools, models, browsers and caches are installed locally and excluded by `.gitignore`. Retain notices and required source for the native binaries bundled with the skill.

## Installation

Use Node.js 22+ with npm. The first `convert` or `validate` command automatically installs missing runtime components inside the skill and then continues. Internet and write access to the skill directory are required during installation. To prepare it in advance:

```sh
node /path/to/pdf2htmlSkill/scripts/setup.mjs
/path/to/pdf2htmlSkill/scripts/pdf2html doctor
```

The skill owns its Node.js packages, Docling.rs native engine, layout/table models and managed Chromium. The supplied binaries cover macOS arm64 and Linux arm64 with glibc. See [runtime installation](references/dependencies.md) for local tool packages, container prerequisites, other architecture builds and offline copying. See [dependencies](dependencies.md) for versions and licenses.

## Conversion

From the book folder:

```sh
/path/to/pdf2htmlSkill/scripts/pdf2html convert
```

The command selects `book.pdf`, or the PDF present in the invocation folder, and publishes `index.html` plus `assets/` beside the source. Multiple PDFs in the same directory are rejected because they would target the same HTML file.

Pass files or directories to convert multiple editions. Directory inputs are searched recursively:

```sh
/path/to/pdf2htmlSkill/scripts/pdf2html convert ../en/book.pdf ../ro/book.pdf
```

Language comes from a terminal filename marker such as `_RO`, then a supported parent folder (`en`, `ro`, `fr`, `de`, `es`, `pt`, `it`, `pl`), with `--lang` as fallback. `--title` sets the title for one PDF. `--image-scale` controls image raster scale, default 2.

For a separate output directory:

```sh
/path/to/pdf2htmlSkill/scripts/pdf2html convert input.pdf --output output/document --lang en
```

Use `--overwrite` to replace converter-owned output. In-place publication preserves the source and unrelated files. A failed validation retains diagnostics and stops publication. JSON on stdout returns the artifact path, options, source hash, document counts, runtime and validation result.

## Fidelity and reader controls

The converter aligns typography to each source occurrence, preserves available embedded fonts, repairs paragraph boundaries and indentation from source geometry, and derives table fills and individual borders from PDF drawings. Heading rules appear only when supported by an aligned source stroke. Fully ruled tables missed by region classification are recovered only when their existing text fits the closed source grid exactly, including merged cells.

Numbered lists retain their starting numbers and any explicit numbering gaps. Images remain local images, including text inside image pixels. Headings, paragraphs, lists, tables, captions and figures remain semantic HTML. Rendering is responsive, so line wrapping can differ from fixed PDF pages.

Ruled chapter labels omitted by layout recognition are recovered from exact source text when their typography and position support the match. Heading weight follows the source so a medium font does not acquire browser-generated bold.

Source font sizes use ratios of `--pdf-reader-size`. Host readers can set `--reader-font-size`; local iframe readers can send `axiologic-reader-settings`. A−/A+ scales prose, headings, captions and tables together. The generated HTML contains its own iframe bridge and local assets.

## Validation

```sh
/path/to/pdf2htmlSkill/scripts/pdf2html validate input.pdf --html output/document/index.html
```

Checks cover text recall and order, source-page anchors, structural counts, local assets, image decoding and browser overflow at 1440, 1024 and 390 pixels. Source-page renders and browser screenshots provide an informational visual score. `--keep-qa-artifacts` retains reports and previews in `.pdf2html-qa/`; conversion metadata otherwise remains in the command result.

Text recall below 98% warns and below 95% fails. Text-order recall below 95% warns and below 90% fails. Multi-column documents can fail the order gate when row-wise source extraction and semantic column order differ; inspect retained diagnostics. See [validation](references/validation.md).

## Development

```sh
node --test tests/*.test.mjs
RUN_PDF2HTML_INTEGRATION=1 node --test tests/*.test.mjs
```

Renderer fixtures check CSS and semantic DOM equivalence. Source, table-recovery and publication tests verify geometry, spans, image handling, ownership and rollback. The integration test converts a PDF and exercises proportional reader resizing. `tests/reader-contract.mjs` can test the actual host reader in both HTTP and local iframe modes.

## Existing-book correction

PDF content and visual fidelity are mandatory repair defaults, including fonts, paragraph geometry and borderless contents. The final result returns to the existing canonical HTML after host-managed backup, hash checks and revalidation in the actual reader. Separate repair outputs are temporary safety candidates, not duplicate editions. See references/repair.md for the required procedure.

Use `scripts/pdf2html repair --report REPORT_JSON` for localized fixes to an existing audited book. The active LLM proposes exact replacements; `--patches FILE --output NEW_HTML` creates a separate candidate and requires revalidation. No missing translations or whole chapters are generated. See [repair contract](references/repair.md).

## Source paragraph borders

The renderer merges collinear vertical PDF strokes and restores a left paragraph border only when source geometry and aligned text identify the complete paragraph. Width, color and horizontal insets come from the source; no quote wording is hard-coded. Table intersections and marginal rules are excluded. Ambiguous or split-paragraph matches remain unresolved.

Use `scripts/pdf2html decorations INPUT.pdf` to export source-hash-bound JSON with `borders` and `unresolved`. This read-only command reuses the existing PDF.js/QPDF extractor, performs no installation, conversion, rasterization or browser capture, and requires the already installed runtime. Consumers can validate and repair existing HTML without importing this skill's modules.

## Flattened source lists

The source presentation provider also returns numbered and bulleted list groups from PDF line geometry. Recognize consecutive markers and hanging continuation lines; exclude numbered contents rows. Recover a uniquely matched complete group from a flattened paragraph, preserving exact text, inline emphasis, page IDs and prose before/after it. Keep the original literal markers in semantic ol/ul/li elements, hide generated markers and measure their hanging inset. Ordered groups retain their starting number across source pages. Font size and leading follow list-specific source measurements, not the prose default. Missing or ambiguous matches are findings, never permission to rewrite text. The decorations JSON command now includes lists alongside paragraph borders, using the same extraction pass.

The read-only decorations JSON also includes `horizontalRules`: isolated interior horizontal strokes with page number, x0/x1, top/bottom, width and color from the PDF. Strokes intersecting vertical table edges are excluded. This evidence supports source-grounded display-page repair in consumers; no title wording or decorative style is inferred.
