# Word fixture

book.docx contains front matter, two chapters, nested lists, emphasis, links,
a raster figure, a table, a footnote and an endnote. Integration tests export it
through each compression profile, compare all rendered pages, validate a fresh
export, detect removed pages, check output ownership and exercise fidelity
fallback. The DOC test first exports the same content to binary Word format.
