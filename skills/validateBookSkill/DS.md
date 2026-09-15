# Design: local layout and structural correction

## Independent candidate acceptance

`tryCorrectionBatches` retries a rejected combined candidate from canonical bytes with independent repair groups. Only rendering/consolidation rejection is recoverable; tool and concurrent-edit errors propagate. One accepted batch ends a pass so later selectors derive from fresh measurements. Unchanged candidates permit the next group. The existing installation guard remains authoritative. Root/page CSS is active before consolidation. Imported geometry copies authored host box declarations and conditional rules into root-only managed selectors; no sampled widths or descendant typography are copied. Tests cover responsive images/text, host mobile padding, page scaling, candidate rejection and runtime failure propagation.


## Table fidelity and blocking findings

Unmapped or ambiguous English paragraphs are errors regardless of token overlap. Nonvisual remote-script warnings may remain nonblocking; they do not certify typography. Completion applies verified corrections and reports unresolved errors as completed_with_errors; unresolved findings do not reject the entire book.

The required pdf2html `decorations` response includes hash-bound `tables`: closed grids or complete columns established by adjacent cell fills and horizontal row rules, source page width, cell text and spans, widths, fills, individual border edges, vertical alignment and uniform typography. Old providers without table evidence fail explicitly. Chromium compares every cell at 1440, 1024 and 390 px in standalone and imported readers, including actual rendered font identity when platform evidence is available. Complete text/span correspondence is required; partial, duplicate, mixed-font or unsupported tables remain errors. Source font lookup retains full face names, including bold MT variants.

Paginated readers scale text, leading and paragraph gaps by max(1, rendered page width / source CSS-pixel page width). The page box is the container query for --validatebook-page-scale, so a wider host cannot inflate type; nested containers inherit that number. Narrow screens retain physical source font sizes and allow page growth; larger pages preserve text-to-page proportions. The host keeps its outer width and padding. A source-fidelity marker neutralizes legacy iframe inflation, and imported parity compares sizes normalized by the independently measured page widths. Managed CSS keeps the measured standalone size. Repairs remain stable across CSS consolidation and reruns.

Native table repairs preserve prose and responsive flow, restore source fills/edges and proportional columns, and consolidate cell styles into managed CSS. Cell selector specificity survives subsequent consolidation and source stylesheet order. Translations require a unique structural table correspondence and matching spans; their text is never rewritten. Regression tests cover lost dark header fills, column proportions, ambiguous mappings, CSS consolidation and imported delivery.


## Problem and resulting behavior

The skill checks HTML/PDF structural integrity, typography and rendering with local computation first and text-only reporting.

## Architecture

- audit.mjs: discovery, native-tool preflight, source extraction, English-first execution, source-mapped propagation, backups, atomic writes and immutable audit records.
- browser.mjs: isolated native CDP session with page scripts and network disabled.
- layout-browser.mjs: complete DOM/geometry/platform-font measurement at three widths and allowlisted text-preserving DOM repair operations. No screenshot call.
- layout-checks.mjs: pure source-text, font, structure and display rules; deterministic findings for uncertainty.
- layout-report.mjs: text and JSON reports, dependency hash verification.
- complete.mjs: layout-only resume and deterministic correction routing. No editorial or model dependencies.

## Acceptance matrix

| Concern | Local evidence | Repair/limit |
| --- | --- | --- |
| Every PDF page | Text and word/line bounds, image/font inventories; unique-text block geometry and relative type scale | Unmatched source regions remain localized findings |
| English omissions/corruption | Bidirectional normalized text comparison, replacement/private-use characters | Exact source-supported restoration only; no speculative rewrite |
| Paragraph/heading integrity | Full block sequence, stable IDs, heading tags | Text-preserving mapped tag repair; ambiguous missing translated prose is reported |
| Tables | Rows, cells, spans, header roles | Automatic header-role propagation only when row/cell/span shape matches |
| Images | Local loading, dimensions, inventory and mapped source path | Rebase uniquely mapped source images; composites require targeted evidence |
| Contents/references | IDs, duplicate IDs, fragment destinations, block sequence | Preserve links and require unique destinations |
| Font display | Computed styles, FontFace load status, actual CDP font/glyph inventory, PDF families | Failed/unmatched fonts are findings; subset naming/fallback ambiguity remains explicit |
| Layout | Full block geometry at 1440/1024/390 px, hidden/clipped/overflowing content | Deterministic responsive and presentation repairs, then remeasure |
| Translation completeness | Stable mappings and structural sequence | Equal counts are not semantic proof; no translation rewriting |
| Installation | Original hash, recovery copy, atomic replacement, final resource closure | Concurrent changes fail rather than overwrite |
| Reporting | Initial findings, corrections, remaining findings and recovery | complete delivers RAPORT-CORECTII.txt at the book root, then deletes the private job directory and leftover helper temps; no screenshots |

