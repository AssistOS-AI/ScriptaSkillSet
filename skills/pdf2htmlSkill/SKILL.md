---
name: pdf2html
description: Convert born-digital PDF documents into self-contained folders of source-positioned HTML while preserving headings, paragraphs, lists, tables, figures, images, links, typography, and reading order as faithfully as practical. Use deterministic structural, content, asset, browser, and visual checks; never OCR or reinterpret text inside images.
---

# PDF to Semantic HTML


## Source table evidence

The read-only `decorations INPUT.pdf` JSON includes `tables` alongside borders, lists and horizontal rules. It recognizes closed ruled grids, complete fill partitions, and borderless two-column tables whose header and body starts remain geometrically aligned. A borderless fragment requires at least two body rows; a one-row next-page fragment is accepted only when it repeats the immediately preceding header and column geometry. The standard PDF text layer supplies text omitted by graphical form operators, while rectangles and font objects retain source fills, column bounds and face names. Decorative gaps, crossing text, isolated pairs and ambiguous boundaries are rejected. Evidence includes source page width, cell text and spans, column widths, fills, individual border edges, vertical alignment and uniform typography. Mixed typography remains null and unsupported tables remain uncertified. The command flushes stdout before exit and performs no conversion, installation or rasterization.


Use this skill when the user asks to convert one or more born-digital PDF files to HTML whose pages, text, pictures and tables stay close to the source layout while scaling uniformly in a reader.

The skill processes documents locally with Node.js. Docling.rs supplies semantic regions and table recognition. PDF.js supplies source text, typography, drawings, image regions and annotations; QPDF extracts embedded fonts. Poppler renders source pages and Chromium validates browser output.

## Required boundary

- Treat the input PDF as immutable.
- Produce real headings, paragraphs, lists, tables, figures, captions, links, and images, and place their containing blocks at source PDF coordinates.
- Do not run OCR. Text that is part of an image remains pixels in an image and must not be copied into the HTML text layer.
- Preserve extracted images as local assets. Do not replace them with generated descriptions or remote URLs.
- Treat source text and styling evidence as authoritative: do not rewrite text, infer emphasis from repeated vocabulary, invent headings, add decorative presentation, or synthesize missing content.
- Emit heading rules only from aligned PDF drawing evidence. Keep source-derived inline borders and omit decorative heading borders from the shared stylesheet.
- Apply bold, italic, and materially different block font sizes only to aligned evidence on the source page, independent of Docling's initial block classification. Retain a heading only when its source font size supports a heading level.
- Recover an omitted chapter label only from an exact bold uppercase source line with an aligned rule before the first recognized block. Exclude repeated running headers and image regions. Disable implicit heading bold when source words are not bold; preserve the embedded source face and proportional size.
- Repair a merged one-column table row only when consecutive source lines reproduce its normalized text exactly; otherwise preserve the serializer output and report the limitation.
- Preserve table fills and infer horizontal and vertical cell-border edges independently from PDF strokes. Use certified source table geometry for fixed pages; retain the older width clamping only for renderer fixture compatibility.
- Render linked one-column contents tables as borderless typographic rows with left titles, flexible dotted leaders, and right-aligned page numbers.
- Preserve justified paragraph alignment from book-like source PDFs. Transfer a repeated first-line indent from source geometry only to paragraphs whose first line exhibits that offset, including short one-line paragraphs. Infer centering only when every source line is geometrically centered and an ordinary paragraph does not begin on a repeated body-text indent; allow uppercase display blocks to exceed the compact-caption width threshold. Transfer source-derived vertical spacing only between adjacent centered flow blocks, never across intervening prose.
- Preserve URI link annotations and map resolvable internal PDF destinations to stable `page_N` anchors.
- Keep each page’s PDF dimensions and position text, tables, figures and images from source coordinates. Fit the complete page to a narrow reader viewport while retaining its proportions.
- Keep generated HTML compatible with host readers that expose `--reader-font-size` or send `axiologic-reader-settings`: A−/A+ changes one scale factor for the whole page, including fonts, images, tables and spacing. Include the local iframe message bridge in `index.html`; do not require host-project assets. Zoomed pages may scroll horizontally.
- Explain that positioned semantic HTML can closely preserve geometry and styling but cannot guarantee pixel-identical PDF rendering.
- Reject encrypted or password-protected PDFs, interactive form preservation, PDF JavaScript, signatures, audio, and video in this version.

