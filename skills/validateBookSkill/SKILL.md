---
name: validateBook
description: Verify and correct existing book HTML structure, layout, typography, tables, images, contents and references against the English PDF. Propagate accepted English presentation to existing languages, check translated structural completeness and text rendering with local code, and deliver a text-only correction report.
---

# Validate book layout and structure

## Scope

This skill performs layout, display and structural-integrity validation and correction. It checks every PDF page and the complete existing HTML, including paragraphs, headings, tables, images, contents, references, local assets and fonts. English is the presentation master. Existing translated text is preserved.

Humanisation, translation rewriting or semantic proofreading, summaries, short-reader creation/review, metadata/keywords, font increase/decrease controls and enlarged-text tests are outside scope. Do not call editorial skills or add those stages. Do not create missing languages, new PDF editions, audio or remote publications. A complete correction request means this layout workflow only.

Use the local implementation first. Do not read the entire book with an LLM by default. No screenshots, PDF rasterization, contact sheets or image reports are generated. Reports are `report.txt`, `report.json` and `repair-tasks.json`.

Read [contracts](references/contracts.md), [execution](references/execution.md) and [dependencies](dependencies.md) before running.

## Workflow

1. Discover the English PDF/HTML and every existing full-language HTML. Read the repository's layout/integration rules and resume the recorded job. Preserve original hashes and recoverable files. Audit-only is read-only outside its job; correction authorization covers local repairs and final installation without stage confirmations.
2. Run local English checks first. Poppler extracts every page's text, word/line bounds, font inventory and image inventory. Chromium measures the entire HTML at 1440, 1024 and 390 px, at default text size, without executing book scripts or taking screenshots. Local code compares text coverage in both directions, structures, anchors, tables, images, loaded resources and actual platform fonts. It detects hidden/clipped text, horizontal overflow, corrupt-character candidates and failed fonts.
3. Correct English presentation. Apply deterministic safe repairs and hash-bound, text-preserving structural/presentation plans. Recheck after writing. Uncertain source differences remain findings; an existing humanised passage is not automatically rewritten to the PDF. Restore exact missing English source material only after its source and placement are established in a targeted host repair, then prepare fresh evidence. Never invent translated paragraphs.
4. Propagate accepted English presentation to all existing languages. Reuse English styles with rebased local asset paths and body presentation attributes. Uniquely mapped structural IDs permit class, heading-tag, table-header and image-source propagation. Preserve language tags, text, links and needed local glyph resources. Do not infer semantic equivalence from block counts. Ambiguous mappings require focused analysis, not whole-book translation review.
5. Check each translation locally for missing structural anchors, paragraph/block sequence differences, table spans/headers, image availability, contents/reference anchors, actual fonts, and hidden/clipped/overflowing text at the same default-size viewports. Matching counts cannot prove semantic completeness. Record unresolved paragraph alignment instead of certifying it from counts alone. Check concrete language-specific rendering defects after propagation.
6. Verify installed canonical files and their local dependency hashes. Keep recoverable originals. Run relevant repository link/catalogue checks if integration files changed; do not open an editorial metadata task or regenerate unchanged derivatives. Finish with a text report listing problems, locations, before/after corrections, checks and unresolved cases. Deliver the final correction report at the book root as `RAPORT-CORECTII.txt`, beside `manifest.json`, and link that file in the final response. If an audit report was also requested, deliver it there as `RAPORT-VERIFICARE.txt`. Keep technical evidence and backups in the private job directory. The `complete` command owns report delivery; audit-only `prepare` remains read-only outside its job. Archive an existing different report in the job before replacing it.

## Commands

```sh
scripts/validatebook doctor --chromium /absolute/chromium --pdftotext /absolute/pdftotext --pdffonts /absolute/pdffonts --pdfimages /absolute/pdfimages
scripts/validatebook complete /book/root --pdf2html /absolute/pdf2htmlSkill/scripts/pdf2html --job-dir /private/layout-completion
scripts/validatebook prepare /book/root --job-dir /private/layout-job
scripts/validatebook prepare /book/root --auto-correct --patches /private/layout-plan.json --job-dir /private/correction-job
scripts/validatebook status /private/layout-job
scripts/validatebook complete-plan /book/root
scripts/validatebook complete-status /private/layout-coordinator/complete.json
```

`--patches` is optional. `--auto-correct` authorizes the native safe repairs, existing-language propagation and installation with recovery copies. It does not authorize prose changes. Existing authorization can also authorize targeted host repairs for defects the local planner cannot resolve; record exact source evidence and before/after changes, then revalidate.

