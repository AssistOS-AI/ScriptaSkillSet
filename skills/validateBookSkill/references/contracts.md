# Layout contract


## Table fidelity and blocking findings

Unmapped or ambiguous English paragraphs are errors regardless of token overlap. Nonvisual remote-script warnings may remain nonblocking; they do not certify typography. Completion stops successfully only after all structural/display errors are resolved.

The required pdf2html `decorations` response includes hash-bound `tables`: closed grids or complete columns established by adjacent cell fills and horizontal row rules, source page width, cell text and spans, widths, fills, individual border edges, vertical alignment and uniform typography. Old providers without table evidence fail explicitly. Chromium compares every cell at 1440, 1024 and 390 px in standalone and imported readers, including actual rendered font identity when platform evidence is available. Complete text/span correspondence is required; partial, duplicate, mixed-font or unsupported tables remain errors. Source font lookup retains full face names, including bold MT variants.

Paginated readers scale text, leading and paragraph gaps by max(1, rendered page width / source CSS-pixel page width). The page box is the container query for --validatebook-page-scale, so a wider host cannot inflate type; nested containers inherit that number. Narrow screens retain physical source font sizes and allow page growth; larger pages preserve text-to-page proportions. The host keeps its outer width and padding. A source-fidelity marker neutralizes legacy iframe inflation, and imported parity compares sizes normalized by the independently measured page widths. Managed CSS keeps the measured standalone size. Repairs remain stable across CSS consolidation and reruns.

Native table repairs preserve prose and responsive flow, restore source fills/edges and proportional columns, and consolidate cell styles into managed CSS. Cell selector specificity survives subsequent consolidation and source stylesheet order. Translations require a unique structural table correspondence and matching spans; their text is never rewritten. Regression tests cover lost dark header fills, column proportions, ambiguous mappings, CSS consolidation and imported delivery.


## Inputs and outputs

Existing English PDF and HTML are required. Discover existing full readers from manifest paths or language folders; never infer full editions from localized landing pages. A declared but missing reader is an error. `--languages` narrows the requested inventory; by default all existing supported editions are included.

Jobs use the single unversioned `scope: layout_and_structure` contract. Outputs are `job.json`, `source-evidence.json`, one language-layout JSON per edition, `report.txt`, `report.json`, and recovery files when corrections occur. No LLM tasks, PNGs, screenshots, PDF page rasters or HTML image reports.

`job.json` binds final canonical inputs, local CSS/import/font/image dependencies and evidence hashes. Status verifies them before returning stored results. Changed input/evidence requires a fresh job. The original hashes and recovery paths remain in `recovery.json`. Status rejects records without the layout scope and required input/evidence fields.

## Local checks

Poppler supplies all PDF pages, text bounds, font and image inventories. Chromium supplies block/anchor/table structure, image loading, computed styles, actual platform fonts and layout at 1440, 1024 and 390 px. Scripts/network are disabled; default text size only.

English source matching normalizes whitespace, Unicode compatibility forms, punctuation and line-end hyphenation. Unmatched lines/passages are candidates, not automatic proof of omission. Unique HTML paragraph matches against the source text, including paragraphs that continue across PDF pages after repeated running headers and printed folios are excluded, compare font size and source family. A heading that also appears in the contents list is matched on its source page before the whole-document search. Generated “Figure from PDF page N” captions are not treated as source prose. Unmapped or ambiguous English paragraphs are findings, not certified. Unmapped geometry remains explicitly uncertified. Font inventories remain a document-level check and do not certify per-paragraph faces. Image inventories reveal missing/different quantities but cannot identify arbitrary PDF composites by count.

Translations are compared structurally: stable source IDs, non-folio IDs, paragraph/block sequence, table shapes and image counts. English `page_N` folios belong to that edition’s pagination and are not translation counterparts. Independently paginated translations may differ in block sequence; that is a warning, not a mandate to invent or rewrite translated prose. Hidden/clipped text, missing resources, corruption candidates, failed fonts and broken anchors are checked independently. Matching block counts do not prove equivalent text. No semantic translation corrections are performed.

