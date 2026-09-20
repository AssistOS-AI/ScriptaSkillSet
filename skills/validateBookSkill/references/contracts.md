# Layout contract


## Table fidelity and blocking findings

Unmapped or ambiguous English paragraphs are errors regardless of token overlap. Nonvisual remote-script warnings may remain nonblocking; they do not certify typography. Completion applies verified corrections and reports unresolved errors as completed_with_errors; unresolved findings do not reject the entire book.

The required pdf2html `decorations` response includes hash-bound `tables`: closed grids, complete fill partitions, or geometrically certified borderless two-column tables, including repeated-header continuations on the next PDF page. Evidence records source page width, cell text and spans, widths, fills, individual border edges, vertical alignment and uniform typography. Old providers without table evidence fail explicitly. Chromium compares every cell at 1440, 1024 and 390 px in standalone and imported readers, including actual rendered font identity when platform evidence is available. Complete text/span correspondence is required; partial, duplicate, mixed-font or unsupported tables remain errors. Source font lookup retains full face names, including bold MT variants.

Paginated readers scale text, leading and paragraph gaps by max(1, rendered page width / source CSS-pixel page width). The page box is the container query for --validatebook-page-scale, so a wider host cannot inflate type; nested containers inherit that number. Narrow screens retain physical source font sizes and allow page growth; larger pages preserve text-to-page proportions. The host keeps its outer width and padding. A source-fidelity marker neutralizes legacy iframe inflation, and imported parity compares sizes normalized by the independently measured page widths. Managed CSS keeps the measured standalone size. Repairs remain stable across CSS consolidation and reruns.

Native table repairs preserve prose and responsive flow, restore source fills/edges and proportional columns, and consolidate cell styles into managed CSS. Cell selector specificity survives subsequent consolidation and source stylesheet order. Translations require the canonical English block order and matching table spans. Native actions never rewrite translation text; the active agent may insert only the missing or corrected unit text selected by the deterministic alignment.

Consecutive continued source tables that a converter merged into one HTML table receive presentation-only cell repairs from their exact row mapping, including repeated header rows the converter kept and folio artifacts excluded from matching. Their rows are never redistributed across page containers, so source pagination is unchanged; any source row without a unique HTML counterpart remains an explicit finding.


## Inputs and outputs

Existing English PDF and HTML are required. Discover existing full readers from manifest paths or language folders; never infer full editions from localized landing pages. A declared but missing reader is an error. `--languages` narrows the requested inventory; by default all existing supported editions are included.

Jobs use the single unversioned `scope: layout_and_structure` contract. Outputs are `job.json`, `source-evidence.json`, one language-layout JSON per edition, `report.md`, `report.json`, and recovery files when corrections occur. Structured `translation_page_retranslation_required` findings are the handoff to the active agent; no PNGs, screenshots, PDF page rasters or HTML image reports are created.

`job.json` binds final canonical inputs, local CSS/import/font/image dependencies and evidence hashes. Status verifies them before returning stored results. Changed input/evidence requires a fresh job. The original hashes and recovery paths remain in `recovery.json`. Status rejects records without the layout scope and required input/evidence fields.

## Local checks

Poppler supplies all PDF pages, text bounds, font and image inventories. Chromium supplies block/anchor/table structure, image loading, computed styles, actual platform fonts and layout at 1440, 1024 and 390 px. Scripts/network are disabled; default text size only.

English source matching normalizes whitespace, Unicode compatibility forms, punctuation and line-end hyphenation. Unmatched lines/passages are candidates, not automatic proof of omission. Unique HTML paragraph matches against the source text, including paragraphs that continue across PDF pages after repeated running headers and printed folios are excluded, compare font size and source family. A heading that also appears in the contents list is matched on its source page before the whole-document search. Generated “Figure from PDF page N” captions are not treated as source prose. Unmapped or ambiguous English paragraphs are findings, not certified. Unmapped geometry remains explicitly uncertified. Font inventories remain a document-level check and do not certify per-paragraph faces. Image inventories reveal missing/different quantities but cannot identify arbitrary PDF composites by count.

Translations are aligned to English by document order, tag role and language-aware sentence count; translated pagination may differ, so page numbers are never used. Each unreconciled unit emits `translation_page_retranslation_required` with the exact missing or sentence-count-different unit, its selectors and both texts. The active agent inserts only the correct text for that unit and lets the following deterministic structure reflow. No placeholder is inserted. Reconciled units certify structure only, not literary or factual equivalence.

## Repairs

`--auto-correct` enables text-preserving safe local actions and installation. Recheck each changed document before proceeding. English errors block automatic cross-language propagation. Safe source-mapped actions require unique structural correspondence; no target paragraph is invented. CSS URLs are rebased relative to each target; dependencies remain local.