Source-dependent English errors block automatic presentation propagation until resolved. A missing image, uncertain table structure or unmapped paragraph is not silently accepted. Repairs are not universally automatic: complex PDF layout cannot be reconstructed reliably from text counts or font names alone.

## Minimal LLM use

The default run creates no per-page, per-paragraph or per-screenshot LLM review tasks. Inspect only localized `needsJudgment` findings: the source page's extracted text/bounds and the affected HTML region. Use source evidence and a small repair plan. Group related issues before rechecking. Retain valid evidence for unchanged files. Run `complete` for authorized corrections. It executes correction passes and final verification without a fixed cycle limit. Repeated installed file hashes with unresolved errors are an implementation failure, never a successful correction; repair the responsible handler and rerun.

`passed` certifies the implemented local checks only. `needs_attention` means unresolved structural/display findings. Reports state the limits of source-image identity, complex PDF typography, semantic paragraph equivalence and glyph analysis. Do not claim translation correctness or interactive application testing.

## Default typography and reader delivery

An overflow-free page with loaded fonts is not sufficient acceptance. The executable audit extracts PDF font sizes using `pdftohtml -xml -zoom 1`, converts points to CSS pixels with 96/72, and measures baseline increments from precise word/line bounds independently of glyph-box height. Unique normalized source-page matches support paragraph font-size and paragraph-gap comparisons; fontspec rounding has an explicit tolerance. Rendered word ranges detect excessive justification gaps even when nothing overflows.

`prepare --auto-correct` calibrates the default type scale and source-supported paragraph leading/gaps without changing text. `--word-spacing natural` requests ordinary word spacing and left alignment consistently across existing languages; `source` is the default and only corrects measured excessive justification. It does not change or test font +/- controls. Do not create phrase-specific CSS or hand-code a rule for a quoted example.

For ScriptaHub standalone readers, the skill reads and hash-binds the shared reader's default settings contract. It measures the numeric settings delivered to the iframe, including any default multiplier. A recognized title-route multiplier is replaced atomically by the existing source-fidelity marker contract, with recovery and drift checks. Unsupported host contracts fail explicitly; they are not silently certified. The adapter never executes book/host JavaScript. It checks the frame and the supported imported article at default settings, not application controls or saved user preferences. Other hosts require an explicit supported adapter before claiming delivery fidelity.

## Shared CSS and reader import

Short dialogue receives the same source font-size checks as longer prose. Match unique source occurrences, including repeated text within one page; text length must not exempt a dialogue from validation.

After presentation repairs, move inline declarations into a single local `validatebook-layout.css` per HTML directory. Deduplicate identical declaration groups, preserve emphasis and heading custom properties, remove inline style attributes, and compare computed property values before installing the CSS and HTML. Allow only sub-0.001px serialization rounding. Keep originals and hash-bound stylesheet evidence. Existing unrelated files must not be overwritten.

Verify both default delivery paths: the standalone/iframe document and the supported imported article. The host must preserve the managed root attribute, declaration-group attributes and same-directory stylesheet when replacing the source body with an article. Check all blocks at each default viewport for text/order, font-size, family and leading parity. A standalone pass cannot certify the imported article. Unsupported import contracts remain errors. No font-control tests or screenshots.

Measure the host root CSS-pixel size as well as the default rem preference. The managed article rule compensates their unit ratio through `--validatebook-font-size`, leaving the reader UI scale intact. Paragraph and root calibration share that variable.

Preserve the host-approved reading width and padding. Typography calibration must not impose a global fit-width policy or override book-specific page geometry. Font-control tests remain outside routine validation; perform them when explicitly requested for a reader change.

For imported HTML, the host reader owns the page width, maximum width, centering and outer padding. Source-fidelity CSS must not override those properties on `.reader-html-content`, including through a later stylesheet or a media query. Check the computed container geometry against the host rule, not just the text of reader.css. Preserve source typography inside that container.

## Source pagination

A page anchor alone does not preserve pagination. Use `prepare BOOK --auto-correct --paginate` after layout correction to create distinct `.pdf-source-page` containers. The cover and title page stay separate. Use English PDF dimensions for the page aspect and require complete English page-number coverage. Insert a missing English blank page only when PDF extraction confirms that it has no text except its printed page number. Missing nonblank boundaries require source evidence. Existing translated page markers belong to their own editions; never relabel them as English source pages or manufacture translated text.

Split nested containers such as contents lists while retaining text, emphasis, links and unique IDs. Preserve the host reading width and font size. Page bodies have a source-proportioned minimum height and may grow with translated text or narrow screens; never clip prose to force a fixed page count. Keep screen separation and print page breaks. Preserve generated pagination CSS on subsequent corrections. The reader counter and previous/next controls must use real page containers when available.

