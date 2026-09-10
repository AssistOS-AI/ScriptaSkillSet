# Scripta HTML to DOCX

Convert Scripta HTML into an editable DOCX with native headings, lists, tables, images, notes, clickable contents and page-number fields.

Requires Node.js >=22. Copy the entire skill folder including external/runtime. Bundled package versions and licenses are recorded in [dependencies.md](dependencies.md).

```bash
scripts/html2doc doctor
scripts/html2doc convert index.html
scripts/html2doc validate index.html --docx book.docx
node --test tests/*.test.mjs
```

See [SKILL.md](SKILL.md) for options, output contracts and handling warnings. Sources remain immutable. Existing outputs require --overwrite and the skill ownership marker.