Native actions repair the language tag, inherit source styles/body presentation attributes, copy presentation classes, correct uniquely mapped tags/table headers and rebase mapped image sources. Native DOM actions remain text-preserving. The only prose change is inserting the missing or corrected unit text identified by the deterministic alignment; external patch plans, helper scripts and reviewed-difference files remain rejected.

Source omissions or complex structures unsupported by deterministic native actions remain error findings. Fix the responsible native handler before rerunning when the source evidence is sufficient. Never generate missing translated prose or reinterpret language meaning under this skill.

## Findings and status

Each finding includes a stable ID, language, category, location, detail, severity and provenance. Native findings never request judgment except `translation_page_retranslation_required`, whose structured evidence is consumed by the active skill agent. Reports retain initial findings, applied corrections and final unresolved findings separately.

`passed` means implemented local checks found no issues. `passed_with_warnings` retains nonblocking limitations/findings. `needs_attention` means unresolved structural/display errors; `incomplete` is used for an unexecuted coordinator. CLI exits 3 for unresolved work and 2 for usage/runtime failures. Never call an unavailable native check passed.

A final report lists exact affected files, problems, before/after changes, local checks, unresolved cases and recoverable originals. It does not certify semantic translation, humanisation, factual accuracy or interactive host application controls.

Host delivery places the final user-facing text at the book root as `RAPORT-CORECTII.md` or `RAPORT-VERIFICARE.md`, beside `manifest.json`. After complete installs that report, it retains the private job directory and recovery copies. Native audit-only execution still writes only inside its job and does not delete it.

Default typography findings include absolute_font_size_difference, line_leading_difference, paragraph_gap_difference, excessive_word_spacing, source_typography_unmapped, source_typography_ambiguous and source_font_family_difference. Native evidence records PDF pt/CSS px, measured gaps and the delivered default reader settings. Presentation repairs additionally allow text-align-last, hyphens, word-spacing and letter-spacing. Source-policy prose is justified regardless of its source font size, while source display-page text (cover, title and other `data-source-display-group` blocks), centered/right-aligned text, and final, forced-break and one-line text keep their PDF presentation. The recognized ScriptaHub default-scaling adapter is a bounded host integration repair with its own hash-checked recovery copy; arbitrary host-code patch plans are not accepted. Calibration uses explicit default settings rather than assuming the nominal CSS body size survives the reader.

PDF-backed `@font-face` declarations use a canonical family per source family and keep face differences in `font-style` and `font-weight`. Regular, Italic, Bold and BoldItalic variants must not become unrelated families when source names differ only by subset prefix or face suffix. A source-normal 400 repair requires a normal 400 face before using that family, and emitted normal typography includes `font-style: normal`.

Block-level bold repairs require majority bold coverage across the matched source passage. Partial inline emphasis, including a bold leading term in an otherwise normal definition paragraph, must not set paragraph-level `font-weight: 700`.

Translation layout propagation requires every unit to reconcile by document order, tag role and sentence count. Native sentence reflow first re-partitions balanced prose runs between structural anchors to the English sentence counts, preserving every character and merging empty translated paragraphs; only genuinely unbalanced or inline-markup units remain for the agent to insert. An unreconciled page receives no presentation propagation until the agent inserts the missing or corrected unit text. Placeholders are forbidden. Validation repeats until every unit reconciles, then canonical English fonts, sizes, colors, spacing, classes and layout roles are applied.

Managed presentation uses `data-validatebook-root` on the reading root, `data-vb-style` declaration-group identifiers, and `link[data-validatebook-presentation]` pointing to the same-directory `validatebook-layout.css`. Managed selectors keep ordinary groups below source-font rules. Newly inlined display-page nodes get extra ID, tag and source-page child selectors so later source ID or nth-of-type rules cannot change captured computed values. Inline style attributes are removed only after a computed-style preservation check; descending/default numeric px fallback and inherited typography drift on textless media elements are accepted so later validation can report remaining source mismatches. CSS is included in input hashes and existing CSS is backed up before replacement. Imported-reader measurements are stored as `<language>-article-layout.json` and bound as job artifacts. Display-page font stacks use a source-derived generic fallback.

## Source pagination

A page anchor alone does not preserve pagination. Use `prepare BOOK --auto-correct --paginate` after layout correction to create distinct `.pdf-source-page` containers. Before splitting, normalize duplicate, skipped or out-of-order `page_N` anchors in document order and update same-document links to the first matching normalized anchor; preserve narrative text and non-page IDs. The cover and title page stay separate. Use English PDF dimensions for the page aspect and require complete English page-number coverage. Insert a missing English blank page only when PDF extraction confirms that it has no text except its printed page number. Missing nonblank boundaries require source evidence. Translation correction uses the corresponding canonical English page and never inserts placeholder content.

