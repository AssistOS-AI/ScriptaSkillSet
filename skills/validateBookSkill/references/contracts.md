# Layout contract

## Inputs and outputs

Existing English PDF and HTML are required. Discover existing full readers from manifest paths or language folders; never infer full editions from localized landing pages. A declared but missing reader is an error. `--languages` narrows the requested inventory; by default all existing supported editions are included.

Jobs use the single unversioned `scope: layout_and_structure` contract. Outputs are `job.json`, `source-evidence.json`, one language-layout JSON per edition, `report.txt`, `report.json`, `repair-tasks.json`, and recovery files when corrections occur. No PNGs, screenshots, PDF page rasters or HTML image reports.

`job.json` binds final canonical inputs, local CSS/import/font/image dependencies and evidence hashes. Status verifies them before returning stored results. Changed input/evidence requires a fresh job. The original hashes and recovery paths remain in `recovery.json`. Status rejects records without the layout scope and required input/evidence fields.

## Local checks

Poppler supplies all PDF pages, text bounds, font and image inventories. Chromium supplies block/anchor/table structure, image loading, computed styles, actual platform fonts and layout at 1440, 1024 and 390 px. Scripts/network are disabled; default text size only.

English source matching normalizes whitespace, Unicode compatibility forms, punctuation and line-end hyphenation. Unmatched lines/passages are candidates, not automatic proof of omission. Unique HTML paragraph matches against the source text, including paragraphs that continue across PDF pages, compare font size and source family. Unmapped or ambiguous English paragraphs are findings, not certified. Unmapped geometry remains explicitly uncertified. Font inventories remain a document-level check and do not certify per-paragraph faces. Image inventories reveal missing/different quantities but cannot identify arbitrary PDF composites by count.

Translations are compared structurally: stable IDs/source IDs, paragraph/block sequence, table shapes and image counts. Hidden/clipped text, missing resources, corruption candidates, failed fonts and broken anchors are checked independently. Matching block counts do not prove equivalent text. No semantic translation corrections are performed.

## Repairs

`--auto-correct` enables text-preserving safe local actions and installation. Recheck each changed document before proceeding. English errors block automatic cross-language propagation. Safe source-mapped actions require unique structural correspondence; no target paragraph is invented. CSS URLs are rebased relative to each target; dependencies remain local.

Optional reviewed plans contain:

```json
{
  "repairs": [{
    "language": "en",
    "sha256": "SHA256_OF_CURRENT_HTML",
    "reason": "PDF heading hierarchy and extracted bounds establish this title",
    "actions": [{"kind":"tag","selector":"#chapter-1","expectedTag":"h2","tag":"h1"}]
  }]
}
```

Plan kinds: `tag` for p/h1–h6/th/td/figcaption; `presentation` with a selector and an allowlisted CSS `properties` object; `table_headers` with source-established row/cell span descriptors. Table row/column counts and spans must already match for header repair. Selectors must match exactly once. Scripts, arbitrary evaluation and text replacement are rejected. DOM text before/after must remain identical.

Native actions additionally repair the language tag, apply responsive constraints, inherit source styles/body presentation attributes, copy uniquely mapped presentation classes and rebase mapped image sources. These are generated locally, not arbitrary plan code.

For source omissions or complex structures unsupported by these actions, the host may perform a targeted authorized repair after locating exact English source evidence. Preserve before/after excerpts and re-run local validation. Never generate missing translated prose or reinterpret language meaning under this skill.

## Findings and status

Each finding includes a stable ID, language, category, location, detail, severity and provenance. `needsJudgment` identifies a localized ambiguity, not a mandate to reread the book. Reports retain initial findings, applied corrections and final unresolved findings separately.

`passed` means implemented local checks found no issues. `passed_with_warnings` retains nonblocking limitations/findings. `needs_attention` means unresolved structural/display errors; `incomplete` is used for an unexecuted coordinator. CLI exits 3 for unresolved work and 2 for usage/runtime failures. Never call an unavailable native check passed.

A final report lists exact affected files, problems, before/after changes, local checks, unresolved cases and recoverable originals. It does not certify semantic translation, humanisation, factual accuracy or interactive host application controls.

Host delivery places the final user-facing text at the book root as `RAPORT-CORECTII.txt` or `RAPORT-VERIFICARE.txt`, beside `manifest.json`. After `complete` installs that report, it deletes the private job directory, `.validatebook-layout` folders and leftover atomic temps. Native audit-only execution still writes only inside its job and does not delete it.

Default typography findings include absolute_font_size_difference, line_leading_difference, paragraph_gap_difference, excessive_word_spacing, source_typography_unmapped, source_typography_ambiguous and source_font_family_difference. Native evidence records PDF pt/CSS px, measured gaps and the delivered default reader settings. Presentation repairs additionally allow word-spacing and letter-spacing. The recognized ScriptaHub default-scaling adapter is a bounded host integration repair with its own hash-checked recovery copy; arbitrary host-code patch plans are not accepted. Calibration uses explicit default settings rather than assuming the nominal CSS body size survives the reader.

Managed presentation uses `data-validatebook-root` on the reading root, `data-vb-style` declaration-group identifiers, and `link[data-validatebook-presentation]` pointing to the same-directory `validatebook-layout.css`. Managed selectors keep ordinary groups below source-font rules. Newly inlined display-page nodes get extra ID, tag and source-page child selectors so later source ID or nth-of-type rules cannot change captured computed values. Inline style attributes are removed only after a computed-style preservation check. CSS is included in input hashes and existing CSS is backed up before replacement. Imported-reader measurements are stored as `<language>-article-layout.json` and bound as job artifacts. Display-page font stacks use a source-derived generic fallback.

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

Detect false headings inside paragraphs from source continuity on both sides. Merge a heading with its adjacent paragraphs only when the source line is not bold, sizes and baseline spacing match ordinary continuous text, and the entire combined text occurs on the same source page. Preserve anchors and exact text; verify the merged result and keep source evidence in the correction log. The same detector can run without mutation during audit.

Body-leading samples must match PDF XML lines at the dominant body font size before their precise bounding-box increments are accepted. Table and caption lines cannot calibrate prose. The ScriptaHub import adapter also supports the generic local-books stylesheet contract, preserving declared CSS order without a title allowlist.

Display-page correction is generic: detect centered or left-aligned sparse layouts, including a centered title whose lines share a midline even if one glyph box is slightly off axis; flush-left rows are not treated as centered. Retain each group's verified source family, color, emphasis, first-line inset, line breaks and vertical gaps, and scale down to the available column on narrow screens. Reader iframe/article parity does not rewrite measured display-page groups. Isolated horizontal rules are consumed from the source-hash-bound pdf2html evidence, excluding table intersections; their width, color and placement are never inferred from the book title. Missing font mappings or ambiguous content stop correction before mutation. Check both standalone and imported delivery after CSS consolidation and rerunning the repair.
