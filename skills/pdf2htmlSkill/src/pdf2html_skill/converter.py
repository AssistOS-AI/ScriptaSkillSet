from __future__ import annotations

import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling_core.types.doc import ImageRefMode, PictureItem, TableItem

from . import __version__
from .images import preserve_unclassified_images
from .models import PdfProfile, SourceEvidence
from .ownership import is_owned_output, write_output_marker
from .preflight import Pdf2HtmlError, inspect_pdf, require_runtime
from .renderer import enhance_html
from .typography import analyze_source, extract_embedded_fonts
from .validation import validate_output


def _docling_counts(document: Any) -> tuple[int, int]:
    tables = 0
    pictures = 0
    for item, _level in document.iterate_items():
        tables += isinstance(item, TableItem)
        pictures += isinstance(item, PictureItem)
    return tables, pictures


def _convert_with_docling(
    profile: PdfProfile, staging: Path, image_scale: float
) -> tuple[int, int, list[int]]:
    options = PdfPipelineOptions()
    options.do_ocr = False
    options.do_table_structure = True
    options.table_structure_options.mode = TableFormerMode.ACCURATE
    options.generate_picture_images = True
    options.generate_page_images = False
    options.images_scale = image_scale
    converter = DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)}
    )
    result = converter.convert(profile.path)
    images_dir = staging / "assets" / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    result.document.save_as_html(
        staging / "index.html",
        artifacts_dir=images_dir,
        image_mode=ImageRefMode.REFERENCED,
        split_page_view=False,
    )
    page_numbers = sorted(
        {
            item.prov[0].page_no
            for item, _level in result.document.iterate_items()
            if getattr(item, "prov", None)
        }
    )
    return (*_docling_counts(result.document), page_numbers)


def _prepare_destination(destination: Path, overwrite: bool) -> None:
    if not destination.exists() or not any(destination.iterdir()):
        return
    if not overwrite:
        raise Pdf2HtmlError(f"Output directory is not empty: {destination}. Use --overwrite for a generated output.")
    if is_owned_output(destination):
        return

    # Backward compatibility for outputs created before ownership moved into index.html.
    manifest = destination / "manifest.json"
    try:
        payload = json.loads(manifest.read_text(encoding="utf-8"))
    except Exception as error:
        raise Pdf2HtmlError("Refusing to overwrite a directory not identified as pdf2html-skill output.") from error
    if payload.get("generator") != "pdf2html-skill":
        raise Pdf2HtmlError("Refusing to overwrite a directory not owned by pdf2html-skill.")


def _qa_destination(destination: Path) -> Path:
    return destination.parent / ".pdf2html-qa" / destination.name


def _publish_qa(staging_qa: Path, destination: Path) -> Path:
    qa_destination = _qa_destination(destination)
    qa_destination.parent.mkdir(parents=True, exist_ok=True)
    if qa_destination.exists():
        shutil.rmtree(qa_destination)
    os.replace(staging_qa, qa_destination)
    return qa_destination


def _publish(staging: Path, destination: Path) -> None:
    backup: Path | None = None
    try:
        if destination.exists():
            if any(destination.iterdir()):
                backup_parent = Path(tempfile.mkdtemp(prefix=f".{destination.name}.backup-", dir=destination.parent))
                backup_parent.rmdir()
                backup = backup_parent
                os.replace(destination, backup)
            else:
                destination.rmdir()
        os.replace(staging, destination)
        if backup:
            shutil.rmtree(backup)
    except Exception:
        if not destination.exists() and backup and backup.exists():
            os.replace(backup, destination)
        raise


def convert_pdf(
    input_pdf: Path,
    destination: Path,
    *,
    language: str = "und",
    title: str | None = None,
    image_scale: float = 2.0,
    overwrite: bool = False,
    keep_qa_artifacts: bool = False,
) -> dict[str, Any]:
    if image_scale <= 0:
        raise Pdf2HtmlError("--image-scale must be greater than zero.")
    runtime = require_runtime()
    profile = inspect_pdf(input_pdf)
    destination = destination.expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.mkdir(parents=True, exist_ok=True)
    _prepare_destination(destination, overwrite)
    if not any(destination.iterdir()):
        destination.rmdir()

    staging = Path(tempfile.mkdtemp(prefix=".pdf2html-", dir=destination.parent))
    try:
        expected_tables, expected_pictures, content_pages = _convert_with_docling(
            profile, staging, image_scale
        )
        evidence = analyze_source(profile.path)
        evidence = SourceEvidence(
            typography=evidence.typography,
            pages=evidence.pages,
            fonts=extract_embedded_fonts(profile.path, staging / "assets" / "fonts"),
        )
        document_title = title or profile.title or profile.path.stem
        enhance_html(
            staging / "index.html",
            staging / "assets" / "styles.css",
            evidence,
            title=document_title,
            language=language,
            source_page_count=profile.pages,
            content_pages=content_pages,
        )
        expected_pictures += preserve_unclassified_images(
            profile.path,
            staging / "index.html",
            staging / "assets" / "images",
        )
        write_output_marker(staging)
        staging_qa = staging / "qa"
        report = validate_output(
            profile,
            staging / "index.html",
            expected_tables=expected_tables,
            expected_pictures=expected_pictures,
            keep_qa_artifacts=keep_qa_artifacts,
            report_dir=staging_qa,
        )
        manifest = {
            "generator": "pdf2html-skill",
            "version": __version__,
            "artifact": str(destination / "index.html"),
            "output": str(destination),
            "source": {"name": profile.path.name, "sha256": profile.sha256, "pages": profile.pages},
            "options": {"language": language, "title": document_title, "imageScale": image_scale, "ocr": False},
            "document": {"tables": expected_tables, "pictures": expected_pictures},
            "validation": {
                "status": report.status,
                "warnings": sum(item.severity == "warning" for item in report.findings),
                "metrics": report.metrics,
            },
            "runtime": runtime,
        }
        if report.status == "failed":
            failed_dir = destination.with_name(f"{destination.name}-failed")
            suffix = 1
            while failed_dir.exists():
                failed_dir = destination.with_name(f"{destination.name}-failed-{suffix}")
                suffix += 1
            os.replace(staging, failed_dir)
            raise Pdf2HtmlError(f"Validation failed. Diagnostic output retained at: {failed_dir}")
        if keep_qa_artifacts:
            qa_destination = _publish_qa(staging_qa, destination)
            manifest["validation"]["report"] = str(qa_destination / "report.json")
        else:
            shutil.rmtree(staging_qa)
        _publish(staging, destination)
        return manifest
    except Exception:
        if staging.exists():
            shutil.rmtree(staging)
        raise


def validate_existing(input_pdf: Path, html_path: Path, keep_qa_artifacts: bool = False) -> dict[str, Any]:
    require_runtime()
    profile = inspect_pdf(input_pdf)
    if not html_path.is_file():
        raise Pdf2HtmlError(f"HTML file does not exist: {html_path}")
    report_dir = _qa_destination(html_path.resolve().parent) if keep_qa_artifacts else None
    return validate_output(
        profile,
        html_path,
        keep_qa_artifacts=keep_qa_artifacts,
        report_dir=report_dir,
    ).to_dict()
