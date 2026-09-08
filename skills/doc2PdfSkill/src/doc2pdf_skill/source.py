from __future__ import annotations

import re
from pathlib import Path
from zipfile import BadZipFile, ZipFile

from lxml import etree

from .models import Doc2PdfError


OLE_MAGIC = bytes.fromhex("D0CF11E0A1B11AE1")
WORD_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def validate_source(path: Path) -> Path:
    source = path.expanduser().resolve()
    if not source.is_file():
        raise Doc2PdfError(f"Input document does not exist: {source}")
    suffix = source.suffix.casefold()
    if suffix not in {".doc", ".docx"}:
        raise Doc2PdfError("Input must have a .doc or .docx extension.")
    if suffix == ".doc":
        with source.open("rb") as stream:
            signature = stream.read(8)
        if signature != OLE_MAGIC:
            raise Doc2PdfError("The .doc input is not a valid OLE compound document or is mislabeled.")
        return source
    try:
        with ZipFile(source) as package:
            if "word/document.xml" not in package.namelist() or package.testzip():
                raise Doc2PdfError("The DOCX package is incomplete or corrupt.")
    except BadZipFile as error:
        raise Doc2PdfError("The DOCX input is corrupt, encrypted, or mislabeled.") from error
    return source


def requested_docx_fonts(path: Path) -> set[str]:
    if path.suffix.casefold() != ".docx":
        return set()
    fonts: set[str] = set()
    with ZipFile(path) as package:
        for name in ("word/document.xml", "word/styles.xml", "word/numbering.xml"):
            if name not in package.namelist():
                continue
            root = etree.fromstring(package.read(name))
            for node in root.xpath(".//w:rFonts", namespaces=WORD_NS):
                for key in ("ascii", "hAnsi", "eastAsia", "cs"):
                    value = node.get(f"{{{WORD_NS['w']}}}{key}")
                    if value and not value.startswith("+"):
                        fonts.add(re.sub(r"\s+", " ", value).strip())
    return fonts


def docx_hyperlink_count(path: Path) -> int | None:
    if path.suffix.casefold() != ".docx":
        return None
    with ZipFile(path) as package:
        root = etree.fromstring(package.read("word/document.xml"))
    return int(root.xpath("count(.//w:hyperlink)", namespaces=WORD_NS))