## Exclusions

No humanisation, semantic translation proofreading/correction, summaries, short-reader work, metadata/keywords, font +/− or enlarged-text tests, screenshots, audio, missing-language creation, remote publishing, LLM/model use, Python execution, external repair plans or reviewed-difference inputs. Interactive application controls are outside the standalone document layout contract.

## Validation

Run pure tests with Node's test runner. Synthetic native tests exercise real geometry, font inventory, blocked scripts and text-preserving repairs. Check CLI scope, missing prerequisites before side effects, stale evidence, corrupt characters, omissions, table spans, CSS/font dependencies and absence of image reports. Never count skipped native tests as passed.

## Default typography and reader delivery

An overflow-free page with loaded fonts is not sufficient acceptance. The executable audit extracts PDF font sizes using `pdftohtml -xml -zoom 1`, converts points to CSS pixels with 96/72, and measures baseline increments from precise word/line bounds independently of glyph-box height. Unique normalized HTML paragraph matches against the source text, including paragraphs that continue across PDF pages after repeated running headers and printed folios are excluded, support paragraph font-size, source-family and paragraph-gap comparisons; fontspec rounding has an explicit tolerance. A heading repeated in the contents list is matched on its source page first. Generated figure captions are not treated as source prose. An unmapped or ambiguous English paragraph is a finding, not an uncertified pass. Rendered word ranges detect excessive justification gaps even when nothing overflows.

`prepare --auto-correct` calibrates the default type scale and source-supported paragraph leading/gaps without changing text. `--word-spacing natural` requests ordinary word spacing and left alignment consistently across existing languages; `source` is the default and only corrects measured excessive justification. It does not change or test font +/- controls. Do not create phrase-specific CSS or hand-code a rule for a quoted example.

For ScriptaHub standalone readers, the skill reads and hash-binds the shared reader's default settings contract. It measures the numeric settings delivered to the iframe, including any default multiplier. A recognized title-route multiplier is replaced atomically by the existing source-fidelity marker contract, with recovery and drift checks. Unsupported host contracts fail explicitly; they are not silently certified. The adapter never executes book/host JavaScript. It checks the frame and the supported imported article at default settings, not application controls or saved user preferences. Other hosts require an explicit supported adapter before claiming delivery fidelity.

## Shared CSS and reader import

Short dialogue receives the same source font-size and family checks as longer prose. Match unique HTML paragraphs against the source text, including paragraphs that continue across PDF pages after repeated running headers and printed folios are excluded; text length must not exempt a dialogue from validation. An unmapped English paragraph fails verification.

After presentation repairs, move inline declarations into a single local `validatebook-layout.css` per HTML directory. Deduplicate identical declaration groups, preserve emphasis and heading custom properties, remove inline style attributes, and compare computed property values before installing the CSS and HTML. Allow only sub-0.001px serialization rounding. For newly inlined display-page nodes, add higher-specificity ID, tag and page-child selectors so later source `#id` and `nth-of-type` rules cannot change captured typography. Leave ordinary managed groups below source-font rules. Display-page families keep a source-derived generic fallback: sans-serif for Inter-like faces, otherwise Georgia, serif. Keep originals and hash-bound stylesheet evidence. Existing unrelated files must not be overwritten.

Verify both default delivery paths: the standalone/iframe document and the supported imported article. The host must preserve the managed root attribute, declaration-group attributes and same-directory stylesheet when replacing the source body with an article. Check all blocks at each default viewport for text/order, font-size, family and leading parity. A standalone pass cannot certify the imported article. Unsupported import contracts remain errors. No font-control tests or screenshots.

