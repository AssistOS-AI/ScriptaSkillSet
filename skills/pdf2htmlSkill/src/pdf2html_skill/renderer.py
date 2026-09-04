from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
import re
from statistics import median

from bs4 import BeautifulSoup, Doctype, NavigableString

from .models import (
    EmbeddedFont,
    SourceEvidence,
    SourcePageEvidence,
    SourceStroke,
    SourceWord,
    TypographyProfile,
)

WORD_PATTERN = re.compile(r"\w+", re.UNICODE)
TOC_ENTRY_PATTERN = re.compile(r"^(?P<title>.*?)(?:\.{3,})\s*(?P<page>\d+)\s*$")
TOC_DOTTED_SOURCE_ENTRY_PATTERN = re.compile(
    r"^(?P<title>.+?)(?:\.{3,})\s*(?P<page>\d+)\s*$"
)
TOC_SOURCE_ENTRY_PATTERN = re.compile(r"^(?P<title>\d+\.\s+.*?)(?:\s+)(?P<page>\d+)\s*$")
TOC_PART_PATTERN = re.compile(r"^PART\s+[IVXLCDM]+(?:\s*[:.-]\s*|\s+).+", re.IGNORECASE)
TOC_HEADINGS = {"contents", "table of contents"}
PLAIN_TOC_ENTRY_PATTERN = re.compile(
    r"^(?:methodological\s+note\b|introduction\b|chapter\s+\d+\s*[.:]|"
    r"conclusion\b|appendix\b|references\b)",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class _HtmlWord:
    node: NavigableString
    start: int
    end: int
    token: str


def _tokens(text: str) -> list[str]:
    return [match.group(0).casefold() for match in WORD_PATTERN.finditer(text)]


def _belongs_to(word: _HtmlWord, container: object) -> bool:
    return any(parent is container for parent in word.node.parents)


def _set_style(block: object, property_name: str, value: str) -> None:
    declarations = [
        declaration.strip()
        for declaration in str(block.get("style", "")).split(";")
        if declaration.strip()
        and not declaration.strip().casefold().startswith(f"{property_name.casefold()}:")
    ]
    declarations.append(f"{property_name}: {value}")
    block["style"] = "; ".join(declarations)


def _unwrap_inferred_inline_styles(container: object) -> None:
    for tag in list(container.find_all(["strong", "b", "em", "i"])):
        tag.unwrap()


def _html_words(container: object) -> list[_HtmlWord]:
    words: list[_HtmlWord] = []
    for node in container.find_all(string=True):
        if not isinstance(node, NavigableString) or node.parent.name in ("script", "style"):
            continue
        text = str(node)
        for match in WORD_PATTERN.finditer(text):
            words.append(_HtmlWord(node, match.start(), match.end(), match.group(0).casefold()))
    return words


def _alignment(page: SourcePageEvidence, section: object) -> tuple[list[_HtmlWord], dict[int, int]]:
    html_words = _html_words(section)
    matcher = SequenceMatcher(
        None,
        [word.token for word in page.words],
        [word.token for word in html_words],
        autojunk=False,
    )
    source_to_html: dict[int, int] = {}
    for source_start, html_start, length in matcher.get_matching_blocks():
        for offset in range(length):
            source_to_html[source_start + offset] = html_start + offset
    return html_words, source_to_html


def _infer_document_justified_right_ratio(evidence: SourceEvidence) -> float | None:
    """Find a repeated body-text right edge across the complete document."""
    ratios: list[float] = []
    for page in evidence.pages:
        for line in page.lines:
            if (
                abs(line.size_pt - evidence.typography.body_size_pt) <= 0.75
                and line.top < page.height_pt * 0.92
                and line.x0 < page.width_pt * 0.3
                and line.x1 - line.x0 >= page.width_pt * 0.6
            ):
                ratios.append(line.x1 / page.width_pt)
    if not ratios:
        return None
    bins = Counter(round(ratio, 3) for ratio in ratios)
    dominant, count = bins.most_common(1)[0]
    if count < 8 or count / len(ratios) < 0.2:
        return None
    matching = [ratio for ratio in ratios if abs(ratio - dominant) <= 0.0015]
    return median(matching)


def _infer_document_body_left_ratio(evidence: SourceEvidence) -> float | None:
    """Find the stable left edge used by continuation lines of body prose."""
    ratios: list[float] = []
    for page in evidence.pages:
        for line in page.lines:
            if (
                abs(line.size_pt - evidence.typography.body_size_pt) <= 0.75
                and line.top < page.height_pt * 0.92
                and line.x0 < page.width_pt * 0.3
                and line.x1 - line.x0 >= page.width_pt * 0.45
            ):
                ratios.append(line.x0 / page.width_pt)
    if not ratios:
        return None
    bins = Counter(round(ratio, 3) for ratio in ratios)
    dominant, count = bins.most_common(1)[0]
    if count < 4 or count / len(ratios) < 0.15:
        return None
    matching = [ratio for ratio in ratios if abs(ratio - dominant) <= 0.0015]
    return median(matching)


def _infer_document_first_line_indent_ratio(
    evidence: SourceEvidence,
    body_left_ratio: float | None,
) -> float | None:
    """Find a repeated body-paragraph first-line offset from source geometry."""
    if body_left_ratio is None:
        return None
    ratios: list[float] = []
    for page in evidence.pages:
        body_left = body_left_ratio * page.width_pt
        minimum_indent = max(0.6 * evidence.typography.body_size_pt, 4.0)
        maximum_indent = max(4.0 * evidence.typography.body_size_pt, 24.0)
        for line in page.lines:
            indent = line.x0 - body_left
            if (
                abs(line.size_pt - evidence.typography.body_size_pt) <= 0.75
                and line.top < page.height_pt * 0.92
                and minimum_indent <= indent <= maximum_indent
                and line.x1 - line.x0 >= page.width_pt * 0.25
            ):
                ratios.append(indent / page.width_pt)
    if not ratios:
        return None
    bins = Counter(round(ratio, 3) for ratio in ratios)
    dominant, count = bins.most_common(1)[0]
    if count < 4 or count / len(ratios) < 0.35:
        return None
    matching = [ratio for ratio in ratios if abs(ratio - dominant) <= 0.0015]
    return median(matching)


def _repair_merged_justified_paragraphs(
    soup: BeautifulSoup,
    section: object,
    page: SourcePageEvidence,
    document_right_ratio: float | None = None,
) -> bool:
    """Recover paragraph ends that survive in the PDF only as short final lines."""
    line_tokens = [_tokens(line.text) for line in page.lines]
    flat_tokens: list[str] = []
    token_lines: list[int] = []
    for line_index, tokens in enumerate(line_tokens):
        flat_tokens.extend(tokens)
        token_lines.extend([line_index] * len(tokens))

    def locate(paragraph: object) -> list[int] | None:
        paragraph_tokens = _tokens(paragraph.get_text(" ", strip=True))
        if not paragraph_tokens:
            return None
        start = next(
            (
                index
                for index in range(len(flat_tokens) - len(paragraph_tokens) + 1)
                if flat_tokens[index : index + len(paragraph_tokens)] == paragraph_tokens
            ),
            None,
        )
        if start is None:
            return None
        return list(dict.fromkeys(token_lines[start : start + len(paragraph_tokens)]))

    expected_right = (
        document_right_ratio * page.width_pt
        if document_right_ratio is not None
        else None
    )
    # Page normalization can leave two adjacent HTML blocks inside one source
    # paragraph. Join only when the first source line reaches the established
    # justified edge and ends without sentence-closing punctuation.
    if expected_right is not None:
        while True:
            merged = False
            paragraphs = list(section.find_all("p", recursive=False))
            for paragraph, following in zip(paragraphs, paragraphs[1:]):
                if paragraph.find(True) is not None or following.find(True) is not None:
                    continue
                if paragraph.find_next_sibling() is not following:
                    continue
                current_lines = locate(paragraph)
                following_lines = locate(following)
                if not current_lines or not following_lines:
                    continue
                last_index = current_lines[-1]
                first_following = following_lines[0]
                last_line = page.lines[last_index]
                next_line = page.lines[first_following]
                closes_sentence = re.search(
                    r"[.!?][\"'”’\)\]]*\s*$", last_line.text
                ) is not None
                if (
                    first_following == last_index + 1
                    and last_line.x1 >= expected_right - 2.5
                    and not closes_sentence
                    and next_line.top - last_line.top <= max(
                        last_line.size_pt, next_line.size_pt
                    ) * 1.7
                ):
                    paragraph.string = (
                        paragraph.get_text(" ", strip=True)
                        + " "
                        + following.get_text(" ", strip=True)
                    )
                    following.decompose()
                    merged = True
                    break
            if not merged:
                break

    changed = False
    for paragraph in list(section.find_all("p", recursive=False)):
        if paragraph.find(True) is not None:
            continue
        text = paragraph.get_text(" ", strip=True)
        paragraph_tokens = _tokens(text)
        minimum_tokens = 4 if document_right_ratio is not None else 20
        if len(paragraph_tokens) < minimum_tokens:
            continue
        used_line_indexes = locate(paragraph)
        if not used_line_indexes:
            continue
        minimum_lines = 2 if document_right_ratio is not None else 4
        if len(used_line_indexes) < minimum_lines:
            continue
        lines = [page.lines[index] for index in used_line_indexes]
        right_edge = expected_right or max(line.x1 for line in lines)
        near_right = sum(abs(line.x1 - right_edge) <= 2.5 for line in lines)
        # A repeated, very stable right edge is the signature of justified prose.
        # This gate prevents ragged-right paragraphs from being split after every line.
        if document_right_ratio is None and near_right < max(2, len(lines) // 12):
            continue
        typical_size = median(line.size_pt for line in lines if line.size_pt > 0)
        shortfall = (
            max(0.45 * typical_size, 4.0)
            if document_right_ratio is not None
            else max(0.75 * typical_size, 6.0)
        )
        boundaries: list[int] = []
        consumed = 0
        for line in lines[:-1]:
            consumed += len(_tokens(line.text))
            if line.x1 < right_edge - shortfall:
                boundaries.append(consumed)
        if not boundaries:
            continue

        matches = list(WORD_PATTERN.finditer(text))
        if len(matches) != len(paragraph_tokens):
            continue
        character_boundaries: list[int] = []
        for boundary in boundaries:
            offset = matches[boundary].start()
            while offset > 0 and text[offset - 1] in {'"', "'", "“", "‘", "(", "["}:
                offset -= 1
            character_boundaries.append(offset)
        character_ranges = [0, *character_boundaries, len(text)]
        fragments: list[object] = []
        line_top_gaps = [
            second.top - first.top
            for first, second in zip(lines, lines[1:])
            if second.top > first.top
        ]
        line_height = (
            max(1.0, min(1.6, median(line_top_gaps) / typical_size))
            if line_top_gaps and typical_size > 0
            else 1.45
        )
        for start_offset, end_offset in zip(character_ranges, character_ranges[1:]):
            fragment_text = text[start_offset:end_offset].strip()
            if not fragment_text:
                continue
            fragment = soup.new_tag("p")
            fragment.attrs = dict(paragraph.attrs)
            fragment["class"] = list(
                dict.fromkeys([*fragment.get("class", []), "source-paragraph-repaired"])
            )
            _set_style(fragment, "line-height", f"{line_height:.3f}")
            _set_style(fragment, "margin-bottom", "0")
            fragment.string = fragment_text
            paragraph.insert_before(fragment)
            fragments.append(fragment)
        if len(fragments) > 1:
            paragraph.decompose()
            changed = True
        else:
            for fragment in fragments:
                fragment.decompose()
    return changed


def _repair_headings(
    section: object,
    page: SourcePageEvidence,
    html_words: list[_HtmlWord],
    source_to_html: dict[int, int],
    body_size: float,
) -> None:
    html_to_source = {html_index: source_index for source_index, html_index in source_to_html.items()}
    word_index = {id(word): index for index, word in enumerate(html_words)}
    for heading in list(section.find_all(re.compile(r"^h[1-6]$"))):
        indexes = [
            word_index[id(word)] for word in html_words if _belongs_to(word, heading)
        ]
        source_indexes = [html_to_source[index] for index in indexes if index in html_to_source]
        if not source_indexes:
            heading.name = "p"
            continue
        size = median(page.words[index].size_pt for index in source_indexes)
        ratio = size / body_size if body_size else 1.0
        if ratio >= 1.8:
            heading.name = "h1"
        elif ratio >= 1.35:
            heading.name = "h2"
        elif ratio >= 1.12:
            heading.name = "h3"
        else:
            heading.name = "p"
        _set_style(heading, "font-size", f"{size:.2f}pt")


def _apply_block_font_sizes(
    section: object,
    page: SourcePageEvidence,
    html_words: list[_HtmlWord],
    source_to_html: dict[int, int],
    body_size: float,
) -> None:
    html_to_source = {html_index: source_index for source_index, html_index in source_to_html.items()}
    word_index = {id(word): index for index, word in enumerate(html_words)}
    for block in section.find_all(
        ["h1", "h2", "h3", "h4", "h5", "h6", "p", "caption", "figcaption", "th", "td"]
    ):
        indexes = [
            word_index[id(word)] for word in html_words if _belongs_to(word, block)
        ]
        source_indexes = [html_to_source[index] for index in indexes if index in html_to_source]
        if not source_indexes:
            continue
        size = median(page.words[index].size_pt for index in source_indexes)
        if block.name.startswith("h") and size > 0:
            words = [page.words[index] for index in source_indexes]
            source_line_tops = sorted({round(word.top, 1) for word in words})
            if len(source_line_tops) == 1:
                source_height = max(word.bottom for word in words) - min(word.top for word in words)
                line_height = source_height / size
            else:
                source_gaps = [
                    second - first
                    for first, second in zip(source_line_tops, source_line_tops[1:])
                ]
                line_height = median(source_gaps) / size
            _set_style(block, "line-height", f"{max(0.9, min(1.5, line_height)):.3f}")
        if abs(size - body_size) < 0.5:
            continue
        _set_style(block, "font-size", f"{size:.2f}pt")


def _apply_block_typography(
    section: object,
    page: SourcePageEvidence,
    html_words: list[_HtmlWord],
    source_to_html: dict[int, int],
    profile: TypographyProfile,
    fonts: tuple[EmbeddedFont, ...],
) -> None:
    font_faces = {font.source_name: font for font in fonts}
    html_to_source = {html_index: source_index for source_index, html_index in source_to_html.items()}
    word_index = {id(word): index for index, word in enumerate(html_words)}
    for block in section.find_all(
        ["h1", "h2", "h3", "h4", "h5", "h6", "p", "caption", "figcaption", "th", "td"]
    ):
        indexes = [
            word_index[id(word)] for word in html_words if _belongs_to(word, block)
        ]
        source_indexes = [html_to_source[index] for index in indexes if index in html_to_source]
        if not source_indexes:
            continue
        words = [page.words[index] for index in source_indexes]
        named_fonts = Counter(word.font_name for word in words if word.font_name)
        font_name, font_name_count = named_fonts.most_common(1)[0] if named_fonts else ("", 0)
        family, family_count = Counter(word.font_family for word in words).most_common(1)[0]
        color, color_count = Counter(word.color for word in words).most_common(1)[0]
        face = font_faces.get(font_name)
        if face and font_name_count / len(words) >= 0.75 and (
            font_name != profile.body_font_name or block.name.startswith("h")
        ):
            _set_style(block, "font-family", f'"{face.css_family}", {_font_stack(family)}')
        elif family_count / len(words) >= 0.75 and (
            family != profile.body_family or block.name.startswith("h")
        ):
            _set_style(block, "font-family", _font_stack(family))
        if color_count / len(words) >= 0.75 and color.casefold() != profile.text_color.casefold():
            _set_style(block, "color", color)


def _source_edge_border(
    strokes: tuple[SourceStroke, ...],
    *,
    side: str,
    coordinate: float,
    span_start: float,
    span_end: float,
) -> str:
    """Return the CSS border evidenced along one source cell edge."""
    candidates: list[tuple[float, float, SourceStroke]] = []
    span = max(0.0, span_end - span_start)
    for stroke in strokes:
        tolerance = max(1.0, stroke.width)
        if side in {"top", "bottom"}:
            if abs(stroke.bottom - stroke.top) > tolerance:
                continue
            stroke_coordinate = (stroke.top + stroke.bottom) / 2
            overlap = min(stroke.x1, span_end) - max(stroke.x0, span_start)
        else:
            if abs(stroke.x1 - stroke.x0) > tolerance:
                continue
            stroke_coordinate = (stroke.x0 + stroke.x1) / 2
            overlap = min(stroke.bottom, span_end) - max(stroke.top, span_start)
        distance = abs(stroke_coordinate - coordinate)
        if distance <= tolerance and overlap >= max(1.0, span * 0.5):
            candidates.append((distance, -overlap, stroke))
    if not candidates:
        return "0"
    stroke = min(candidates, key=lambda item: (item[0], item[1]))[2]
    return f"{max(0.5, stroke.width):.2f}pt solid {stroke.color}"


def _apply_table_geometry(
    soup: BeautifulSoup,
    section: object,
    page: SourcePageEvidence,
    html_words: list[_HtmlWord],
    source_to_html: dict[int, int],
) -> None:
    if not page.rectangles:
        return
    html_to_source = {
        html_index: source_index for source_index, html_index in source_to_html.items()
    }
    word_index = {id(word): index for index, word in enumerate(html_words)}
    for table in section.find_all("table"):
        cell_rectangles: dict[int, object] = {}
        cell_words: dict[int, list[SourceWord]] = {}
        for cell in table.find_all(["th", "td"]):
            indexes = [
                word_index[id(word)]
                for word in html_words
                if _belongs_to(word, cell)
            ]
            source_indexes = [
                html_to_source[index] for index in indexes if index in html_to_source
            ]
            words = [page.words[index] for index in source_indexes]
            if not words:
                continue
            cell_words[id(cell)] = words
            centers = [
                ((word.x0 + word.x1) / 2, (word.top + word.bottom) / 2)
                for word in words
            ]
            candidates = [
                rectangle
                for rectangle in page.rectangles
                if all(
                    rectangle.x0 - 0.75 <= x <= rectangle.x1 + 0.75
                    and rectangle.top - 0.75 <= y <= rectangle.bottom + 0.75
                    for x, y in centers
                )
            ]
            if not candidates:
                continue
            rectangle = min(
                candidates,
                key=lambda item: (item.x1 - item.x0) * (item.bottom - item.top),
            )
            cell_rectangles[id(cell)] = rectangle

        if len(cell_rectangles) < 2:
            continue
        selected = list(cell_rectangles.values())
        table_left = min(rectangle.x0 for rectangle in selected)
        table_right = max(rectangle.x1 for rectangle in selected)
        table_top = min(rectangle.top for rectangle in selected)
        table_bottom = max(rectangle.bottom for rectangle in selected)
        table_strokes = tuple(
            stroke
            for stroke in page.strokes
            if stroke.x1 >= table_left - 1
            and stroke.x0 <= table_right + 1
            and stroke.bottom >= table_top - 1
            and stroke.top <= table_bottom + 1
        )
        _set_style(table, "table-layout", "fixed")
        _set_style(table, "border-collapse", "collapse")
        content_words = [
            word for word in page.words if word.top < page.height_pt * 0.93
        ]
        if content_words:
            content_left = min(word.x0 for word in content_words)
            content_right = max(word.x1 for word in content_words)
            content_width = content_right - content_left
            if content_width > 0:
                left_ratio = max(0.0, (table_left - content_left) / content_width)
                right_ratio = max(0.0, (content_right - table_right) / content_width)
                width_ratio = max(0.0, 1.0 - left_ratio - right_ratio)
                _set_style(
                    table,
                    "width",
                    f"{width_ratio * 100:.2f}%",
                )
                _set_style(
                    table,
                    "margin-left",
                    f"{left_ratio * 100:.2f}%",
                )
                _set_style(
                    table,
                    "margin-right",
                    f"{right_ratio * 100:.2f}%",
                )

        rows = table.find_all("tr")
        reference_cells: list[object] = []
        column_bounds: list[tuple[float, float]] = []
        for row in rows:
            cells = row.find_all(["th", "td"], recursive=False)
            if len(cells) > len(reference_cells) and all(
                id(cell) in cell_rectangles for cell in cells
            ):
                reference_cells = cells
        if reference_cells:
            column_bounds = [
                (
                    cell_rectangles[id(cell)].x0,
                    cell_rectangles[id(cell)].x1,
                )
                for cell in reference_cells
            ]
            widths = [
                cell_rectangles[id(cell)].x1 - cell_rectangles[id(cell)].x0
                for cell in reference_cells
            ]
            width_total = sum(widths)
            existing = table.find("colgroup", recursive=False)
            if existing:
                existing.decompose()
            colgroup = soup.new_tag("colgroup")
            for width in widths:
                column = soup.new_tag("col")
                column["style"] = f"width: {width / width_total * 100:.2f}%"
                colgroup.append(column)
            table.insert(0, colgroup)

        row_boundaries = sorted(
            {
                round(value, 2)
                for rectangle in selected
                for value in (rectangle.top, rectangle.bottom)
            }
        )
        inferred_row_bounds = (
            list(zip(row_boundaries, row_boundaries[1:]))
            if len(row_boundaries) == len(rows) + 1
            else []
        )

        caption = table.find("caption", recursive=False)
        if caption is not None:
            caption_words = [
                word
                for word in html_words
                if _belongs_to(word, caption)
            ]
            caption_source_indexes = [
                html_to_source[word_index[id(word)]]
                for word in caption_words
                if word_index[id(word)] in html_to_source
            ]
            if caption_source_indexes:
                caption_left = min(
                    page.words[index].x0 for index in caption_source_indexes
                )
                caption_offset = caption_left - table_left
                if caption_offset >= 0:
                    _set_style(caption, "padding-left", f"{caption_offset:.2f}pt")
                else:
                    _set_style(caption, "position", "relative")
                    _set_style(caption, "left", f"{caption_offset:.2f}pt")
                _set_style(caption, "text-align", "left")

        for row_index, row in enumerate(rows):
            row_rectangles = [
                cell_rectangles[id(cell)]
                for cell in row.find_all(["th", "td"], recursive=False)
                if id(cell) in cell_rectangles
            ]
            inferred_bounds = (
                inferred_row_bounds[row_index] if inferred_row_bounds else None
            )
            if inferred_bounds:
                _set_style(row, "height", f"{inferred_bounds[1] - inferred_bounds[0]:.2f}pt")
            elif row_rectangles:
                height = max(
                    rectangle.bottom - rectangle.top for rectangle in row_rectangles
                )
                _set_style(row, "height", f"{height:.2f}pt")
            for cell_index, cell in enumerate(row.find_all(["th", "td"], recursive=False)):
                rectangle = cell_rectangles.get(id(cell))
                words = cell_words.get(id(cell), [])
                if not words:
                    continue
                if rectangle is not None:
                    cell_left, cell_right = rectangle.x0, rectangle.x1
                    cell_top, cell_bottom = rectangle.top, rectangle.bottom
                elif inferred_bounds and cell_index < len(column_bounds):
                    cell_left, cell_right = column_bounds[cell_index]
                    cell_top, cell_bottom = inferred_bounds
                else:
                    continue
                left_padding = min(
                    8.0, max(0.0, min(word.x0 for word in words) - cell_left)
                )
                right_padding = left_padding
                top_padding = min(
                    8.0, max(0.0, min(word.top for word in words) - cell_top)
                )
                bottom_padding = min(
                    8.0,
                    max(0.0, cell_bottom - max(word.bottom for word in words)),
                )
                if rectangle is not None:
                    _set_style(cell, "background-color", rectangle.fill_color)
                _set_style(cell, "border", "0")
                for side, coordinate, span_start, span_end in (
                    ("top", cell_top, cell_left, cell_right),
                    ("right", cell_right, cell_top, cell_bottom),
                    ("bottom", cell_bottom, cell_left, cell_right),
                    ("left", cell_left, cell_top, cell_bottom),
                ):
                    _set_style(
                        cell,
                        f"border-{side}",
                        _source_edge_border(
                            table_strokes,
                            side=side,
                            coordinate=coordinate,
                            span_start=span_start,
                            span_end=span_end,
                        ),
                    )
                text_color, text_color_count = Counter(
                    word.color for word in words
                ).most_common(1)[0]
                if text_color_count / len(words) >= 0.75:
                    _set_style(cell, "color", text_color)
                _set_style(
                    cell,
                    "padding",
                    f"{top_padding:.2f}pt {right_padding:.2f}pt "
                    f"{bottom_padding:.2f}pt {left_padding:.2f}pt",
                )
                line_tops = sorted({round(word.top, 2) for word in words})
                if len(line_tops) > 1:
                    gaps = [
                        second - first
                        for first, second in zip(line_tops, line_tops[1:])
                        if second > first
                    ]
                    size = median(word.size_pt for word in words)
                    if gaps and size > 0:
                        ratio = max(1.0, min(1.5, median(gaps) / size))
                        _set_style(cell, "line-height", f"{ratio:.3f}")
                word_lines: dict[float, list[SourceWord]] = {}
                for word in words:
                    word_lines.setdefault(round(word.top, 1), []).append(word)
                centered_lines = [
                    abs(
                        (min(word.x0 for word in line) - cell_left)
                        - (cell_right - max(word.x1 for word in line))
                    )
                    <= 2.0
                    for line in word_lines.values()
                ]
                if centered_lines and all(centered_lines):
                    _set_style(cell, "text-align", "center")


def _apply_block_geometry(
    section: object,
    page: SourcePageEvidence,
    html_words: list[_HtmlWord],
    source_to_html: dict[int, int],
) -> None:
    html_to_source = {html_index: source_index for source_index, html_index in source_to_html.items()}
    word_index = {id(word): index for index, word in enumerate(html_words)}
    for block in section.find_all("p"):
        indexes = [
            word_index[id(word)] for word in html_words if _belongs_to(word, block)
        ]
        source_indexes = [html_to_source[index] for index in indexes if index in html_to_source]
        if not source_indexes:
            continue
        words = [page.words[index] for index in source_indexes]
        line_tops = {round(word.top, 1) for word in words}
        if len(line_tops) < 2:
            continue
        source_height = max(word.bottom for word in words) - min(word.top for word in words)
        if source_height > 0:
            _set_style(block, "min-height", f"{source_height:.2f}pt")


def _apply_paragraph_first_line_indents(
    section: object,
    page: SourcePageEvidence,
    html_words: list[_HtmlWord],
    source_to_html: dict[int, int],
    body_left_ratio: float | None,
    first_line_indent_ratio: float | None,
    body_size: float,
) -> None:
    """Transfer only the repeated first-line indent evidenced by the PDF."""
    if body_left_ratio is None or first_line_indent_ratio is None:
        return
    html_to_source = {
        html_index: source_index for source_index, html_index in source_to_html.items()
    }
    word_index = {id(word): index for index, word in enumerate(html_words)}
    body_left = body_left_ratio * page.width_pt
    expected_first_left = (body_left_ratio + first_line_indent_ratio) * page.width_pt
    tolerance = max(1.5, 0.2 * first_line_indent_ratio * page.width_pt)
    for paragraph in section.find_all("p"):
        if paragraph.find_parent(["table", "figure", "nav", "li", "aside"]):
            continue
        if "text-align: center" in str(paragraph.get("style", "")).casefold():
            continue
        indexes = [
            word_index[id(word)]
            for word in html_words
            if _belongs_to(word, paragraph)
        ]
        source_indexes = [
            html_to_source[index] for index in indexes if index in html_to_source
        ]
        if not source_indexes:
            continue
        words = [page.words[index] for index in source_indexes]
        sizes = [word.size_pt for word in words if word.size_pt > 0]
        if not sizes or abs(median(sizes) - body_size) > 0.75:
            continue
        source_lines: dict[float, list[SourceWord]] = {}
        for word in sorted(words, key=lambda item: (item.top, item.x0)):
            source_lines.setdefault(round(word.top, 1), []).append(word)
        ordered_lines = list(source_lines.values())
        first_left = min(word.x0 for word in ordered_lines[0])
        if abs(first_left - expected_first_left) > tolerance:
            continue
        if len(ordered_lines) > 1 and not any(
            abs(min(word.x0 for word in line) - body_left) <= tolerance
            for line in ordered_lines[1:]
        ):
            continue
        _set_style(
            paragraph,
            "text-indent",
            f"{first_line_indent_ratio * page.width_pt:.2f}pt",
        )


def _apply_centered_display_rhythm(
    section: object,
    page: SourcePageEvidence,
    html_words: list[_HtmlWord],
    source_to_html: dict[int, int],
) -> None:
    """Preserve deliberate vertical placement on title and divider pages."""
    html_to_source = {
        html_index: source_index for source_index, html_index in source_to_html.items()
    }
    word_index = {id(word): index for index, word in enumerate(html_words)}
    blocks: list[tuple[object, list[SourceWord]]] = []
    for block in section.find_all(
        ["h1", "h2", "h3", "h4", "h5", "h6", "p"], recursive=False
    ):
        if "text-align: center" not in str(block.get("style", "")).casefold():
            continue
        indexes = [
            word_index[id(word)] for word in html_words if _belongs_to(word, block)
        ]
        source_indexes = [
            html_to_source[index] for index in indexes if index in html_to_source
        ]
        if not source_indexes:
            continue
        words = [page.words[index] for index in source_indexes]
        blocks.append((block, words))

    has_display_rule = any(
        stroke.x1 - stroke.x0 >= page.width_pt * 0.5 for stroke in page.strokes
    )
    if len(blocks) < 2 or (len(blocks) < 3 and not has_display_rule):
        return
    for block, words in blocks:
        line_tops = {round(word.top, 1) for word in words}
        if len(line_tops) == 1:
            size = median(word.size_pt for word in words if word.size_pt > 0)
            source_height = max(word.bottom for word in words) - min(word.top for word in words)
            if size > 0 and source_height > 0:
                _set_style(block, "line-height", f"{max(0.9, min(1.5, source_height / size)):.3f}")
        _set_style(block, "margin-top", "0")

    flow_names = ["h1", "h2", "h3", "h4", "h5", "h6", "p"]
    for (block, words), (next_block, next_words) in zip(blocks, blocks[1:]):
        # Centered display rhythm describes consecutive display blocks. A later
        # centered notice must not make the intervening ordinary prose look like
        # blank space after an earlier chapter heading.
        if block.find_next_sibling(flow_names) is not next_block:
            continue
        bottom = max(word.bottom for word in words)
        next_top = min(word.top for word in next_words)
        strokes = [
            stroke
            for stroke in page.strokes
            if bottom <= stroke.top <= next_top
            and stroke.x1 - stroke.x0 >= page.width_pt * 0.5
        ]
        if strokes:
            stroke = min(strokes, key=lambda item: item.top)
            _set_style(block, "padding-bottom", f"{max(0.0, stroke.top - bottom):.2f}pt")
            _set_style(
                block,
                "border-bottom",
                f"{max(0.5, stroke.width):.2f}pt solid {stroke.color}",
            )
            gap = max(0.0, next_top - stroke.bottom)
        else:
            gap = max(0.0, next_top - bottom)
        _set_style(block, "margin-bottom", f"{gap:.2f}pt")


def _apply_block_alignment(
    section: object,
    page: SourcePageEvidence,
    html_words: list[_HtmlWord],
    source_to_html: dict[int, int],
) -> None:
    html_to_source = {html_index: source_index for source_index, html_index in source_to_html.items()}
    word_index = {id(word): index for index, word in enumerate(html_words)}

    source_lines: list[list[SourceWord]] = []
    for word in sorted(page.words, key=lambda item: (item.top, item.x0)):
        if not source_lines or abs(word.top - source_lines[-1][0].top) > 1.0:
            source_lines.append([word])
        else:
            source_lines[-1].append(word)
    line_start_counts = Counter(round(min(word.x0 for word in line), 1) for line in source_lines)
    common_body_lefts = [
        left
        for left, count in line_start_counts.most_common()
        if count >= 2 and left < page.width_pt * 0.25
    ]

    for block in section.find_all(["h1", "h2", "h3", "h4", "h5", "h6", "p", "caption", "figcaption"]):
        indexes = [
            word_index[id(word)] for word in html_words if _belongs_to(word, block)
        ]
        source_indexes = [html_to_source[index] for index in indexes if index in html_to_source]
        if not source_indexes:
            continue
        block_words = [page.words[index] for index in source_indexes]
        block_lines: list[list[SourceWord]] = []
        for word in sorted(block_words, key=lambda item: (item.top, item.x0)):
            if not block_lines or abs(word.top - block_lines[-1][0].top) > 1.0:
                block_lines.append([word])
            else:
                block_lines[-1].append(word)
        line_bounds = [
            (min(word.x0 for word in line), max(word.x1 for word in line))
            for line in block_lines
        ]
        lines_are_geometrically_centered = all(
            abs((left + right) / 2 - page.width_pt / 2) / page.width_pt < 0.035
            for left, right in line_bounds
        )
        lines_are_compact = all(
            (right - left) / page.width_pt < 0.7 for left, right in line_bounds
        )
        letters = "".join(character for character in block.get_text(" ", strip=True) if character.isalpha())
        is_uppercase_display = bool(letters) and letters == letters.upper()
        lines_are_centered = lines_are_geometrically_centered and (
            lines_are_compact or is_uppercase_display
        )
        starts_on_body_indent = block.name == "p" and any(
            abs(line_bounds[0][0] - left) <= 1.5 for left in common_body_lefts
        )
        if lines_are_centered and (is_uppercase_display or not starts_on_body_indent):
            _set_style(block, "text-align", "center")
        elif block.name == "caption":
            _set_style(block, "text-align", "left")


def _rebuild_contents_table(soup: BeautifulSoup, section: object, page: SourcePageEvidence) -> None:
    heading = section.find(re.compile(r"^h[1-6]$"))
    table = section.find("table")
    if table is None:
        return

    heading_text = heading.get_text(" ", strip=True).casefold() if heading is not None else ""
    dotted_line_count = sum(
        TOC_DOTTED_SOURCE_ENTRY_PATTERN.match(" ".join(line.text.split())) is not None
        for line in page.lines
    )
    if heading_text not in TOC_HEADINGS and (dotted_line_count < 2 or not page.links):
        return

    items: list[tuple[str, str, str | None, float]] = []
    current: list[str] | None = None
    current_page: str | None = None
    current_x0 = 0.0
    started = False
    for line in page.lines:
        text = " ".join(line.text.split())
        if not text or text.casefold() in TOC_HEADINGS:
            continue
        dotted_match = TOC_DOTTED_SOURCE_ENTRY_PATTERN.match(text)
        if dotted_match:
            if current is not None:
                items.append(("entry", " ".join(current), current_page, current_x0))
                current = None
            title_text = dotted_match.group("title").rstrip()
            kind = "part" if TOC_PART_PATTERN.match(title_text) else "entry"
            items.append((kind, title_text, dotted_match.group("page"), line.x0))
            started = True
            continue
        if TOC_PART_PATTERN.match(text):
            if current is not None:
                items.append(("entry", " ".join(current), current_page, current_x0))
                current = None
            items.append(("part", text, None, line.x0))
            started = True
            continue
        match = TOC_SOURCE_ENTRY_PATTERN.match(text)
        if match:
            if current is not None:
                items.append(("entry", " ".join(current), current_page, current_x0))
            current = [match.group("title")]
            current_page = match.group("page")
            current_x0 = line.x0
            started = True
            continue
        if started and current is not None and line.top < page.height_pt * 0.83:
            current.append(text)
    if current is not None:
        items.append(("entry", " ".join(current), current_page, current_x0))
    if len([item for item in items if item[0] == "entry"]) < 2:
        return

    baseline_x0 = min(item[3] for item in items)
    table.clear()
    table["class"] = list(dict.fromkeys([*table.get("class", []), "toc-table"]))
    dotted_lines = [
        line
        for line in page.lines
        if TOC_DOTTED_SOURCE_ENTRY_PATTERN.match(" ".join(line.text.split())) is not None
    ]
    if dotted_lines:
        toc_size = median(line.size_pt for line in dotted_lines if line.size_pt > 0)
        _set_style(table, "font-size", f"{toc_size:.2f}pt")
        line_tops = sorted(line.top for line in dotted_lines)
        if len(line_tops) > 1 and toc_size > 0:
            source_span = max(line.bottom for line in dotted_lines) - min(
                line.top for line in dotted_lines
            )
            line_height = max(1.0, min(2.2, source_span / len(dotted_lines) / toc_size))
            _set_style(table, "line-height", f"{line_height:.3f}")
    body = soup.new_tag("tbody")
    for kind, title_text, page_text, x0 in items:
        row = soup.new_tag("tr")
        row["class"] = ["toc-part-row" if kind == "part" else "toc-entry-row"]
        indent = max(0.0, x0 - baseline_x0)
        if indent >= 0.5:
            row["style"] = f"--toc-indent: {indent:.2f}pt"
        cell = soup.new_tag("td")
        # Source-link reconstruction runs after alignment and links the exact
        # title/page-number spans. Keeping this wrapper non-interactive avoids
        # invalid nested anchors while retaining a single flex layout row.
        entry = soup.new_tag("div")
        entry["class"] = ["toc-entry"]
        title = soup.new_tag("span")
        title["class"] = ["toc-part-title" if kind == "part" else "toc-title"]
        title.string = title_text
        entry.append(title)
        if page_text:
            leader = soup.new_tag("span")
            leader["class"] = ["toc-leader"]
            leader["aria-hidden"] = "true"
            page_number = soup.new_tag("span")
            page_number["class"] = ["toc-page"]
            page_number.string = page_text
            entry.extend([leader, page_number])
        cell.append(entry)
        row.append(cell)
        body.append(row)
    table.append(body)
    for sibling in list(table.parent.find_all("p", recursive=False)):
        if sibling.get_text(" ", strip=True).isdigit():
            sibling.decompose()


def _rebuild_plain_contents(soup: BeautifulSoup, section: object, page: SourcePageEvidence) -> None:
    heading = section.find(re.compile(r"^h[1-6]$"))
    table = section.find("table")
    if (
        heading is None
        or table is None
        or heading.get_text(" ", strip=True).casefold() not in TOC_HEADINGS
    ):
        return
    if any(
        TOC_DOTTED_SOURCE_ENTRY_PATTERN.match(" ".join(line.text.split())) is not None
        for line in page.lines
    ):
        return

    items: list[str] = []
    recognized_entries = 0
    for line in page.lines:
        text = " ".join(line.text.split())
        if not text or text.casefold() in TOC_HEADINGS:
            continue
        if PLAIN_TOC_ENTRY_PATTERN.match(text):
            items.append(text)
            recognized_entries += 1
        elif items:
            items[-1] = f"{items[-1]} {text}"
    if recognized_entries < 3:
        return

    contents = soup.new_tag("nav")
    contents["class"] = ["contents-list"]
    contents["aria-label"] = heading.get_text(" ", strip=True)
    for text in items:
        entry = soup.new_tag("p")
        entry["class"] = ["contents-list-entry"]
        entry.string = text
        contents.append(entry)
    container = table.parent
    if container is not None and "table-scroll" in container.get("class", []):
        container.replace_with(contents)
    else:
        table.replace_with(contents)


def _boundary_table(section: object, *, first: bool) -> object | None:
    children = [child for child in section.find_all(recursive=False) if getattr(child, "name", None)]
    if not children:
        return None
    boundary = children[0] if first else children[-1]
    if boundary.name == "table":
        return boundary
    if "table-scroll" in boundary.get("class", []):
        return boundary.find("table", recursive=False)
    return None


def _repair_continued_table_headers(main: object) -> None:
    sections = main.find_all("section", class_="source-page", recursive=False)
    for previous, current in zip(sections, sections[1:]):
        previous_table = _boundary_table(previous, first=False)
        current_table = _boundary_table(current, first=True)
        if previous_table is None or current_table is None:
            continue
        previous_rows = previous_table.find_all("tr")
        current_rows = current_table.find_all("tr")
        if not previous_rows or len(current_rows) < 2:
            continue
        previous_header = previous_rows[0].find_all(["th", "td"], recursive=False)
        previous_last = previous_rows[-1].find_all(["th", "td"], recursive=False)
        current_first = current_rows[0].find_all(["th", "td"], recursive=False)
        current_second = current_rows[1].find_all(["th", "td"], recursive=False)
        if not current_first or not all(cell.name == "th" for cell in current_first):
            continue
        if not all(cell.name == "td" for cell in previous_last + current_second):
            continue
        if not (
            len(previous_header)
            == len(previous_last)
            == len(current_first)
            == len(current_second)
        ):
            continue
        previous_header_text = [cell.get_text(" ", strip=True).casefold() for cell in previous_header]
        current_first_text = [cell.get_text(" ", strip=True).casefold() for cell in current_first]
        if current_first_text == previous_header_text:
            continue
        for cell in current_first:
            cell.name = "td"


def _repair_single_column_tables(
    soup: BeautifulSoup, section: object, page: SourcePageEvidence
) -> None:
    for table in section.find_all("table"):
        rows = table.find_all("tr")
        if not rows or any(len(row.find_all(["td", "th"], recursive=False)) != 1 for row in rows):
            continue
        target = _tokens(table.get_text(" ", strip=True))
        if not target:
            continue
        matched_lines = None
        for start in range(len(page.lines)):
            collected: list[str] = []
            for end in range(start, len(page.lines)):
                collected.extend(_tokens(page.lines[end].text))
                if collected == target:
                    matched_lines = page.lines[start : end + 1]
                    break
                if len(collected) >= len(target) or collected != target[: len(collected)]:
                    break
            if matched_lines is not None:
                break
        if matched_lines is None or len(matched_lines) <= len(rows):
            continue
        body = table.find("tbody") or table
        for row in rows:
            row.decompose()
        for line in matched_lines:
            row = soup.new_tag("tr")
            cell = soup.new_tag("td")
            cell.string = line.text
            row.append(cell)
            body.append(row)


def _apply_source_inline_evidence(
    soup: BeautifulSoup,
    page: SourcePageEvidence,
    html_words: list[_HtmlWord],
    source_to_html: dict[int, int],
) -> None:
    href_by_source: dict[int, str] = {}
    for link in page.links:
        for index in link.word_indexes:
            href_by_source[index] = link.href
    html_to_source = {html_index: source_index for source_index, html_index in source_to_html.items()}
    by_node: dict[int, tuple[NavigableString, list[tuple[_HtmlWord, SourceWord, str | None]]]] = {}
    for html_index, source_index in html_to_source.items():
        html_word = html_words[html_index]
        source_word = page.words[source_index]
        if not (source_word.bold or source_word.italic or source_index in href_by_source):
            continue
        entry = by_node.setdefault(id(html_word.node), (html_word.node, []))
        entry[1].append((html_word, source_word, href_by_source.get(source_index)))

    for node, styled_words in by_node.values():
        text = str(node)
        pieces: list[object] = []
        cursor = 0
        for html_word, source_word, href in sorted(styled_words, key=lambda item: item[0].start):
            if html_word.start > cursor:
                pieces.append(NavigableString(text[cursor : html_word.start]))
            content: object = NavigableString(text[html_word.start : html_word.end])
            if source_word.italic:
                tag = soup.new_tag("em")
                tag.append(content)
                content = tag
            if source_word.bold:
                tag = soup.new_tag("strong")
                tag.append(content)
                content = tag
            if href:
                tag = soup.new_tag("a", href=href)
                tag.append(content)
                content = tag
            pieces.append(content)
            cursor = html_word.end
        if cursor < len(text):
            pieces.append(NavigableString(text[cursor:]))
        node.replace_with(*pieces)


def _merge_adjacent_links(soup: BeautifulSoup) -> None:
    for parent in soup.find_all(True):
        anchor = parent.find("a", recursive=False)
        while anchor is not None:
            sibling = anchor.next_sibling
            separators: list[NavigableString] = []
            while isinstance(sibling, NavigableString) and not WORD_PATTERN.search(str(sibling)):
                separators.append(sibling)
                sibling = sibling.next_sibling
            if getattr(sibling, "name", None) == "a" and sibling.get("href") == anchor.get("href"):
                for separator in separators:
                    anchor.append(separator.extract())
                for child in list(sibling.contents):
                    anchor.append(child.extract())
                following = sibling.next_sibling
                sibling.decompose()
                anchor = anchor
                if following is None:
                    continue
            else:
                anchor = anchor.find_next_sibling("a")


def _normalize_toc_tables(soup: BeautifulSoup) -> None:
    for table in soup.find_all("table"):
        entries: list[tuple[object, object, re.Match[str]]] = []
        for row in table.find_all("tr"):
            cells = row.find_all(["td", "th"], recursive=False)
            if len(cells) != 1:
                entries = []
                break
            cell = cells[0]
            anchors = cell.find_all("a")
            match = TOC_ENTRY_PATTERN.match(cell.get_text(" ", strip=True))
            if len(anchors) != 1 or match is None:
                entries = []
                break
            entries.append((cell, anchors[0], match))
        if not entries:
            continue
        classes = list(table.get("class", []))
        if "toc-table" not in classes:
            classes.append("toc-table")
        table["class"] = classes
        for cell, old_anchor, match in entries:
            anchor = soup.new_tag("a", href=old_anchor.get("href", ""))
            anchor["class"] = ["toc-entry"]
            title = soup.new_tag("span")
            title["class"] = ["toc-title"]
            title.string = match.group("title").rstrip()
            leader = soup.new_tag("span")
            leader["class"] = ["toc-leader"]
            leader["aria-hidden"] = "true"
            page = soup.new_tag("span")
            page["class"] = ["toc-page"]
            page.string = match.group("page")
            anchor.extend([title, leader, page])
            cell.clear()
            cell.append(anchor)


def _resolved_token_pages(
    start: int,
    end: int,
    page_votes: dict[int, list[int]],
) -> list[int | None]:
    pages: list[int | None] = []
    for index in range(start, end):
        votes = page_votes.get(index, [])
        if votes:
            counts = Counter(votes)
            pages.append(max(counts, key=lambda number: (counts[number], -number)))
        else:
            pages.append(None)
    following: int | None = None
    for index in range(len(pages) - 1, -1, -1):
        if pages[index] is not None:
            following = pages[index]
        elif following is not None:
            pages[index] = following
    previous: int | None = None
    for index, page in enumerate(pages):
        if page is None:
            pages[index] = previous
        elif previous is not None and page < previous:
            pages[index] = previous
        previous = pages[index]
    return pages


def _split_text_element(
    soup: BeautifulSoup,
    element: object,
    token_pages: list[int | None],
) -> list[tuple[int, object]]:
    text = element.get_text(" ", strip=True)
    matches = list(WORD_PATTERN.finditer(text))
    if not matches or len(matches) != len(token_pages):
        return []
    assigned = [page for page in token_pages if page is not None]
    if not assigned or len(set(assigned)) == 1:
        return []
    fragments: list[tuple[int, object]] = []
    run_start = 0
    current_page = assigned[0]
    for index in range(1, len(matches) + 1):
        next_page = token_pages[index] if index < len(matches) else None
        if index < len(matches) and next_page == current_page:
            continue
        start_offset = 0 if run_start == 0 else matches[run_start].start()
        end_offset = len(text) if index == len(matches) else matches[index].start()
        fragment_text = text[start_offset:end_offset].strip()
        if fragment_text:
            fragment = soup.new_tag(element.name)
            fragment.attrs = dict(element.attrs)
            fragment.string = fragment_text
            fragments.append((current_page, fragment))
        run_start = index
        if index < len(matches) and next_page is not None:
            current_page = next_page
    return fragments


def _split_list_element(
    soup: BeautifulSoup,
    element: object,
    token_pages: list[int | None],
) -> list[tuple[int, object]]:
    results: list[tuple[int, object]] = []
    offset = 0
    containers: dict[int, object] = {}
    for item in element.find_all("li", recursive=False):
        item_count = len(_tokens(item.get_text(" ", strip=True)))
        item_pages = token_pages[offset : offset + item_count]
        offset += item_count
        assigned = [page for page in item_pages if page is not None]
        if not assigned:
            continue
        pieces = _split_text_element(soup, item, item_pages)
        if not pieces:
            counts = Counter(assigned)
            selected = max(counts, key=lambda number: (counts[number], -number))
            clone = soup.new_tag("li")
            clone.attrs = dict(item.attrs)
            clone.string = item.get_text(" ", strip=True)
            pieces = [(selected, clone)]
        for page_number, piece in pieces:
            container = containers.get(page_number)
            if container is None:
                container = soup.new_tag(element.name)
                container.attrs = dict(element.attrs)
                containers[page_number] = container
                results.append((page_number, container))
            container.append(piece)
    return results


def _normalize_source_pages(
    soup: BeautifulSoup, evidence: SourceEvidence, content_pages: list[int]
) -> object:
    body = soup.body
    split_table = None
    if body is not None:
        for candidate in body.find_all("table", recursive=False):
            if candidate.find("td") and candidate.find("div", class_="page"):
                split_table = candidate
                break
    extracted: dict[int, list[object]] = {}
    if split_table is not None:
        rows = split_table.find_all("tr")
        normalized_pages = [number + 1 for number in content_pages] if content_pages and min(content_pages) == 0 else content_pages
        for page_number, row in zip(normalized_pages, rows):
            cells = row.find_all("td", recursive=False)
            page = cells[-1].find("div", class_="page") if cells else None
            if page is not None:
                extracted[page_number] = [child.extract() for child in list(page.contents)]
        split_table.decompose()
    else:
        page = body.find("div", class_="page") if body else None
        if page is not None:
            children = [
                child
                for child in list(page.contents)
                if not isinstance(child, NavigableString) or str(child).strip()
            ]
            source_tokens: list[str] = []
            source_token_pages: list[int] = []
            for source_page in evidence.pages:
                source_tokens.extend(word.token for word in source_page.words)
                source_token_pages.extend(
                    [source_page.page_number] * len(source_page.words)
                )
            html_tokens: list[str] = []
            child_token_ranges: list[tuple[int, int]] = []
            for child_index, child in enumerate(children):
                child_tokens = _tokens(child.get_text(" ", strip=True)) if hasattr(child, "get_text") else _tokens(str(child))
                start = len(html_tokens)
                html_tokens.extend(child_tokens)
                child_token_ranges.append((start, len(html_tokens)))
            page_votes: dict[int, list[int]] = {}
            matcher = SequenceMatcher(None, source_tokens, html_tokens)
            for source_start, html_start, length in matcher.get_matching_blocks():
                for offset in range(length):
                    page_votes.setdefault(html_start + offset, []).append(
                        source_token_pages[source_start + offset]
                    )
            previous_page = content_pages[0] if content_pages else 1
            for child_index, child in enumerate(children):
                start, end = child_token_ranges[child_index]
                token_pages = _resolved_token_pages(start, end, page_votes)
                pieces: list[tuple[int, object]] = []
                if getattr(child, "name", None) in ("p", "h1", "h2", "h3", "h4", "h5", "h6"):
                    pieces = _split_text_element(soup, child, token_pages)
                elif getattr(child, "name", None) in ("ul", "ol"):
                    pieces = _split_list_element(soup, child, token_pages)
                if pieces:
                    child.extract()
                    for selected_page, piece in pieces:
                        previous_page = max(previous_page, selected_page)
                        extracted.setdefault(previous_page, []).append(piece)
                    continue
                assigned = [page for page in token_pages if page is not None]
                if assigned:
                    counts = Counter(assigned)
                    selected_page = max(counts, key=lambda number: (counts[number], -number))
                    previous_page = max(previous_page, selected_page)
                extracted.setdefault(previous_page, []).append(child.extract())
            page.decompose()
        elif body is not None:
            first_page = content_pages[0] if content_pages else 1
            extracted[first_page] = [child.extract() for child in list(body.contents)]

    main = soup.new_tag("main")
    main["class"] = ["pdf-document"]
    for page_number in range(1, len(evidence.pages) + 1):
        source_page = evidence.pages[page_number - 1]
        section = soup.new_tag("section")
        section["class"] = ["source-page"]
        section["id"] = f"page_{page_number}"
        section["data-source-page"] = str(page_number)
        section["aria-label"] = f"PDF page {page_number}"
        label_candidates = [
            word
            for word in source_page.words
            if word.text.isdigit()
            and word.top >= source_page.height_pt * 0.93
        ]
        if not label_candidates:
            label_candidates = [
                word
                for word in source_page.words
                if word.text.isdigit()
                and word.top >= source_page.height_pt * 0.9
                and abs((word.x0 + word.x1) / 2 - source_page.width_pt / 2)
                <= source_page.width_pt * 0.08
            ]
        page_label_word = max(label_candidates, key=lambda word: word.top) if label_candidates else None
        page_label = page_label_word.text if page_label_word else ""
        section["data-page-label"] = page_label
        if source_page.words:
            content_words = [
                word for word in source_page.words if word is not page_label_word
            ] or list(source_page.words)
            # CSS vertical percentage padding is resolved against the containing
            # block's width, so express every source margin against page width.
            top = min(
                [word.top for word in content_words]
                + [image.top for image in source_page.images]
            ) / source_page.width_pt * 100
            left = min(
                [word.x0 for word in content_words]
                + [image.x0 for image in source_page.images]
            ) / source_page.width_pt * 100
            right_edge = max(
                [word.x1 for word in content_words]
                + [image.x1 for image in source_page.images]
            )
            bottom_edge = max(
                [word.bottom for word in content_words]
                + [image.bottom for image in source_page.images]
            )
            right = (source_page.width_pt - right_edge) / source_page.width_pt * 100
            bottom = (
                source_page.height_pt - bottom_edge
            ) / source_page.width_pt * 100
            section["style"] = (
                f"--pdf-page-top: {top:.2f}%; "
                f"--pdf-page-left: {left:.2f}%; "
                f"--pdf-page-right: {right:.2f}%; "
                f"--pdf-page-bottom: {bottom:.2f}%"
            )
        for child in extracted.get(page_number, []):
            section.append(child)
        main.append(section)
    if body is not None:
        for child in list(body.contents):
            child.extract()
        body.append(main)
    return main


def _normalize_local_image_paths(soup: BeautifulSoup, html_path: Path) -> None:
    root = html_path.parent.resolve()
    for image in soup.find_all("img", src=True):
        source = str(image["src"])
        if source.startswith(("data:", "http://", "https://")):
            continue
        candidate = Path(source)
        if candidate.is_absolute() and candidate.resolve().is_relative_to(root):
            image["src"] = candidate.resolve().relative_to(root).as_posix()


def _mark_image_only_pages(main: object, evidence: SourceEvidence) -> None:
    for page in evidence.pages:
        if page.words:
            continue
        section = main.find("section", attrs={"data-source-page": str(page.page_number)})
        if section is None:
            continue
        meaningful = [
            child
            for child in section.children
            if not isinstance(child, NavigableString) or str(child).strip()
        ]
        if (
            len(meaningful) == 1
            and getattr(meaningful[0], "name", None) == "figure"
            and meaningful[0].find("img")
        ):
            meaningful[0].find("img")["alt"] = ""
            section["class"] = list(
                dict.fromkeys([*section.get("class", []), "source-page-full-image"])
            )
            section["style"] = (
                "--pdf-page-top: 0%; --pdf-page-left: 0%; "
                "--pdf-page-right: 0%; --pdf-page-bottom: 0%"
            )


def _font_stack(family: str) -> str:
    return {
        "serif": 'Georgia, "Times New Roman", serif',
        "monospace": '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    }.get(family, 'Inter, "Segoe UI", Arial, sans-serif')


def build_styles(evidence: SourceEvidence) -> str:
    profile = evidence.typography
    page_width_pt = median(page.width_pt for page in evidence.pages) if evidence.pages else 612.0
    page_height_pt = median(page.height_pt for page in evidence.pages) if evidence.pages else 792.0
    h1, h2, h3 = profile.heading_scale
    faces = {font.source_name: font for font in evidence.fonts}
    body_face = faces.get(profile.body_font_name)
    body_stack = (
        f'"{body_face.css_family}", {_font_stack(profile.body_family)}'
        if body_face
        else _font_stack(profile.body_family)
    )
    font_rules_parts = []
    for font in evidence.fonts:
        font_format = "truetype" if font.href.endswith(".ttf") else "opentype"
        font_rules_parts.append(
            f'@font-face {{ font-family: "{font.css_family}"; '
            f'src: url("{font.href}") format("{font_format}"); '
            f"font-weight: {font.weight}; font-style: {font.style}; font-display: block; }}"
        )
    font_rules = "\n".join(font_rules_parts)
    return f"""{font_rules}
:root {{
  --pdf-body-size: {profile.body_size_pt:.2f}pt;
  --pdf-text: {profile.text_color};
  --pdf-page-width: {page_width_pt:.2f}pt;
  --pdf-page-height: {page_height_pt:.2f}pt;
  --pdf-page-aspect: {page_width_pt:.2f} / {page_height_pt:.2f};
}}
* {{ box-sizing: border-box; }}
html {{ background-color: #f5f5f5; color: var(--pdf-text); }}
body {{
  max-width: min(800px, var(--pdf-page-width));
  margin: 0 auto;
  padding: 2rem 0;
  font-family: {body_stack};
  font-size: var(--pdf-body-size);
  line-height: 1.45;
}}
main.pdf-document {{ width: 100%; margin: 0; }}
.source-page {{
  position: relative;
  aspect-ratio: var(--pdf-page-aspect);
  margin-bottom: 1.5rem;
  padding: var(--pdf-page-top, 2rem) var(--pdf-page-right, 2rem) var(--pdf-page-bottom, 2rem) var(--pdf-page-left, 2rem);
  background-color: #fff;
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.12);
}}
.source-page:last-child {{ margin-bottom: 0; }}
.source-page > :first-child {{ margin-top: 0; }}
.source-page-full-image {{ overflow: hidden; padding: 0; }}
.source-page-full-image > figure {{ position: absolute; inset: 0; margin: 0; }}
.source-page-full-image > figure > img {{ width: 100%; height: 100%; object-fit: cover; }}
.source-page::after {{
  content: attr(data-page-label);
  position: absolute;
  right: 1rem;
  bottom: 0.75rem;
  left: 1rem;
  color: #777;
  font-size: 0.75rem;
  line-height: 1;
  text-align: center;
}}
h1 {{ font-size: {h1:.2f}em; }}
h2 {{ font-size: {h2:.2f}em; }}
h3 {{ font-size: {h3:.2f}em; }}
h1, h2, h3, h4, h5, h6 {{
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  color: #333;
  line-height: 1.25;
  break-after: avoid;
}}
h1 {{ border-bottom: 0; }}
.source-page > h1:first-child:not([style*="text-align: center"]) {{ padding-bottom: 0.3em; border-bottom: 0.12em solid currentColor; }}
p {{ margin: 0 0 0.55em; text-align: justify; }}
p, li, td, th {{ overflow-wrap: anywhere; }}
figure {{ max-width: 100%; margin: 1.5em 0; text-align: center; }}
img {{ display: block; max-width: 100%; height: auto; margin-inline: auto; }}
figcaption {{ margin-top: 0.5em; color: #666; text-align: center; }}
.table-scroll {{ width: 100%; max-width: 100%; overflow-x: auto; }}
table {{ width: 100%; max-width: 100%; margin: 1em 0; border-collapse: collapse; }}
th, td {{ padding: 8px; border: 1px solid #ddd; text-align: start; vertical-align: top; }}
th {{ background-color: #f2f2f2; font-weight: bold; }}
.toc-table {{ margin: 0; border: 0; table-layout: auto; }}
.toc-table td {{ padding: 0; border: 0; }}
.toc-part-row td {{ font-weight: 700; }}
.toc-entry {{ display: flex; align-items: baseline; gap: 0.3em; width: 100%; box-sizing: border-box; padding-left: var(--toc-indent, 0pt); color: inherit; text-decoration: none; }}
.toc-title {{ flex: 0 1 auto; }}
.toc-part-title {{ flex: 0 1 auto; }}
.toc-leader {{ flex: 1 1 auto; min-width: 1rem; border-bottom: 1px dotted currentColor; }}
.toc-page {{ flex: 0 0 auto; min-width: 2ch; text-align: right; }}
.contents-list {{ margin: 0; }}
.contents-list-entry {{ margin: 0 0 0.45em; line-height: 1.25; text-align: left; }}
.contents-list-entry:last-child {{ margin-bottom: 0; }}
pre {{ padding: 1em; overflow: auto; background-color: #f6f8fa; border-radius: 3px; }}
code {{ padding: 0.2em 0.4em; background-color: #f6f8fa; border-radius: 3px; font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; }}
pre code {{ padding: 0; background-color: transparent; }}
.formula {{ margin: 1em 0; padding: 0.5em; background-color: #f9f9f9; text-align: center; }}
.formula-not-decoded {{
  margin: 1em 0;
  padding: 0.5em;
  background: repeating-linear-gradient(45deg, #f0f0f0, #f0f0f0 10px, #f9f9f9 10px, #f9f9f9 20px);
  text-align: center;
}}
.key-value-region {{ margin: 1em 0; padding: 1em; background-color: #f9f9f9; border-radius: 4px; }}
.key-value-region dt {{ font-weight: bold; }}
.key-value-region dd {{ margin: 0 0 0.5em 1em; }}
.form-container {{ margin: 1em 0; padding: 1em; border: 1px solid #ddd; border-radius: 4px; }}
.form-item {{ margin-bottom: 0.5em; }}
.image-classification {{ margin-top: 0.5em; color: #666; font-size: 0.9em; }}
details.docling-meta {{ margin: 0.5em 0; font-size: 0.9em; text-align: left; }}
details.docling-meta > summary {{ padding: 2px 6px; color: #555; cursor: pointer; font-style: italic; }}
.docling-meta-field {{ margin: 4px 0 4px 1em; padding: 6px 10px; background-color: #f0f0f0; border-left: 3px solid #ccc; border-radius: 3px; text-align: left; }}
.docling-meta-field-label {{ color: #444; font-weight: bold; }}
a {{ color: inherit; text-decoration: inherit; }}
@media (max-width: 640px) {{
  body {{ padding: 0.75rem; }}
  .source-page {{ margin-bottom: 1rem; }}
  .source-page::after {{ bottom: 0.5rem; }}
}}
@media print {{
  html {{ background: #fff; }}
  body {{ max-width: none; padding: 0; }}
  main.pdf-document {{ width: auto; margin: 0; }}
  .source-page {{ min-height: var(--pdf-page-height); margin: 0; padding: 0; aspect-ratio: auto; box-shadow: none; }}
  .source-page:not(:empty) {{ padding-top: var(--pdf-page-top, 0%); }}
  .source-page + .source-page:not(:empty) {{ break-before: page; }}
  a {{ color: inherit; }}
}}
"""


def enhance_html(
    html_path: Path,
    stylesheet_path: Path,
    evidence: SourceEvidence,
    *,
    title: str,
    language: str,
    source_page_count: int,
    content_pages: list[int],
) -> None:
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    if soup.html is None:
        wrapper = BeautifulSoup("<!doctype html><html><head></head><body></body></html>", "html.parser")
        wrapper.body.append(soup)
        soup = wrapper
    if soup.head is None:
        soup.html.insert(0, soup.new_tag("head"))
    if soup.body is None:
        soup.html.append(soup.new_tag("body"))

    soup.html["lang"] = language
    for embedded_style in list(soup.head.find_all("style")):
        embedded_style.decompose()
    title_tag = soup.head.find("title") or soup.new_tag("title")
    title_tag.string = title
    if title_tag.parent is None:
        soup.head.append(title_tag)
    if not soup.head.find("meta", attrs={"name": "viewport"}):
        viewport = soup.new_tag("meta")
        viewport["name"] = "viewport"
        viewport["content"] = "width=device-width, initial-scale=1"
        soup.head.append(viewport)
    for existing_generator in list(soup.head.find_all("meta", attrs={"name": "generator"})):
        existing_generator.decompose()
    generator = soup.new_tag("meta")
    generator["name"] = "generator"
    generator["content"] = "pdf2html-skill"
    soup.head.append(generator)

    main = _normalize_source_pages(soup, evidence, content_pages)
    _normalize_local_image_paths(soup, html_path)
    _mark_image_only_pages(main, evidence)
    document_right_ratio = _infer_document_justified_right_ratio(evidence)
    document_body_left_ratio = _infer_document_body_left_ratio(evidence)
    document_first_line_indent_ratio = _infer_document_first_line_indent_ratio(
        evidence, document_body_left_ratio
    )
    for page in evidence.pages:
        section = main.find("section", attrs={"data-source-page": str(page.page_number)})
        if section is None:
            continue
        _unwrap_inferred_inline_styles(section)
        _repair_single_column_tables(soup, section, page)
        _rebuild_contents_table(soup, section, page)
        _rebuild_plain_contents(soup, section, page)
        _repair_merged_justified_paragraphs(
            soup, section, page, document_right_ratio
        )
        html_words, source_to_html = _alignment(page, section)
        _repair_headings(
            section,
            page,
            html_words,
            source_to_html,
            evidence.typography.body_size_pt,
        )
        _apply_block_font_sizes(
            section,
            page,
            html_words,
            source_to_html,
            evidence.typography.body_size_pt,
        )
        _apply_block_typography(
            section,
            page,
            html_words,
            source_to_html,
            evidence.typography,
            evidence.fonts,
        )
        _apply_table_geometry(soup, section, page, html_words, source_to_html)
        _apply_block_geometry(section, page, html_words, source_to_html)
        _apply_block_alignment(section, page, html_words, source_to_html)
        _apply_paragraph_first_line_indents(
            section,
            page,
            html_words,
            source_to_html,
            document_body_left_ratio,
            document_first_line_indent_ratio,
            evidence.typography.body_size_pt,
        )
        _apply_centered_display_rhythm(section, page, html_words, source_to_html)
        _apply_source_inline_evidence(soup, page, html_words, source_to_html)

    _repair_continued_table_headers(main)
    _merge_adjacent_links(soup)
    _normalize_toc_tables(soup)

    stylesheet_path.parent.mkdir(parents=True, exist_ok=True)
    stylesheet_path.write_text(build_styles(evidence), encoding="utf-8")
    link = soup.new_tag("link", rel="stylesheet", href="assets/styles.css")
    soup.head.append(link)

    for table in soup.find_all("table"):
        if table.parent and "table-scroll" in table.parent.get("class", []):
            continue
        container = soup.new_tag("div")
        container["class"] = ["table-scroll"]
        table.wrap(container)

    for image in soup.find_all("img"):
        figure = image.find_parent("figure")
        caption = figure.find("figcaption") if figure else None
        if caption:
            image["alt"] = caption.get_text(" ", strip=True)
        elif not image.has_attr("alt"):
            image["alt"] = ""
        image["loading"] = "lazy"
        image["decoding"] = "async"

    for anchor in soup.find_all("a", href=True):
        if str(anchor["href"]).startswith(("http://", "https://")):
            anchor["rel"] = "noopener noreferrer"

    for doctype in list(soup.find_all(string=lambda value: isinstance(value, Doctype))):
        doctype.extract()
    html_path.write_text("<!doctype html>\n" + str(soup), encoding="utf-8")
