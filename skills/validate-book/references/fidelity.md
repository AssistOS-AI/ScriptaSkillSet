# Structure and presentation fidelity

## PDF reference and responsive integrity

Book fidelity is measured once at the original PDF page width, using 96 CSS pixels per inch (1 PDF point = 96/72 CSS pixels). Select the viewport that naturally delivers that page width; do not override document styles or font sizes to force a match. A page that cannot reach its source width is an explicit reference geometry error. Typography, table and border presentation, display-page geometry and source insets are compared against this reference, for both standalone and supported imported readers.

The 1440, 1024 and 390 CSS-pixel views remain integrity checks: hidden or clipped text, overlaps, broken assets/fonts, omitted pages, overflow and reader import differences are still errors. Different word spacing and line wrapping at these widths are expected reflow and are not source fidelity errors. There is no universal 0.65 em acceptance threshold.

At the PDF reference width, compare measured word gaps only for unique source and HTML lines with the same word sequence, allowing the greater of 2 CSS pixels or 25% of the source gap for normal rendering and rounded font-metric differences. Visual fidelity is approximate, not pixel-identical. Differences beyond this tolerance are advisory when computed word-spacing and letter-spacing remain normal or zero; forced spacing beyond tolerance remains an error. Missing spacing-style evidence cannot certify natural spacing. Record matching-line coverage and gap measurements; differently wrapped or ambiguous lines are not certified by that spacing comparison. Full manuscript text, source typography and structural checks remain independent. Reports retain the reference dimensions separately from responsive layouts.


## Independent manuscript acceptance

This skill owns book acceptance; it never calls the converter’s technical checks or trusts its success as validation. Its own Poppler bounding-box evidence is compared with the complete HTML manuscript text, preserving NFC spelling, capitalization, punctuation, numbers and reading order. Presentation ligatures, soft hyphens and whitespace are normalized. A hard line-end join additionally needs compatible geometry, an unbroken source spelling and no conflicting compound spelling; otherwise it remains a difference. Printed folios may be excluded only at measured page edges; narrative numbers remain content. Missing evidence and every unresolved text mismatch are errors. Approximate text normalization used to match typography is not an acceptance rule. Existing graphics/font extraction commands supply raw measurements only; they make no book-validation decision.



## Table fidelity and blocking findings

Unmapped or ambiguous English paragraphs are errors regardless of token overlap. Nonvisual remote-script warnings may remain nonblocking; they do not certify typography. Completion stops successfully only after all structural/display errors are resolved.

The required pdf2html `decorations` response includes hash-bound tables from closed grids, complete fill partitions, or geometrically aligned borderless columns with a repeated-header continuation rule. It records source page width, spans, fills, individual edges, vertical alignment and uniform typography. Complete cell/text correspondence and rendered font identity are checked at the original PDF page width in both delivery paths. Unsupported tables remain errors.

For paginated content, expected type sizes, leading and gaps use clamp(1, rendered page width / physical source width, 1.2), capping upscaling at 1.2× so a wide screen cannot inflate type indefinitely. The page box is the container query for that inherited numeric scale. Small screens retain the physical font-size floor and reflow; large pages retain source proportions. The host outer geometry stays intact. The source-fidelity marker disables legacy iframe inflation, and reader parity normalizes by independently measured page widths. Managed CSS keeps the measured standalone size. Tests cover missing fills, false font fallback, consolidation and a second repair.

Native table repairs preserve prose and responsive flow, restore source fills/edges and proportional columns, and consolidate cell styles into managed CSS. Cell selector specificity survives subsequent consolidation and source stylesheet order. Translations require a unique structural table correspondence and matching spans; their text is never rewritten. Regression tests cover lost dark header fills, column proportions, ambiguous mappings, CSS consolidation and imported delivery.


English PDF is the source for English structure and presentation. Check every source page, and check HTML back against the source for omitted/added blocks and conversion damage. Local extraction retains source text, bounds, font and image inventories. Real Chromium measures document geometry and actual fonts without taking screenshots.

Correct paragraphs, heading hierarchy, table headers/cell associations, figures, contents/reference destinations, font loading and styles, text clipping and overflow. Propagate accepted English presentation to existing translations; preserve their text. Physical page breaks and target line wrapping can differ while preserving reading order and structure.

