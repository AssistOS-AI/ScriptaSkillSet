from pathlib import Path

import pytest
from bs4 import BeautifulSoup

from pdf2html_skill.batch import (
    convert_many_in_place,
    ensure_book_artifact_target,
    expand_pdf_inputs,
    infer_language,
    install_book_artifact,
)
from pdf2html_skill.preflight import Pdf2HtmlError


def _generated_book(path: Path, marker: str = "new") -> None:
    path.mkdir(parents=True)
    (path / "index.html").write_text(
        f'<!doctype html><html><head><meta name="generator" content="pdf2html-skill"></head><body>{marker}</body></html>',
        encoding="utf-8",
    )
    (path / "assets").mkdir()
    (path / "assets" / "styles.css").write_text(marker, encoding="utf-8")


def test_install_keeps_relative_asset_references_valid(tmp_path: Path) -> None:
    destination = tmp_path / "en"
    destination.mkdir()
    source = tmp_path / "staged"
    _generated_book(source)
    image = source / "assets" / "cover.png"
    image.write_bytes(b"png")
    (source / "index.html").write_text(
        '<html><head><meta name="generator" content="pdf2html-skill"></head>'
        '<body><img src="assets/cover.png"></body></html>',
        encoding="utf-8",
    )

    install_book_artifact(source, destination, overwrite=False)

    soup = BeautifulSoup((destination / "index.html").read_text(encoding="utf-8"), "html.parser")
    assert (destination / soup.img["src"]).is_file()


def test_no_input_uses_book_pdf_from_invocation_folder(tmp_path: Path) -> None:
    source = tmp_path / "book.pdf"
    source.write_bytes(b"%PDF-")
    assert expand_pdf_inputs([], tmp_path) == [source]


def test_no_input_accepts_single_pdf_with_any_name(tmp_path: Path) -> None:
    source = tmp_path / "A_Balance_of_Iron_and_Salt.pdf"
    source.write_bytes(b"%PDF-")
    assert expand_pdf_inputs([], tmp_path) == [source]


def test_explicit_input_accepts_any_pdf_name(tmp_path: Path) -> None:
    source = tmp_path / "manuscript-final.pdf"
    source.write_bytes(b"%PDF-")
    assert expand_pdf_inputs([source], tmp_path) == [source]


def test_directory_inputs_are_discovered_recursively(tmp_path: Path) -> None:
    english = tmp_path / "en" / "book.pdf"
    romanian = tmp_path / "ro" / "book.pdf"
    english.parent.mkdir()
    romanian.parent.mkdir()
    english.write_bytes(b"%PDF-")
    romanian.write_bytes(b"%PDF-")
    assert expand_pdf_inputs([tmp_path], tmp_path) == [english, romanian]
    assert infer_language(english) == "en"
    assert infer_language(romanian) == "ro"


def test_install_preserves_pdf_and_other_folder_files(tmp_path: Path) -> None:
    destination = tmp_path / "en"
    destination.mkdir()
    (destination / "book.pdf").write_bytes(b"%PDF-")
    (destination / "book.html").write_text("keep", encoding="utf-8")
    source = tmp_path / "staged"
    _generated_book(source)

    install_book_artifact(source, destination, overwrite=False)

    assert (destination / "book.pdf").is_file()
    assert (destination / "book.html").read_text(encoding="utf-8") == "keep"
    assert "new" in (destination / "index.html").read_text(encoding="utf-8")
    assert (destination / "assets" / "styles.css").is_file()


def test_install_replaces_only_owned_generated_files(tmp_path: Path) -> None:
    destination = tmp_path / "en"
    _generated_book(destination, "old")
    (destination / "book.pdf").write_bytes(b"%PDF-")
    replacement = tmp_path / "replacement"
    _generated_book(replacement, "new")

    install_book_artifact(replacement, destination, overwrite=True)

    assert (destination / "book.pdf").is_file()
    assert "new" in (destination / "index.html").read_text(encoding="utf-8")
    assert (destination / "assets" / "styles.css").read_text(encoding="utf-8") == "new"


