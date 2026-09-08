# Runtime dependencies

## Required

- `uv` bootstraps managed Python 3.12 and locked Python packages.
- LibreOffice Writer renders `.doc` and `.docx` files. Discovery checks `soffice`/`libreoffice`, macOS `/Applications`, and Windows Program Files locations.

## Profile-specific

- Ghostscript is required only by `balanced` and `compact`. Discovery checks `gs` and Windows `gswin64c.exe`/`gswin32c.exe` locations.
- PyMuPDF performs PDF inspection and page rendering, so Poppler is not a runtime dependency.

## Installation policy

`convert` and `validate` never install system packages. `install-deps` is a separate, explicit command. It displays the selected native package-manager operations and requires interactive confirmation unless `--yes` was supplied after host/user approval.
