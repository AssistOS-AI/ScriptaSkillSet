from __future__ import annotations

import os
from pathlib import Path

import pytest
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Image as ReportImage
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from pdf2html_skill.batch import convert_many_in_place


pytestmark = pytest.mark.integration


def _fixture_pdf(path: Path) -> None:
    pixel_image = path.with_suffix(".png")
    image = Image.new("RGB", (600, 180), "#dbeafe")
    ImageDraw.Draw(image).text((30, 70), "PIXELS_ONLY_TOKEN", fill="#172033")
    image.save(pixel_image)

    styles = getSampleStyleSheet()
    story = [
        Paragraph("Semantic conversion fixture", styles["Title"]),
        Paragraph("A paragraph with <b>bold</b> and <i>italic</i> content.", styles["BodyText"]),
        Spacer(1, 12),
        Table(
            [["Merged heading", ""], ["Alpha", "Beta"]],
            colWidths=[180, 180],
            style=TableStyle([
                ("SPAN", (0, 0), (1, 0)),
                ("GRID", (0, 0), (-1, -1), 1, colors.black),
                ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
            ]),
        ),
        Spacer(1, 18),
        ReportImage(str(pixel_image), width=300, height=90),
    ]
    SimpleDocTemplate(str(path), pagesize=A4).build(story)


@pytest.mark.skipif(
    os.environ.get("RUN_PDF2HTML_INTEGRATION") != "1",
    reason="Set RUN_PDF2HTML_INTEGRATION=1 to run Docling and Chromium.",
)
def test_full_conversion_preserves_image_as_image(tmp_path: Path) -> None:
    destination = tmp_path / "en"
    destination.mkdir()
    source = destination / "book.pdf"
    _fixture_pdf(source)

    result = convert_many_in_place(
        [], invocation_dir=destination, keep_qa_artifacts=True
    )
    manifest = result["books"][0]

    html = (destination / "index.html").read_text(encoding="utf-8")
    assert manifest["validation"]["status"] != "failed"
    assert "<table" in html
    assert "<img" in html
    assert "<strong>bold</strong>" in html
    assert "<em>italic</em>" in html
    assert "PIXELS_ONLY_TOKEN" not in html
    assert 'id="page_1"' in html
    assert manifest["artifact"] == str(destination / "index.html")
    assert not (destination / "manifest.json").exists()
    assert not (destination / "qa").exists()
    assert source.is_file()
    assert (destination / ".pdf2html-qa" / "report.json").is_file()

    with sync_playwright() as manager:
        browser = manager.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto((destination / "index.html").as_uri(), wait_until="load")
        page.evaluate(
            "window.postMessage({type: 'axiologic-reader-settings', fontSize: 1.16}, '*')"
        )
        page.wait_for_function(
            "getComputedStyle(document.documentElement).getPropertyValue('--standalone-size').trim() === '1.16rem'"
        )
        normal_sizes = page.locator("h1, p, th, td").evaluate_all(
            "nodes => nodes.map(node => parseFloat(getComputedStyle(node).fontSize))"
        )
        page.evaluate(
            "window.postMessage({type: 'axiologic-reader-settings', fontSize: 1.24}, '*')"
        )
        page.wait_for_function(
            "getComputedStyle(document.documentElement).getPropertyValue('--standalone-size').trim() === '1.24rem'"
        )
        larger_sizes = page.locator("h1, p, th, td").evaluate_all(
            "nodes => nodes.map(node => parseFloat(getComputedStyle(node).fontSize))"
        )
        browser.close()

    assert normal_sizes
    assert len(normal_sizes) == len(larger_sizes)
    assert all(larger > normal for normal, larger in zip(normal_sizes, larger_sizes))
