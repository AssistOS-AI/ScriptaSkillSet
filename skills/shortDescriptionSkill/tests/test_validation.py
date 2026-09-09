from __future__ import annotations

from pathlib import Path

from shortdescription_skill.core import file_sha256
from shortdescription_skill.validation import validate_short_description


def _files(tmp_path: Path, paragraph: str) -> tuple[Path, Path]:
    source = tmp_path / "source.html"
    source.write_text('<html lang="en"><body><p>Evidence and uncertainty shape public judgment.</p></body></html>', encoding="utf-8")
    target = tmp_path / "shortDescription.html"
    target.write_text(
        f'''<!doctype html><html lang="en"><head>
        <meta name="short-description-generator" content="shortdescription-skill">
        <meta name="short-description-source-sha256" content="{file_sha256(source)}"></head>
        <body><article data-short-description><p>{paragraph}</p></article></body></html>''',
        encoding="utf-8",
    )
    return source, target


def test_valid_description_passes(tmp_path: Path) -> None:
    source, target = _files(tmp_path, "Evidence shapes judgment. Uncertainty creates tension. The document explores public claims. Its theme concerns interpretation.")
    assert validate_short_description(source, target)["status"] == "passed"


def test_three_sentences_fail(tmp_path: Path) -> None:
    source, target = _files(tmp_path, "Evidence shapes judgment. Uncertainty creates tension. Its theme concerns interpretation.")
    report = validate_short_description(source, target)
    assert report["status"] == "failed"
    assert any(item["code"] == "sentence-count" for item in report["findings"])
