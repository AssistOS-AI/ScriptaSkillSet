# Scripta DOC/DOCX to PDF

Convert Word documents with LibreOffice, optimize with QPDF and verify every PDF page with Poppler. Ghostscript supplies the optional balanced and compact profiles.

Requires Node.js >=22. Copy the entire skill folder including external/runtime. Prepare native tools using [dependencies.md](dependencies.md), then run doctor.

```bash
scripts/doc2pdf doctor
scripts/doc2pdf convert manuscript.docx --profile fidelity
scripts/doc2pdf validate manuscript.docx --pdf manuscript.pdf
node --test tests/*.test.mjs
```

See [SKILL.md](SKILL.md) for options, output contracts and handling warnings. Sources remain immutable. Existing outputs require --overwrite and the skill ownership marker.