Text and geometry comparisons are evidence, not proof of every visual detail. Font names can differ between PDF subsets and browser registrations. PDF image masks/tiles do not correspond one-to-one to HTML images. Equal block counts do not prove that a translation contains every intended paragraph. Keep ambiguous mappings as findings and use narrowly scoped source/HTML analysis where needed. Never turn these uncertainties into a blanket pass or a full editorial review.

Safe local repairs preserve visible prose exactly. More complex English source restorations require exact source evidence and a deterministic native handler followed by fresh validation. Until that handler exists, the difference remains an error finding. Missing translated prose is reported, not generated. No humanisation, translation wording corrections, summaries, metadata authoring or font-size-control testing occurs.

Before any canonical replacement, verify the original hash and write a recoverable copy. Use atomic replacement and remeasure. Keep local CSS/import/font/image dependency hashes. Reports link to actual canonical files, record changes and identify unresolved checks. No duplicate public reader editions, PDF replacement, remote publication or screenshots.

## Default typography and reader delivery

An overflow-free page with loaded fonts is not sufficient acceptance. The executable audit extracts PDF font sizes using `pdftohtml -xml -zoom 1`, converts points to CSS pixels with 96/72, and measures baseline increments from precise word/line bounds independently of glyph-box height. Unique normalized HTML paragraph matches against the source text, including paragraphs that continue across PDF pages, support paragraph font-size, source-family and paragraph-gap comparisons; fontspec rounding has an explicit tolerance. Converted `pre` or monospace blocks are matched by the same source text and receive their actual PDF font family (serif or monospace), size and alignment, with whitespace normalized, so the same source text type is presented consistently regardless of the converter's element choice. Vertically distinct source lines that a converter merged into one ragged block are restored with `<br>` at the PDF line boundaries, preserving the exact text and a single element. A merged block whose source lines use different font roles is split into one element per role, so each keeps its own family and size. Those same `<br>` positions are stored as sentence indices and re-inserted after the matching sentence boundary in every translation. An unmapped or ambiguous English paragraph is a finding, not an uncertified pass. Rendered word ranges detect excessive justification gaps even when nothing overflows.

`prepare --auto-correct` calibrates the default type scale and source-supported paragraph leading/gaps without changing text. `--word-spacing natural` requests ordinary word spacing and left alignment consistently across existing languages; `source` is the default and only corrects measured excessive justification. It does not change or test font +/- controls. Do not create phrase-specific CSS or hand-code a rule for a quoted example.

For ScriptaHub standalone readers, the skill reads and hash-binds the shared reader's default settings contract. It measures the numeric settings delivered to the iframe, including any default multiplier. A recognized title-route multiplier is replaced atomically by the existing source-fidelity marker contract, with recovery and drift checks. Unsupported host contracts fail explicitly; they are not silently certified. The adapter never executes book/host JavaScript. It checks the frame and the supported imported article at default settings, not application controls or saved user preferences. Other hosts require an explicit supported adapter before claiming delivery fidelity.

## Shared CSS and reader import

Short dialogue receives the same source font-size and family checks as longer prose. Match unique HTML paragraphs against the source text, including paragraphs that continue across PDF pages; text length must not exempt a dialogue from validation. An unmapped English paragraph fails verification.

After presentation repairs, move inline declarations into a single local `validatebook-layout.css` per HTML directory. Deduplicate identical declaration groups, preserve emphasis and heading custom properties, remove inline style attributes, and compare computed property values before installing the CSS and HTML. Allow only sub-0.001px serialization rounding. Keep originals and hash-bound stylesheet evidence. Existing unrelated files must not be overwritten.

Verify both default delivery paths: the standalone/iframe document and the supported imported article. The host must preserve the managed root attribute, declaration-group attributes and same-directory stylesheet when replacing the source body with an article. Check all blocks at each default viewport for text/order, font-size, family and leading parity. A standalone pass cannot certify the imported article. Unsupported import contracts remain errors. No font-control tests or screenshots.

Measure the host root CSS-pixel size as well as the default rem preference. The managed article rule compensates their unit ratio through `--validatebook-font-size`, leaving the reader UI scale intact. Paragraph and root calibration share that variable.

Preserve the host-approved reading width and padding. Typography calibration must not impose a global fit-width policy or override book-specific page geometry. Font-control tests remain outside routine validation; perform them when explicitly requested for a reader change.

For imported HTML, the host reader owns the page width, maximum width, centering and outer padding. Source-fidelity CSS must not override those properties on `.reader-html-content`, including through a later stylesheet or a media query. Check the computed container geometry against the host rule, not just the text of reader.css. Preserve source typography inside that container.
