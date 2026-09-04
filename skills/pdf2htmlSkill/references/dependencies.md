# Runtime dependencies

The Python environment is declared in `pyproject.toml` and locked with `uv.lock`. Normal Codex use goes through `scripts/pdf2html`, which provisions and reuses `.venv` automatically without host-project imports or absolute machine paths.

## Automatic Python and Chromium setup

```bash
./scripts/pdf2html convert /path/to/book.pdf
```

The launcher requires `uv`, installs a native managed Python 3.12, synchronizes runtime packages from `uv.lock`, installs Chromium once for each new environment, runs `doctor`, and then executes the requested conversion in the same process tree. The first conversion may additionally download Docling layout and table models. Keep the model and browser caches available for later offline conversions.

In Codex, invoke this launcher once with a reusable approval for its exact command prefix. Do not separately elevate `uv`, Playwright, `doctor`, or the Python entrypoint. A shell script cannot grant permissions by itself; the Codex host grants them to the launcher process, and every child step inherits that single approved boundary.

Developers who need test dependencies can still run `uv sync --managed-python --python 3.12 --extra dev` directly.

## Poppler

macOS with Homebrew:

```bash
brew install poppler
```

Ubuntu or Debian:

```bash
sudo apt-get update
sudo apt-get install -y poppler-utils
```

Fedora or RHEL-family distributions:

```bash
sudo dnf install poppler-utils
```

After installing Poppler, rerun the originally requested launcher command. Use `./scripts/pdf2html doctor` only when troubleshooting the environment independently.

Use a Python build matching the host CPU architecture. This matters on Apple Silicon systems that also contain older Intel Python installations because Docling's machine-learning dependencies require architecture-compatible wheels.
