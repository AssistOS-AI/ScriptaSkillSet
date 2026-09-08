# Validation contract

Validation compares the final PDF with a fresh raw LibreOffice export from the same source.

Errors gate publication: invalid/encrypted PDF, page-count or page-size change, text coverage below 99.9%, adjacent-token order below 99.5%, removed links/outlines, changed blank-page pattern, out-of-page text, non-embedded fonts, or rendered-page difference above the selected profile limit.

Normalized mean pixel-difference limits at 96 DPI are `0.002` for `fidelity`, `0.035` for `balanced`, and `0.075` for `compact`. A smaller score is better. Lossy profile failure triggers a validated `fidelity` fallback; fidelity failure aborts publication.

Requested DOCX font names that cannot be matched to rendered PDF font names are warnings because theme fonts and renderer aliases can prevent exact name matching. QA reports both sets for review.

For DOCX inputs, native Word hyperlink elements are counted. LibreOffice exporting fewer PDF links is reported as a warning, while any further loss introduced by optimization is an error. Legacy DOC does not expose a deterministic pre-render hyperlink inventory.
