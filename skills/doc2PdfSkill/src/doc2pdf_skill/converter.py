from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

import pikepdf

from .models import Doc2PdfError, Finding, Profile
from .preflight import tools
from .qa import validate_against_reference
from .source import docx_hyperlink_count, requested_docx_fonts, validate_source


OWNER_KEY = "/ScriptaSkill"
OWNER_VALUE = "doc2pdf-skill"


def _owned(path: Path) -> bool:
    try:
        with pikepdf.open(path) as pdf:
            return str(pdf.docinfo.get(OWNER_KEY, "")) == OWNER_VALUE
    except (pikepdf.PdfError, OSError):
        return False


def _stored_profile(path: Path) -> Profile:
    try:
        with pikepdf.open(path) as pdf:
            value = str(pdf.docinfo.get("/ScriptaProfile", "fidelity"))
    except (pikepdf.PdfError, OSError):
        return "fidelity"
    return value if value in {"fidelity", "balanced", "compact"} else "fidelity"  # type: ignore[return-value]


def _output_path(source: Path, requested: Path | None) -> Path:
    output = (requested or source.with_suffix(".pdf")).expanduser().resolve()
    if output.suffix.casefold() != ".pdf":
        raise Doc2PdfError("Output must have a .pdf extension.")
    if output == source:
        raise Doc2PdfError("Output cannot replace the source document.")
    return output


def _prepare_output(output: Path, overwrite: bool) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    if not output.exists():
        return
    if not overwrite:
        raise Doc2PdfError(f"Output already exists; use --overwrite for a skill-owned PDF: {output}")
    if not _owned(output):
        raise Doc2PdfError(f"Refusing to overwrite a PDF not owned by doc2pdf-skill: {output}")


def _profile_registry(profile_dir: Path) -> None:
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "registrymodifications.xcu").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<oor:items xmlns:oor="http://openoffice.org/2001/registry">'
        '<item oor:path="/org.openoffice.Office.Common/Security/Scripting">'
        '<prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop>'
        '</item></oor:items>',
        encoding="utf-8",
    )


def _libreoffice_export(source: Path, directory: Path, executable: Path) -> Path:
    export_dir = directory / "libreoffice-output"
    export_dir.mkdir()
    profile_dir = directory / "libreoffice-profile"
    _profile_registry(profile_dir)
    profile_uri = profile_dir.resolve().as_uri()
    command = [
        str(executable), f"-env:UserInstallation={profile_uri}", "--headless", "--nologo",
        "--nodefault", "--nolockcheck", "--norestore", "--convert-to",
        "pdf:writer_pdf_Export", "--outdir", str(export_dir), str(source),
    ]
    try:
        completed = subprocess.run(command, check=False, capture_output=True, text=True, timeout=180)
    except subprocess.TimeoutExpired as error:
        raise Doc2PdfError("LibreOffice conversion exceeded the 180-second timeout.") from error
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip()
        raise Doc2PdfError(f"LibreOffice conversion failed ({completed.returncode}): {detail}")
    outputs = list(export_dir.glob("*.pdf"))
    if len(outputs) != 1 or not outputs[0].is_file() or outputs[0].stat().st_size == 0:
        detail = (completed.stderr or completed.stdout).strip()
        raise Doc2PdfError(f"LibreOffice did not create exactly one non-empty PDF. {detail}")
    return outputs[0]


def _lossless(source: Path, output: Path, profile: Profile) -> None:
    with pikepdf.open(source) as pdf:
        pdf.docinfo[OWNER_KEY] = OWNER_VALUE
        pdf.docinfo["/ScriptaProfile"] = profile
        pdf.docinfo["/Producer"] = "Scripta doc2pdf-skill (LibreOffice + pikepdf)"
        pdf.docinfo["/ModDate"] = datetime.now(timezone.utc).strftime("D:%Y%m%d%H%M%SZ")
        pdf.save(
            output,
            linearize=True,
            compress_streams=True,
            recompress_flate=True,
            object_stream_mode=pikepdf.ObjectStreamMode.generate,
        )


def _ghostscript(source: Path, output: Path, executable: Path, profile: Profile) -> None:
    dpi, quality = (300, 92) if profile == "balanced" else (150, 82)
    command = [
        str(executable), "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.7", "-dNOPAUSE",
        "-dBATCH", "-dSAFER", "-dDetectDuplicateImages=true", "-dCompressFonts=true",
        "-dSubsetFonts=true", "-dEmbedAllFonts=true", "-dPreserveAnnots=true",
        "-dDownsampleColorImages=true", "-dDownsampleGrayImages=true",
        "-dColorImageDownsampleType=/Bicubic", "-dGrayImageDownsampleType=/Bicubic",
        f"-dColorImageResolution={dpi}", f"-dGrayImageResolution={dpi}",
        "-dAutoFilterColorImages=false", "-dAutoFilterGrayImages=false",
        "-dColorImageFilter=/DCTEncode", "-dGrayImageFilter=/DCTEncode",
        f"-dJPEGQ={quality}", f"-sOutputFile={output}", str(source),
    ]
    try:
        completed = subprocess.run(command, check=False, capture_output=True, text=True, timeout=180)
    except subprocess.TimeoutExpired as error:
        raise Doc2PdfError("Ghostscript optimization exceeded the 180-second timeout.") from error
    if completed.returncode != 0 or not output.is_file() or output.stat().st_size == 0:
        detail = (completed.stderr or completed.stdout).strip()
        raise Doc2PdfError(f"Ghostscript optimization failed ({completed.returncode}): {detail}")


