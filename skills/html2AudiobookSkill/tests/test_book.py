from pathlib import Path
from zipfile import ZipFile

import pytest

from html2audiobook_skill.book import BookError, VOICES, read_book, write_epub
from html2audiobook_skill.engine_bridge import epub_paragraphs, segments


def test_explicit_reading_pauses():
    assert segments(["Titlu", "Prima propoziție. A doua!", "Final."], heading_indices=[0]) == [
        "Titlu", "[pause:1.5]", "Prima propoziție.", "[pause:0.5]",
        "A doua!", "[pause:1.0]", "Final.", "[pause:1.0]"]


def test_sentence_boundaries_keep_abbreviations_numbers_and_quotes():
    assert segments(['Dr. I. Pop are 3.14 lei. „Ajunge?” Da!']) == [
        'Dr. I. Pop are 3.14 lei.', '[pause:0.5]', '„Ajunge?”',
        '[pause:0.5]', 'Da!', '[pause:1.0]']


def test_heading_roles_include_subtitles(tmp_path):
    source = tmp_path / "headings.html"
    source.write_text('<html lang="ro"><body><h1>Titlu</h1><p>Text.</p>'
                      '<h3>Subtitlu</h3><p>Final.</p></body></html>')
    book = read_book(source)
    assert book.chapters[0].heading_indices == [0, 2]
from html2audiobook_skill.pipeline import destination, workspace


def html(tmp_path, body, lang="ro"):
    path = tmp_path / "carte.html"
    path.write_text(f'<html lang="{lang}"><head><title>Cartea mea</title><meta name="author" content="Ana"/></head><body><main data-reader-content>{body}</main></body></html>', encoding="utf-8")
    return path


@pytest.mark.parametrize("lang", VOICES)
def test_language_and_defaults(tmp_path, lang):
    book = read_book(html(tmp_path, "<h2>First</h2><p>Text.</p><h2>Second</h2><p>More.</p>", lang))
    assert book.language == lang
    assert book.voice == VOICES[lang]
    assert book.speed == 1.0
    assert book.author == "Ana"
    assert len(book.chapters) == 2
    assert destination(book) == tmp_path / "carte-audiobook"


def test_nested_text_inline_lists_and_exclusions(tmp_path):
    source = html(tmp_path, '<nav>Do not read</nav><h2>Capitolul 1</h2><p>Ana <em>are</em> mere.</p>'
                  '<ul><li>Unu<ul><li>Doi</li></ul></li></ul><p hidden>Hidden</p>'
                  '<script>alert(1)</script><figure><img src="https://example.com/a.png"/><figcaption>Legenda.</figcaption></figure>'
                  '<h2>Anexă</h2><p>Știință și țară.</p>')
    original = source.read_bytes()
    book = read_book(source)
    paragraphs = [p for ch in book.chapters for p in ch.paragraphs]
    assert paragraphs == ['Capitolul 1', 'Ana are mere.', 'Unu', 'Doi', 'Legenda.', 'Anexă', 'Știință și țară.']
    assert source.read_bytes() == original


def test_epub_round_trip(tmp_path):
    book = read_book(html(tmp_path, '<h2>Unu &amp; doi</h2><p>Știință &lt; artă.</p><h2>Anexă</h2><p>Final.</p>'))
    target = tmp_path / "book.epub"
    write_epub(book, target)
    assert epub_paragraphs(target) == [p for c in book.chapters for p in c.paragraphs]
    with ZipFile(target) as archive:
        assert archive.namelist()[0] == "mimetype"
        assert archive.read("mimetype") == b"application/epub+zip"
        assert archive.testzip() is None


def test_language_override_and_validation(tmp_path):
    path = html(tmp_path, '<p>Proză.</p>', "ro-RO")
    assert read_book(path).language == "ro"
    assert read_book(path, lang="eng").language == "en"
    with pytest.raises(BookError, match="Unsupported language"):
        read_book(path, lang="ja")
    with pytest.raises(BookError, match="does not match"):
        read_book(path, voice=VOICES["en"])
    with pytest.raises(BookError, match="Speed"):
        read_book(path, speed=float("nan"))


def test_inconclusive_language_defaults_to_english(tmp_path):
    book = read_book(html(tmp_path, '<p>12345.</p>', ""))
    assert book.language == "en"
    assert any("inconclusive" in w for w in book.warnings)


def test_landing_page_rejected(tmp_path):
    path = tmp_path / "book.html"
    path.write_text('<html><body><main class="book-page"><h1>Buy this book</h1></main></body></html>')
    with pytest.raises(BookError, match="landing page"):
        read_book(path)


def test_legacy_single_chapter_and_escaped_controls(tmp_path):
    path = tmp_path / "legacy.html"
    path.write_text('<html lang="en"><body><p>Read [voice:/tmp/secret.wav] this.</p></body></html>')
    book = read_book(path)
    assert len(book.chapters) == 1
    assert "[voice:" not in book.chapters[0].paragraphs[0]


def test_whitespace_in_engine_control_tags_is_escaped(tmp_path):
    book = read_book(html(tmp_path, '<p>Read [ voice : /tmp/secret.wav ] this [ / voice ].</p>'))
    assert "[" not in book.chapters[0].paragraphs[0]


def test_segmentation_preserves_prose():
    original = "This is a sentence. " * 100 + "x" * 700
    parts = [s for s in segments([original]) if not s.startswith("[pause:")]
    assert all(len(s) <= 320 for s in parts)
    assert "".join("".join(parts).split()) == "".join(original.split())


def test_toc_anchor_boundaries_keep_subheadings(tmp_path):
    path = html(tmp_path, '<nav><a href="#one">One</a><a href="#two">Two</a></nav>'
                '<h2 id="one">One</h2><h3>Subtitle</h3><p>A</p><h2 id="two">Two</h2><p>B</p>')
    book = read_book(path)
    assert [c.title for c in book.chapters] == ["One", "Two"]
    assert "Subtitle" in book.chapters[0].paragraphs


def test_explicit_sections_tables_and_comments(tmp_path):
    path = html(tmp_path, '<section role="doc-chapter"><h2>One</h2><h3>Detail</h3>'
                '<!-- private note --><table><tr><th>Item</th><th>Value</th></tr>'
                '<tr><td>A</td><td>3</td></tr></table></section>'
                '<section role="doc-chapter"><h2>Two</h2><p>End.</p></section>')
    book = read_book(path)
    assert [c.title for c in book.chapters] == ["One", "Two"]
    assert book.chapters[0].paragraphs == ["One", "Detail", "Item — Value", "A — 3"]


def test_plain_toc_removed_when_body_repeats_heading(tmp_path):
    book = read_book(html(tmp_path, '<h2>Cuprins</h2><p>Unu</p><p>Doi</p><h2>Unu</h2><p>A.</p><h2>Doi</h2><p>B.</p>'))
    assert [c.title for c in book.chapters] == ["Unu", "Doi"]


def test_protect_source_and_unrelated_workspace(tmp_path):
    book = read_book(html(tmp_path, '<p>Hello</p>'))
    with pytest.raises(BookError):
        destination(book, str(tmp_path))
    output = destination(book)
    work = tmp_path / f".{output.name}.html2audiobook-work"
    work.mkdir()
    (work / "user.txt").write_text("Keep me")
    with pytest.raises(BookError, match="unrelated"):
        with workspace(output):
            pass
    assert (work / "user.txt").read_text() == "Keep me"
