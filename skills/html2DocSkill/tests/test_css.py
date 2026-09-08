from __future__ import annotations

from pathlib import Path

from bs4 import BeautifulSoup

from html2doc_skill.css import StyleResolver, color_hex, points


def test_css_cascade_variables_and_lengths(tmp_path: Path) -> None:
    source = tmp_path / "index.html"
    source.write_text(
        "<html><head><style>:root{--base:12pt}p{font-size:var(--base);color:#abc} .lead{font-size:2em}</style></head>"
        "<body><main data-reader-content><p class='lead' style='text-align:center'>Text</p></main></body></html>",
        encoding="utf-8",
    )
    soup = BeautifulSoup(source.read_text(), "html.parser")
    resolver = StyleResolver(soup, source)
    paragraph = soup.p
    assert resolver.resolve(paragraph, "text-align") == "center"
    assert points(resolver.resolve(paragraph, "font-size"), base=12) == 24
    assert color_hex(resolver.resolve(paragraph, "color")) == "AABBCC"


def test_length_and_color_helpers() -> None:
    assert points("96px") == 72
    assert round(points("25.4mm") or 0) == 72
    assert color_hex("rgb(1, 2, 255)") == "0102FF"
