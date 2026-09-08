from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from pathlib import Path
import re

import pymupdf as fitz
from PIL import Image, ImageChops

from .models import Finding, Profile


TOKEN = re.compile(r"\w+", re.UNICODE)
VISUAL_LIMITS: dict[Profile, float] = {
    "fidelity": 0.002,
    "balanced": 0.035,
    "compact": 0.075,
}


@dataclass
class PdfInventory:
    pages: int
    page_sizes: list[tuple[float, float]]
    tokens: list[str]
    links: int
    outlines: int
    fonts: set[str]
    unembedded_fonts: set[str]
    blank_pages: list[int]
    out_of_bounds_blocks: list[tuple[int, tuple[float, float, float, float]]]


def _normalize_font(name: str) -> str:
    name = re.sub(r"^[A-Z]{6}\+", "", name)
    return re.sub(r"[^a-z0-9]", "", name.casefold())


def _image(page: fitz.Page, dpi: int = 96) -> Image.Image:
    pixmap = page.get_pixmap(dpi=dpi, colorspace=fitz.csRGB, alpha=False)
    return Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)


def _is_blank(image: Image.Image, text: str) -> bool:
    if text.strip():
        return False
    gray = image.convert("L")
    histogram = gray.histogram()
    dark = sum(histogram[:245])
    return dark / max(1, gray.width * gray.height) < 0.0001


def inspect_pdf(path: Path, *, render_dir: Path | None = None, prefix: str = "pdf") -> PdfInventory:
    document = fitz.open(path)
    page_sizes: list[tuple[float, float]] = []
    tokens: list[str] = []
    fonts: set[str] = set()
    unembedded: set[str] = set()
    blanks: list[int] = []
    outside: list[tuple[int, tuple[float, float, float, float]]] = []
    link_count = 0
    for index, page in enumerate(document):
        rect = page.rect
        page_sizes.append((round(rect.width, 3), round(rect.height, 3)))
        text = page.get_text("text")
        tokens.extend(token.casefold() for token in TOKEN.findall(text))
        link_count += len(page.get_links())
        for block in page.get_text("blocks"):
            x0, y0, x1, y1 = map(float, block[:4])
            if x0 < -1 or y0 < -1 or x1 > rect.width + 1 or y1 > rect.height + 1:
                outside.append((index + 1, (x0, y0, x1, y1)))
        for font in page.get_fonts(full=True):
            xref, name = int(font[0]), str(font[3])
            fonts.add(name)
            embedded = False
            if xref > 0:
                try:
                    embedded = bool(document.extract_font(xref)[3])
                except (RuntimeError, ValueError):
                    embedded = False
            if not embedded:
                unembedded.add(name)
        image = _image(page)
        if _is_blank(image, text):
            blanks.append(index + 1)
        if render_dir:
            render_dir.mkdir(parents=True, exist_ok=True)
            image.save(render_dir / f"{prefix}-{index + 1:04d}.png")
    inventory = PdfInventory(
        pages=document.page_count,
        page_sizes=page_sizes,
        tokens=tokens,
        links=link_count,
        outlines=len(document.get_toc(simple=True)),
        fonts=fonts,
        unembedded_fonts=unembedded,
        blank_pages=blanks,
        out_of_bounds_blocks=outside,
    )
    document.close()
    return inventory


def _coverage(source: list[str], output: list[str]) -> float:
    if not source:
        return 1.0
    available = Counter(output)
    matched = 0
    for token in source:
        if available[token]:
            available[token] -= 1
            matched += 1
    return matched / len(source)


def _order(source: list[str], output: list[str]) -> float:
    if len(source) < 2:
        return 1.0
    pairs = Counter(zip(output, output[1:]))
    matched = 0
    for pair in zip(source, source[1:]):
        if pairs[pair]:
            pairs[pair] -= 1
            matched += 1
    return matched / (len(source) - 1)


def _visual_difference(reference: Path, candidate: Path) -> tuple[float, list[float]]:
    reference_doc, candidate_doc = fitz.open(reference), fitz.open(candidate)
    differences: list[float] = []
    try:
        for reference_page, candidate_page in zip(reference_doc, candidate_doc):
            before, after = _image(reference_page), _image(candidate_page)
            if before.size != after.size:
                differences.append(1.0)
                continue
            histogram = ImageChops.difference(before, after).histogram()
            channel_pixels = before.width * before.height * 3
            differences.append(sum((index % 256) * count for index, count in enumerate(histogram)) / (255 * channel_pixels))
    finally:
        reference_doc.close()
        candidate_doc.close()
    return (max(differences, default=0.0), differences)


