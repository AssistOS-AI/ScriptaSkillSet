from __future__ import annotations

import os
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any

from .converter import convert_pdf
from .ownership import is_owned_output
from .preflight import Pdf2HtmlError


SUPPORTED_LANGUAGES = {"en", "fr", "de", "es", "pt", "it", "ro", "pl"}


def expand_pdf_inputs(inputs: list[Path], invocation_dir: Path) -> list[Path]:
    if not inputs:
        default_pdf = invocation_dir / "book.pdf"
        inputs = [default_pdf] if default_pdf.is_file() else sorted(invocation_dir.glob("*.pdf"))

    resolved: list[Path] = []
    for item in inputs:
        candidate = item.expanduser().resolve()
        if candidate.is_dir():
            resolved.extend(
                path
                for path in sorted(candidate.rglob("*"))
                if path.is_file() and path.suffix.casefold() == ".pdf"
            )
        elif candidate.is_file() and candidate.suffix.casefold() == ".pdf":
            resolved.append(candidate)
        elif candidate.exists():
            raise Pdf2HtmlError(f"Input is not a PDF file: {candidate}")
        else:
            raise Pdf2HtmlError(f"Input does not exist: {candidate}")

    unique = list(dict.fromkeys(resolved))
    if not unique:
        raise Pdf2HtmlError(
            f"No PDF files were found. Put book.pdf in {invocation_dir} or pass PDF paths."
        )
    return unique


def infer_language(path: Path, default: str | None = None) -> str:
    suffix = re.search(r"(?:[_. -])([a-zA-Z]{2})$", path.stem)
    if suffix and suffix.group(1).casefold() in SUPPORTED_LANGUAGES:
        return suffix.group(1).casefold()
    parent_language = path.parent.name.casefold()
    if parent_language in SUPPORTED_LANGUAGES:
        return parent_language
    if default:
        return default.casefold()
    return "und"


def ensure_book_artifact_target(destination: Path, *, overwrite: bool) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    target_html = destination / "index.html"
    target_assets = destination / "assets"
    collisions = [path for path in (target_html, target_assets) if path.exists()]
    if collisions and not overwrite:
        raise Pdf2HtmlError(
            f"Generated book files already exist in {destination}. Use --overwrite to rebuild them."
        )
    empty_incomplete_assets = (
        not target_html.exists()
        and target_assets.is_dir()
        and not any(path.is_file() or path.is_symlink() for path in target_assets.rglob("*"))
    )
    if collisions and not is_owned_output(
        destination, allow_legacy_incomplete=True
    ) and not empty_incomplete_assets:
        raise Pdf2HtmlError(
            f"Refusing to replace index.html or assets in {destination}; they are not owned by pdf2html-skill."
        )


def install_book_artifact(source: Path, destination: Path, *, overwrite: bool) -> None:
    ensure_book_artifact_target(destination, overwrite=overwrite)
    target_html = destination / "index.html"
    target_assets = destination / "assets"

    backup = Path(
        tempfile.mkdtemp(
            prefix=f".{destination.name}.pdf2html-backup-", dir=destination.parent
        )
    )
    moved_targets: list[tuple[Path, Path]] = []
    installed_targets: list[Path] = []
    try:
        for target in (target_html, target_assets):
            if target.exists():
                stored = backup / target.name
                os.replace(target, stored)
                moved_targets.append((stored, target))
        os.replace(source / "index.html", target_html)
        installed_targets.append(target_html)
        os.replace(source / "assets", target_assets)
        installed_targets.append(target_assets)
        shutil.rmtree(backup)
    except Exception:
        for target in reversed(installed_targets):
            if target.is_dir():
                shutil.rmtree(target)
            elif target.exists():
                target.unlink()
        for stored, target in moved_targets:
            if stored.exists() and not target.exists():
                os.replace(stored, target)
        if backup.exists():
            shutil.rmtree(backup)
        raise


def convert_many_in_place(
    inputs: list[Path],
    *,
    invocation_dir: Path,
    default_language: str | None = None,
    title: str | None = None,
    image_scale: float = 2.0,
    overwrite: bool = False,
    keep_qa_artifacts: bool = False,
) -> dict[str, Any]:
    pdfs = expand_pdf_inputs(inputs, invocation_dir.resolve())
    if title and len(pdfs) > 1:
        raise Pdf2HtmlError("--title can be used only when converting one PDF.")

    destinations = [pdf.parent for pdf in pdfs]
    duplicates = {path for path in destinations if destinations.count(path) > 1}
    if duplicates:
        repeated = ", ".join(str(path) for path in sorted(duplicates))
        raise Pdf2HtmlError(
            "Multiple PDFs cannot write index.html into the same folder. "
            f"Place each edition in its own folder: {repeated}"
        )

    for destination in destinations:
        ensure_book_artifact_target(destination, overwrite=overwrite)

    results: list[dict[str, Any]] = []
    for pdf, destination in zip(pdfs, destinations):
        with tempfile.TemporaryDirectory(
            prefix=f".{destination.name}.pdf2html-stage-", dir=destination.parent
        ) as temp_name:
            temp_root = Path(temp_name)
            staged_book = temp_root / "book"
            result = convert_pdf(
                pdf,
                staged_book,
                language=infer_language(pdf, default_language),
                title=title,
                image_scale=image_scale,
                keep_qa_artifacts=keep_qa_artifacts,
            )
            install_book_artifact(staged_book, destination, overwrite=overwrite)
            result["artifact"] = str(destination / "index.html")
            result["output"] = str(destination)
            if keep_qa_artifacts:
                source_qa = temp_root / ".pdf2html-qa" / staged_book.name
                target_qa = destination / ".pdf2html-qa"
                if target_qa.exists():
                    shutil.rmtree(target_qa)
                os.replace(source_qa, target_qa)
                result["validation"]["report"] = str(target_qa / "report.json")
            results.append(result)
    return {"count": len(results), "books": results}