## Repairs

`--auto-correct` enables text-preserving safe local actions and installation. Recheck each changed document before proceeding. English errors block automatic cross-language propagation. Safe source-mapped actions require unique structural correspondence; no target paragraph is invented. CSS URLs are rebased relative to each target; dependencies remain local.

Native actions repair the language tag, apply responsive constraints, inherit source styles/body presentation attributes, copy uniquely mapped presentation classes, correct uniquely mapped tags/table headers and rebase mapped image sources. These actions are generated only by bundled local code from hash-bound evidence. External patch plans, reviewed-difference files, scripts, arbitrary evaluation and text replacement are rejected. DOM text before/after must remain identical.

Source omissions or complex structures unsupported by deterministic native actions remain error findings. Fix the responsible native handler before rerunning when the source evidence is sufficient. Never generate missing translated prose or reinterpret language meaning under this skill.

## Findings and status

Each finding includes a stable ID, language, category, location, detail, severity and provenance. Findings never request LLM or agent judgment. Reports retain initial findings, applied corrections and final unresolved findings separately.

`passed` means implemented local checks found no issues. `passed_with_warnings` retains nonblocking limitations/findings. `needs_attention` means unresolved structural/display errors; `incomplete` is used for an unexecuted coordinator. CLI exits 3 for unresolved work and 2 for usage/runtime failures. Never call an unavailable native check passed.

A final report lists exact affected files, problems, before/after changes, local checks, unresolved cases and recoverable originals. It does not certify semantic translation, humanisation, factual accuracy or interactive host application controls.

Host delivery places the final user-facing text at the book root as `RAPORT-CORECTII.txt` or `RAPORT-VERIFICARE.txt`, beside `manifest.json`. After complete installs that report, it retains the private job directory and recovery copies. Native audit-only execution still writes only inside its job and does not delete it.

Default typography findings include absolute_font_size_difference, line_leading_difference, paragraph_gap_difference, excessive_word_spacing, source_typography_unmapped, source_typography_ambiguous and source_font_family_difference. Native evidence records PDF pt/CSS px, measured gaps and the delivered default reader settings. Presentation repairs additionally allow word-spacing and letter-spacing. The recognized ScriptaHub default-scaling adapter is a bounded host integration repair with its own hash-checked recovery copy; arbitrary host-code patch plans are not accepted. Calibration uses explicit default settings rather than assuming the nominal CSS body size survives the reader.

Managed presentation uses `data-validatebook-root` on the reading root, `data-vb-style` declaration-group identifiers, and `link[data-validatebook-presentation]` pointing to the same-directory `validatebook-layout.css`. Managed selectors keep ordinary groups below source-font rules. Newly inlined display-page nodes get extra ID, tag and source-page child selectors so later source ID or nth-of-type rules cannot change captured computed values. Inline style attributes are removed only after a computed-style preservation check. CSS is included in input hashes and existing CSS is backed up before replacement. Imported-reader measurements are stored as `<language>-article-layout.json` and bound as job artifacts. Display-page font stacks use a source-derived generic fallback.

## Source pagination

A page anchor alone does not preserve pagination. Use `prepare BOOK --auto-correct --paginate` after layout correction to create distinct `.pdf-source-page` containers. The cover and title page stay separate. Use English PDF dimensions for the page aspect and require complete English page-number coverage. Insert a missing English blank page only when PDF extraction confirms that it has no text except its printed page number. Missing nonblank boundaries require source evidence. Existing translated page markers belong to their own editions; never relabel them as English source pages or manufacture translated text.

Split nested containers such as contents lists while retaining text, emphasis, links and unique IDs. Preserve the host outer reading width and text-size preference; scale paginated content according to source page geometry. Every page, including translated covers, title, copyright and closing pages, retains a source-proportioned minimum height. Translations keep their own page boundaries and may grow with longer content; never clip prose or impose the English page count. Keep screen separation and print page breaks. Preserve generated pagination CSS on subsequent corrections. The reader counter and previous/next controls must use real page containers when available.

