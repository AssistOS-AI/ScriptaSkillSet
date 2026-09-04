from pathlib import Path

import pytest

from pdf2html_skill import preflight
from pdf2html_skill.preflight import Pdf2HtmlError, inspect_pdf


def test_rejects_non_pdf(tmp_path: Path) -> None:
    source = tmp_path / "not-a-pdf.pdf"
    source.write_text("not a pdf", encoding="utf-8")
    with pytest.raises(Pdf2HtmlError, match="not a valid PDF"):
        inspect_pdf(source)


def test_rejects_missing_pdf(tmp_path: Path) -> None:
    with pytest.raises(Pdf2HtmlError, match="does not exist"):
        inspect_pdf(tmp_path / "missing.pdf")


def test_missing_runtime_points_to_bootstrap_launcher(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        preflight,
        "doctor",
        lambda: {"ok": False, "missing": ["chromium"]},
    )
    with pytest.raises(Pdf2HtmlError, match="scripts/pdf2html doctor"):
        preflight.require_runtime()
