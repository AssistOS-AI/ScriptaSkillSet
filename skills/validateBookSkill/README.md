# ValidateBook

Rejected combined corrections are retried as independent pagination, table, typography, display and structural batches. Each batch must pass standalone/imported delivery checks before installation; the next pass remeasures installed content. Rejected attempts remain reported. Responsive host container geometry is preserved from the actual host stylesheet, and media font inheritance cannot abort text repairs.


## Table fidelity and blocking findings

Unmapped or ambiguous English paragraphs are errors regardless of token overlap. Nonvisual remote-script warnings may remain nonblocking; they do not certify typography. Completion applies verified corrections and reports unresolved errors as completed_with_errors; unresolved findings do not reject the entire book.

The required pdf2html `decorations` response includes hash-bound `tables`: closed grids or complete columns established by adjacent cell fills and horizontal row rules, source page width, cell text and spans, widths, fills, individual border edges, vertical alignment and uniform typography. Old providers without table evidence fail explicitly. Chromium compares every cell at 1440, 1024 and 390 px in standalone and imported readers, including actual rendered font identity when platform evidence is available. Complete text/span correspondence is required; partial, duplicate, mixed-font or unsupported tables remain errors. Source font lookup retains full face names, including bold MT variants.

Paginated readers scale text, leading and paragraph gaps by max(1, rendered page width / source CSS-pixel page width). The registered inherited --validatebook-page-scale number prevents nested containers from changing the scale. Narrow screens retain physical source font sizes and allow page growth; larger pages preserve text-to-page proportions. The host keeps its outer width and padding. A source-fidelity marker neutralizes legacy iframe inflation, and imported parity compares sizes normalized by the independently measured page widths. Repairs remain stable across CSS consolidation and reruns.

Native table repairs preserve prose and responsive flow, restore source fills/edges and proportional columns, and consolidate cell styles into managed CSS. Cell selector specificity survives subsequent consolidation and source stylesheet order. Translations require the canonical English page/block structure and matching table spans. Regression tests cover lost dark header fills, column proportions, ambiguous mappings, CSS consolidation and imported delivery.


Local verification and correction of book HTML layout, fonts and structural integrity. English PDF/HTML presentation is corrected first. Existing translations are aligned to the English canonical order by tag role and sentence count, without using translated page numbers. The active skill agent inserts only the missing or sentence-count-different unit text, then English presentation is propagated to reconciled pages. The native implementation uses no external model API, Python command or external repair plan.

No general humanisation, whole-book semantic proofreading, summaries, metadata, font +/− tests or screenshots. Agent translation is limited to the missing or sentence-count-different units identified by deterministic alignment. The final human-readable artifact is `report.md`, supported by JSON evidence and correction logs.

The `complete` command delivers the final correction account as `RAPORT-CORECTII.md` at the book root, beside `manifest.json`; a requested audit account goes there as `RAPORT-VERIFICARE.md`. Final responses link these book-owned reports. After delivery, complete retains the private job directory and recovery copies; disposable candidate files are removed. Native audit-only `prepare` still keeps its job for `report`/`status`. Ambiguous evidence remains an explicit finding and is never delegated to an agent or LLM.

See [instructions](SKILL.md), [contract](references/contracts.md), [workflow](references/complete-scriptahub.md), [execution](references/execution.md), [design](DS.md), and [dependencies](dependencies.md).

## Run

Node.js 22+ and explicitly configured Chromium, pdftotext, pdffonts, pdfimages and pdftohtml are required for new audits. Reporting, planning and pure tests need only Node. No installation happens at startup.

```sh
scripts/validatebook doctor --chromium /path/chromium --pdftotext /path/pdftotext --pdffonts /path/pdffonts --pdfimages /path/pdfimages
scripts/validatebook complete /book --pdf2html /path/to/pdf2htmlSkill/scripts/pdf2html --job-dir /private/book-layout
scripts/validatebook report /private/book-layout
node --test tests/*.test.mjs
```

Tool configuration can use `VALIDATEBOOK_CHROMIUM`, `VALIDATEBOOK_PDFTOTEXT`, `VALIDATEBOOK_PDFFONTS`, `VALIDATEBOOK_PDFIMAGES`, `VALIDATEBOOK_PDFTOHTML`. Without `--auto-correct`, canonical files remain unchanged. Corrections are written atomically with source-drift guards and private originals. External patch and reviewed-difference inputs are rejected. Inspect `recovery.json` if a run is interrupted after a write.

