---
name: pdf2html
description: Convert born-digital PDF documents into self-contained folders of semantic, responsive HTML while preserving headings, paragraphs, lists, tables, figures, images, links, typography, and reading order as faithfully as practical. Use deterministic structural, content, asset, browser, and visual checks; never OCR or reinterpret text inside images.
---

# PDF to Semantic HTML

Use this skill when the user asks to convert one or more born-digital PDF files to semantic HTML and wants formatting, pictures, and tables preserved as closely as a reflowable document permits.

The skill is local-first. It uses Docling for document structure and table recognition, pdfplumber for source text, occurrence-level typography evidence, source lines, and recovery of embedded images that the layout model does not classify, pypdf for source link annotations and destinations, Poppler for reference rendering, and Chromium through Playwright for browser validation. It does not call an LLM or upload document content.

## Required boundary

- Treat the input PDF as immutable.
- Produce real headings, paragraphs, lists, tables, figures, captions, links, and images rather than an absolutely positioned page replica.
- Do not run OCR. Text that is part of an image remains pixels in an image and must not be copied into the HTML text layer.
- Preserve extracted images as local assets. Do not replace them with generated descriptions or remote URLs.
- Treat source text and styling evidence as authoritative: do not rewrite text, infer emphasis from repeated vocabulary, invent headings, add decorative presentation, or synthesize missing content.
- Emit heading rules only from aligned PDF drawing evidence. Keep source-derived inline borders and omit decorative heading borders from the shared stylesheet.
- Apply bold, italic, and materially different block font sizes only to aligned evidence on the source page, independent of Docling's initial block classification. Retain a heading only when its source font size supports a heading level.
- Repair a merged one-column table row only when consecutive source lines reproduce its normalized text exactly; otherwise preserve the serializer output and report the limitation.
- Preserve table fills and infer horizontal and vertical cell-border edges independently from PDF strokes. Clamp source-derived table widths and margins to the responsive content box so rounding cannot create incidental horizontal scrolling; retain overflow scrolling only for genuinely wide tables.
- Render linked one-column contents tables as borderless typographic rows with left titles, flexible dotted leaders, and right-aligned page numbers.
- Preserve justified paragraph alignment from book-like source PDFs. Transfer a repeated first-line indent from source geometry only to paragraphs whose first line exhibits that offset, including short one-line paragraphs. Infer centering only when every source line is geometrically centered and an ordinary paragraph does not begin on a repeated body-text indent; allow uppercase display blocks to exceed the compact-caption width threshold. Transfer source-derived vertical spacing only between adjacent centered flow blocks, never across intervening prose.
- Preserve URI link annotations and map resolvable internal PDF destinations to stable `page_N` anchors.
- Keep normal browser output book-like: render source pages as separate responsive sheets using the source page aspect ratio and margins, including intentional blank page area, compact gaps, subtle shadows, and numbered footers. Preserve explicit fixed page height and page breaks only in print CSS.
- Keep generated HTML compatible with host readers that expose `--reader-font-size` or send `axiologic-reader-settings`: preserve source typography as ratios of one reader-controlled base so A−/A+ resizes body text, headings, captions, and table text together. Include the local iframe message bridge in `index.html`; do not require host-project assets.
- Explain that semantic HTML can closely preserve hierarchy and styling but cannot be pixel-identical to fixed-layout PDF pages.
- Reject encrypted or password-protected PDFs, interactive form preservation, PDF JavaScript, signatures, audio, and video in this version.

## Portable launcher

Resolve the selected skill directory from this `SKILL.md`, then invoke its `scripts/pdf2html` launcher from the PDF working directory. Do not rely on a globally installed `pdf2html` command or a host-project virtual environment.

```bash
<skill-directory>/scripts/pdf2html convert
```

The launcher is idempotent and supports macOS and Linux. On first use it verifies `uv` and Poppler, installs a native managed Python 3.12, synchronizes the locked runtime packages into the skill-owned `.venv`, installs Playwright Chromium, runs `doctor`, and continues with the requested command in the same process tree. Later calls reuse the environment while still synchronizing lockfile changes. Install Poppler separately if the launcher reports that `pdfinfo` or `pdftoppm` is unavailable. See `references/dependencies.md`.

Treat the launcher as the single permission boundary. When sandbox elevation is required, make one escalated call for the complete launcher command and request a reusable rule scoped to the exact `<skill-directory>/scripts/pdf2html` prefix. Do not run or request permission separately for `uv`, Playwright, `doctor`, conversion, or validation. Their subprocesses inherit the launcher's approved execution context. The host application remains authoritative for displaying and recording that one approval.

Docling may download local layout and table models during the first conversion. Once its cache is populated, conversion does not require sending the source document to a remote service.

## Conversion workflow

1. Resolve the source PDF or PDFs. Unless the user explicitly requests `--output`, publish each HTML book beside its source PDF.
2. Invoke the requested conversion directly through the skill-owned launcher in one tool call. It bootstraps the local runtime and runs `doctor` internally on first use. Do not issue a preliminary standalone `doctor` call. Stop on a missing dependency.
3. Inspect the PDF metadata and confirm that it is not encrypted.
4. Convert in place. With no explicit input, prefer `book.pdf`; if it is absent, accept the PDF files found in the invocation folder:

```bash
<skill-directory>/scripts/pdf2html convert
```

5. Read the validation status, warning count, and metrics returned by the command.
6. Do not deliver a conversion whose returned validation status reports `failed`. Failed conversions are retained in a sibling `-failed` directory for diagnosis.
7. When the returned result contains warnings, inspect the affected metrics and, when requested, the retained visual comparison before deciding whether the semantic result is acceptable.

Use `--keep-qa-artifacts` to retain PDF reference renders, responsive browser screenshots, and the visual comparison under a hidden `.pdf2html-qa/` directory. Use `--overwrite` only when `index.html` identifies `pdf2html-skill` as its generator. Legacy manifest-based isolated outputs remain safely replaceable.

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

The validator checks normalized text coverage and order, the complete set of source-page anchors, Docling-to-HTML table and picture counts during conversion, local image integrity, remote image leakage, browser console errors, broken images, and horizontal overflow at desktop, tablet, and mobile widths. It reports external and internal page-link counts. It covers long HTML documents through bounded screenshot segments and retains representative first, middle, and last segments for detailed QA. It also renders representative PDF pages and computes an informational visual score. That score is not a pass/fail gate because semantic reflow legitimately changes page geometry.

The default text gates are:

- coverage below 98% is a warning and below 95% is an error;
- order below 95% is a warning and below 90% is an error.

See `references/validation.md` for metric interpretation and limitations.

## Output contract

The generated portion of every successful book folder contains only:

- `index.html` - semantic document HTML;
- `assets/styles.css` - inferred and responsive presentation rules;
- `assets/images/` - referenced local picture assets.

Conversion metadata and validation status are returned by the command, not written into the book. Persistent QA files exist only when `--keep-qa-artifacts` is explicitly requested, under the hidden `.pdf2html-qa/` path.

## Final response

Return every generated book as a primary artifact by linking each `index.html`. For a batch, also report its language, validation status, warning count, and the most important known fidelity limitation. Do not return the source PDF, a manifest, or a QA directory as the artifact. Never claim pixel-perfect conversion or OCR support.