Derive page-body padding from recurring PDF text bounds, excluding blank rows and printed folios; retain the host outer width and centering. Do not substitute arbitrary clamp padding for measured margins. Reject ambiguous or mixed-size geometry. Rebuild matched contents presentation with dotted leaders, source indentation and row leading. Preserve link labels and targets. English labels use printed PDF folios; translated labels use their own reader page markers. Never present English folios as translated page numbers. Unmatched entries remain recorded for review.

The imported-article adapter must reproduce the host stylesheet order: host reader, managed presentation, then accepted source CSS. Contents rules must retain their measured leading even when source CSS loads later. CDP font collection checks descendant formatting contexts when a flex contents label is not reported on its parent. Existing paginated documents receive source-padding comparisons during read-only audits too.

Exclude repeated running headers in the top margin when estimating the body text area. Natural word spacing preserves source-supported centered or right-aligned display paragraphs; it only removes prose justification. Contents without dotted leaders in the source remain borderless aligned rows without invented leaders.

## Source paragraph borders

PDF graphics extraction belongs to the pdf2html skill. Configure its absolute launcher path through `--pdf2html` or `VALIDATEBOOK_PDF2HTML`. validateBook invokes `decorations INPUT.pdf` and verifies the source hash and border/list evidence before repairs. Missing configuration or invalid evidence fails explicitly. No extraction code or PDF runtime is copied into validateBook.

Compare source-supported paragraph left borders, color, thickness and horizontal insets in standalone and imported readers at all three default widths. Automatic correction requires a unique page/text paragraph match; ambiguous matches remain findings. Consolidate border declarations into managed CSS, propagate by unique structural IDs to existing languages, and verify their computed presentation. Table borders, running headers, arbitrary shapes and right-side borders are not certified by this paragraph-border check. Reports retain its scope explicitly. No screenshots or font-control tests.

## Flattened source lists

The pdf2html source extractor also returns numbered and bulleted list groups from PDF line geometry. Recognize consecutive markers and hanging continuation lines; exclude numbered contents rows. Recover a uniquely matched complete group from a flattened paragraph, preserving exact text, inline emphasis, page IDs and prose before/after it. Keep the original literal markers in semantic ol/ul/li elements, hide generated markers and measure their hanging inset. Ordered groups retain their starting number across source pages. Font size and leading follow list-specific source measurements, not the prose default. Missing or ambiguous matches are findings, never permission to rewrite text. Lists and paragraph borders share one local extraction pass.

## Executable completion

Use `scripts/validatebook complete BOOK_ROOT` for an authorized verify-and-correct request. The command applies English corrections, checks installed files, propagates accepted presentation, checks existing translations and writes `RAPORT-CORECTII.txt` at the book root. The private job directory, recovery copies and verification evidence are retained. `prepare` remains the single-pass audit/repair primitive and keeps its job. No LLM, model API, Python runtime or external review plan is used. PDF extraction is delegated to the explicitly configured pdf2html skill. A failed correction handler must be fixed; do not relabel its unresolved findings as passed. The coordinator detects repeated installed file states, rather than stopping after a fixed number of passes or comparing error counts.

Sparse centered or left-aligned display pages are checked independently from prose and reader parity. Source XML groups establish separate title, subtitle, italic description and year blocks, their font sizes, explicit line groups and vertical gaps. Repair requires complete normalized text agreement and a verified embedded source family. Rebuild the groups before the single CSS consolidation step; retain page anchors and responsive wrapping. Check grouping, alignment, emphasis, sizes, leading and margins at each viewport in both reader paths. A repeated running title must not exempt the title-page heading from these checks.

