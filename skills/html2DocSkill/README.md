# html2DocSkill

Converts a Scripta semantic HTML book into a native, editable DOCX with professional book styles, separately paginated front matter, reflowable chapters, a source-emphasis-aware static clickable contents list, footer-only page numbering, local images, tables, links, and explicit semantic notes. It does not generate headers.

## Runtime

The portable launcher needs only `uv`; it provisions managed Python 3.12 and the locked dependencies itself:

```bash
scripts/html2doc doctor
```

No browser, LibreOffice, Microsoft Word, Poppler, LLM, or remote service is used.

## Convert

```bash
scripts/html2doc convert /books/example/en/index.html
scripts/html2doc convert input.html --output manuscript.docx --title "Title" --author "Author"
```

For `index.html`, the default artifact is `<containing-folder>.docx`; for other inputs it is `<input-stem>.docx`. Existing output requires `--overwrite` and must carry the skill ownership marker.

## Validate

```bash
scripts/html2doc validate input.html --docx manuscript.docx
```

Validation covers package integrity, normalized semantic text, Word fields and styles, links, bookmarks, images, tables, absence of headers, footer numbering, and notes. It intentionally does not render the DOCX, so appearance can vary slightly between Word-compatible editors.

## Development

```bash
uv sync --extra dev
uv run pytest
uv run python -m compileall -q src tests
```
