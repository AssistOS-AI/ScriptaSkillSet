# doc2PdfSkill

Converts local `.doc` and `.docx` documents to validated PDFs using LibreOffice. The default `fidelity` profile changes PDF container structure without recompressing images. `balanced` and `compact` use Ghostscript for smaller screen-oriented files and automatically fall back to `fidelity` if QA detects structural loss.

The public JPeetz/agent-skills `document-processing` workflow was consulted for its recommendation to use LibreOffice headless. No upstream source code or documentation is vendored: the specialized implementation and QA pipeline here are original. The upstream repository currently has no machine-detectable license file, despite its README describing repository standards as MIT.

## Runtime

The launcher needs `uv`; it provisions Python 3.12 and Python dependencies. System tools are discovered in `PATH` and standard application locations.

```bash
scripts/doc2pdf doctor
scripts/doc2pdf install-deps
```

`install-deps` is explicit and interactive. Add `--yes` only after the system-level installation has been approved. Supported installers are Homebrew on macOS, apt/dnf/pacman on Linux, and winget on Windows.

## Convert and validate

```bash
scripts/doc2pdf convert manuscript.docx
scripts/doc2pdf convert legacy.doc --output legacy.pdf --profile balanced
scripts/doc2pdf validate manuscript.docx --pdf manuscript.pdf
```

Existing output requires `--overwrite` and must carry the skill ownership marker. QA artifacts are temporary unless `--keep-qa-artifacts` is supplied.

## Development

```bash
uv sync --extra dev
uv run pytest
uv run python -m compileall -q src tests
```
