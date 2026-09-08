from pathlib import Path

import pymupdf as fitz

from doc2pdf_skill.qa import validate_against_reference


def blank_pdf(path: Path) -> None:
    document = fitz.open()
    document.new_page(width=300, height=400)
    document.save(path)
    document.close()


def test_identical_blank_pdf_passes_fidelity_qa(tmp_path: Path) -> None:
    reference, candidate = tmp_path / "reference.pdf", tmp_path / "candidate.pdf"
    blank_pdf(reference)
    blank_pdf(candidate)
    result = validate_against_reference(reference, candidate, profile="fidelity")
    assert result["status"] == "passed"
    assert result["metrics"]["maxVisualDifference"] == 0


def test_page_count_change_fails(tmp_path: Path) -> None:
    reference, candidate = tmp_path / "reference.pdf", tmp_path / "candidate.pdf"
    blank_pdf(reference)
    document = fitz.open(reference)
    document.new_page(width=300, height=400)
    document.save(candidate)
    document.close()
    result = validate_against_reference(reference, candidate, profile="fidelity")
    assert result["status"] == "failed"
    assert "page-count" in {finding["code"] for finding in result["findings"]}
