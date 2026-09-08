from pathlib import Path

import pikepdf
import pytest

from doc2pdf_skill.converter import OWNER_KEY, OWNER_VALUE, _prepare_output
from doc2pdf_skill.models import Doc2PdfError


def test_refuse_to_overwrite_unowned_pdf(tmp_path: Path) -> None:
    output = tmp_path / "book.pdf"
    with pikepdf.new() as pdf:
        pdf.add_blank_page()
        pdf.save(output)
    with pytest.raises(Doc2PdfError, match="not owned"):
        _prepare_output(output, overwrite=True)


def test_allow_overwrite_of_owned_pdf(tmp_path: Path) -> None:
    output = tmp_path / "book.pdf"
    with pikepdf.new() as pdf:
        pdf.add_blank_page()
        pdf.docinfo[OWNER_KEY] = OWNER_VALUE
        pdf.save(output)
    _prepare_output(output, overwrite=True)