Derive page-body padding from recurring PDF text bounds, excluding blank rows and printed folios; retain the host outer width and centering. Do not substitute arbitrary clamp padding for measured margins. Reject ambiguous or mixed-size geometry. Rebuild matched contents presentation with dotted leaders, source indentation and row leading. Preserve link labels and targets. English labels use printed PDF folios; translated labels use their own reader page markers. Never present English folios as translated page numbers. Unmatched entries remain recorded for review.

The imported-article adapter must reproduce the host stylesheet order: host reader, managed presentation, then accepted source CSS. Contents rules must retain their measured leading even when source CSS loads later. CDP font collection checks descendant formatting contexts when a flex contents label is not reported on its parent. Existing paginated documents receive source-padding comparisons during read-only audits too.

Exclude repeated running headers in the top margin when estimating the body text area. Natural word spacing preserves source-supported centered or right-aligned display paragraphs; it only removes prose justification. Contents without dotted leaders in the source remain borderless aligned rows without invented leaders.

## Source paragraph borders

PDF graphics extraction belongs to the pdf2html skill. Configure its absolute launcher path through `--pdf2html` or `VALIDATEBOOK_PDF2HTML`. validateBook invokes `decorations INPUT.pdf` and verifies the source hash and border/list evidence before repairs. Missing configuration or invalid evidence fails explicitly. No extraction code or PDF runtime is copied into validateBook.

Compare source-supported paragraph left borders, color, thickness and horizontal insets in standalone and imported readers at all three default widths. Automatic correction requires a unique page/text paragraph match; ambiguous matches remain findings. Consolidate border declarations into managed CSS, propagate by unique structural IDs to existing languages, and verify their computed presentation. Table borders, running headers, arbitrary shapes and right-side borders are not certified by this paragraph-border check. Reports retain its scope explicitly. No screenshots or font-control tests.

## Flattened source lists

The pdf2html source extractor also returns numbered and bulleted list groups from PDF line geometry. Recognize consecutive markers and hanging continuation lines; exclude numbered contents rows. Recover a uniquely matched complete group from a flattened paragraph, preserving exact text, inline emphasis, page IDs and prose before/after it. Keep the original literal markers in semantic ol/ul/li elements, hide generated markers and measure their hanging inset. Ordered groups retain their starting number across source pages. Font size and leading follow list-specific source measurements, not the prose default. Missing or ambiguous matches are findings, never permission to rewrite text. Lists and paragraph borders share one local extraction pass.

## Executable completion

Use `scripts/validatebook complete BOOK_ROOT` for an authorized verify-and-correct request. The command applies English corrections, checks installed files, propagates accepted presentation, checks existing translations and writes `RAPORT-CORECTII.txt` at the book root. It keeps each pass and recovery evidence in a separate private directory. `prepare` remains the single-pass audit/repair primitive. No model API is called. PDF extraction is delegated to the explicitly configured pdf2html skill. A failed correction handler must be fixed; do not relabel its unresolved findings as passed. The coordinator detects repeated installed file states, rather than stopping after a fixed number of passes or comparing error counts.

Sparse centered or left-aligned display pages are checked independently from prose and reader parity. Source XML groups establish separate title, subtitle, italic description and year blocks, their font sizes, explicit line groups and vertical gaps. Repair requires complete normalized text agreement and a verified embedded source family. Rebuild the groups before the single CSS consolidation step; retain page anchors and responsive wrapping. Check grouping, alignment, emphasis, sizes, leading and margins at each viewport in both reader paths. A repeated running title must not exempt the title-page heading from these checks.

Detect false headings inside paragraphs from source continuity on both sides. Merge a heading with its adjacent paragraphs only when the source line is not bold, sizes and baseline spacing match ordinary continuous text, and the entire combined text occurs on the same source page. Preserve anchors and exact text; verify the merged result and keep source evidence in the correction log. The same detector can run without mutation during audit.

Body-leading samples must match PDF XML lines at the dominant body font size before their precise bounding-box increments are accepted. Table and caption lines cannot calibrate prose. The ScriptaHub import adapter also supports the generic local-books stylesheet contract, preserving declared CSS order without a title allowlist.

Display-page correction is generic: detect centered or left-aligned sparse layouts, retain each group's verified source family, color, emphasis, first-line inset, line breaks and vertical gaps, and scale down to the available column on narrow screens. Isolated horizontal rules are consumed from the source-hash-bound pdf2html evidence, excluding table intersections; their width, color and placement are never inferred from the book title. Missing font mappings or ambiguous content stop correction before mutation. Check both standalone and imported delivery after CSS consolidation and rerunning the repair.
