from __future__ import annotations

import hashlib
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import pdfplumber
from pypdf import PdfReader

from .models import PdfProfile


class Pdf2HtmlError(RuntimeError):
    """A user-actionable conversion failure."""


def executable_version(name: str) -> str | None:
    executable = shutil.which(name)
    if not executable:
        return None
    completed = subprocess.run(
        [executable, "-v"], capture_output=True, text=True, check=False
    )
    output = (completed.stdout or completed.stderr).strip().splitlines()
    return output[0] if output else executable


def doctor(*, verify_browser: bool = True) -> dict[str, Any]:
    dependencies: dict[str, Any] = {
        "python": sys.version.split()[0],
        "pdfinfo": executable_version("pdfinfo"),
        "pdftoppm": executable_version("pdftoppm"),
    }
    missing = [name for name in ("pdfinfo", "pdftoppm") if not dependencies[name]]

    try:
        import docling  # noqa: F401

        dependencies["docling"] = "available"
    except ImportError:
        dependencies["docling"] = None
        missing.append("docling")

    try:
        from playwright.sync_api import sync_playwright

        dependencies["playwright"] = "available"
        if verify_browser:
            with sync_playwright() as manager:
                browser = manager.chromium.launch(headless=True)
                dependencies["chromium"] = browser.version
                browser.close()
    except Exception as error:  # Browser installation failures vary by platform.
        dependencies["chromium"] = None
        dependencies["chromium_error"] = str(error)
        missing.append("chromium")

    dependencies["ok"] = not missing
    dependencies["missing"] = sorted(set(missing))
    return dependencies


def require_runtime() -> dict[str, Any]:
    result = doctor()
    if not result["ok"]:
        missing = ", ".join(result["missing"])
        raise Pdf2HtmlError(
            f"Missing runtime dependencies: {missing}. Run the skill's "
            "'scripts/pdf2html doctor' launcher to bootstrap the local Python "
            "environment and Chromium; install Poppler if required."
        )
    return result


def inspect_pdf(path: Path) -> PdfProfile:
    path = path.expanduser().resolve()
    if not path.is_file():
        raise Pdf2HtmlError(f"Input PDF does not exist: {path}")
    with path.open("rb") as stream:
        header = stream.read(5)
    if path.suffix.lower() != ".pdf" or header != b"%PDF-":
        raise Pdf2HtmlError(f"Input is not a valid PDF file: {path}")

    try:
        reader = PdfReader(path)
    except Exception as error:
        raise Pdf2HtmlError(f"PDF structure could not be read: {path}") from error
    if reader.is_encrypted:
        raise Pdf2HtmlError("Encrypted or password-protected PDFs are not supported.")

    digest_builder = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest_builder.update(chunk)
    digest = digest_builder.hexdigest()
    metadata = reader.metadata or {}
    page_text: list[str] = []
    page_sizes: list[tuple[float, float]] = []

    try:
        with pdfplumber.open(path) as document:
            for page in document.pages:
                page_text.append(page.extract_text(x_tolerance=2, y_tolerance=3) or "")
                page_sizes.append((float(page.width), float(page.height)))
    except Exception as error:
        raise Pdf2HtmlError(f"PDF pages could not be extracted: {path}") from error

    return PdfProfile(
        path=path,
        sha256=digest,
        pages=len(reader.pages),
        title=str(metadata.get("/Title")) if metadata.get("/Title") else None,
        author=str(metadata.get("/Author")) if metadata.get("/Author") else None,
        page_sizes=page_sizes,
        page_text=page_text,
    )