Distribute the skill checkout. Runtime packages, tools, models, browsers and caches are installed locally and excluded by `.gitignore`. Retain notices and required source for the native binaries bundled with the skill.

## Portable launcher

Resolve the selected skill directory from this `SKILL.md`, then invoke its `scripts/pdf2html` launcher from the PDF working directory. Do not rely on a globally installed `pdf2html` command or a host-project virtual environment.

```bash
<skill-directory>/scripts/pdf2html convert
```

The launcher supports macOS and Linux and runs Node.js modules relative to this skill. The first `convert` or `validate` command installs missing pinned models, packages, Chromium and local Poppler/QPDF binaries automatically. It reuses working components and checks runtime integrity before conversion. `scripts/setup.mjs` can prepare the skill in advance; `doctor` only reports readiness. See `references/dependencies.md`.

When sandbox elevation is required for Chromium, invoke the complete launcher command with a reusable approval scoped to its exact path. Conversion and validation share that process boundary.

## Conversion workflow

1. Resolve the source PDF or PDFs. Unless the user explicitly requests `--output`, publish each HTML book beside its source PDF.
2. Invoke the requested conversion directly through the skill-owned launcher in one tool call. It prepares missing runtime components locally before conversion. If installation fails, report the concrete diagnostic and follow the installation instructions.
3. Inspect the PDF metadata and confirm that it is not encrypted.
4. Convert in place. With no explicit input, prefer `book.pdf`; if it is absent, accept the PDF files found in the invocation folder:

```bash
<skill-directory>/scripts/pdf2html convert
```

5. Read the validation status, warning count, and metrics returned by the command.
6. Do not deliver a conversion whose returned validation status reports `failed`. Failed conversions are retained in a sibling `-failed` directory for diagnosis.
7. When the returned result contains warnings, inspect the affected metrics and, when requested, the retained visual comparison before deciding whether the semantic result is acceptable.

Use `--keep-qa-artifacts` to retain PDF reference renders, responsive browser screenshots, and the visual comparison under a hidden `.pdf2html-qa/` directory. Use `--overwrite` only when `index.html` identifies `pdf2html-skill` as its generator.

### Multiple PDFs

When the user supplies multiple PDFs or a directory, run one command and let each PDF publish beside its source:

```bash
<skill-directory>/scripts/pdf2html convert ../en/book.pdf ../ro/book.pdf ../fr/book.pdf
```

Directories are searched recursively. Language comes from a supported parent folder or terminal filename marker, with `--lang` as a fallback. Two PDFs may not target the same directory because both would own `index.html`. In-place publication owns only `index.html` and `assets/`; it preserves the source PDF and every unrelated file in the folder.

## Validation workflow

Validate an existing conversion independently with:

```bash
<skill-directory>/scripts/pdf2html validate input.pdf --html output/document/index.html
```

Fully ruled tables missed by region classification are recovered only when their existing text fits a closed source grid exactly, with unambiguous cells and preserved spans.

The validator checks exact source text and order, source-page anchors, unresolved positions, rendered fixed-page geometry, table and picture counts, local image integrity, browser console errors, broken images, and overflow at desktop, tablet, and mobile widths before reader zoom. It reports external and internal page-link counts. It covers long HTML documents through bounded screenshot segments and retains representative first, middle, and last segments for detailed QA. It also renders representative PDF pages and computes an informational visual score. That score is not a pass/fail gate because browser font rendering and source rasterization differ.