def test_install_rejects_foreign_index(tmp_path: Path) -> None:
    destination = tmp_path / "en"
    destination.mkdir()
    (destination / "index.html").write_text("foreign", encoding="utf-8")
    source = tmp_path / "staged"
    _generated_book(source)
    with pytest.raises(Pdf2HtmlError, match="not owned"):
        install_book_artifact(source, destination, overwrite=True)


def test_install_accepts_owned_assets_when_index_is_missing(tmp_path: Path) -> None:
    destination = tmp_path / "en"
    destination.mkdir()
    assets = destination / "assets"
    assets.mkdir()
    (assets / ".pdf2html-skill").write_text("pdf2html-skill\n", encoding="utf-8")
    replacement = tmp_path / "replacement"
    _generated_book(replacement, "new")

    install_book_artifact(replacement, destination, overwrite=True)

    assert "new" in (destination / "index.html").read_text(encoding="utf-8")


def test_legacy_incomplete_output_can_be_rebuilt(tmp_path: Path) -> None:
    destination = tmp_path / "en"
    (destination / "assets").mkdir(parents=True)
    (destination / "assets" / "styles.css").write_text(
        ":root{--pdf-page-aspect:1/1} main.pdf-document{}", encoding="utf-8"
    )
    (destination / ".pdf2html-qa").mkdir()
    (destination / ".pdf2html-qa" / "report.json").write_text(
        "{}", encoding="utf-8"
    )

    ensure_book_artifact_target(destination, overwrite=True)


def test_empty_incomplete_assets_can_be_rebuilt(tmp_path: Path) -> None:
    destination = tmp_path / "en"
    (destination / "assets" / "images").mkdir(parents=True)
    (destination / "assets" / "fonts").mkdir()

    ensure_book_artifact_target(destination, overwrite=True)


def test_unowned_incomplete_assets_with_files_are_rejected(tmp_path: Path) -> None:
    destination = tmp_path / "en"
    (destination / "assets").mkdir(parents=True)
    (destination / "assets" / "user-file.css").write_text(
        "user content", encoding="utf-8"
    )

    with pytest.raises(Pdf2HtmlError, match="not owned"):
        ensure_book_artifact_target(destination, overwrite=True)


def test_foreign_index_is_not_overridden_by_asset_marker(tmp_path: Path) -> None:
    destination = tmp_path / "en"
    (destination / "assets").mkdir(parents=True)
    (destination / "assets" / ".pdf2html-skill").write_text(
        "pdf2html-skill\n", encoding="utf-8"
    )
    (destination / "index.html").write_text("foreign", encoding="utf-8")
    replacement = tmp_path / "replacement"
    _generated_book(replacement)

    with pytest.raises(Pdf2HtmlError, match="not owned"):
        install_book_artifact(replacement, destination, overwrite=True)


def test_collision_is_rejected_before_conversion(tmp_path: Path, monkeypatch) -> None:
    destination = tmp_path / "en"
    _generated_book(destination)
    source = destination / "book.pdf"
    source.write_bytes(b"%PDF-")
    called = False

    def fail_if_called(*args, **kwargs):
        nonlocal called
        called = True
        raise AssertionError("conversion should not start")

    monkeypatch.setattr("pdf2html_skill.batch.convert_pdf", fail_if_called)
    with pytest.raises(Pdf2HtmlError, match="already exist"):
        convert_many_in_place([], invocation_dir=destination)
    assert not called


def test_multiple_pdfs_in_same_folder_are_rejected(tmp_path: Path) -> None:
    first = tmp_path / "one.pdf"
    second = tmp_path / "two.pdf"
    first.write_bytes(b"%PDF-")
    second.write_bytes(b"%PDF-")
    with pytest.raises(Pdf2HtmlError, match="same folder"):
        convert_many_in_place([first, second], invocation_dir=tmp_path)
