# Compatibility

## Required Scripta structure

The HTML must contain `main[data-reader-content]`. Page containers such as `section.source-page` are accepted but treated as flow containers. The converter recognizes `table.toc-table`, `nav.contents-list`, plain source pages headed “Contents” or “Table of Contents”, `.source-page-full-image`, local figures, and source IDs.

## Semantic HTML

Supported content includes headings, paragraphs, common inline emphasis, line breaks, block quotations, preformatted text, nested ordered and unordered lists, definition lists, figures, captions, local raster images, tables including `rowspan` and `colspan`, external links, internal anchors, and explicit EPUB-ARIA footnotes/endnotes.

Scripts, styles, hidden content, interactive controls, audio, video, canvas, SVG markup, remote assets, and generated browser pseudo-content are not transferred.

## CSS subset

The converter uses local linked stylesheets, embedded styles, inline declarations, selector specificity, inheritance, Scripta custom properties, and simple `calc()` multiplication. It maps font family/size/weight/style, color, alignment, line height, margins, indents, page breaks, table fills, image widths, and page dimensions. Browser-only layout such as grid, flexbox, shadows, animations, and absolute positioning has no Word equivalent and is ignored.

Local raster fonts referenced by `@font-face` are not embedded. Word uses the named installed font or its own substitution.
