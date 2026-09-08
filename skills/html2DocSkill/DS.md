# HTML to DOCX Design Summary

## Purpose

`html2DocSkill` converts the semantic, self-contained HTML emitted and preserved by Scripta into a native, editable Word document. It deliberately favors editorial reflow, Word styles, and robust document mechanisms over browser-page geometry.

## Input and styling boundary

The required input boundary is `main[data-reader-content]`. The converter reads local linked and embedded CSS, applies a deterministic cascade for the supported Scripta subset, resolves common custom-property and length forms, and maps useful presentation to Word. Unsupported presentation never changes text and is reported when it affects the contract. Scripts and reader integration are excluded.

## Book model

Source page wrappers before and including the contents page retain their page boundaries, so cover, copyright, title, note, and contents material do not collapse together. Body source wrappers remain reflowable. A sparse first page or full-page image becomes the cover. A structured contents block or a plain source page headed “Contents” is replaced by a static clickable contents list whose label and bold/regular emphasis come from the semantic source rather than technical PDF labels; otherwise one is inserted before the detected body. Each body chapter starts a new Word page inside the same body section, preventing page-number resets. No Word headers are generated. Every section contains only a centered native page-number field in its footer. Front matter uses lower-Roman numbering and the single body section restarts Arabic numbering once.

Headings, paragraphs, inline emphasis, nested lists, figures, captions, tables, bookmarks, and links become native Word structures. Explicit semantic notes are installed through a narrowly scoped OOXML package extension because python-docx does not expose note creation.

Heading line spacing follows the source up to a compact 1.15-line ceiling so long chapter titles remain visually cohesive when Word wraps them.

## Safety and validation

The converter writes a sibling candidate, validates its ZIP and OOXML, reopens it with python-docx, and publishes atomically only after all error gates pass. Validation measures semantic text coverage and order and checks native fields, styles, relationships, images, tables, bookmarks, hyperlinks, notes, and ownership. Existing unrelated DOCX files are never overwritten.

No visual renderer is used. Structural validation can establish document integrity and content fidelity, but cannot prove identical pagination or appearance across Microsoft Word, LibreOffice, and other editors.
