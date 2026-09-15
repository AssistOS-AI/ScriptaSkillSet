# Structure and presentation fidelity

English PDF is the source for English structure and presentation. Check every source page, and check HTML back against the source for omitted/added blocks and conversion damage. Local extraction retains source text, bounds, font and image inventories. Real Chromium measures document geometry and actual fonts without taking screenshots.

Correct paragraphs, heading hierarchy, table headers/cell associations, figures, contents/reference destinations, font loading and styles, text clipping and overflow. Propagate accepted English presentation to existing translations; preserve their text. Physical page breaks and target line wrapping can differ while preserving reading order and structure.

Text and geometry comparisons are evidence, not proof of every visual detail. Font names can differ between PDF subsets and browser registrations. PDF image masks/tiles do not correspond one-to-one to HTML images. Equal block counts do not prove that a translation contains every intended paragraph. Keep ambiguous mappings as findings and use narrowly scoped source/HTML analysis where needed. Never turn these uncertainties into a blanket pass or a full editorial review.

Safe local repairs preserve visible prose exactly. More complex English source restorations require exact source evidence and a targeted authorized host repair followed by fresh validation. Missing translated prose is reported, not generated. No humanisation, translation wording corrections, summaries, metadata authoring or font-size-control testing occurs.

Before any canonical replacement, verify the original hash and write a recoverable copy. Use atomic replacement and remeasure. Keep local CSS/import/font/image dependency hashes. Reports link to actual canonical files, record changes and identify unresolved checks. No duplicate public reader editions, PDF replacement, remote publication or screenshots.

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
