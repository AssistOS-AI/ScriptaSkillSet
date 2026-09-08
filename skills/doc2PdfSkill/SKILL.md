---
name: doc2Pdf
description: Convert local Microsoft Word DOC or DOCX documents into high-fidelity, optimized PDFs with LibreOffice, lossless-by-default optimization, deterministic structural and rendered-page QA, atomic publication, and optional balanced or compact image compression.
---

# Scripta DOC/DOCX to PDF

Use this skill when the user wants a PDF made from a local `.doc` or `.docx` file and document appearance, links, fonts, pagination, and output quality matter.

## Required boundary

- Treat the input as immutable and process it locally.
- Use LibreOffice Writer as the free cross-platform rendering engine.
- Never install LibreOffice or Ghostscript during `convert`. Use `install-deps` only after explicit user approval.
- Run LibreOffice headlessly with an isolated temporary profile and macro execution disabled.
- Default to the lossless `fidelity` profile. Use `balanced` or `compact` only when the user asks for a smaller PDF or accepts image recompression.
- Compare the optimized PDF to LibreOffice's unoptimized PDF before publication. Reject material text, page, link, outline, font, geometry, or rendered-page regressions.
- Preserve the source and publish the PDF atomically. Never replace an unrelated existing PDF.
- Do not claim Microsoft Word rendering, PDF/A conformance, or pixel identity with Word.

## Portable launcher

Resolve this skill directory from `SKILL.md` and invoke:

```bash
<skill-directory>/scripts/doc2pdf doctor
<skill-directory>/scripts/doc2pdf convert manuscript.docx
```

The launcher requires `uv`, provisions managed Python 3.12 and locked Python dependencies, then runs the skill. LibreOffice is required for conversion. Ghostscript is required only for `balanced` and `compact`.

If system dependencies are missing, request permission before running:

```bash
<skill-directory>/scripts/doc2pdf install-deps
```

## Workflow

1. Run `doctor` and inspect `ok`, LibreOffice discovery, and profile availability.
2. Resolve exactly one `.doc` or `.docx` source and reject invalid, encrypted, or mislabeled input.
3. Select `fidelity` unless the user explicitly requests smaller output.
4. Convert into a temporary staging directory, optimize, validate against the raw LibreOffice PDF, and publish only if QA passes.
5. Use `--overwrite` only for an existing PDF carrying the `doc2pdf-skill` ownership marker.
6. Return the PDF, profile, byte reduction, QA status, and any warnings.

```bash
<skill-directory>/scripts/doc2pdf convert manuscript.docx \
  --output manuscript.pdf --profile fidelity
```

Validate an existing PDF independently:

```bash
<skill-directory>/scripts/doc2pdf validate manuscript.docx --pdf manuscript.pdf
```

Use `--keep-qa-artifacts` only when rendered reference/candidate pages and the QA report are useful for diagnosis.

## Output contract

The normal persistent artifact is the requested PDF. Commands emit JSON containing `status`, `artifact`, `profile`, `warnings`, dependency data, byte metrics, and deterministic QA metrics. Successful outputs carry a `doc2pdf-skill` metadata marker.

## Completion

Do not deliver a failed candidate. State which profile was used and whether lossy optimization fell back to `fidelity`. Report missing or non-embedded fonts and potential substitutions honestly.