Local checks inspect every PDF page and the whole HTML at 1440/1024/390 px. Text and geometry JSON replace screenshots. Actual rendered font names/glyph counts are obtained through CDP. Safe repairs cover language attributes, responsive constraints and source-mapped presentation. Ambiguous missing paragraphs, table spans, complex source layouts and font mappings remain explicit findings until a source-supported repair is established.

`complete-plan`/`complete-status` track only this layout workflow. They do not run editorial skills or certify translations semantically.

## Native integration tests

Set `VALIDATEBOOK_INTEGRATION=1` and the configured tool variables, then run the tests. Browser tests create only temporary synthetic books and JSON/text evidence, never mutate real books or request screenshots. Native browser execution may require an existing platform grant; a blocked test is not a pass.

Default typography calibration and reader-frame delivery checks are built into prepare. Use `--word-spacing natural` with `--auto-correct` when left-aligned prose is requested. The default `source` policy justifies body prose and uses `text-align-last: left` with automatic hyphenation, so final, forced-break and one-line text remains left-aligned without stretching short lines. `pdftohtml` defaults to the same configured Poppler executable directory as pdftotext; override it explicitly with `--pdftohtml`. See SKILL.md for acceptance limits.

PDF subset font faces are grouped by source family before `validatebook-layout.css` is generated, so Regular, Italic, Bold and BoldItalic become descriptors of one CSS family. Normal source text writes `font-style: normal` and cannot be assigned to a family that lacks a normal 400 face.

Partial PDF bold, such as a bold definition term followed by normal prose, is measured by coverage. It does not authorize block-level bold for the whole paragraph.

## Shared CSS and reader import

Short dialogue receives the same source font-size and family checks as longer prose. Match unique HTML paragraphs against the source text, including paragraphs that continue across PDF pages after repeated running headers and printed folios are excluded; text length must not exempt a dialogue from validation. An unmapped English paragraph fails verification. English `page_N` folios are not translation counterparts.

After presentation repairs, move inline declarations into a single local `validatebook-layout.css` per HTML directory. Deduplicate identical declaration groups, preserve emphasis and heading custom properties, remove inline style attributes, and compare computed property values before installing the CSS and HTML. Allow sub-0.001px serialization rounding, descending/default numeric px fallback, and inherited typography drift on textless media elements; ascending or non-numeric computed-style drift remains blocking. Later validation must report any remaining source mismatch instead of letting consolidation abort the run. For newly inlined display-page nodes, add higher-specificity ID, tag and page-child selectors so later source `#id` and `nth-of-type` rules cannot change captured typography. Leave ordinary managed groups below source-font rules. Display-page families keep a source-derived generic fallback: sans-serif for Inter-like faces, otherwise Georgia, serif. Keep originals and hash-bound stylesheet evidence. Existing unrelated files must not be overwritten.

Verify both default delivery paths: the standalone/iframe document and the supported imported article. The host must preserve the managed root attribute, declaration-group attributes and same-directory stylesheet when replacing the source body with an article. Check all blocks at each default viewport for text/order, font-size, family and leading parity. A standalone pass cannot certify the imported article. Unsupported import contracts remain errors. No font-control tests or screenshots.

Measure the host root CSS-pixel size as well as the default rem preference. The managed article rule compensates their unit ratio through `--validatebook-font-size`, leaving the reader UI scale intact. Paragraph and root calibration share that variable.

## Source pagination

A page anchor alone does not preserve pagination. Use `prepare BOOK --auto-correct --paginate` after layout correction to create distinct `.pdf-source-page` containers. Before splitting, normalize duplicate, skipped or out-of-order `page_N` anchors in document order and update same-document links to the first matching normalized anchor; preserve narrative text and non-page IDs. The cover and title page stay separate. Use English PDF dimensions for the page aspect and require complete English page-number coverage. Insert a missing English blank page only when PDF extraction confirms that it has no text except its printed page number. Missing nonblank boundaries require source evidence. Translation repair uses the corresponding English page and never inserts placeholders.

