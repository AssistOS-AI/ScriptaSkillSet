"""Deterministic HTML reading order and self-contained EPUB preparation."""
from __future__ import annotations

from collections import Counter
from dataclasses import asdict, dataclass, field
import hashlib
import json
from pathlib import Path
import re
import unicodedata
from xml.etree import ElementTree as ET
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED

from bs4 import BeautifulSoup, Comment, NavigableString, Tag
from langdetect import DetectorFactory, detect_langs, LangDetectException

VOICES = {
    "en": "en_GB-alan-medium", "fr": "fr_FR-tom-medium",
    "de": "de_DE-thorsten_emotional-medium", "es": "es_ES-davefx-medium",
    "pt": "pt_PT-tugão-medium", "it": "it_IT-paola-medium",
    "ro": "ro_RO-mihai-medium", "pl": "pl_PL-darkman-medium",
}
ISO3 = dict(zip(VOICES, ("eng", "fra", "deu", "spa", "por", "ita", "ron", "pol")))
HEADINGS = {f"h{i}" for i in range(1, 7)}
TOC_TITLES = {"contents", "table of contents", "cuprins", "sommaire", "table des matières",
              "inhaltsverzeichnis", "índice", "indice", "sommario", "spis treści"}
BLOCKS = HEADINGS | {"p", "li", "dt", "dd", "figcaption", "pre", "tr", "blockquote"}


class BookError(ValueError):
    """An input or output cannot be processed safely."""


def compact(text: str) -> str:
    return " ".join(unicodedata.normalize("NFC", text).split())


def digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


@dataclass
class Chapter:
    title: str
    paragraphs: list[str]
    heading_indices: list[int] = field(default_factory=list)


@dataclass
class Book:
    source: str
    source_hash: str
    title: str
    author: str | None
    language: str
    voice: str
    speed: float
    chapters: list[Chapter]
    warnings: list[str]

    def data(self) -> dict:
        return asdict(self)


def language_for(declared: str | None, text: str, warnings: list[str]) -> str:
    if declared:
        lang = declared.strip().lower().replace("_", "-").split("-")[0]
        lang = {v: k for k, v in ISO3.items()}.get(lang, lang)
    else:
        DetectorFactory.seed = 0
        try:
            candidates = detect_langs(text[:30000])
            lang = candidates[0].lang if candidates[0].prob >= 0.85 else ""
        except LangDetectException:
            lang = ""
        if not lang:
            warnings.append("Language detection inconclusive; using English. Override with --lang.")
            lang = "en"
        else:
            warnings.append(f"No HTML language; detected {lang} from text.")
    if lang not in VOICES:
        raise BookError(f"Unsupported language: {lang}. Supported: {', '.join(VOICES)}")
    return lang


def _meta(soup: BeautifulSoup, *names: str) -> str | None:
    for name in names:
        tag = soup.find("meta", attrs={"name": re.compile(f"^{re.escape(name)}$", re.I)})
        if tag and compact(tag.get("content", "")):
            return compact(tag["content"])
    return None


def _units(root: Tag) -> list[tuple[Tag, str]]:
    """Flatten block boundaries without duplicating nested list/blockquote text."""
    units: list[tuple[Tag, str]] = []

    def visit(node: Tag) -> None:
        if node.name == "tr":
            text = " — ".join(compact(cell.get_text(" ", strip=True)) for cell in node.find_all(["th", "td"], recursive=False))
            if text:
                units.append((node, text))
            return
        pending: list[str] = []

        def flush() -> None:
            text = compact("".join(pending))
            if text:
                units.append((node, text))
            pending.clear()

        for child in node.children:
            if isinstance(child, Comment):
                continue
            if isinstance(child, NavigableString):
                pending.append(str(child))
            elif isinstance(child, Tag):
                if child.name == "br":
                    pending.append(" ")
                elif child.name in BLOCKS or child.find(list(BLOCKS)):
                    flush()
                    visit(child)
                else:
                    pending.append(child.get_text("", strip=False))
        flush()

    visit(root)
    return units