Detect false headings inside paragraphs from source continuity on both sides. Merge a heading with its adjacent paragraphs only when the source line is not bold, sizes and baseline spacing match ordinary continuous text, and the entire combined text occurs on the same source page. Preserve anchors and exact text; verify the merged result and keep source evidence in the correction log. The same detector can run without mutation during audit.

Body-leading samples must match PDF XML lines at the dominant body font size before their precise bounding-box increments are accepted. Table and caption lines cannot calibrate prose. The ScriptaHub import adapter also supports the generic local-books stylesheet contract, preserving declared CSS order without a title allowlist.

Display-page correction is generic: detect centered or left-aligned sparse layouts, including a centered title whose lines share a midline even if one glyph box is slightly off axis; flush-left rows are not treated as centered. Retain each group's verified source family, color, emphasis, first-line inset, line breaks and vertical gaps, and scale down to the available column on narrow screens. Reader iframe/article parity does not rewrite measured display-page groups. Isolated horizontal rules are consumed from the source-hash-bound pdf2html evidence, excluding table intersections; their width, color and placement are never inferred from the book title. Missing font mappings or ambiguous content stop correction before mutation. Check both standalone and imported delivery after CSS consolidation and rerunning the repair.


## Installation safety and page spacing

Generated page boxes own PDF-derived outer insets. Undecorated normal-flow main/article/section/div page shells have their duplicate box spacing and minimum height neutralized; paragraph, list and table spacing is preserved. Positioned or decorated layouts with ambiguous spacing remain blocking findings. Covers are detected at any nesting depth. One reading root must contain every page. Before replacing canonical HTML/CSS, same-directory candidates are measured at 1440, 1024 and 390 px in standalone and supported imported delivery. Missing reader pages, cumulative shell spacing and unsafe display regressions reject installation. Recovery copies and native job evidence are retained after completion, including failures.

## Independent translation pagination

English page-boundary and PDF-margin checks apply only to English. Existing translations keep their page counts, break positions, chapter placement and local page geometry, including continuous flow and multiple chapters on one page. The --paginate correction option paginates English only. English page anchor numbers do not constrain translated reader pages. Missing reader content, broken anchors, hidden or clipped content, overlapping boxes and cumulative container spacing remain errors in every language. Translation page geometry is not replaced with the English profile during CSS regeneration.

## Autonomous transactional completion

Complete owns the whole correction cycle in an isolated working copy, including source-anchor pagination when present, CSS consolidation, source typography checks at all three widths, translated role-based typography and both delivery paths. Translations are never matched lexically to English paragraphs; ambiguous roles remain explicit errors. Every language retains full page minimum dimensions, checked in both delivery paths at every viewport; translated content may extend pages without changing its text or imposing English breaks. Explicit paragraph sizes include the page scale exactly once, and managed selector priority survives reruns. Both complete and CLI prepare --auto-correct use this transaction. Only a candidate without blocking findings is installed, after original input hashes are rechecked. Failed candidates remain in the native job with evidence; the book is preserved. External PDF/HTML overrides are audit-only. A candidate that changes the host reader cannot be installed as a book-only change. No external agent scripts, repair plans or manual sequence of helper scripts is part of normal execution.

## Authorized publisher restoration

The --restore-source-publisher option requires explicit user authorization. Native code extracts a unique copyright identity and website from the PDF, restores those entities only inside the existing copyright section, preserves narrative and translated sentence structure, and records before/after evidence. It is not enabled by ordinary layout correction. Complete still requires successful candidate validation before installation.

## Translated images and tables

Preserve localized image assets, including cover lettering, while applying English display dimensions, aspect ratio, fit, alignment and decoration. Match unique shared image/figure identities, including the cover role; ambiguous images remain blocking findings. Check rendered image boxes in standalone and imported readers at every viewport, even when intrinsic asset ratios differ. Never replace localized artwork merely to inherit presentation. Table styling follows source cell borders, fills, column proportions, padding, typography and alignment; preserve translated cell text and allow row-height growth. Match unique structural identities or a unique same-grid table in the same structural role; missing or ambiguous translated tables remain blocking findings.