Split nested containers such as contents lists while retaining text, emphasis, links and unique IDs. Preserve the host outer reading width and text-size preference; scale paginated English content according to source page geometry. Translated pages use the canonical English page/block structure but may grow vertically with longer words. Keep screen separation and print page breaks. Preserve generated pagination CSS on subsequent corrections. The reader counter and previous/next controls must use real page containers when available.

Derive page-body padding from recurring PDF text bounds, excluding blank rows and printed folios; retain the host outer width and centering. Do not substitute arbitrary clamp padding for measured margins. Reject ambiguous or mixed-size geometry. Rebuild matched contents presentation with dotted leaders, source indentation and row leading. Preserve link labels and targets. English labels use printed PDF folios; translated labels use their own reader page markers. Never present English folios as translated page numbers. Unmatched entries remain recorded for review.

The imported-article adapter must reproduce the host stylesheet order: host reader, managed presentation, then accepted source CSS. Contents rules must retain their measured leading even when source CSS loads later. CDP font collection checks descendant formatting contexts when a flex contents label is not reported on its parent. Existing paginated documents receive source-padding comparisons during read-only audits too.

Exclude repeated running headers in the top margin when estimating the body text area. Natural word spacing preserves source-supported centered or right-aligned display paragraphs; it only removes prose justification. Contents without dotted leaders in the source remain borderless aligned rows without invented leaders.

## Source paragraph borders

PDF graphics extraction belongs to the pdf2html skill. Configure its absolute launcher path through `--pdf2html` or `VALIDATEBOOK_PDF2HTML`. validateBook invokes `decorations INPUT.pdf` and verifies the source hash and border/list evidence before repairs. Missing configuration or invalid evidence fails explicitly. No extraction code or PDF runtime is copied into validateBook.

Compare source-supported paragraph left borders, color, thickness and horizontal insets in standalone and imported readers at all three default widths. Automatic correction requires a unique page/text paragraph match; ambiguous matches remain findings. Consolidate border declarations into managed CSS, propagate by unique structural IDs to existing languages, and verify their computed presentation. Table borders, running headers, arbitrary shapes and right-side borders are not certified by this paragraph-border check. Reports retain its scope explicitly. No screenshots or font-control tests.

## Flattened source lists

The pdf2html source extractor also returns numbered and bulleted list groups from PDF line geometry. Recognize consecutive markers and hanging continuation lines; exclude numbered contents rows. Recover a uniquely matched complete group from a flattened paragraph, preserving exact text, inline emphasis, page IDs and prose before/after it. Keep the original literal markers in semantic ol/ul/li elements, hide generated markers and measure their hanging inset. Ordered groups retain their starting number across source pages. Font size and leading follow list-specific source measurements, not the prose default. Missing or ambiguous matches are findings, never permission to rewrite text. Lists and paragraph borders share one local extraction pass.

## Executable completion

Use `scripts/validatebook complete BOOK_ROOT` for native English correction and deterministic translated-unit findings. The active skill agent consumes `translation_page_retranslation_required`, inserts only the missing or corrected unit text and reruns validation until every existing language reconciles. No external model API, Python runtime, helper script or external review plan is used. PDF extraction is delegated to the configured pdf2html skill.

Sparse centered or left-aligned display pages are checked independently from prose and reader parity. Source XML groups establish separate title, subtitle, italic description and year blocks, their font sizes, explicit line groups and vertical gaps. Repair requires complete normalized text agreement and a verified embedded source family. Rebuild the groups before the single CSS consolidation step; retain page anchors and responsive wrapping. Check grouping, alignment, emphasis, sizes, leading and margins at each viewport in both reader paths. A repeated running title must not exempt the title-page heading from these checks.

Body-leading samples must match PDF XML lines at the dominant body font size before their precise bounding-box increments are accepted. Table and caption lines cannot calibrate prose. The ScriptaHub import adapter also supports the generic local-books stylesheet contract, preserving declared CSS order without a title allowlist.

Display-page correction is generic: detect centered or left-aligned sparse layouts, including a centered title whose lines share a midline even if one glyph box is slightly off axis; flush-left rows are not treated as centered. Retain each group's verified source family, color, emphasis, first-line inset, line breaks and vertical gaps, and scale down to the available column on narrow screens. Reader iframe/article parity does not rewrite measured display-page groups. Isolated horizontal rules are consumed from the source-hash-bound pdf2html evidence, excluding table intersections; their width, color and placement are never inferred from the book title. Missing font mappings or ambiguous content leave the affected repair unapplied and reported. Check both standalone and imported delivery after CSS consolidation and rerunning the repair.