Split nested containers such as contents lists while retaining text, emphasis, links and unique IDs. Preserve the host outer reading width and text-size preference; scale paginated English content according to source page geometry. Translation pages follow the canonical English page/block boundaries and may grow vertically with longer target-language text. Keep screen separation and print page breaks. Preserve generated pagination CSS on subsequent corrections. The reader counter and previous/next controls must use real page containers when available.

Derive page-body padding from recurring PDF text bounds, excluding blank rows and printed folios; retain the host outer width and centering. Do not substitute arbitrary clamp padding for measured margins. Reject ambiguous or mixed-size geometry. Rebuild matched contents presentation with dotted leaders, source indentation and row leading. Preserve link labels and targets. English labels use printed PDF folios; translated labels use their own reader page markers. Never present English folios as translated page numbers. Unmatched entries remain recorded for review.

The imported-article adapter must reproduce the host stylesheet order: host reader, managed presentation, then accepted source CSS. Contents rules must retain their measured leading even when source CSS loads later. CDP font collection checks descendant formatting contexts when a flex contents label is not reported on its parent. Existing paginated documents receive source-padding comparisons during read-only audits too.

Exclude repeated running headers in the top margin when estimating the body text area. Natural word spacing preserves source-supported centered or right-aligned display paragraphs; it only removes prose justification. Contents without dotted leaders in the source remain borderless aligned rows without invented leaders.

## Source paragraph borders

PDF graphics extraction belongs to the pdf2html skill. Configure its absolute launcher path through `--pdf2html` or `VALIDATEBOOK_PDF2HTML`. validateBook invokes `decorations INPUT.pdf` and verifies the source hash and border/list evidence before repairs. Missing configuration or invalid evidence fails explicitly. No extraction code or PDF runtime is copied into validateBook.

Compare source-supported paragraph left borders, color, thickness and horizontal insets in standalone and imported readers at all three default widths. Automatic correction requires a unique page/text paragraph match; ambiguous matches remain findings. Consolidate border declarations into managed CSS, propagate by unique structural IDs to existing languages, and verify their computed presentation. Table borders, running headers, arbitrary shapes and right-side borders are not certified by this paragraph-border check. Reports retain its scope explicitly. No screenshots or font-control tests.

## Flattened source lists

The pdf2html source extractor also returns numbered and bulleted list groups from PDF line geometry. Recognize consecutive markers and hanging continuation lines; exclude numbered contents rows. Recover a uniquely matched complete group from a flattened paragraph, preserving exact text, inline emphasis, page IDs and prose before/after it. Keep the original literal markers in semantic ol/ul/li elements, hide generated markers and measure their hanging inset. Ordered groups retain their starting number across source pages. Font size and leading follow list-specific source measurements, not the prose default. Missing or ambiguous matches are findings, never permission to rewrite text. Lists and paragraph borders share one local extraction pass.

## Executable completion

Use `scripts/validatebook complete BOOK_ROOT` for native English correction and deterministic translated-unit findings. The active skill agent then reads those findings, inserts only the missing or corrected unit text, and reruns validation until all existing languages reconcile or a blocking error remains. No external model API, Python runtime, helper script or external review plan is used. PDF extraction is delegated to the explicitly configured pdf2html skill. A failed correction handler must be fixed; do not relabel its unresolved findings as passed.

Sparse centered or left-aligned display pages are checked independently from prose and reader parity. Source XML groups establish separate title, subtitle, italic description and year blocks, their font sizes, explicit line groups and vertical gaps. Repair requires complete normalized text agreement and a verified embedded source family. Rebuild the groups before the single CSS consolidation step; retain page anchors and responsive wrapping. Check grouping, alignment, emphasis, sizes, leading and margins at each viewport in both reader paths. A repeated running title must not exempt the title-page heading from these checks.

Detect false headings inside paragraphs from source continuity on both sides. Merge a heading with its adjacent paragraphs only when the source line is not bold, sizes and baseline spacing match ordinary continuous text, and the entire combined text occurs on the same source page. Preserve anchors and exact text; verify the merged result and keep source evidence in the correction log. The same detector can run without mutation during audit.

Body-leading samples must match PDF XML lines at the dominant body font size before their precise bounding-box increments are accepted. Table and caption lines cannot calibrate prose. The ScriptaHub import adapter also supports the generic local-books stylesheet contract, preserving declared CSS order without a title allowlist.

Display-page correction is generic: detect centered or left-aligned sparse layouts, including a centered title whose lines share a midline even if one glyph box is slightly off axis; flush-left rows are not treated as centered. Retain each group's verified source family, color, emphasis, first-line inset, line breaks and vertical gaps, and scale down to the available column on narrow screens. Reader iframe/article parity does not rewrite measured display-page groups. Isolated horizontal rules are consumed from the source-hash-bound pdf2html evidence, excluding table intersections; their width, color and placement are never inferred from the book title. Missing font mappings or ambiguous content leave the affected repair unapplied and reported. Check both standalone and imported delivery after CSS consolidation and rerunning the repair.