def read_book(source: Path, *, lang: str | None = None, voice: str | None = None,
              speed: float = 1.0, title: str | None = None, author: str | None = None) -> Book:
    source = source.resolve(strict=True)
    if source.suffix.lower() not in {".html", ".htm", ".xhtml"}:
        raise BookError("Input must be a local HTML file.")
    if not 0.5 <= speed <= 2.0:
        raise BookError("Speed must be between 0.5 and 2.0; normal speed is 1.0.")
    raw = source.read_bytes()
    soup = BeautifulSoup(raw, "html.parser")
    warnings: list[str] = []
    root = soup.select_one("main[data-reader-content]")
    if root is None:
        if soup.select_one(".book-page, .book-details, .book-introduction"):
            raise BookError("This is a book landing page. Use full_content.html or the reader's book HTML.")
        root = soup.body
        warnings.append("Legacy HTML: reading body content and inferring chapter boundaries.")
    if root is None:
        raise BookError("No book body found.")
    book_title = title or _meta(soup, "dc.title", "title")
    if not book_title:
        heading = root.find("h1") or soup.title
        book_title = compact(heading.get_text()) if heading else source.stem
    book_author = author if author is not None else _meta(soup, "author", "dc.creator")
    declared = lang or (soup.html.get("lang") if soup.html else None) or _meta(soup, "dc.language")
    toc_targets: set[str] = set()
    for toc in soup.select('nav, [role="doc-toc"], [epub\\:type="toc"], .toc, #toc, .table-of-contents'):
        for link in toc.select('a[href^="#"]'):
            toc_targets.add(link["href"][1:])
    selectors = ('script, style, noscript, template, nav, button, input, select, textarea, '
                 '[hidden], [aria-hidden="true"], [data-pdf-conversion-warning], '
                 '[role="doc-toc"], [epub\\:type="toc"], .toc, #toc, .table-of-contents, '
                 '.reader-toolbar, .reader-controls, .page-number, .pdf-page-number')
    for tag in list(root.select(selectors)):
        if tag.parent is not None:
            tag.decompose()
    for tag in list(root.find_all(style=True)):
        if tag.parent is None:
            continue
        if re.search(r"(?:display\s*:\s*none|visibility\s*:\s*hidden)", tag["style"], re.I):
            tag.decompose()
    units = _units(root)
    # Plain PDF-derived contents: remove only when an exact later heading marks its end.
    for index, (tag, text) in enumerate(units):
        if tag.name in HEADINGS and text.casefold() in TOC_TITLES:
            later = units[index + 1:]
            repeated = next((j for j in range(1, len(later)) if later[j][0].name in HEADINGS
                             and any(compact(t).casefold() == later[j][1].casefold()
                                     for _, t in later[:j])), None)
            if repeated is not None:
                units = units[:index] + later[repeated:]
                warnings.append("Removed a plain contents section using its repeated body heading.")
            else:
                warnings.append("Possible plain contents section retained: no reliable end boundary.")
            break
    if not units:
        raise BookError("No narratable text found.")
    counts = Counter(t.name for t, _ in units if t.name in HEADINGS)
    level = next((f"h{i}" for i in range(1, 7) if counts[f"h{i}"] >= 2), None)
    explicit = []
    for tag, _ in units:
        if tag.name not in HEADINGS:
            continue
        section = (tag.find_parent(attrs={"role": "doc-chapter"}) or
                   tag.find_parent(attrs={"epub:type": "chapter"}) or
                   tag.find_parent(id=lambda value: value in toc_targets))
        if tag.get("id") in toc_targets or (section and section.find(list(HEADINGS)) is tag):
            explicit.append(tag)
    explicit_ids = {id(t) for t in explicit}
    if not explicit_ids:
        warnings.append(f"Chapter boundaries inferred from {level.upper()}." if level else
                        "No repeated chapter headings; using a single chapter.")
    chapters: list[Chapter] = []
    current = Chapter(compact(book_title), [])
    for tag, text in units:
        boundary = id(tag) in explicit_ids if explicit_ids else tag.name == level
        if boundary:
            if current.paragraphs:
                chapters.append(current)
            current = Chapter(text, [])
        # Escape upstream narration control syntax; HTML is data, never voice instructions.
        safe = re.sub(r"\[(\s*/?\s*(?:voice|pause|break)(?:\s*:[^\]]*)?\s*)\]", r"［\1］", text, flags=re.I)
        if safe != text and "Escaped literal narration control tags." not in warnings:
            warnings.append("Escaped literal narration control tags.")
        if tag.name in HEADINGS:
            current.heading_indices.append(len(current.paragraphs))
        current.paragraphs.append(safe)
    if current.paragraphs:
        chapters.append(current)
    text = " ".join(p for c in chapters for p in c.paragraphs)
    language = language_for(declared, text, warnings)
    selected_voice = voice or VOICES[language]
    if not re.fullmatch(r"[a-z]{2}_[A-Z]{2}-[\w%-]+-(?:x_low|low|medium|high)", selected_voice):
        raise BookError("Voice must be a Piper model identifier, e.g. ro_RO-mihai-medium.")
    if selected_voice[:2] != language:
        raise BookError(f"Voice {selected_voice} does not match language {language}.")
    return Book(str(source), hashlib.sha256(raw).hexdigest(), compact(book_title), book_author,
                language, selected_voice, speed, chapters, warnings)


