---
name: html2Doc
description: Convert a Scripta semantic HTML book or document into an editable, professionally styled DOCX while preserving text, headings, lists, tables, images, captions, links, explicit notes, language, and supported CSS. Produce native Word styles, a static clickable contents list, book sections, and footer page numbers without headers; validate deterministically without visual rendering.
---

# Scripta HTML to DOCX

Use this skill when the user wants a Word document made from a semantic HTML book produced by the Scripta skill set. The result is a reflowable editorial document, not a fixed-layout copy of the HTML or its original PDF pages.

## Required boundary

- Treat the input HTML and local assets as immutable.
- Accept Scripta documents containing `main[data-reader-content]`; do not claim support for arbitrary web pages.
- Preserve semantic visible text verbatim. Do not summarize, translate, rewrite, or invent metadata.
- Resolve only local stylesheets and images contained by the book directory. Reject remote, missing, invalid, or escaping resources.
- Map supported CSS to native Word formatting and use restrained book defaults when Scripta provides no applicable style.
- Preserve `.source-page` boundaries for front matter through the contents page. Reflow body source pages, while beginning body chapters and explicit HTML page breaks on new Word pages.
- Replace a structured or plain Scripta contents page with a static clickable Word contents list. Use the semantic “Contents” heading rather than technical page labels, and preserve bold versus regular source-entry emphasis when entries can be matched. Never leave field-update placeholder text in the document.
- Do not generate Word headers. Put only a centered native page-number field in each section footer.
- Convert only explicit `doc-noteref`/`doc-footnote` and `doc-endnote` semantics into native notes. Never infer notes from numeric superscripts.
- Do not execute scripts, call an LLM, upload content, invoke office software, or claim visual verification.

## Portable launcher

Resolve this skill directory from `SKILL.md` and invoke the launcher from the book directory:

```bash
<skill-directory>/scripts/html2doc convert index.html
```

The launcher requires Node.js >=22. Its document, HTML, CSS, XML, ZIP and image helpers are bundled inside external/runtime. Copy the complete skill directory.

## Workflow

1. Resolve exactly one source HTML file and confirm that it has the Scripta content root.
2. Run conversion through the portable launcher. By default `index.html` becomes `<folder-name>.docx`; another filename retains its stem.
3. Supply `--title`, `--author`, or `--lang` only to override missing or incorrect HTML metadata.
4. Use `--output` for a different `.docx` path. Use `--overwrite` only for an existing file owned by this skill.
5. Inspect the returned validation status and findings. Do not deliver an output whose status is `failed`.

```bash
<skill-directory>/scripts/html2doc convert index.html \
  --title "Book title" --author "Author"
```

Validate an existing artifact independently:

```bash
<skill-directory>/scripts/html2doc validate index.html --docx book.docx
```

## Output contract

The only persistent artifact is the requested `.docx`. The command returns JSON containing `status`, `artifact`, `warnings`, and deterministic metrics for text, headings, links, bookmarks, images, tables, and notes. Publication is atomic and outputs carry an `html2doc-skill` ownership marker.

## Completion

Return the generated DOCX as the primary artifact. State that the document uses reflowable Word pagination and a static clickable contents list; only page-number fields remain dynamic. Report warnings honestly and never describe the result as visually verified.
