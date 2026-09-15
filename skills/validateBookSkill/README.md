# ValidateBook

Local verification and correction of book HTML layout, fonts and structural integrity. English PDF/HTML presentation is corrected first and propagated to existing languages. Every translation then receives local structure/display checks without rewriting its text.

No humanisation, translation proofreading, summaries, metadata, font +/− tests or screenshots. The final human-readable artifact is `report.txt`, supported by JSON evidence and correction logs.

The `complete` command delivers the final correction account as `RAPORT-CORECTII.txt` at the book root, beside `manifest.json`; a requested audit account goes there as `RAPORT-VERIFICARE.txt`. Final responses link these book-owned reports. After that delivery, `complete` deletes the private job directory, `.validatebook-layout` folders and leftover atomic temps. Native audit-only `prepare` still keeps its job for `report`/`status`.

See [instructions](SKILL.md), [contract and repair plans](references/contracts.md), [workflow](references/complete-scriptahub.md), [execution](references/execution.md), [design](DS.md), and [dependencies](dependencies.md).

## Run

Node.js 22+ and explicitly configured Chromium, pdftotext, pdffonts, pdfimages and pdftohtml are required for new audits. Reporting, planning and pure tests need only Node. No installation happens at startup.

```sh
scripts/validatebook doctor --chromium /path/chromium --pdftotext /path/pdftotext --pdffonts /path/pdffonts --pdfimages /path/pdfimages
scripts/validatebook complete /book --pdf2html /path/to/pdf2htmlSkill/scripts/pdf2html --job-dir /private/book-layout
scripts/validatebook report /private/book-layout
node --test tests/*.test.mjs
```

Tool configuration can use `VALIDATEBOOK_CHROMIUM`, `VALIDATEBOOK_PDFTOTEXT`, `VALIDATEBOOK_PDFFONTS`, `VALIDATEBOOK_PDFIMAGES`, `VALIDATEBOOK_PDFTOHTML`. `--patches` accepts a reviewed hash-bound layout plan. Without `--auto-correct`, canonical files remain unchanged. Corrections are written atomically with source-drift guards and private originals. Inspect `recovery.json` if a run is interrupted after a write.

Local checks inspect every PDF page and the whole HTML at 1440/1024/390 px. Text and geometry JSON replace screenshots. Actual rendered font names/glyph counts are obtained through CDP. Safe repairs cover language attributes, responsive constraints and source-mapped presentation. Ambiguous missing paragraphs, table spans, complex source layouts and font mappings remain explicit findings until a source-supported repair is established.

`complete-plan`/`complete-status` track only this layout workflow. They do not run editorial skills or certify translations semantically.

## Native integration tests

Set `VALIDATEBOOK_INTEGRATION=1` and the configured tool variables, then run the tests. Browser tests create only temporary synthetic books and JSON/text evidence, never mutate real books or request screenshots. Native browser execution may require an existing platform grant; a blocked test is not a pass.

Default typography calibration and reader-frame delivery checks are built into prepare. Use `--word-spacing natural` with `--auto-correct` when ordinary spacing is requested. `pdftohtml` defaults to the same configured Poppler executable directory as pdftotext; override it explicitly with `--pdftohtml`. See SKILL.md for acceptance limits.

## Shared CSS and reader import

Short dialogue receives the same source font-size and family checks as longer prose. Match unique HTML paragraphs against the source text, including paragraphs that continue across PDF pages; text length must not exempt a dialogue from validation. An unmapped English paragraph fails verification.

After presentation repairs, move inline declarations into a single local `validatebook-layout.css` per HTML directory. Deduplicate identical declaration groups, preserve emphasis and heading custom properties, remove inline style attributes, and compare computed property values before installing the CSS and HTML. Allow only sub-0.001px serialization rounding. For newly inlined display-page nodes, add higher-specificity ID, tag and page-child selectors so later source `#id` and `nth-of-type` rules cannot change captured typography. Leave ordinary managed groups below source-font rules. Display-page families keep a source-derived generic fallback: sans-serif for Inter-like faces, otherwise Georgia, serif. Keep originals and hash-bound stylesheet evidence. Existing unrelated files must not be overwritten.

Verify both default delivery paths: the standalone/iframe document and the supported imported article. The host must preserve the managed root attribute, declaration-group attributes and same-directory stylesheet when replacing the source body with an article. Check all blocks at each default viewport for text/order, font-size, family and leading parity. A standalone pass cannot certify the imported article. Unsupported import contracts remain errors. No font-control tests or screenshots.

Measure the host root CSS-pixel size as well as the default rem preference. The managed article rule compensates their unit ratio through `--validatebook-font-size`, leaving the reader UI scale intact. Paragraph and root calibration share that variable.

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

Use `scripts/validatebook complete BOOK_ROOT` for an authorized verify-and-correct request. The command applies English corrections, checks installed files, propagates accepted presentation, checks existing translations and writes `RAPORT-CORECTII.txt` at the book root. After the report is written, it deletes the private job directory and leftover helper temps. `prepare` remains the single-pass audit/repair primitive and keeps its job. No model API is called. PDF extraction is delegated to the explicitly configured pdf2html skill. A failed correction handler must be fixed; do not relabel its unresolved findings as passed. The coordinator detects repeated installed file states, rather than stopping after a fixed number of passes or comparing error counts.

Sparse centered or left-aligned display pages are checked independently from prose and reader parity. Source XML groups establish separate title, subtitle, italic description and year blocks, their font sizes, explicit line groups and vertical gaps. Repair requires complete normalized text agreement and a verified embedded source family. Rebuild the groups before the single CSS consolidation step; retain page anchors and responsive wrapping. Check grouping, alignment, emphasis, sizes, leading and margins at each viewport in both reader paths. A repeated running title must not exempt the title-page heading from these checks.

Body-leading samples must match PDF XML lines at the dominant body font size before their precise bounding-box increments are accepted. Table and caption lines cannot calibrate prose. The ScriptaHub import adapter also supports the generic local-books stylesheet contract, preserving declared CSS order without a title allowlist.

Display-page correction is generic: detect centered or left-aligned sparse layouts, including a centered title whose lines share a midline even if one glyph box is slightly off axis; flush-left rows are not treated as centered. Retain each group's verified source family, color, emphasis, first-line inset, line breaks and vertical gaps, and scale down to the available column on narrow screens. Reader iframe/article parity does not rewrite measured display-page groups. Isolated horizontal rules are consumed from the source-hash-bound pdf2html evidence, excluding table intersections; their width, color and placement are never inferred from the book title. Missing font mappings or ambiguous content stop correction before mutation. Check both standalone and imported delivery after CSS consolidation and rerunning the repair.
