from pathlib import Path
from zipfile import ZipFile

import pytest

from doc2pdf_skill.models import Doc2PdfError
from doc2pdf_skill.source import docx_hyperlink_count, requested_docx_fonts, validate_source


DOCUMENT = b'''<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:rPr><w:rFonts w:ascii="Book Antiqua"/></w:rPr><w:t>Hello</w:t></w:r></w:p></w:body>
</w:document>'''


def make_docx(path: Path) -> None:
    with ZipFile(path, "w") as package:
        package.writestr("word/document.xml", DOCUMENT)


def test_validate_docx_and_extract_direct_fonts(tmp_path: Path) -> None:
    path = tmp_path / "book.docx"
    make_docx(path)
    assert validate_source(path) == path.resolve()
    assert requested_docx_fonts(path) == {"Book Antiqua"}
    assert docx_hyperlink_count(path) == 0


def test_reject_mislabeled_docx(tmp_path: Path) -> None:
    path = tmp_path / "bad.docx"
    path.write_text("not a Word document")
    with pytest.raises(Doc2PdfError, match="corrupt, encrypted, or mislabeled"):
        validate_source(path)


def test_accept_legacy_ole_signature(tmp_path: Path) -> None:
    path = tmp_path / "legacy.doc"
    path.write_bytes(bytes.fromhex("D0CF11E0A1B11AE1") + b"payload")
    assert validate_source(path) == path.resolve()