## Installation safety and page spacing

Generated page boxes own PDF-derived outer insets. Undecorated normal-flow main/article/section/div page shells have their duplicate box spacing and minimum height neutralized; paragraph, list and table spacing is preserved. Positioned or decorated layouts with ambiguous spacing remain reported errors. Covers are detected at any nesting depth. One reading root must contain every page. Before replacing canonical HTML/CSS, same-directory candidates are measured at 1440, 1024 and 390 px in standalone and supported imported delivery. Missing reader pages, cumulative shell spacing and unsafe display regressions reject the affected correction batch, without aborting other documents. Recovery copies and native job evidence are retained on failure and removed after verified successful completion and final-report delivery.

## Canonical translation pages

English PDF-margin and visual page-boundary checks apply only to English. Translation structure is nevertheless compared against the corresponding canonical English page number. A retranscribed translated page may grow vertically because translated words have different lengths, but its ordered blocks and sentence counts must match English. Translations do not receive independent hidden/clipped/overflow, font-rendering, page-height or imported-reader visual findings.

## Autonomous transactional completion

Complete owns native English correction, CSS consolidation and canonical presentation propagation. English is the visual and structural template. A translated unit is accepted only when it reconciles to its English counterpart by document order, tag role and sentence count; otherwise the active agent inserts the missing or corrected text and validation repeats. Once reconciled, the translation inherits English layout roles, managed typography, display composition, contents structure, spacing, colors and table/list presentation. Translation word lengths may grow the page. No independent visual-conformance findings are produced for translations. The Markdown report remains concise; structured unit evidence stays in JSON. Batch execution publishes only the final report for the current invocation and overwrites older reports. External repair plans and helper scripts are not part of execution.

## Authorized publisher restoration

The --restore-source-publisher option requires explicit user authorization. Native code extracts a unique copyright identity and website from the PDF, restores those entities only inside the existing copyright section, preserves narrative and translated sentence structure, and records before/after evidence. It is not enabled by ordinary layout correction. Complete still requires successful candidate validation before installation.

## Translated images and tables

Preserve localized image assets, including cover lettering, while applying English display dimensions, aspect ratio, fit, alignment and decoration. Match unique shared image/figure identities, including the cover role; ambiguous images remain reported errors. Check rendered image boxes in standalone and imported readers at every viewport, even when intrinsic asset ratios differ. Never replace localized artwork merely to inherit presentation. Table styling follows source cell borders, fills, column proportions, padding, typography and alignment; preserve translated cell text and allow row-height growth. Match unique structural identities or a unique same-grid table in the same structural role; missing or ambiguous translated tables remain reported errors.

## Cleanup after successful completion

After successful correction, verify the installed canonical files and durably save RAPORT-CORECTII.md at the book root. Then the native complete command must automatically remove book-owned .validatebook-jobs, .validatebook-layout and .validatebook-layout-jobs, including obsolete jobs, staged copies, recovery copies and temporary evidence. Preserve the PDF, canonical HTML/CSS/assets, manifest and final reports. Runtime failures retain diagnostics until the next fresh invocation; unresolved validation errors permit verified installation and cleanup. Never remove another running job: unresolved lock files defer cleanup. Audit-only prepare retains its report/status job. No agent-authored cleanup script or intermediate user confirmation is required. Cleanup status and removed paths remain in the machine-readable command result and are omitted from the user-facing Markdown report.

## Fresh execution and partial completion

Every complete invocation (including prepare --auto-correct) deletes previous book-owned .validatebook-jobs, .validatebook-layout and .validatebook-layout-jobs results and final reports before creating a fresh transaction. Preserve canonical PDF/HTML/CSS/assets: starting from zero means fresh evidence, not undoing installed corrections. Never delete another job with an unresolved lock. Custom job directories receive a new transaction; unrelated files are preserved. Audit-only prepare retains its read-only report/status job.

Apply source-supported repairs until no further file changes occur. Unresolved validation findings remain errors in RAPORT-CORECTII.md; completed_with_errors means verified corrections were installed, not that the book passed all checks. Exit code 3 signals remaining errors without disabling HTML or reader access. Unsafe candidate batches are rejected and recorded while other documents continue. Runtime/tool failures and concurrent edits preserve originals. After verified installation and durable reporting, remove temporary results even for completed_with_errors.

Shared reader presentation is isolated from managed books. A root marked with `data-pdf-fidelity` or `data-validatebook-root` receives reader control variables and outer reading-surface geometry, while its descendant typography, colours, media, tables and internal page spacing come only from edition CSS. Generic shared styles must exclude both markers. Shared reader CSS must not contain book-specific presentation exceptions. Inter-page gaps may be host-owned; spacing inside each source page is book-owned.
