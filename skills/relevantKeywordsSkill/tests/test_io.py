from __future__ import annotations

from relevantkeywords_skill.io import write_keywords


def test_write_keywords_creates_simple_comma_separated_file(tmp_path):
    source = tmp_path / "index.html"
    text_path = write_keywords(source, ["astrology", "zodiac"])

    assert text_path.name == "relevantKeywords.txt"
    assert text_path.read_text(encoding="utf-8") == "astrology, zodiac\n"
