from __future__ import annotations

from collections import Counter
from hashlib import sha256
from pathlib import Path
from statistics import median
from typing import Any
import re

import pdfplumber
from pypdf import PdfReader

from .models import (
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

TOKEN_PATTERN = re.compile(r"\w+", re.UNICODE)


def _emphasis(font_name: str, matrix: Any = None) -> tuple[bool, bool]:
    normalized = font_name.lower()
    bold = any(token in normalized for token in ("bold", "black", "heavy", "semibold", "demi"))
    italic = any(token in normalized for token in ("italic", "oblique"))
    if not italic and isinstance(matrix, (tuple, list)) and len(matrix) >= 4:
        a, _, c, d = (float(value) for value in matrix[:4])
        # PDFs commonly synthesize italics by shearing a regular font. The
        # font name then carries no emphasis marker, but c/a (or b/d for the
        # alternate orientation) exposes the slant.
        italic = (abs(a) > 1e-6 and abs(c / a) >= 0.12) or (
            abs(d) > 1e-6 and abs(float(matrix[1]) / d) >= 0.12
        )
    return bold, italic


def _family(font_name: str) -> str:
    normalized = font_name.lower()
    if any(token in normalized for token in ("courier", "mono", "code")):
        return "monospace"
    if any(token in normalized for token in ("times", "serif", "garamond", "georgia")):
        return "serif"
    return "sans-serif"


def _clean_font_name(value: Any) -> str:
    return str(value or "").removeprefix("/")


def _font_family_key(source_name: str) -> str:
    name = source_name.split("+", 1)[-1]
    return re.sub(
        r"[-_ ]?(?:regular|roman|bold|semibold|demibold|italic|oblique)$",
        "",
        name,
        flags=re.IGNORECASE,
    ).casefold()


def extract_embedded_fonts(path: Path, destination: Path) -> tuple[EmbeddedFont, ...]:
    """Extract browser-usable embedded fonts so HTML glyph metrics match the PDF."""
    reader = PdfReader(path)
    extracted: dict[str, EmbeddedFont] = {}
    destination.mkdir(parents=True, exist_ok=True)
    for page in reader.pages:
        resources = page.get("/Resources") or {}
        fonts = resources.get("/Font") or {}
        for reference in fonts.values():
            font = reference.get_object()
            source_name = _clean_font_name(font.get("/BaseFont"))
            if not source_name or source_name in extracted:
                continue
            descendants = font.get("/DescendantFonts") or [font]
            descendant = descendants[0].get_object()
            descriptor_ref = descendant.get("/FontDescriptor") or font.get(
                "/FontDescriptor"
            )
            if not descriptor_ref:
                continue
            descriptor = descriptor_ref.get_object()
            stream = descriptor.get("/FontFile2")
            extension = "ttf"
            if stream is None and descriptor.get("/FontFile3") is not None:
                stream = descriptor.get("/FontFile3")
                extension = "otf"
            if stream is None:
                continue
            data = stream.get_object().get_data()
            digest = sha256(data).hexdigest()[:12]
            filename = f"font-{digest}.{extension}"
            (destination / filename).write_bytes(data)
            bold, italic = _emphasis(source_name)
            family_digest = sha256(
                _font_family_key(source_name).encode("utf-8")
            ).hexdigest()[:12]
            extracted[source_name] = EmbeddedFont(
                source_name=source_name,
                css_family=f"pdf-font-{family_digest}",
                href=f"fonts/{filename}",
                weight=700 if bold else 400,
                style="italic" if italic else "normal",
            )
    return tuple(extracted.values())


def _css_color(value: Any) -> str:
    if isinstance(value, (tuple, list)) and len(value) >= 3:
        channels = [max(0, min(255, round(float(item) * 255))) for item in value[:3]]
        return "#" + "".join(f"{channel:02x}" for channel in channels)
    if isinstance(value, (int, float)):
        channel = max(0, min(255, round(float(value) * 255)))
        return f"#{channel:02x}{channel:02x}{channel:02x}"
    return "#111827"


def _destination_href(reader: PdfReader, annotation: Any) -> str | None:
    action = annotation.get("/A")
    if action and action.get("/S") == "/URI" and action.get("/URI"):
        return str(action["/URI"])
    destination = annotation.get("/Dest")
    if destination is None:
        return None
    named = reader.named_destinations.get(str(destination))
    if named is None:
        return None
    try:
        return f"#page_{reader.get_destination_page_number(named) + 1}"
    except Exception:
        return None


def _overlaps(word: SourceWord, rect: tuple[float, float, float, float]) -> bool:
    left, top, right, bottom = rect
    return word.x1 > left and word.x0 < right and word.bottom > top and word.top < bottom


def analyze_source(path: Path) -> SourceEvidence:
    sizes: list[float] = []
    fonts: Counter[str] = Counter()
    font_names: Counter[str] = Counter()
    colors: Counter[str] = Counter()
    pages: list[SourcePageEvidence] = []
    reader = PdfReader(path)

    with pdfplumber.open(path) as document:
        for page_number, page in enumerate(document.pages, start=1):
            for character in page.chars:
                text = str(character.get("text", ""))
                if not text.strip():
                    continue
                size = float(character.get("size") or 0)
                if size > 0:
                    sizes.append(size)
                font_name = _clean_font_name(character.get("fontname"))
                fonts[_family(font_name)] += 1
                font_names[font_name] += 1
                colors[_css_color(character.get("non_stroking_color"))] += 1
            source_words: list[SourceWord] = []
            for word in page.extract_words(
                extra_attrs=["fontname", "size", "non_stroking_color"]
            ):
                text = str(word.get("text", ""))
                font_name = _clean_font_name(word.get("fontname"))
                bold, italic = _emphasis(font_name)
                if not italic:
                    word_x0 = float(word.get("x0") or 0)
                    word_x1 = float(word.get("x1") or 0)
                    word_top = float(word.get("top") or 0)
                    word_bottom = float(word.get("bottom") or 0)
                    characters = [
                        character
                        for character in page.chars
                        if str(character.get("text", "")).strip()
                        and word_x0 - 0.5
                        <= (float(character.get("x0") or 0) + float(character.get("x1") or 0)) / 2
                        <= word_x1 + 0.5
                        and word_top - 0.5
                        <= (float(character.get("top") or 0) + float(character.get("bottom") or 0)) / 2
                        <= word_bottom + 0.5
                    ]
                    italic = bool(characters) and sum(
                        _emphasis(font_name, character.get("matrix"))[1]
                        for character in characters
                    ) / len(characters) >= 0.6
                for match in TOKEN_PATTERN.finditer(text):
                    source_words.append(
                        SourceWord(
                            text=match.group(0),
                            token=match.group(0).casefold(),
                            bold=bold,
                            italic=italic,
                            size_pt=float(word.get("size") or 0),
                            x0=float(word.get("x0") or 0),
                            x1=float(word.get("x1") or 0),
                            top=float(word.get("top") or 0),
                            bottom=float(word.get("bottom") or 0),
                            font_family=_family(font_name),
                            color=_css_color(word.get("non_stroking_color")),
                            font_name=font_name,
                        )
                    )

            source_lines: list[SourceLine] = []
            for line in page.extract_text_lines(return_chars=True):
                line_sizes = [float(char.get("size") or 0) for char in line.get("chars", [])]
                source_lines.append(
                    SourceLine(
                        text=str(line.get("text", "")),
                        size_pt=round(median(line_sizes), 2) if line_sizes else 0,
                        x0=float(line.get("x0") or 0),
                        x1=float(line.get("x1") or 0),
                        top=float(line.get("top") or 0),
                        bottom=float(line.get("bottom") or 0),
                    )
                )

            source_links: list[SourceLink] = []
            pdf_page = reader.pages[page_number - 1]
            for reference in pdf_page.get("/Annots") or []:
                annotation = reference.get_object()
                if annotation.get("/Subtype") != "/Link" or not annotation.get("/Rect"):
                    continue
                href = _destination_href(reader, annotation)
                if not href:
                    continue
                x0, y0, x1, y1 = (float(value) for value in annotation["/Rect"])
                rect = (min(x0, x1), float(page.height) - max(y0, y1), max(x0, x1), float(page.height) - min(y0, y1))
                indexes = tuple(index for index, word in enumerate(source_words) if _overlaps(word, rect))
                if indexes:
                    source_links.append(SourceLink(indexes, href))

            rectangles = tuple(
                SourceRectangle(
                    x0=float(rect.get("x0") or 0),
                    x1=float(rect.get("x1") or 0),
                    top=float(rect.get("top") or 0),
                    bottom=float(rect.get("bottom") or 0),
                    fill_color=_css_color(rect.get("non_stroking_color")),
                )
                for rect in page.rects
                if rect.get("fill")
                and float(rect.get("width") or 0) > 1
                and float(rect.get("height") or 0) > 1
                and float(rect.get("width") or 0) < float(page.width) * 0.98
                and float(rect.get("height") or 0) < float(page.height) * 0.98
            )
            strokes = tuple(
                SourceStroke(
                    x0=float(line.get("x0") or 0),
                    x1=float(line.get("x1") or 0),
                    top=float(line.get("top") or 0),
                    bottom=float(line.get("bottom") or 0),
                    color=_css_color(line.get("stroking_color")),
                    width=max(0.5, float(line.get("linewidth") or 0)),
                )
                for line in page.lines
            )
            images = tuple(
                SourceImage(
                    x0=float(image.get("x0") or 0),
                    x1=float(image.get("x1") or 0),
                    top=float(image.get("top") or 0),
                    bottom=float(image.get("bottom") or 0),
                )
                for image in page.images
                if float(image.get("width") or 0) >= 8
                and float(image.get("height") or 0) >= 8
            )

            pages.append(
                SourcePageEvidence(
                    page_number=page_number,
                    width_pt=float(page.width),
                    height_pt=float(page.height),
                    words=tuple(source_words),
                    lines=tuple(source_lines),
                    links=tuple(source_links),
                    rectangles=rectangles,
                    strokes=strokes,
                    images=images,
                )
            )

    body_size = round(median(sizes), 2) if sizes else 11.0
    body_family = fonts.most_common(1)[0][0] if fonts else "sans-serif"
    text_color = colors.most_common(1)[0][0] if colors else "#111827"
    larger = sorted({size for size in sizes if size >= body_size * 1.15}, reverse=True)
    scales = [round(size / body_size, 2) for size in larger[:3]]
    defaults = [2.0, 1.55, 1.25]
    heading_scale = tuple((scales + defaults[len(scales) :])[:3])
    body_font_name = font_names.most_common(1)[0][0] if font_names else ""
    typography = TypographyProfile(
        body_size, body_family, text_color, heading_scale, body_font_name
    )
    return SourceEvidence(typography=typography, pages=tuple(pages))


def infer_typography(path: Path) -> TypographyProfile:
    return analyze_source(path).typography