## Installation safety and page spacing

Generated page boxes own PDF-derived outer insets. Undecorated normal-flow main/article/section/div page shells have their duplicate box spacing and minimum height neutralized; paragraph, list and table spacing is preserved. Positioned or decorated layouts with ambiguous spacing remain reported errors. Covers are detected at any nesting depth. One reading root must contain every page. Before replacing canonical HTML/CSS, same-directory candidates are measured at 1440, 1024 and 390 px in standalone and supported imported delivery. Missing reader pages, cumulative shell spacing and unsafe display regressions reject the affected correction batch, without aborting other documents. Recovery copies and native job evidence are retained on failure and removed after verified successful completion and final-report delivery.

## Canonical translation pages

English PDF-margin and visual page checks apply only to English. Translations are paired to the corresponding English page and must have identical ordered block tags and per-block sentence counts. Translated words may make the page taller. No independent visual-conformance findings are produced for translations.

## Autonomous transactional completion

Complete owns native English correction, CSS consolidation and canonical style propagation. Each translated unit is accepted only when it reconciles to its English counterpart by document order, tag role and sentence count. A mismatch emits full structured evidence; the active agent inserts only the missing or corrected unit text without placeholders. Validation repeats until every unit reconciles. The corrected translation then inherits English fonts, sizes, weights, colors, spacing, classes and table/list presentation. Reports contain grouped remaining translation errors and grouped applied fixes; detailed unit evidence remains in JSON.

## Authorized publisher restoration

The --restore-source-publisher option requires explicit user authorization. Native code extracts a unique copyright identity and website from the PDF, restores those entities only inside the existing copyright section, preserves narrative and translated sentence structure, and records before/after evidence. It is not enabled by ordinary layout correction. Complete still requires successful candidate validation before installation.

## Translated images and tables

Preserve localized image assets, including cover lettering, while applying English display dimensions, aspect ratio, fit, alignment and decoration. Match unique shared image/figure identities, including the cover role; ambiguous images remain reported errors. Check rendered image boxes in standalone and imported readers at every viewport, even when intrinsic asset ratios differ. Never replace localized artwork merely to inherit presentation. Table styling follows source cell borders, fills, column proportions, padding, typography and alignment; preserve translated cell text and allow row-height growth. Match unique structural identities or a unique same-grid table in the same structural role; missing or ambiguous translated tables remain reported errors.

## Cleanup after successful completion

After successful correction, verify the installed canonical files and durably save RAPORT-CORECTII.md at the book root. Then the native complete command must automatically remove book-owned .validatebook-jobs, .validatebook-layout and .validatebook-layout-jobs, including obsolete jobs, staged copies, recovery copies and temporary evidence. Preserve the PDF, canonical HTML/CSS/assets, manifest and final reports. Runtime failures retain diagnostics until the next fresh invocation; unresolved validation errors permit verified installation and cleanup. Never remove another running job: unresolved lock files defer cleanup and must be reported explicitly. Audit-only prepare retains its report/status job. No agent-authored cleanup script or intermediate user confirmation is required. The final report records cleanup completion or failure; deleted job paths are historical, not available evidence.

## Fresh execution and partial completion

Every complete invocation (including prepare --auto-correct) deletes previous book-owned .validatebook-jobs, .validatebook-layout and .validatebook-layout-jobs results and final reports before creating a fresh transaction. Preserve canonical PDF/HTML/CSS/assets: starting from zero means fresh evidence, not undoing installed corrections. Never delete another job with an unresolved lock. Custom job directories receive a new transaction; unrelated files are preserved. Audit-only prepare retains its read-only report/status job.

Apply source-supported repairs until no further file changes occur. Unresolved validation findings remain errors in RAPORT-CORECTII.md; completed_with_errors means verified corrections were installed, not that the book passed all checks. Exit code 3 signals remaining errors without disabling HTML or reader access. Unsafe candidate batches are rejected and recorded while other documents continue. Runtime/tool failures and concurrent edits preserve originals. After verified installation and durable reporting, remove temporary results even for completed_with_errors.