def validate_against_reference(
    reference: Path,
    candidate: Path,
    *,
    profile: Profile,
    requested_fonts: set[str] | None = None,
    source_hyperlinks: int | None = None,
    render_dir: Path | None = None,
) -> dict[str, object]:
    findings: list[Finding] = []
    try:
        reference_inventory = inspect_pdf(reference, render_dir=render_dir, prefix="reference")
        candidate_inventory = inspect_pdf(candidate, render_dir=render_dir, prefix="candidate")
    except (RuntimeError, ValueError) as error:
        return {
            "status": "failed",
            "findings": [Finding("error", "invalid-pdf", f"PDF inspection failed: {error}").json()],
            "metrics": {},
        }
    coverage = _coverage(reference_inventory.tokens, candidate_inventory.tokens)
    order = _order(reference_inventory.tokens, candidate_inventory.tokens)
    max_difference, page_differences = _visual_difference(reference, candidate)
    if candidate_inventory.pages != reference_inventory.pages:
        findings.append(Finding("error", "page-count", "Optimization changed the page count."))
    if candidate_inventory.page_sizes != reference_inventory.page_sizes:
        findings.append(Finding("error", "page-size", "Optimization changed one or more page sizes."))
    if coverage < 0.999:
        findings.append(Finding("error", "text-coverage", f"Text coverage is {coverage:.3%}, below 99.9%."))
    if order < 0.995:
        findings.append(Finding("error", "text-order", f"Adjacent-token order is {order:.3%}, below 99.5%."))
    if candidate_inventory.links < reference_inventory.links:
        findings.append(Finding("error", "links-removed", "Optimization removed PDF links."))
    if source_hyperlinks is not None and candidate_inventory.links < source_hyperlinks:
        findings.append(Finding("warning", "source-links-not-exported", "LibreOffice exported fewer PDF links than the DOCX contains.", {"source": source_hyperlinks, "pdf": candidate_inventory.links}))
    if candidate_inventory.outlines < reference_inventory.outlines:
        findings.append(Finding("error", "outlines-removed", "Optimization removed PDF outline entries."))
    if candidate_inventory.blank_pages != reference_inventory.blank_pages:
        findings.append(Finding("error", "blank-pages", "Optimization changed the blank-page pattern."))
    if candidate_inventory.out_of_bounds_blocks:
        findings.append(Finding("error", "page-overflow", "Text blocks extend outside a PDF page.", {"blocks": candidate_inventory.out_of_bounds_blocks[:20]}))
    if candidate_inventory.unembedded_fonts:
        findings.append(Finding("error", "fonts-not-embedded", "The PDF contains non-embedded fonts.", {"fonts": sorted(candidate_inventory.unembedded_fonts)}))
    if max_difference > VISUAL_LIMITS[profile]:
        findings.append(Finding("error", "visual-difference", f"Rendered-page difference {max_difference:.5f} exceeds {VISUAL_LIMITS[profile]:.5f}."))
    requested_fonts = requested_fonts or set()
    rendered_names = {_normalize_font(name) for name in candidate_inventory.fonts}
    unmatched = sorted(name for name in requested_fonts if _normalize_font(name) not in rendered_names)
    if unmatched:
        findings.append(Finding("warning", "font-substitution-possible", "Requested DOCX font names were not found verbatim in the PDF; aliases or substitutions may be present.", {"requested": unmatched}))
    status = "failed" if any(item.severity == "error" for item in findings) else ("passed_with_warnings" if findings else "passed")
    return {
        "status": status,
        "findings": [finding.json() for finding in findings],
        "metrics": {
            "pages": candidate_inventory.pages,
            "textCoverage": round(coverage, 6),
            "textOrder": round(order, 6),
            "links": candidate_inventory.links,
            "outlines": candidate_inventory.outlines,
            "fonts": sorted(candidate_inventory.fonts),
            "unembeddedFonts": sorted(candidate_inventory.unembedded_fonts),
            "blankPages": candidate_inventory.blank_pages,
            "maxVisualDifference": round(max_difference, 8),
            "pageVisualDifferences": [round(value, 8) for value in page_differences],
            "visualLimit": VISUAL_LIMITS[profile],
            "visualValidation": True,
        },
    }