def write_epub(book: Book, path: Path) -> None:
    """Minimal EPUB3: one spine document per chapter, no external resources."""
    ns = "http://www.idpf.org/2007/opf"
    dc = "http://purl.org/dc/elements/1.1/"
    ET.register_namespace("", ns)
    ET.register_namespace("dc", dc)
    package = ET.Element(f"{{{ns}}}package", {"version": "3.0", "unique-identifier": "book-id"})
    metadata = ET.SubElement(package, f"{{{ns}}}metadata")
    for key, value in (("identifier", digest(book.data())), ("title", book.title),
                       ("language", book.language), ("creator", book.author)):
        if value:
            node = ET.SubElement(metadata, f"{{{dc}}}{key}", {"id": "book-id"} if key == "identifier" else {})
            node.text = value
    ET.SubElement(metadata, f"{{{ns}}}meta", {"property": "dcterms:modified"}).text = "2000-01-01T00:00:00Z"
    manifest = ET.SubElement(package, f"{{{ns}}}manifest")
    ET.SubElement(manifest, f"{{{ns}}}item", {"id": "nav", "href": "nav.xhtml", "media-type": "application/xhtml+xml", "properties": "nav"})
    spine = ET.SubElement(package, f"{{{ns}}}spine")
    html_ns = "http://www.w3.org/1999/xhtml"

    def document(title: str) -> tuple[ET.Element, ET.Element]:
        html = ET.Element("html", {"xmlns": html_ns, "lang": book.language})
        head = ET.SubElement(html, "head")
        ET.SubElement(head, "title").text = title
        return html, ET.SubElement(html, "body")

    nav, body = document(book.title)
    nav_element = ET.SubElement(body, "nav", {"xmlns:epub": "http://www.idpf.org/2007/ops", "epub:type": "toc"})
    listing = ET.SubElement(nav_element, "ol")
    with ZipFile(path, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("mimetype", "application/epub+zip", compress_type=ZIP_STORED)
        archive.writestr("META-INF/container.xml", '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
        for i, chapter in enumerate(book.chapters, 1):
            filename = f"chapter-{i:04d}.xhtml"
            ET.SubElement(manifest, f"{{{ns}}}item", {"id": f"ch{i}", "href": filename, "media-type": "application/xhtml+xml"})
            ET.SubElement(spine, f"{{{ns}}}itemref", {"idref": f"ch{i}"})
            ET.SubElement(ET.SubElement(listing, "li"), "a", {"href": filename}).text = chapter.title
            html, body = document(chapter.title)
            for paragraph in chapter.paragraphs:
                ET.SubElement(body, "p").text = paragraph
            archive.writestr(filename, ET.tostring(html, encoding="utf-8", xml_declaration=True))
        archive.writestr("nav.xhtml", ET.tostring(nav, encoding="utf-8", xml_declaration=True))
        archive.writestr("book.opf", ET.tostring(package, encoding="utf-8", xml_declaration=True))
