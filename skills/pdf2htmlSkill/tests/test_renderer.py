from pathlib import Path

import pytest

from bs4 import BeautifulSoup

from pdf2html_skill.models import (
    EmbeddedFont,
    SourceEvidence,
    SourceImage,
    SourceLine,
    SourceLink,
    SourcePageEvidence,
    SourceRectangle,
    SourceStroke,
    SourceWord,
    TypographyProfile,
)
from pdf2html_skill.renderer import (
    _repair_merged_justified_paragraphs,
    _repair_continued_table_headers,
    build_styles,
    enhance_html,
)


def _evidence(
    words: list[tuple[str, bool, bool, float]],
    *,
    lines: tuple[SourceLine, ...] = (),
    links: tuple[SourceLink, ...] = (),
) -> SourceEvidence:
    source_words = tuple(
        SourceWord(text, text.casefold(), bold, italic, size, index, index + 1, 0, 10)
        for index, (text, bold, italic, size) in enumerate(words)
    )
    return SourceEvidence(
        typography=TypographyProfile(body_size_pt=10),
        pages=(SourcePageEvidence(1, 522, 756, source_words, lines, links),),
    )


def test_enhance_html_adds_semantics_and_local_styles(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text(
        '<html><head></head><body><h1>Title</h1><table><tr><td>A</td></tr></table><img src="assets/picture.png"></body></html>',
        encoding="utf-8",
    )

    enhance_html(
        html_path,
        stylesheet,
        _evidence(
            [
                ("Title", True, False, 24),
                ("A", False, False, 10),
            ]
        ),
        title="Document",
        language="ro",
        source_page_count=1,
        content_pages=[1],
    )

    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    assert soup.html["lang"] == "ro"
    assert soup.title.string == "Document"
    assert soup.find("meta", attrs={"name": "generator"})["content"] == "pdf2html-skill"
    assert "pdf-document" in soup.main["class"]
    assert soup.main.has_attr("data-reader-content")
    assert "--pdf-reader-size: var(--reader-font-size, var(--standalone-size, 10.00pt))" in soup.section["style"]
    assert "font-size: var(--pdf-reader-size)" in soup.section["style"]
    assert "table-scroll" in soup.table.parent["class"]
    assert soup.img["alt"] == ""
    assert soup.h1.get_text(strip=True) == "Title"
    assert soup.find("section", id="page_1")["aria-label"] == "PDF page 1"
    bridge = soup.find("script", id="pdf2html-reader-bridge")
    assert bridge is not None
    assert "axiologic-reader-settings" in bridge.string
    assert "--standalone-size" in bridge.string
    assert stylesheet.is_file()


def test_embedded_source_font_is_used_for_body_and_chapter_label(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text(
        "<html><body><p><strong>CHAPTER</strong> <strong>1</strong></p></body></html>",
        encoding="utf-8",
    )
    words = (
        SourceWord(
            "CHAPTER", "chapter", True, False, 9.5, 50, 98, 53, 63,
            "serif", "#b88b45", "Subset+EBGaramond-Bold",
        ),
        SourceWord(
            "1", "1", True, False, 9.5, 100, 105, 53, 63,
            "serif", "#b88b45", "Subset+EBGaramond-Bold",
        ),
    )
    evidence = SourceEvidence(
        typography=TypographyProfile(
            body_size_pt=10.5,
            body_family="serif",
            body_font_name="Subset+EBGaramond-Regular",
        ),
        pages=(SourcePageEvidence(1, 432, 648, words, (), ()),),
        fonts=(
            EmbeddedFont(
                "Subset+EBGaramond-Regular", "pdf-garamond", "fonts/regular.ttf"
            ),
            EmbeddedFont(
                "Subset+EBGaramond-Bold", "pdf-garamond", "fonts/bold.ttf", 700
            ),
        ),
    )

    enhance_html(
        html_path,
        stylesheet,
        evidence,
        title="Book",
        language="en",
        source_page_count=1,
        content_pages=[1],
    )

    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    assert 'font-family: "pdf-garamond"' in soup.p["style"]
    css = stylesheet.read_text(encoding="utf-8")
    assert '@font-face { font-family: "pdf-garamond"' in css
    assert 'font-family: "pdf-garamond", Georgia' in css


def test_table_uses_pdf_column_geometry_and_cell_colors(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text(
        "<html><body><table><tr><th>Concept</th><th>Explanation</th></tr>"
        "<tr><td>Law</td><td>Binding rule</td></tr></table></body></html>",
        encoding="utf-8",
    )
    words = (
        SourceWord(
            "Concept", "concept", True, False, 10, 10, 45, 5, 15,
            color="#ffffff",
        ),
        SourceWord(
            "Explanation", "explanation", True, False, 10, 70, 120, 5, 15,
            color="#ffffff",
        ),
        SourceWord("Law", "law", True, False, 10, 5, 20, 25, 35),
        SourceWord("Binding", "binding", False, False, 10, 70, 100, 25, 35),
        SourceWord("rule", "rule", False, False, 10, 103, 120, 25, 35),
    )
    rectangles = (
        SourceRectangle(0, 60, 0, 20, "#163052"),
        SourceRectangle(60, 120, 0, 20, "#163052"),
        SourceRectangle(0, 60, 20, 40, "#f6f1e7"),
        SourceRectangle(60, 120, 20, 40, "#eaf0f6"),
    )
    strokes = (
        SourceStroke(0, 120, 0, 0, "#c8cdd3"),
        SourceStroke(0, 120, 20, 20, "#c8cdd3"),
        SourceStroke(0, 120, 40, 40, "#c8cdd3"),
        SourceStroke(0, 0, 0, 40, "#c8cdd3"),
        SourceStroke(60, 60, 0, 40, "#c8cdd3"),
        SourceStroke(120, 120, 0, 40, "#c8cdd3"),
    )
    evidence = SourceEvidence(
        typography=TypographyProfile(body_size_pt=10),
        pages=(
            SourcePageEvidence(
                1, 120, 180, words, (), (), rectangles=rectangles, strokes=strokes
            ),
        ),
    )

    enhance_html(
        html_path,
        stylesheet,
        evidence,
        title="Table",
        language="en",
        source_page_count=1,
        content_pages=[1],
    )

    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    assert [column["style"] for column in soup.select("colgroup col")] == [
        "width: 50.00%",
        "width: 50.00%",
    ]
    assert "table-layout: fixed" in soup.table["style"]
    assert "background-color: #163052" in soup.th["style"]
    assert "color: #ffffff" in soup.th["style"]
    assert "background-color: #f6f1e7" in soup.td["style"]
    assert "border: 0" in soup.td["style"]
    assert "border-top: 0.50pt solid #c8cdd3" in soup.td["style"]
    assert "border-right: 0.50pt solid #c8cdd3" in soup.td["style"]
    assert "border-bottom: 0.50pt solid #c8cdd3" in soup.td["style"]
    assert "border-left: 0.50pt solid #c8cdd3" in soup.td["style"]


def test_table_preserves_horizontal_only_rules_and_clamps_subpixel_overflow(
    tmp_path: Path,
) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text(
        "<html><body><table><caption>Table signals</caption>"
        "<tr><th>Signal</th><th>Implication</th></tr>"
        "<tr><td>Aspirin</td><td>Rapid feedback</td></tr>"
        "<tr><td>Viagra</td><td>Immediate benefit</td></tr>"
        "<tr><td>Coffin</td><td>Inevitable demand</td></tr></table>"
        "<p>Page bounds</p></body></html>",
        encoding="utf-8",
    )
    words = (
        SourceWord("Table", "table", True, False, 9, 51.85, 75, 5, 14),
        SourceWord("signals", "signals", True, False, 9, 80, 112, 5, 14),
        SourceWord("Signal", "signal", True, False, 8, 57, 85, 25, 33),
        SourceWord("Implication", "implication", True, False, 8, 160, 210, 25, 33),
        SourceWord("Aspirin", "aspirin", True, False, 8, 57, 88, 45, 53),
        SourceWord("Rapid", "rapid", False, False, 9, 160, 185, 45, 54),
        SourceWord("feedback", "feedback", False, False, 9, 190, 230, 45, 54),
        SourceWord("Viagra", "viagra", True, False, 8, 57, 85, 65, 73),
        SourceWord("Immediate", "immediate", False, False, 9, 160, 205, 65, 74),
        SourceWord("benefit", "benefit", False, False, 9, 210, 242, 65, 74),
        SourceWord("Coffin", "coffin", True, False, 8, 57, 82, 85, 93),
        SourceWord("Inevitable", "inevitable", False, False, 9, 160, 205, 85, 94),
        SourceWord("demand", "demand", False, False, 9, 210, 245, 85, 94),
        SourceWord("Page", "page", False, False, 10, 51.85, 75, 120, 130),
        SourceWord("bounds", "bounds", False, False, 10, 350, 387.3, 120, 130),
    )
    rectangles = tuple(
        SourceRectangle(left, right, top, bottom, fill)
        for top, bottom, fill in (
            (20, 40, "#1c1b1a"),
            (40, 60, "#f5f0e7"),
            (60, 80, "#ffffff"),
            (80, 100, "#f5f0e7"),
        )
        for left, right in ((51.1, 153.1), (153.1, 387.1))
    )
    strokes = tuple(
        SourceStroke(51, 387, y, y, "#c9c2b8")
        for y in (20, 40, 60, 80, 100)
    )
    evidence = SourceEvidence(
        typography=TypographyProfile(body_size_pt=10),
        pages=(
            SourcePageEvidence(
                1,
                432,
                648,
                words,
                (),
                (),
                rectangles=rectangles,
                strokes=strokes,
            ),
        ),
    )
    enhance_html(
        html_path,
        stylesheet,
        evidence,
        title="Horizontal rules",
        language="en",
        source_page_count=1,
        content_pages=[1],
    )
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    assert "width: 99.94%" in soup.table["style"]
    assert "margin-left: 0.00%" in soup.table["style"]
    assert "margin-right: 0.06%" in soup.table["style"]
    assert "padding-left: 0.75pt" in soup.caption["style"]
    assert "position:" not in soup.caption["style"]
    for cell in soup.select("th, td"):
        assert "border-left: 0" in cell["style"]
        assert "border-right: 0" in cell["style"]
        assert "border-top: 0.50pt solid #c9c2b8" in cell["style"]
        assert "border-bottom: 0.50pt solid #c9c2b8" in cell["style"]


def test_table_preserves_source_indent_caption_style_and_borderless_rows(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text(
        "<html><body><table><caption>Table caption</caption>"
        "<tr><th>Concept</th><th>Meaning</th></tr>"
        "<tr><td>First</td><td>Explanation one</td></tr>"
        "<tr><td>Second</td><td>Explanation two</td></tr>"
        "</table><p>Body</p></body></html>",
        encoding="utf-8",
    )
    words = (
        SourceWord("Table", "table", True, False, 11, 10, 40, 5, 16, font_name="Play-Bold", color="#17324d"),
        SourceWord("caption", "caption", True, False, 11, 43, 90, 5, 16, font_name="Play-Bold", color="#17324d"),
        SourceWord("Concept", "concept", False, False, 8, 25, 55, 24, 32, color="#ffffff"),
        SourceWord("Meaning", "meaning", False, False, 8, 75, 110, 24, 32, color="#ffffff"),
        SourceWord("First", "first", False, False, 8, 25, 45, 44, 52, color="#17324d"),
        SourceWord("Explanation", "explanation", False, False, 8, 75, 125, 44, 52),
        SourceWord("one", "one", False, False, 8, 128, 145, 44, 52),
        SourceWord("Second", "second", False, False, 8, 25, 52, 64, 72, color="#17324d"),
        SourceWord("Explanation", "explanation", False, False, 8, 75, 125, 64, 72),
        SourceWord("two", "two", False, False, 8, 128, 145, 64, 72),
        SourceWord("Body", "body", False, False, 10, 10, 190, 90, 100),
    )
    rectangles = (
        SourceRectangle(20, 70, 20, 40, "#17324d"),
        SourceRectangle(70, 180, 20, 40, "#17324d"),
        SourceRectangle(20, 70, 60, 80, "#f6f8f9"),
        SourceRectangle(70, 180, 60, 80, "#f6f8f9"),
    )
    evidence = SourceEvidence(
        typography=TypographyProfile(body_size_pt=10, body_font_name="ArialMT"),
        pages=(SourcePageEvidence(1, 200, 180, words, (), (), rectangles=rectangles),),
        fonts=(EmbeddedFont("Play-Bold", "pdf-play", "fonts/play.ttf", 700),),
    )
    enhance_html(
        html_path,
        stylesheet,
        evidence,
        title="Table",
        language="en",
        source_page_count=1,
        content_pages=[1],
    )
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    assert "width: 88.89%" in soup.table["style"]
    assert "margin-left: 5.56%" in soup.table["style"]
    assert "left: -10.00pt" in soup.caption["style"]
    assert "text-align: left" in soup.caption["style"]
    assert "font-size: calc(var(--pdf-reader-size) * 1.1000)" in soup.caption["style"]
    assert 'font-family: "pdf-play"' in soup.caption["style"]
    assert "color: #17324d" in soup.caption["style"]
    assert all("border: 0" in cell["style"] for cell in soup.select("th, td"))
    assert [row["style"] for row in soup.select("tr")] == [
        "height: 20.00pt",
        "height: 20.00pt",
        "height: 20.00pt",
    ]


def test_rewrites_staging_image_path_and_marks_image_only_cover(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    image_path = tmp_path / "assets" / "images" / "cover.png"
    image_path.parent.mkdir(parents=True)
    image_path.write_bytes(b"png")
    html_path.write_text(
        f'<html><body><figure><img src="{image_path}"></figure></body></html>',
        encoding="utf-8",
    )
    evidence = SourceEvidence(
        typography=TypographyProfile(body_size_pt=10),
        pages=(SourcePageEvidence(1, 432, 648, (), (), ()),),
    )

    enhance_html(
        html_path,
        stylesheet,
        evidence,
        title="Cover",
        language="en",
        source_page_count=1,
        content_pages=[1],
    )

    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    assert soup.img["src"] == "assets/images/cover.png"
    assert "source-page-full-image" in soup.section["class"]


def test_page_padding_includes_image_above_first_text(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text(
        '<html><body><figure><img src="assets/figure.png"><figcaption>Caption</figcaption>'
        "</figure></body></html>",
        encoding="utf-8",
    )
    words = (
        SourceWord("Caption", "caption", False, False, 10, 20, 60, 100, 110),
    )
    evidence = SourceEvidence(
        typography=TypographyProfile(body_size_pt=10),
        pages=(
            SourcePageEvidence(
                1,
                120,
                180,
                words,
                (),
                (),
                images=(SourceImage(10, 110, 20, 90),),
            ),
        ),
    )

    enhance_html(
        html_path,
        stylesheet,
        evidence,
        title="Figure",
        language="en",
        source_page_count=1,
        content_pages=[1],
    )

    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    assert "--pdf-page-top: 16.67%" in soup.section["style"]
    assert "--pdf-page-left: 8.33%" in soup.section["style"]
    assert "font-style: italic" not in stylesheet.read_text(encoding="utf-8").split(
        "figcaption {", 1
    )[1].split("}", 1)[0]


def test_identical_paragraphs_do_not_share_source_geometry(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text(
        '<html><body><p>"No."</p><p>Middle</p><p>"No."</p></body></html>',
        encoding="utf-8",
    )
    words = (
        SourceWord("No", "no", False, False, 10, 10, 20, 10, 20),
        SourceWord("Middle", "middle", False, False, 10, 10, 40, 40, 50),
        SourceWord("No", "no", False, False, 10, 10, 20, 600, 610),
    )
    evidence = SourceEvidence(
        typography=TypographyProfile(body_size_pt=10),
        pages=(SourcePageEvidence(1, 120, 640, words, (), ()),),
    )

    enhance_html(
        html_path,
        stylesheet,
        evidence,
        title="Repeated text",
        language="en",
        source_page_count=1,
        content_pages=[1],
    )

    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    repeated = [paragraph for paragraph in soup.find_all("p") if "No" in paragraph.text]
    assert len(repeated) == 2
    assert all("min-height" not in paragraph.get("style", "") for paragraph in repeated)


def test_splits_paragraph_that_crosses_a_source_page_boundary(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text(
        '<div class="page"><h2>Section</h2><p>Alpha beta gamma delta</p></div>',
        encoding="utf-8",
    )
    first_words = (
        SourceWord("Section", "section", True, False, 14, 50, 100, 500, 515),
        SourceWord("Alpha", "alpha", False, False, 10, 50, 80, 530, 542),
        SourceWord("beta", "beta", False, False, 10, 85, 110, 530, 542),
    )
    second_words = (
        SourceWord("gamma", "gamma", False, False, 10, 50, 90, 60, 72),
        SourceWord("delta", "delta", False, False, 10, 95, 130, 60, 72),
    )
    evidence = SourceEvidence(
        typography=TypographyProfile(body_size_pt=10),
        pages=(
            SourcePageEvidence(1, 522, 756, first_words, (), ()),
            SourcePageEvidence(2, 522, 756, second_words, (), ()),
        ),
    )

    enhance_html(
        html_path,
        stylesheet,
        evidence,
        title="X",
        language="en",
        source_page_count=2,
        content_pages=[1, 2],
    )

    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    assert soup.select_one("#page_1 p").get_text(" ", strip=True) == "Alpha beta"
    assert soup.select_one("#page_2 p").get_text(" ", strip=True) == "gamma delta"


def test_preserves_multiline_source_paragraph_height(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text("<p>Alpha beta</p>", encoding="utf-8")
    words = (
        SourceWord("Alpha", "alpha", False, False, 10, 50, 80, 100, 110),
        SourceWord("beta", "beta", False, False, 10, 50, 75, 120, 130),
    )
    evidence = SourceEvidence(
        typography=TypographyProfile(body_size_pt=10),
        pages=(SourcePageEvidence(1, 522, 756, words, (), ()),),
    )
    enhance_html(
        html_path,
        stylesheet,
        evidence,
        title="X",
        language="en",
        source_page_count=1,
        content_pages=[1],
    )
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    assert "min-height: 30.00pt" in soup.p["style"]


def test_preserves_source_heading_family_and_color(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text("<h2>BLUE HEADING</h2>", encoding="utf-8")
    words = (
        SourceWord("BLUE", "blue", True, False, 18, 10, 40, 10, 28, "sans-serif", "#315f78"),
        SourceWord("HEADING", "heading", True, False, 18, 45, 100, 10, 28, "sans-serif", "#315f78"),
    )
    evidence = SourceEvidence(
        typography=TypographyProfile(body_size_pt=10, body_family="serif", text_color="#17232b"),
        pages=(SourcePageEvidence(1, 432, 648, words, (), ()),),
    )
    enhance_html(
        html_path,
        stylesheet,
        evidence,
        title="X",
        language="en",
        source_page_count=1,
        content_pages=[1],
    )
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    assert "font-family: Inter" in soup.h1["style"]
    assert "color: #315f78" in soup.h1["style"]


def test_external_links_are_hardened(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text("<p>Link now</p>", encoding="utf-8")
    enhance_html(
        html_path,
        stylesheet,
        _evidence(
            [("Link", False, False, 10), ("now", False, False, 10)],
            links=(SourceLink((0, 1), "https://example.com"),),
        ),
        title="X",
        language="und",
        source_page_count=1,
        content_pages=[1],
    )
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    assert soup.a["rel"] == ["noopener", "noreferrer"]
    assert len(soup.find_all("a")) == 1
    assert soup.a.get_text(" ", strip=True) == "Link now"


def test_styles_repeated_words_by_occurrence_not_globally(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text("<p>same same</p>", encoding="utf-8")
    enhance_html(
        html_path,
        stylesheet,
        _evidence([("same", True, False, 10), ("same", False, False, 10)]),
        title="X",
        language="und",
        source_page_count=1,
        content_pages=[1],
    )
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    assert soup.p.decode_contents() == "<strong>same</strong> same"


def test_demotes_body_sized_heading_without_changing_text(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text("<h2>NOT A HEADING</h2>", encoding="utf-8")
    enhance_html(
        html_path,
        stylesheet,
        _evidence([("NOT", True, False, 10), ("A", True, False, 10), ("HEADING", True, False, 10)]),
        title="X",
        language="und",
        source_page_count=1,
        content_pages=[1],
    )
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    assert soup.h2 is None
    assert soup.p.get_text(" ", strip=True) == "NOT A HEADING"


def test_does_not_center_body_indented_line_that_happens_to_be_symmetric(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text("<p>Alpha</p><p>Give me</p><p>Omega</p>", encoding="utf-8")
    words = (
        SourceWord("Alpha", "alpha", False, False, 10, 73.4, 130, 0, 10),
        SourceWord("Give", "give", False, False, 10, 73.4, 130, 20, 30),
        SourceWord("me", "me", False, False, 10, 390, 417.2, 20, 30),
        SourceWord("Omega", "omega", False, False, 10, 73.4, 140, 40, 50),
    )
    evidence = SourceEvidence(
        typography=TypographyProfile(body_size_pt=10),
        pages=(SourcePageEvidence(1, 522, 756, words, (), ()),),
    )
    enhance_html(
        html_path,
        stylesheet,
        evidence,
        title="X",
        language="und",
        source_page_count=1,
        content_pages=[1],
    )
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    target = next(item for item in soup.find_all("p") if item.get_text(" ", strip=True) == "Give me")
    assert "text-align: center" not in target.get("style", "")


def test_preserves_repeated_pdf_first_line_indent_without_indenting_lead_paragraph(
    tmp_path: Path,
) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    paragraphs = (
        ("Lead paragraph continues at the body edge", "and closes here.", 50.0),
        ("First indented paragraph begins from source", "and continues at the body edge.", 65.0),
        ("Second indented paragraph begins from source", "and continues at the body edge.", 65.0),
        ("Third indented paragraph begins from source", "and continues at the body edge.", 65.0),
        ("A short indented paragraph.", None, 65.0),
    )
    html_path.write_text(
        "<html><body>"
        + "".join(
            f"<p>{first}{' ' + second if second else ''}</p>"
            for first, second, _ in paragraphs
        )
        + "</body></html>",
        encoding="utf-8",
    )
    words: list[SourceWord] = []
    lines: list[SourceLine] = []
    for paragraph_index, (first, second, first_left) in enumerate(paragraphs):
        for line_index, (text, left) in enumerate(
            [(first, first_left), *(([(second, 50.0)] if second else []))]
        ):
            top = 40.0 + paragraph_index * 35.0 + line_index * 14.0
            lines.append(SourceLine(text, 10, left, 460, top, top + 10))
            cursor = left
            for raw_word in text.split():
                token = "".join(
                    character for character in raw_word.casefold() if character.isalnum()
                )
                width = max(12.0, len(raw_word) * 5.0)
                words.append(
                    SourceWord(
                        raw_word,
                        token,
                        False,
                        False,
                        10,
                        cursor,
                        cursor + width,
                        top,
                        top + 10,
                    )
                )
                cursor += width + 4.0
    evidence = SourceEvidence(
        typography=TypographyProfile(body_size_pt=10),
        pages=(SourcePageEvidence(1, 500, 700, tuple(words), tuple(lines), ()),),
    )
    enhance_html(
        html_path,
        stylesheet,
        evidence,
        title="Indented prose",
        language="en",
        source_page_count=1,
        content_pages=[1],
    )
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    rendered = soup.find_all("p")
    assert "text-indent" not in rendered[0].get("style", "")
    assert all("text-indent: 15.00pt" in item["style"] for item in rendered[1:])


def test_centers_display_line_when_geometry_does_not_match_body_indent(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text("<p>Alpha</p><p>NOTICE</p><p>Omega</p>", encoding="utf-8")
    words = (
        SourceWord("Alpha", "alpha", False, False, 10, 73.4, 130, 0, 10),
        SourceWord("NOTICE", "notice", False, False, 10, 220, 302, 20, 30),
        SourceWord("Omega", "omega", False, False, 10, 73.4, 140, 40, 50),
    )
    evidence = SourceEvidence(
        typography=TypographyProfile(body_size_pt=10),
        pages=(SourcePageEvidence(1, 522, 756, words, (), ()),),
    )
    enhance_html(
        html_path,
        stylesheet,
        evidence,
        title="X",
        language="und",
        source_page_count=1,
        content_pages=[1],
    )
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    target = next(item for item in soup.find_all("p") if item.get_text(strip=True) == "NOTICE")
    assert "text-align: center" in target["style"]


def test_footer_uses_lowest_centered_page_number_candidate(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text("<p>Reference 2206</p>", encoding="utf-8")
    words = (
        SourceWord("Reference", "reference", False, False, 10, 50, 100, 585, 595),
        SourceWord("2206", "2206", False, False, 10, 250, 275, 590, 600),
        SourceWord("86", "86", False, False, 8, 258, 268, 618, 628),
    )
    evidence = SourceEvidence(
        typography=TypographyProfile(body_size_pt=10),
        pages=(SourcePageEvidence(1, 522, 648, words, (), ()),),
    )
    enhance_html(
        html_path,
        stylesheet,
        evidence,
        title="X",
        language="en",
        source_page_count=1,
        content_pages=[1],
    )
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    assert soup.section["data-page-label"] == "86"


def test_footer_number_is_excluded_from_content_bottom_margin(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text("<p>Last content</p>", encoding="utf-8")
    words = (
        SourceWord("Last", "last", False, False, 10, 52, 72, 585, 596),
        SourceWord("content", "content", False, False, 10, 75, 115, 585, 596),
        SourceWord("2", "2", False, False, 9, 214, 218, 639, 648),
    )
    evidence = SourceEvidence(
        typography=TypographyProfile(body_size_pt=10),
        pages=(SourcePageEvidence(1, 432, 648, words, (), ()),),
    )
    enhance_html(
        html_path,
        stylesheet,
        evidence,
        title="X",
        language="en",
        source_page_count=1,
        content_pages=[1],
    )
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    assert soup.section["data-page-label"] == "2"
    assert "--pdf-page-bottom: 12.04%" in soup.section["style"]


def test_applies_consistent_size_and_centering_to_uppercase_notice_blocks(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text(
        "<p>TEMPORARY NOTICE CONTINUES</p><h2>CITIZENS REMINDED</h2>",
        encoding="utf-8",
    )
    words = (
        SourceWord("TEMPORARY", "temporary", False, False, 8.5, 68, 200, 0, 10),
        SourceWord("NOTICE", "notice", False, False, 8.5, 210, 445, 0, 10),
        SourceWord("CONTINUES", "continues", False, False, 8.5, 181, 348, 12, 22),
        SourceWord("CITIZENS", "citizens", False, False, 8.5, 80, 220, 30, 40),
        SourceWord("REMINDED", "reminded", False, False, 8.5, 240, 433, 30, 40),
    )
    evidence = SourceEvidence(
        typography=TypographyProfile(body_size_pt=12),
        pages=(SourcePageEvidence(1, 522, 756, words, (), ()),),
    )
    enhance_html(
        html_path,
        stylesheet,
        evidence,
        title="X",
        language="und",
        source_page_count=1,
        content_pages=[1],
    )
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    assert soup.h2 is None
    assert [item["style"] for item in soup.find_all("p")] == [
        "font-size: calc(var(--pdf-reader-size) * 0.7083); min-height: 22.00pt; text-align: center",
        "font-size: calc(var(--pdf-reader-size) * 0.7083); text-align: center",
    ]


def test_repairs_merged_single_column_table_from_pdf_lines(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text(
        "<table><tr><td>FIRST ........ 1 SECOND ........ 2</td></tr></table>",
        encoding="utf-8",
    )
    lines = (SourceLine("FIRST ........ 1", 10), SourceLine("SECOND ........ 2", 10))
    enhance_html(
        html_path,
        stylesheet,
        _evidence(
            [("FIRST", False, False, 10), ("1", False, False, 10), ("SECOND", False, False, 10), ("2", False, False, 10)],
            lines=lines,
        ),
        title="X",
        language="und",
        source_page_count=1,
        content_pages=[1],
    )
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    assert [cell.get_text(" ", strip=True) for cell in soup.find_all("td")] == [
        "FIRST ........ 1",
        "SECOND ........ 2",
    ]
    assert soup.find("section", id="page_1") is not None


def test_renders_linked_contents_as_borderless_leader_rows(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text(
        "<table><tr><td>FIRST CHAPTER........1</td></tr>"
        "<tr><td>SECOND CHAPTER........12</td></tr></table>",
        encoding="utf-8",
    )
    enhance_html(
        html_path,
        stylesheet,
        _evidence(
            [
                ("FIRST", False, False, 10),
                ("CHAPTER", False, False, 10),
                ("1", False, False, 10),
                ("SECOND", False, False, 10),
                ("CHAPTER", False, False, 10),
                ("12", False, False, 10),
            ],
            links=(
                SourceLink((0, 1, 2), "#page_1"),
                SourceLink((3, 4, 5), "#page_12"),
            ),
        ),
        title="X",
        language="und",
        source_page_count=1,
        content_pages=[1],
    )
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    assert "toc-table" in soup.table["class"]
    assert [item.get_text(" ", strip=True) for item in soup.select(".toc-title")] == [
        "FIRST CHAPTER",
        "SECOND CHAPTER",
    ]
    assert [item.get_text(strip=True) for item in soup.select(".toc-page")] == ["1", "12"]
    assert all(item["aria-hidden"] == "true" for item in soup.select(".toc-leader"))


def test_rebuilds_multicolumn_contents_without_absorbing_footnote(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text(
        "<h1>Contents</h1><table><tr><td>broken</td><td>1</td></tr></table>"
        "<p>Page numbers refer to the body.</p>",
        encoding="utf-8",
    )
    lines = (
        SourceLine("Contents", 18, 50, 130, 50, 70),
        SourceLine("PART I: PATTERNS", 9, 54, 190, 100, 112),
        SourceLine("1. A long chapter title 1", 10, 72, 377, 126, 138),
        SourceLine("continued here", 10, 59, 180, 151, 163),
        SourceLine("2. A second chapter 8", 10, 72, 377, 190, 202),
        SourceLine("Page numbers refer to the body.", 8.5, 50, 300, 556, 568),
    )
    words = [
        ("Contents", True, False, 18),
        ("PART", True, False, 9),
        ("I", True, False, 9),
        ("PATTERNS", True, False, 9),
        ("1", False, False, 10),
        ("A", False, False, 10),
        ("long", False, False, 10),
        ("chapter", False, False, 10),
        ("title", False, False, 10),
        ("1", False, False, 10),
        ("continued", False, False, 10),
        ("here", False, False, 10),
        ("2", False, False, 10),
        ("A", False, False, 10),
        ("second", False, False, 10),
        ("chapter", False, False, 10),
        ("8", False, False, 10),
        ("Page", False, True, 8.5),
        ("numbers", False, True, 8.5),
        ("refer", False, True, 8.5),
        ("to", False, True, 8.5),
        ("the", False, True, 8.5),
        ("body", False, True, 8.5),
    ]
    enhance_html(
        html_path,
        stylesheet,
        _evidence(words, lines=lines),
        title="X",
        language="en",
        source_page_count=1,
        content_pages=[1],
    )
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    assert soup.select_one(".toc-title").get_text(" ", strip=True) == "1. A long chapter title continued here"
    assert soup.select_one(".toc-page").get_text(strip=True) == "1"
    assert "Page numbers" not in soup.select_one(".toc-title").get_text(" ", strip=True)


def test_rebuilds_table_of_contents_with_dotted_rows_and_pdf_indentation(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text(
        "<h2>Table of Contents</h2><table>"
        "<tr><th>PART I....1</th><td></td></tr>"
        "<tr><th>CHAPTER 1....2</th><td></td></tr>"
        "<tr><th>INTERLUDE I....15</th><td></td></tr>"
        "</table>",
        encoding="utf-8",
    )
    lines = (
        SourceLine("Table of Contents", 16, 56, 175, 50, 70),
        SourceLine("PART I: PERFECT KINDNESS........................1", 9, 56, 383, 81, 92),
        SourceLine("CHAPTER 1 - The Bowl That Listened..............2", 9, 74, 383, 98, 109),
        SourceLine("INTERLUDE I - The Coat Was Red.................15", 9, 92, 383, 115, 126),
    )
    enhance_html(
        html_path,
        stylesheet,
        _evidence(
            [
                ("Table", True, False, 16),
                ("of", True, False, 16),
                ("Contents", True, False, 16),
                ("PART", True, False, 9),
                ("I", True, False, 9),
                ("PERFECT", True, False, 9),
                ("KINDNESS", True, False, 9),
                ("1", True, False, 9),
                ("CHAPTER", False, False, 9),
                ("1", False, False, 9),
                ("The", False, False, 9),
                ("Bowl", False, False, 9),
                ("That", False, False, 9),
                ("Listened", False, False, 9),
                ("2", False, False, 9),
                ("INTERLUDE", False, False, 9),
                ("I", False, False, 9),
                ("The", False, False, 9),
                ("Coat", False, False, 9),
                ("Was", False, False, 9),
                ("Red", False, False, 9),
                ("15", False, False, 9),
            ],
            lines=lines,
        ),
        title="X",
        language="en",
        source_page_count=1,
        content_pages=[1],
    )
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    assert soup.select_one("table.toc-table") is not None
    assert soup.select_one("table.toc-table th") is None
    assert [item.get_text(" ", strip=True) for item in soup.select(".toc-page")] == ["1", "2", "15"]
    assert soup.select(".toc-entry-row")[0]["style"] == "--toc-indent: 18.00pt"
    assert soup.select(".toc-entry-row")[1]["style"] == "--toc-indent: 36.00pt"


def test_rebuilds_plain_contents_as_list_and_joins_wrapped_title(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text(
        "<h2>Contents</h2><table>"
        "<tr><td>Chapter 1. First</td></tr>"
        "<tr><td>Chapter 11. Affective Tempo May Change Human</td></tr>"
        "<tr><td>Communication</td></tr>"
        "<tr><td>References</td></tr>"
        "</table>",
        encoding="utf-8",
    )
    lines = (
        SourceLine("Contents", 17, 13, 80, 4, 21),
        SourceLine("Chapter 1. First", 10, 13, 120, 35, 45),
        SourceLine("Chapter 11. Affective Tempo May Change Human", 10, 13, 300, 52, 62),
        SourceLine("Communication", 10, 13, 100, 65, 75),
        SourceLine("References", 10, 13, 80, 82, 92),
    )
    enhance_html(
        html_path,
        stylesheet,
        _evidence(
            [
                ("Contents", True, False, 17),
                ("Chapter", False, False, 10),
                ("1", False, False, 10),
                ("First", False, False, 10),
                ("Chapter", False, False, 10),
                ("11", False, False, 10),
                ("Affective", False, False, 10),
                ("Tempo", False, False, 10),
                ("May", False, False, 10),
                ("Change", False, False, 10),
                ("Human", False, False, 10),
                ("Communication", False, False, 10),
                ("References", False, False, 10),
            ],
            lines=lines,
        ),
        title="X",
        language="en",
        source_page_count=1,
        content_pages=[1],
    )
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    assert soup.select_one("nav.contents-list") is not None
    assert soup.table is None
    assert [entry.get_text(" ", strip=True) for entry in soup.select(".contents-list-entry")] == [
        "Chapter 1. First",
        "Chapter 11. Affective Tempo May Change Human Communication",
        "References",
    ]


def test_demotes_false_header_at_start_of_continued_table_page() -> None:
    soup = BeautifulSoup(
        '<main><section class="source-page"><div class="table-scroll"><table>'
        "<tr><th>Candidate</th><th>Assessment</th></tr>"
        "<tr><td>Prior row</td><td>Prior assessment</td></tr>"
        '</table></div></section><section class="source-page"><div class="table-scroll"><table>'
        "<tr><th>Version grief</th><th>Plausible</th></tr>"
        "<tr><td>Synthetic discomfort</td><td>Uncertain</td></tr>"
        "</table></div></section></main>",
        "html.parser",
    )
    _repair_continued_table_headers(soup.main)
    first_row = soup.select("section")[1].select_one("tr")
    assert first_row.find("th") is None
    assert [cell.name for cell in first_row.find_all(recursive=False)] == ["td", "td"]


def test_recovers_paragraphs_from_short_final_lines_in_justified_prose(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    texts = (
        "First paragraph starts here and fills the line",
        "before it ends early.",
        "Second paragraph also fills a complete justified line",
        "and has its own short ending.",
        "Third paragraph is the final passage on this page.",
    )
    html_path.write_text(
        "<html><body><p>" + " ".join(texts) + "</p></body></html>",
        encoding="utf-8",
    )
    words: list[SourceWord] = []
    lines: list[SourceLine] = []
    for line_index, line_text in enumerate(texts):
        top = 60 + line_index * 15
        x1 = 470 if line_index in (0, 2) else (180 if line_index in (1, 3) else 310)
        lines.append(SourceLine(line_text, 10, 50, x1, top, top + 10))
        line_words = line_text.split()
        for word_index, word in enumerate(line_words):
            words.append(
                SourceWord(
                    word,
                    "".join(character for character in word.casefold() if character.isalnum()),
                    False,
                    False,
                    10,
                    50 + word_index * 20,
                    68 + word_index * 20,
                    top,
                    top + 10,
                )
            )
    evidence = SourceEvidence(
        typography=TypographyProfile(body_size_pt=10),
        pages=(SourcePageEvidence(1, 522, 756, tuple(words), tuple(lines), ()),),
    )
    enhance_html(
        html_path,
        stylesheet,
        evidence,
        title="Book",
        language="en",
        source_page_count=1,
        content_pages=[1],
    )
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    paragraphs = soup.select("p.source-paragraph-repaired")
    assert len(paragraphs) == 3
    assert paragraphs[0].get_text(" ", strip=True).endswith("ends early.")
    assert paragraphs[1].get_text(" ", strip=True).startswith("Second paragraph")
    assert all("margin-bottom: 0" in paragraph["style"] for paragraph in paragraphs)


def test_recovers_dialogue_page_with_sparse_justified_right_edges(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    texts = (
        "A long opening line reaches the stable justified right edge",
        "and this is its short ending.",
        '"A short line of dialogue."',
        '"Another short reply."',
        "A second long narrative line reaches the same right edge",
        "and ends here.",
        '"Question?"',
        '"Answer."',
        "A third long narrative line reaches the same right edge",
        "with another ending.",
        '"More dialogue."',
        "A fourth long narrative line reaches the same right edge",
        "and closes the page.",
    )
    html_path.write_text(
        "<html><body><p>" + " ".join(texts) + "</p></body></html>",
        encoding="utf-8",
    )
    words: list[SourceWord] = []
    lines: list[SourceLine] = []
    full_lines = {0, 4, 8, 11}
    for line_index, line_text in enumerate(texts):
        top = 60 + line_index * 15
        x1 = 470 if line_index in full_lines else 220 + line_index
        lines.append(SourceLine(line_text, 10, 50, x1, top, top + 10))
        for word_index, word in enumerate(line_text.split()):
            token = "".join(character for character in word.casefold() if character.isalnum())
            words.append(
                SourceWord(
                    word, token, False, False, 10,
                    50 + word_index * 20, 68 + word_index * 20, top, top + 10,
                )
            )
    evidence = SourceEvidence(
        typography=TypographyProfile(body_size_pt=10),
        pages=(SourcePageEvidence(1, 522, 756, tuple(words), tuple(lines), ()),),
    )
    enhance_html(
        html_path,
        stylesheet,
        evidence,
        title="Book",
        language="en",
        source_page_count=1,
        content_pages=[1],
    )
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    paragraphs = soup.select("p.source-paragraph-repaired")
    assert len(paragraphs) >= 8
    assert any(paragraph.get_text(strip=True) == '"Question?"' for paragraph in paragraphs)


def test_merges_false_block_break_before_recovering_source_paragraphs() -> None:
    soup = BeautifulSoup(
        "<section><p>The opening paragraph reaches the right edge while</p>"
        "<p>it continues here and ends. A second paragraph begins. "
        '"A reply follows." More narrative follows here. "The final reply."</p></section>',
        "html.parser",
    )
    line_texts = (
        "The opening paragraph reaches the right edge while",
        "it continues here and ends.",
        "A second paragraph begins.",
        '"A reply follows."',
        "More narrative follows here.",
        '"The final reply."',
    )
    lines = tuple(
        SourceLine(
            text,
            10,
            50,
            470 if index == 0 else 180 + index * 10,
            60 + index * 15,
            70 + index * 15,
        )
        for index, text in enumerate(line_texts)
    )
    page = SourcePageEvidence(1, 522, 756, (), lines, ())
    assert _repair_merged_justified_paragraphs(
        soup, soup.section, page, 470 / 522
    )
    paragraphs = soup.section.find_all("p", recursive=False)
    assert paragraphs[0].get_text(" ", strip=True) == (
        "The opening paragraph reaches the right edge while "
        "it continues here and ends."
    )
    assert paragraphs[1].get_text(" ", strip=True) == "A second paragraph begins."


def test_recovers_boundary_inside_short_three_line_block() -> None:
    soup = BeautifulSoup(
        "<section><p>A sentence fills the first justified line and continues "
        "until this short ending. A separate final paragraph.</p></section>",
        "html.parser",
    )
    lines = (
        SourceLine(
            "A sentence fills the first justified line and continues",
            10, 50, 470, 60, 70,
        ),
        SourceLine("until this short ending.", 10, 50, 190, 75, 85),
        SourceLine("A separate final paragraph.", 10, 50, 210, 90, 100),
    )
    page = SourcePageEvidence(1, 522, 756, (), lines, ())
    assert _repair_merged_justified_paragraphs(
        soup, soup.section, page, 470 / 522
    )
    assert [
        paragraph.get_text(" ", strip=True)
        for paragraph in soup.section.find_all("p", recursive=False)
    ] == [
        "A sentence fills the first justified line and continues until this short ending.",
        "A separate final paragraph.",
    ]


def test_preserves_centered_title_page_vertical_rhythm_and_rule(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text(
        "<html><body><h1>BOOK TITLE</h1><p>A subtitle</p><p>A distant note</p></body></html>",
        encoding="utf-8",
    )
    words = (
        SourceWord("BOOK", "book", True, False, 28, 120, 250, 60, 88),
        SourceWord("TITLE", "title", True, False, 28, 255, 402, 60, 88),
        SourceWord("A", "a", False, False, 14, 190, 205, 108, 122),
        SourceWord("subtitle", "subtitle", False, False, 14, 210, 332, 108, 122),
        SourceWord("A", "a", False, False, 10, 205, 213, 230, 240),
        SourceWord("distant", "distant", False, False, 10, 218, 270, 230, 240),
        SourceWord("note", "note", False, False, 10, 275, 317, 230, 240),
    )
    evidence = SourceEvidence(
        typography=TypographyProfile(body_size_pt=10),
        pages=(
            SourcePageEvidence(
                1,
                522,
                756,
                words,
                (),
                (),
                strokes=(SourceStroke(50, 472, 96, 96, "#4f81bd", 0.5),),
            ),
        ),
    )
    enhance_html(
        html_path,
        stylesheet,
        evidence,
        title="Book",
        language="en",
        source_page_count=1,
        content_pages=[1],
    )
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    assert "border-bottom: 0.50pt solid #4f81bd" in soup.h1["style"]
    assert "padding-bottom: 8.00pt" in soup.h1["style"]
    assert "margin-bottom: 12.00pt" in soup.h1["style"]
    assert "margin-bottom: 108.00pt" in soup.find_all("p")[0]["style"]

    # The same title page without a source stroke must not acquire a rule.
    html_path.write_text(
        "<html><body><h1>BOOK TITLE</h1><p>A subtitle</p><p>A distant note</p></body></html>",
        encoding="utf-8",
    )
    enhance_html(
        html_path,
        stylesheet,
        SourceEvidence(
            typography=TypographyProfile(body_size_pt=10),
            pages=(SourcePageEvidence(1, 522, 756, words, (), ()),),
        ),
        title="Book",
        language="en",
        source_page_count=1,
        content_pages=[1],
    )
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    assert "border-bottom" not in soup.h1.get("style", "")
    assert "padding-bottom" not in soup.h1.get("style", "")


@pytest.mark.parametrize("rule_top", [None, 33, 88, 140])
def test_left_heading_rule_requires_stroke_between_heading_and_prose(tmp_path: Path, rule_top: int | None) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text("<html><body><h1>Chapter title</h1><p>Opening prose.</p></body></html>", encoding="utf-8")
    words = (
        SourceWord("Chapter", "chapter", True, False, 20, 52, 120, 59, 79),
        SourceWord("title", "title", True, False, 20, 125, 170, 59, 79),
        SourceWord("Opening", "opening", False, False, 10, 52, 95, 103, 113),
        SourceWord("prose.", "prose", False, False, 10, 100, 135, 103, 113),
    )
    strokes = () if rule_top is None else (SourceStroke(52, 380, rule_top, rule_top, "#b7a06a", 0.5),)
    enhance_html(
        html_path, stylesheet,
        SourceEvidence(typography=TypographyProfile(body_size_pt=10), pages=(SourcePageEvidence(1, 432, 648, words, (), (), strokes=strokes),)),
        title="Book", language="en", source_page_count=1, content_pages=[1],
    )
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    style = soup.h1.get("style", "")
    if rule_top == 88:
        assert "border-bottom: 0.50pt solid #b7a06a" in style
        assert "padding-bottom: 9.00pt" in style
        assert "margin-bottom: 15.00pt" in style
    else:
        assert "border-bottom" not in style
        assert "padding-bottom" not in style


def test_centered_rhythm_does_not_jump_over_body_paragraphs(tmp_path: Path) -> None:
    html_path = tmp_path / "index.html"
    stylesheet = tmp_path / "assets" / "styles.css"
    html_path.write_text(
        "<html><body><h1>A CITY AT THE HORIZON</h1>"
        "<p>Opening body text.</p>"
        "<p>NOVELTY CONSUMPTION IS NOT AN EMERGENCY.</p>"
        "<p>PLEASE ENJOY IT.</p></body></html>",
        encoding="utf-8",
    )
    words = (
        SourceWord("A", "a", True, False, 18, 153, 165, 62, 80),
        SourceWord("CITY", "city", True, False, 18, 170, 220, 62, 80),
        SourceWord("AT", "at", True, False, 18, 225, 250, 62, 80),
        SourceWord("THE", "the", True, False, 18, 255, 295, 62, 80),
        SourceWord("HORIZON", "horizon", True, False, 18, 300, 376, 62, 80),
        SourceWord("Opening", "opening", False, False, 10, 56, 105, 97, 107),
        SourceWord("body", "body", False, False, 10, 109, 136, 97, 107),
        SourceWord("text", "text", False, False, 10, 140, 165, 97, 107),
        SourceWord("NOVELTY", "novelty", False, False, 8.5, 157, 200, 288, 297),
        SourceWord("CONSUMPTION", "consumption", False, False, 8.5, 204, 270, 288, 297),
        SourceWord("IS", "is", False, False, 8.5, 274, 283, 288, 297),
        SourceWord("NOT", "not", False, False, 8.5, 287, 305, 288, 297),
        SourceWord("AN", "an", False, False, 8.5, 309, 322, 288, 297),
        SourceWord("EMERGENCY", "emergency", False, False, 8.5, 326, 365, 288, 297),
        SourceWord("PLEASE", "please", False, False, 8.5, 220, 255, 307, 316),
        SourceWord("ENJOY", "enjoy", False, False, 8.5, 259, 288, 307, 316),
        SourceWord("IT", "it", False, False, 8.5, 292, 302, 307, 316),
    )
    evidence = SourceEvidence(
        typography=TypographyProfile(body_size_pt=10),
        pages=(SourcePageEvidence(1, 522, 756, words, (), ()),),
    )

    enhance_html(
        html_path,
        stylesheet,
        evidence,
        title="Book",
        language="en",
        source_page_count=1,
        content_pages=[1],
    )

    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    heading_style = str(soup.h1.get("style", ""))
    notice_style = str(soup.find_all("p")[1].get("style", ""))
    assert "margin-bottom" not in heading_style
    assert "margin-bottom: 10.00pt" in notice_style


def test_screen_html_preserves_full_page_aspect_and_source_whitespace() -> None:
    styles = build_styles(_evidence([("text", False, False, 10)]))
    screen_styles = styles.split("@media print", maxsplit=1)[0]
    assert "h1 { border-bottom: 0; }" in screen_styles
    assert ".source-page > h1:first-child" not in screen_styles
    assert "min-height: var(--pdf-page-height)" not in screen_styles
    assert "break-before: page" not in screen_styles
    assert "max-width: min(800px, var(--pdf-page-width))" in screen_styles
    assert "background-color: #f5f5f5" in screen_styles
    assert "--pdf-page-aspect: 522.00 / 756.00" in screen_styles
    assert "aspect-ratio: var(--pdf-page-aspect)" in screen_styles
    assert "padding: var(--pdf-page-top, 2rem)" in screen_styles
    assert "margin-bottom: 1.5rem" in screen_styles
    assert "box-shadow: 0 1px 8px rgba(0, 0, 0, 0.12)" in screen_styles
    assert "text-align: justify" in screen_styles
    assert "font-size: var(--standalone-size, var(--pdf-body-size))" in screen_styles
    assert ".toc-table td { padding: 0; border: 0; }" in screen_styles
    assert ".toc-table td:last-child" not in screen_styles
    assert ".table-scroll { width: 100%; max-width: 100%; overflow-x: auto; }" in screen_styles
    assert "table { width: 100%; max-width: 100%;" in screen_styles
    assert ".source-page::after" in screen_styles
    assert "content: attr(data-page-label)" in screen_styles
    assert "border-top" not in screen_styles
    assert "min-height: var(--pdf-page-height)" in styles.split("@media print", maxsplit=1)[1]