Measure the host root CSS-pixel size as well as the default rem preference. The managed article rule compensates their unit ratio through `--validatebook-font-size`, leaving the reader UI scale intact. Paragraph and root calibration share that variable.

Preserve the host-approved reading width and padding. Typography calibration must not impose a global fit-width policy or override book-specific page geometry. Font-control tests remain outside routine validation; perform them when explicitly requested for a reader change.

For imported HTML, the host reader owns the page width, maximum width, centering and outer padding. Source-fidelity CSS must not override those properties on `.reader-html-content`, including through a later stylesheet or a media query. Check the computed container geometry against the host rule, not just the text of reader.css. Preserve source typography inside that container.

Both `data-pdf-fidelity` and `data-validatebook-root` identify book-owned presentation. Shared reader CSS supplies control variables and outer-surface geometry only for these documents. Descendant typography, colours, tables, images and internal page spacing are governed by edition CSS; generic defaults must explicitly exclude both markers, and the validator rejects book-specific shared-reader exceptions. The reader may own gaps between page sheets. The edition owns all spacing inside a sheet.

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

Use `scripts/validatebook complete BOOK_ROOT` for an authorized verify-and-correct request. The command applies English corrections, checks installed files, propagates accepted presentation, checks existing translations and writes `RAPORT-CORECTII.txt` at the book root. Private jobs, recovery copies and temporary evidence are retained during execution and on failure; successful completion cleans them after saving the final report. `prepare` remains the single-pass audit/repair primitive and keeps its job. No LLM, model API, Python runtime or external review plan is used. PDF extraction is delegated to the explicitly configured pdf2html skill. A failed correction handler must be fixed; do not relabel its unresolved findings as passed. The coordinator detects repeated installed file states, rather than stopping after a fixed number of passes or comparing error counts.

Sparse centered or left-aligned display pages are checked independently from prose and reader parity. Source XML groups establish separate title, subtitle, italic description and year blocks, their font sizes, explicit line groups and vertical gaps. Repair requires complete normalized text agreement and a verified embedded source family. Rebuild the groups before the single CSS consolidation step; retain page anchors and responsive wrapping. Check grouping, alignment, emphasis, sizes, leading and margins at each viewport in both reader paths. A repeated running title must not exempt the title-page heading from these checks.

Detect false headings inside paragraphs from source continuity on both sides. Merge a heading with its adjacent paragraphs only when the source line is not bold, sizes and baseline spacing match ordinary continuous text, and the entire combined text occurs on the same source page. Preserve anchors and exact text; verify the merged result and keep source evidence in the correction log. The same detector can run without mutation during audit.

Body-leading samples must match PDF XML lines at the dominant body font size before their precise bounding-box increments are accepted. Table and caption lines cannot calibrate prose. The ScriptaHub import adapter also supports the generic local-books stylesheet contract, preserving declared CSS order without a title allowlist.

Display-page correction is generic: detect centered or left-aligned sparse layouts, including a centered title whose lines share a midline even if one glyph box is slightly off axis; flush-left rows are not treated as centered. Retain each group's verified source family, color, emphasis, first-line inset, line breaks and vertical gaps, and scale down to the available column on narrow screens. Reader iframe/article parity does not rewrite measured display-page groups. Isolated horizontal rules are consumed from the source-hash-bound pdf2html evidence, excluding table intersections; their width, color and placement are never inferred from the book title. Missing font mappings or ambiguous content leave the affected repair unapplied and reported. Check both standalone and imported delivery after CSS consolidation and rerunning the repair.


## Installation safety and page spacing

Generated page boxes own PDF-derived outer insets. Undecorated normal-flow main/article/section/div page shells have their duplicate box spacing and minimum height neutralized; paragraph, list and table spacing is preserved. Positioned or decorated layouts with ambiguous spacing remain reported errors. Covers are detected at any nesting depth. One reading root must contain every page. Before replacing canonical HTML/CSS, same-directory candidates are measured at 1440, 1024 and 390 px in standalone and supported imported delivery. Missing reader pages, cumulative shell spacing and unsafe display regressions reject the affected correction batch, without aborting other documents. Recovery copies and native job evidence are retained on failure and removed after verified successful completion and final-report delivery.

