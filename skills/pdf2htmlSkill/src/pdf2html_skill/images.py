from __future__ import annotations

from pathlib import Path
import re

import pdfplumber
from bs4 import BeautifulSoup
from PIL import Image


TOKEN_PATTERN = re.compile(r"\w+", re.UNICODE)


def _average_hash(image: Image.Image, size: int = 16) -> tuple[int, ...]:
    grayscale = image.convert("L").resize((size, size))
    pixels = list(
        grayscale.get_flattened_data()
        if hasattr(grayscale, "get_flattened_data")
        else grayscale.getdata()
    )
    average = sum(pixels) / len(pixels)
    return tuple(1 if pixel >= average else 0 for pixel in pixels)


def _similarity(left: tuple[int, ...], right: tuple[int, ...]) -> float:
    if len(left) != len(right):
        return 0.0
    return 1.0 - sum(a != b for a, b in zip(left, right)) / len(left)


def _caption_is_below(
    lines: list[dict[str, object]],
    caption_text: str,
    image_top: float,
    image_bottom: float,
) -> bool | None:
    caption_tokens = [
        match.group(0).casefold() for match in TOKEN_PATTERN.finditer(caption_text)
    ]
    prefix = caption_tokens[:4]
    if not prefix:
        return None
    for line in lines:
        line_tokens = [
            match.group(0).casefold()
            for match in TOKEN_PATTERN.finditer(str(line.get("text", "")))
        ]
        if line_tokens[: len(prefix)] != prefix:
            continue
        line_top = float(line.get("top") or 0)
        if line_top >= image_bottom - 2:
            return True
        if line_top <= image_top + 2:
            return False
    return None


def _existing_hashes(html_path: Path) -> list[tuple[int, ...]]:
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    hashes: list[tuple[int, ...]] = []
    for image in soup.find_all("img", src=True):
        source = str(image["src"])
        if source.startswith(("data:", "http://", "https://")):
            continue
        asset = (html_path.parent / source).resolve()
        if asset.is_file() and asset.is_relative_to(html_path.parent.resolve()):
            try:
                with Image.open(asset) as opened:
                    hashes.append(_average_hash(opened))
            except Exception:
                continue
    return hashes


def preserve_unclassified_images(pdf_path: Path, html_path: Path, images_dir: Path) -> int:
    """Add embedded-image occurrences that Docling did not serialize as pictures."""
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    container = soup.find("main") or soup.body
    if container is None:
        return 0
    known_hashes = _existing_hashes(html_path)
    additions: list[tuple[int, float, Path, bool]] = []
    replaced_existing = False
    images_dir.mkdir(parents=True, exist_ok=True)

    with pdfplumber.open(pdf_path) as document:
        for page_number, page in enumerate(document.pages, start=1):
            candidates = [
                item
                for item in page.images
                if float(item.get("width", 0)) >= 8 and float(item.get("height", 0)) >= 8
            ]
            if not candidates:
                continue
            rendered = page.to_image(resolution=144, antialias=True).original.convert("RGB")
            scale = 144 / 72
            text_lines = page.extract_text_lines()
            source_page = soup.find(attrs={"data-source-page": str(page_number)})
            existing_page_images = source_page.find_all("img", recursive=True) if source_page else []
            for image_number, item in enumerate(candidates, start=1):
                left = max(0, round(float(item["x0"]) * scale))
                right = min(rendered.width, round(float(item["x1"]) * scale))
                top = max(0, round(float(item["top"]) * scale))
                bottom = min(rendered.height, round(float(item["bottom"]) * scale))
                if right <= left or bottom <= top:
                    continue
                crop = rendered.crop((left, top, right, bottom))
                filename = f"source-page-{page_number:04d}-image-{image_number:02d}.png"
                output_path = images_dir / filename
                if len(existing_page_images) >= len(candidates):
                    crop.save(output_path, "PNG", optimize=True)
                    existing_image = existing_page_images[image_number - 1]
                    existing_image["src"] = output_path.relative_to(
                        html_path.parent
                    ).as_posix()
                    figure = existing_image.find_parent("figure")
                    caption = figure.find("figcaption") if figure else None
                    if caption:
                        caption_below = _caption_is_below(
                            text_lines,
                            caption.get_text(" ", strip=True),
                            float(item.get("top") or 0),
                            float(item.get("bottom") or 0),
                        )
                        if caption_below is True:
                            caption.insert_before(existing_image.extract())
                        elif caption_below is False:
                            caption.insert_after(existing_image.extract())
                    replaced_existing = True
                    continue
                crop_hash = _average_hash(crop)
                match_index = next(
                    (index for index, known in enumerate(known_hashes) if _similarity(crop_hash, known) >= 0.93),
                    None,
                )
                if match_index is not None:
                    known_hashes.pop(match_index)
                    continue
                crop.save(output_path, "PNG", optimize=True)
                full_page = (
                    float(item.get("width", 0)) >= float(page.width) * 0.9
                    and float(item.get("height", 0)) >= float(page.height) * 0.9
                )
                additions.append((page_number, float(item["top"]), output_path, full_page))

    for page_number, top, output_path, full_page in sorted(additions):
        figure = soup.new_tag("figure")
        figure["class"] = ["source-picture"]
        figure["data-source-page"] = str(page_number)
        figure["data-source-top"] = f"{top:.2f}"
        image = soup.new_tag("img")
        image["src"] = output_path.relative_to(html_path.parent).as_posix()
        image["alt"] = ""
        image["loading"] = "lazy"
        image["decoding"] = "async"
        figure.append(image)
        source_page = soup.find(attrs={"data-source-page": str(page_number)})
        if source_page is not None and full_page:
            classes = list(source_page.get("class", []))
            classes.append("source-page-full-image")
            source_page["class"] = classes
            source_page["style"] = "--pdf-page-top: 0%; --pdf-page-left: 0%; --pdf-page-right: 0%; --pdf-page-bottom: 0%"
        (source_page or container).append(figure)

    if additions or replaced_existing:
        html_path.write_text(str(soup), encoding="utf-8")
    return len(additions)