Validation requires exact per-page text sequence after Unicode NFC, presentation-ligature, soft-hyphen and whitespace normalization. Case and punctuation are preserved; omissions, additions, duplicates, changed sentence punctuation and reordered content fail. Hard line-end hyphens are not silently removed. Text outside source-page sections and incorrect section order fail. Recall and adjacent-token scores remain diagnostic metrics, not acceptance thresholds. Recognized PDF tables are checked independently by cell text, positions and spans; recognized lists must retain their items; clear paragraph gaps must not be merged. PDF image regions require distinct matching local PNGs on the corresponding page (64-by-64 color samples, RMS tolerance 0.05 and aspect-ratio tolerance 3%). Unsupported image formats or unmatched regions fail this source-image check. Browser checks also reject hidden/clipped content and failed fonts. Both conversion and standalone validation use the source checks; failed standalone validation exits with code 1. Final-path validation runs before publication backups are discarded, and failures restore the previous output. These checks do not certify all source typography, ambiguous paragraph boundaries, image placement within a page, or pixel-identical rendering; complex extraction order differences require review instead of automatic acceptance.

See `references/validation.md` for metric interpretation and limitations.

## Output contract

The generated portion of every successful book folder contains only:

- `index.html` - semantic document HTML;
- `assets/styles.css` - source-based page and element presentation rules;
- `assets/images/` - referenced local picture assets;
- `assets/fonts/` - available embedded font streams.

Conversion metadata and validation status are returned by the command, not written into the book. Persistent QA files exist only when `--keep-qa-artifacts` is explicitly requested, under the hidden `.pdf2html-qa/` path.

## Final response

Return every generated book as a primary artifact by linking each `index.html`. For a batch, also report its language, validation status, warning count, and the most important known fidelity limitation. Do not return the source PDF, a manifest, or a QA directory as the artifact. Never claim pixel-perfect conversion or OCR support.

## Existing-book correction

Correction defaults to the existing reader-consumed HTML path, not conversion to a new `index.html` or delivery of a `.corrected.html` edition. Read references/repair.md. Compare content AND PDF-derived fonts, sizes, line height, paragraph boundaries/indents, headings, margins, title pages and contents. Do this without asking the user to request fidelity. A borderless contents list must not acquire a grid or header row. Verify actual rendered fonts and the real reader, not just standalone HTML or text recall. Temporary candidates protect evidence; after validation the host retains a recovery backup, checks the original hash, promotes to the same authorized canonical path and rechecks it. Audit alone never authorizes replacement.

Use `scripts/pdf2html repair --report REPORT_JSON` for localized fixes to an existing audited book. The active LLM proposes exact replacements; `--patches FILE --output NEW_HTML` creates a separate candidate and requires revalidation. No missing translations or whole chapters are generated. See [repair contract](references/repair.md).

## Source paragraph borders

The renderer merges collinear vertical PDF strokes and restores a left paragraph border only when source geometry and aligned text identify the complete paragraph. Width, color and horizontal insets come from the source; no quote wording is hard-coded. Table intersections and marginal rules are excluded. Ambiguous or split-paragraph matches remain unresolved.

Use `scripts/pdf2html decorations INPUT.pdf` to export source-hash-bound JSON with `borders` and `unresolved`. This read-only command reuses the existing PDF.js/QPDF extractor, performs no installation, conversion, rasterization or browser capture, and requires the already installed runtime. Consumers can validate and repair existing HTML without importing this skill's modules.

## Flattened source lists

The source presentation provider also returns numbered and bulleted list groups from PDF line geometry. Recognize consecutive markers and hanging continuation lines; exclude numbered contents rows. Recover a uniquely matched complete group from a flattened paragraph, preserving exact text, inline emphasis, page IDs and prose before/after it. Keep the original literal markers in semantic ol/ul/li elements, hide generated markers and measure their hanging inset. Ordered groups retain their starting number across source pages. Font size and leading follow list-specific source measurements, not the prose default. Missing or ambiguous matches are findings, never permission to rewrite text. The decorations JSON command now includes lists alongside paragraph borders, using the same extraction pass.

The read-only decorations JSON also includes `horizontalRules`: isolated interior horizontal strokes with page number, x0/x1, top/bottom, width and color from the PDF. Strokes intersecting vertical table edges are excluded. This evidence supports source-grounded display-page repair in consumers; no title wording or decorative style is inferred.