def _build_candidate(raw: Path, directory: Path, profile: Profile, ghostscript: Path | None) -> Path:
    candidate = directory / f"candidate-{profile}.pdf"
    if profile == "fidelity":
        _lossless(raw, candidate, profile)
        return candidate
    if ghostscript is None:
        raise Doc2PdfError(f"The {profile} profile requires Ghostscript. Run install-deps or use fidelity.")
    compressed = directory / f"ghostscript-{profile}.pdf"
    _ghostscript(raw, compressed, ghostscript, profile)
    _lossless(compressed, candidate, profile)
    return candidate


def _qa_dir(output: Path) -> Path:
    root = output.parent / ".doc2pdf-qa"
    root.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    candidate = root / f"{output.stem}-{stamp}"
    counter = 1
    while candidate.exists():
        candidate = root / f"{output.stem}-{stamp}-{counter}"
        counter += 1
    return candidate


def _run_pipeline(
    source: Path,
    output: Path,
    profile: Profile,
    *,
    overwrite: bool,
    keep_qa_artifacts: bool,
) -> dict[str, object]:
    _prepare_output(output, overwrite)
    runtime = tools()
    if runtime.libreoffice is None:
        raise Doc2PdfError("LibreOffice was not found. Run doc2pdf install-deps, then doctor.")
    work = Path(tempfile.mkdtemp(prefix=".doc2pdf-", dir=output.parent))
    retained: Path | None = None
    try:
        raw = _libreoffice_export(source, work, runtime.libreoffice)
        requested_fonts = requested_docx_fonts(source)
        requested_profile = profile
        candidate = _build_candidate(raw, work, profile, runtime.ghostscript)
        renders = work / "renders" if keep_qa_artifacts else None
        source_links = docx_hyperlink_count(source)
        qa = validate_against_reference(raw, candidate, profile=profile, requested_fonts=requested_fonts, source_hyperlinks=source_links, render_dir=renders)
        warnings: list[dict[str, object]] = []
        if qa["status"] == "failed" and profile != "fidelity":
            warnings.append(Finding("warning", "profile-fallback", f"The {profile} candidate failed QA; fidelity was published instead.", {"failedFindings": qa["findings"]}).json())
            profile = "fidelity"
            candidate = _build_candidate(raw, work, profile, runtime.ghostscript)
            qa = validate_against_reference(raw, candidate, profile=profile, requested_fonts=requested_fonts, source_hyperlinks=source_links, render_dir=renders)
        if qa["status"] == "failed":
            raise Doc2PdfError("PDF candidate failed QA: " + json.dumps(qa["findings"], ensure_ascii=False))
        raw_bytes, final_bytes = raw.stat().st_size, candidate.stat().st_size
        os.replace(candidate, output)
        result: dict[str, object] = {
            "status": "passed_with_warnings" if warnings or qa["status"] == "passed_with_warnings" else "passed",
            "source": str(source),
            "artifact": str(output),
            "requestedProfile": requested_profile,
            "profile": profile,
            "warnings": warnings + [finding for finding in qa["findings"] if finding["severity"] == "warning"],
            "findings": qa["findings"],
            "metrics": {
                **qa["metrics"],
                "rawBytes": raw_bytes,
                "outputBytes": final_bytes,
                "savedBytes": raw_bytes - final_bytes,
                "sizeRatio": round(final_bytes / raw_bytes, 6) if raw_bytes else 1.0,
            },
        }
        if keep_qa_artifacts:
            (work / "qa.json").write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
            retained = _qa_dir(output)
            shutil.move(str(work), retained)
            result["qaArtifacts"] = str(retained)
        return result
    finally:
        if retained is None:
            shutil.rmtree(work, ignore_errors=True)


def convert_document(
    input_path: Path,
    output_path: Path | None = None,
    *,
    profile: Profile = "fidelity",
    overwrite: bool = False,
    keep_qa_artifacts: bool = False,
) -> dict[str, object]:
    source = validate_source(input_path)
    output = _output_path(source, output_path)
    return _run_pipeline(source, output, profile, overwrite=overwrite, keep_qa_artifacts=keep_qa_artifacts)


def validate_existing(input_path: Path, pdf_path: Path, *, keep_qa_artifacts: bool = False) -> dict[str, object]:
    source = validate_source(input_path)
    pdf = pdf_path.expanduser().resolve()
    if not pdf.is_file():
        raise Doc2PdfError(f"PDF does not exist: {pdf}")
    runtime = tools()
    if runtime.libreoffice is None:
        raise Doc2PdfError("LibreOffice was not found. Run doc2pdf install-deps, then doctor.")
    work = Path(tempfile.mkdtemp(prefix=".doc2pdf-validate-", dir=pdf.parent))
    retained: Path | None = None
    try:
        raw = _libreoffice_export(source, work, runtime.libreoffice)
        renders = work / "renders" if keep_qa_artifacts else None
        profile = _stored_profile(pdf)
        result = validate_against_reference(raw, pdf, profile=profile, requested_fonts=requested_docx_fonts(source), source_hyperlinks=docx_hyperlink_count(source), render_dir=renders)
        result.update({"source": str(source), "artifact": str(pdf), "profile": profile})
        if keep_qa_artifacts:
            (work / "qa.json").write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
            retained = _qa_dir(pdf)
            shutil.move(str(work), retained)
            result["qaArtifacts"] = str(retained)
        return result
    finally:
        if retained is None:
            shutil.rmtree(work, ignore_errors=True)
