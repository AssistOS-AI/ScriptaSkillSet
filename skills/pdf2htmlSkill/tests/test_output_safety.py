import json
from pathlib import Path

import pytest

from pdf2html_skill.converter import _prepare_destination
from pdf2html_skill.preflight import Pdf2HtmlError


def test_refuses_unknown_populated_output(tmp_path: Path) -> None:
    destination = tmp_path / "output"
    destination.mkdir()
    (destination / "user-file.txt").write_text("keep", encoding="utf-8")
    with pytest.raises(Pdf2HtmlError, match="not empty"):
        _prepare_destination(destination, overwrite=False)
    with pytest.raises(Pdf2HtmlError, match="not identified"):
        _prepare_destination(destination, overwrite=True)


def test_accepts_html_owned_output_with_explicit_overwrite(tmp_path: Path) -> None:
    destination = tmp_path / "output"
    destination.mkdir()
    (destination / "index.html").write_text(
        '<!doctype html><html><head><meta name="generator" content="pdf2html-skill"></head><body></body></html>',
        encoding="utf-8",
    )
    _prepare_destination(destination, overwrite=True)


def test_accepts_legacy_manifest_owned_output_with_explicit_overwrite(tmp_path: Path) -> None:
    destination = tmp_path / "output"
    destination.mkdir()
    (destination / "manifest.json").write_text(
        json.dumps({"generator": "pdf2html-skill"}), encoding="utf-8"
    )
    _prepare_destination(destination, overwrite=True)
