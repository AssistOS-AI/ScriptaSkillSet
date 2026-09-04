from __future__ import annotations

from pathlib import Path

from bs4 import BeautifulSoup


GENERATOR_NAME = "pdf2html-skill"
MARKER_NAME = ".pdf2html-skill"


def is_owned_html(path: Path) -> bool:
    if not path.is_file():
        return False
    try:
        soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    except Exception:
        return False
    generator = (
        soup.head.find("meta", attrs={"name": "generator"}) if soup.head else None
    )
    return bool(generator and generator.get("content") == GENERATOR_NAME)


def write_output_marker(destination: Path) -> None:
    assets = destination / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    (assets / MARKER_NAME).write_text(GENERATOR_NAME + "\n", encoding="utf-8")


def _has_output_marker(destination: Path) -> bool:
    marker = destination / "assets" / MARKER_NAME
    try:
        return marker.read_text(encoding="utf-8").strip() == GENERATOR_NAME
    except (OSError, UnicodeError):
        return False


def _is_legacy_incomplete_output(destination: Path) -> bool:
    """Recognize generated assets left by versions that predate the marker file."""
    report = destination / ".pdf2html-qa" / "report.json"
    stylesheet = destination / "assets" / "styles.css"
    if not report.is_file() or not stylesheet.is_file():
        return False
    try:
        css = stylesheet.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return False
    return "--pdf-page-aspect:" in css and "main.pdf-document" in css


def is_owned_output(
    destination: Path, *, allow_legacy_incomplete: bool = False
) -> bool:
    index = destination / "index.html"
    if index.exists():
        return is_owned_html(index)
    if _has_output_marker(destination):
        return True
    return allow_legacy_incomplete and _is_legacy_incomplete_output(destination)