## Independent translation pagination

English page-boundary and PDF-margin checks apply only to English. Existing translations keep their page counts, break positions, chapter placement and local page geometry, including continuous flow and multiple chapters on one page. The --paginate correction option paginates English only. English page anchor numbers do not constrain translated reader pages. Missing reader content, broken anchors, hidden or clipped content, overlapping boxes and cumulative container spacing remain errors in every language. Translation page geometry is not replaced with the English profile during CSS regeneration.

## Autonomous transactional completion

Complete owns the whole correction cycle in an isolated working copy, including source-anchor pagination when present, CSS consolidation, source typography checks at all three widths, translated role-based typography and both delivery paths. Translations are never matched lexically to English paragraphs; ambiguous roles remain explicit errors. Every language retains full page minimum dimensions, checked in both delivery paths at every viewport; translated content may extend pages without changing its text or imposing English breaks. Explicit paragraph sizes include the page scale exactly once, and managed selector priority survives reruns. Both complete and CLI prepare --auto-correct use this transaction. Install verified correction batches after original input hashes are rechecked. Reject unsafe rendering batches, report their errors and continue other documents. Remaining validation errors do not reject accepted corrections. External PDF/HTML overrides are audit-only. A candidate that changes the host reader cannot be installed as a book-only change. No external agent scripts, repair plans or manual sequence of helper scripts is part of normal execution.

## Authorized publisher restoration

The --restore-source-publisher option requires explicit user authorization. Native code extracts a unique copyright identity and website from the PDF, restores those entities only inside the existing copyright section, preserves narrative and translated sentence structure, and records before/after evidence. It is not enabled by ordinary layout correction. Complete still requires successful candidate validation before installation.

## Translated images and tables

Preserve localized image assets, including cover lettering, while applying English display dimensions, aspect ratio, fit, alignment and decoration. Match unique shared image/figure identities, including the cover role; ambiguous images remain reported errors. Check rendered image boxes in standalone and imported readers at every viewport, even when intrinsic asset ratios differ. Never replace localized artwork merely to inherit presentation. Table styling follows source cell borders, fills, column proportions, padding, typography and alignment; preserve translated cell text and allow row-height growth. Match unique structural identities or a unique same-grid table in the same structural role; missing or ambiguous translated tables remain reported errors.

## Cleanup after successful completion

After successful correction, verify the installed canonical files and durably save RAPORT-CORECTII.txt at the book root. Then the native complete command must automatically remove book-owned .validatebook-jobs, .validatebook-layout and .validatebook-layout-jobs, including obsolete jobs, staged copies, recovery copies and temporary evidence. Preserve the PDF, canonical HTML/CSS/assets, manifest and final reports. Runtime failures retain diagnostics until the next fresh invocation; unresolved validation errors permit verified installation and cleanup. Never remove another running job: unresolved lock files defer cleanup and must be reported explicitly. Audit-only prepare retains its report/status job. No agent-authored cleanup script or intermediate user confirmation is required. The final report records cleanup completion or failure; deleted job paths are historical, not available evidence.

## Fresh execution and partial completion

Every complete invocation (including prepare --auto-correct) deletes previous book-owned .validatebook-jobs, .validatebook-layout and .validatebook-layout-jobs results and final reports before creating a fresh transaction. Preserve canonical PDF/HTML/CSS/assets: starting from zero means fresh evidence, not undoing installed corrections. Never delete another job with an unresolved lock. Custom job directories receive a new transaction; unrelated files are preserved. Audit-only prepare retains its read-only report/status job.

Apply source-supported repairs until no further file changes occur. Unresolved validation findings remain errors in RAPORT-CORECTII.txt; completed_with_errors means verified corrections were installed, not that the book passed all checks. Exit code 3 signals remaining errors without disabling HTML or reader access. Unsafe candidate batches are rejected and recorded while other documents continue. Runtime/tool failures and concurrent edits preserve originals. After verified installation and durable reporting, remove temporary results even for completed_with_errors.
