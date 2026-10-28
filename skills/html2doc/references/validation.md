# Validation

Successful conversion requires a valid DOCX ZIP package, parseable core OOXML parts, at least 99.5% normalized semantic token coverage, at least 98% adjacent-token order, a complete static clickable contents list, no visible TOC or chapter-header placeholders, one body numbering restart and native footer page fields, field-refresh settings for page numbers, Word heading styles, matching image and content-table counts, valid note relationships, and the ownership marker.

The source comparison excludes Scripta's contents block because it is rebuilt from the document heading hierarchy, presentation-only TOC page numbers and leaders, and note-reference labels because Word generates their display values. Explicit note bodies remain part of the comparison.

Missing body headings are a warning when chapter boundaries cannot be identified. The report records `visualValidation: false`: the skill does not render or compare pages, and consumers must not interpret structural success as cross-editor pixel identity.
