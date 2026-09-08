from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from zipfile import BadZipFile, ZipFile

from bs4 import BeautifulSoup, Tag
from docx import Document
from lxml import etree

from .converter import (
    _is_hidden,
    _text_counts,
    _tokens,
    find_body_heading,
    find_cover_page,
    find_toc_container,
    semantic_text,
    toc_entry_headings,
)
from .models import Finding, Html2DocError


W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PR = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"w": W, "r": R, "pr": PR}


def _xml(files: dict[str, bytes], name: str):
    try:
        return etree.fromstring(files[name])
    except KeyError as error:
        raise Html2DocError(f"DOCX package is missing {name}.") from error
    except etree.XMLSyntaxError as error:
        raise Html2DocError(f"Invalid XML in {name}: {error}") from error


def validate_docx(source: Path, docx_path: Path) -> dict[str, object]:
    source, docx_path = source.resolve(), docx_path.resolve()
    if not source.is_file():
        raise Html2DocError(f"Input HTML does not exist: {source}")
    if not docx_path.is_file():
        raise Html2DocError(f"DOCX does not exist: {docx_path}")
    findings: list[Finding] = []
    try:
        with ZipFile(docx_path) as package:
            bad = package.testzip()
            if bad:
                findings.append(Finding("error", "package-crc", f"Corrupt DOCX member: {bad}"))
            files = {name: package.read(name) for name in package.namelist()}
    except BadZipFile as error:
        raise Html2DocError(f"Output is not a valid DOCX ZIP package: {error}") from error
    document_xml = _xml(files, "word/document.xml")
    styles_xml = _xml(files, "word/styles.xml")
    relationships = _xml(files, "word/_rels/document.xml.rels")
    settings = _xml(files, "word/settings.xml")
    try:
        opened = Document(docx_path)
    except Exception as error:
        findings.append(Finding("error", "python-docx-open", f"python-docx cannot reopen the output: {error}"))
        opened = None

    soup = BeautifulSoup(source.read_text(encoding="utf-8"), "html.parser")
    source_tokens = _tokens(semantic_text(soup))
    comparison_document = deepcopy(document_xml)
    for paragraph in comparison_document.xpath(".//w:p[w:pPr/w:pStyle[starts-with(@w:val, 'ScriptaTOC')]]", namespaces=NS):
        paragraph.getparent().remove(paragraph)
    toc_node = find_toc_container(soup)
    if toc_node is None or toc_node.name not in {"table", "nav"}:
        for paragraph in comparison_document.xpath(".//w:p[w:pPr/w:pStyle[@w:val='TOCHeading']]", namespaces=NS):
            paragraph.getparent().remove(paragraph)
    output_text = " ".join(comparison_document.xpath(".//w:t/text()", namespaces=NS))
    for name in ("word/footnotes.xml", "word/endnotes.xml"):
        if name in files:
            output_text += " " + " ".join(_xml(files, name).xpath(".//w:t/text()", namespaces=NS))
    output_tokens = _tokens(output_text)
    coverage, order = _text_counts(source_tokens, output_tokens)
    if coverage < 0.995:
        findings.append(Finding("error", "text-coverage", f"Normalized semantic text coverage is {coverage:.2%}, below 99.5%."))
    if order < 0.98:
        findings.append(Finding("error", "text-order", f"Normalized adjacent-token order is {order:.2%}, below 98%."))

    fields = " ".join(document_xml.xpath(".//w:instrText/text()", namespaces=NS))
    visible_text = " ".join(document_xml.xpath(".//w:t/text()", namespaces=NS))
    if "Update field to build the table of contents" in visible_text or "TOC" in fields:
        findings.append(Finding("error", "toc-placeholder", "The document contains a dynamic TOC or a visible TOC placeholder."))
    if settings.find(f"{{{W}}}updateFields") is None:
        findings.append(Finding("error", "field-update-missing", "Word fields are not marked for refresh on open."))
    heading_styles = set(styles_xml.xpath(".//w:style[starts-with(@w:styleId, 'Heading')]/@w:styleId", namespaces=NS))
    if not heading_styles:
        findings.append(Finding("error", "heading-styles-missing", "Native Word heading styles are missing."))
    bookmarks = document_xml.xpath("count(.//w:bookmarkStart)", namespaces=NS)
    hyperlinks = document_xml.xpath("count(.//w:hyperlink)", namespaces=NS)
    images = document_xml.xpath("count(.//w:drawing)", namespaces=NS)
    tables = document_xml.xpath("count(.//w:tbl)", namespaces=NS)
    footnote_refs = document_xml.xpath("count(.//w:footnoteReference)", namespaces=NS)
    endnote_refs = document_xml.xpath("count(.//w:endnoteReference)", namespaces=NS)
    rel_types = relationships.xpath("./pr:Relationship/@Type", namespaces=NS)
    bookmark_names = set(document_xml.xpath(".//w:bookmarkStart/@w:name", namespaces=NS))
    internal_targets = set(document_xml.xpath(".//w:hyperlink/@w:anchor", namespaces=NS))
    missing_targets = sorted(internal_targets - bookmark_names)
    if missing_targets:
        findings.append(Finding("error", "internal-link-target", "Internal Word links target missing bookmarks.", {"targets": missing_targets}))
    header_parts = [name for name in files if name.startswith("word/header") and name.endswith(".xml")]
    header_references = document_xml.xpath("count(.//w:headerReference)", namespaces=NS)
    if header_parts or header_references:
        findings.append(Finding("error", "unexpected-header", "The DOCX must not contain generated headers."))
    has_body_section = bool(document_xml.xpath(".//w:pgNumType[@w:fmt='decimal']", namespaces=NS))
    decimal_restarts = int(document_xml.xpath("count(.//w:pgNumType[@w:fmt='decimal' and @w:start='1'])", namespaces=NS))
    if has_body_section and decimal_restarts != 1:
        findings.append(Finding("error", "body-page-number-restarts", f"Expected one Arabic page-number restart, found {decimal_restarts}."))
    if footnote_refs and not any(value.endswith("/footnotes") for value in rel_types):
        findings.append(Finding("error", "footnote-relationship", "Footnote references have no package relationship."))
    if endnote_refs and not any(value.endswith("/endnotes") for value in rel_types):
        findings.append(Finding("error", "endnote-relationship", "Endnote references have no package relationship."))
    if opened is not None and "html2doc-skill" not in (opened.core_properties.keywords or ""):
        findings.append(Finding("error", "ownership-marker", "The html2doc-skill ownership marker is missing."))
    source_heading_nodes = list(soup.select("main[data-reader-content] h1, main[data-reader-content] h2, main[data-reader-content] h3, main[data-reader-content] h4, main[data-reader-content] h5, main[data-reader-content] h6"))
    if toc_node:
        source_heading_nodes = [heading for heading in source_heading_nodes if heading is not toc_node and toc_node not in heading.parents]
        if toc_node.name in {"table", "nav"}:
            toc_heading = toc_node.find_previous(["h1", "h2", "h3", "h4", "h5", "h6"])
            if toc_heading and toc_heading.get_text(" ", strip=True).casefold() in {"contents", "table of contents"}:
                source_heading_nodes = [heading for heading in source_heading_nodes if heading is not toc_heading]
    source_headings = len(source_heading_nodes)
    output_headings = int(document_xml.xpath("count(.//w:p[w:pPr/w:pStyle[starts-with(@w:val, 'Heading') or @w:val='ScriptaBookTitle']])", namespaces=NS))
    if output_headings != source_headings:
        findings.append(Finding("error", "heading-count", f"Expected {source_headings} semantic headings, found {output_headings} in DOCX."))
    body_heading = find_body_heading(soup, toc_node, find_cover_page(soup))
    toc_entries = toc_entry_headings(soup, body_heading)
    static_toc_count = int(document_xml.xpath("count(.//w:p[w:pPr/w:pStyle[starts-with(@w:val, 'ScriptaTOC')]])", namespaces=NS))
    if static_toc_count != len(toc_entries):
        findings.append(Finding("error", "static-toc-count", f"Expected {len(toc_entries)} static TOC entries, found {static_toc_count}."))
    toc_containers = {id(toc_node)} if toc_node is not None else set()
    source_links = [
        link for link in soup.select("main[data-reader-content] a[href]")
        if str(link.get("role", "")).casefold() != "doc-noteref"
        and link.find("a", href=True) is None
        and not any(id(parent) in toc_containers for parent in link.parents if isinstance(parent, Tag))
        and not any(_is_hidden(parent) for parent in link.parents if isinstance(parent, Tag))
    ]
    expected_hyperlinks = len(source_links) + len(toc_entries)
    if int(hyperlinks) != expected_hyperlinks:
        findings.append(Finding("error", "hyperlink-count", f"Expected {expected_hyperlinks} content and TOC hyperlinks, found {int(hyperlinks)} in DOCX."))
    source_images = len([image for image in soup.select("main[data-reader-content] img") if not any(_is_hidden(parent) for parent in image.parents if isinstance(parent, Tag))])
    source_tables = len([table for table in soup.select("main[data-reader-content] table") if "toc-table" not in table.get("class", []) and not any(_is_hidden(parent) for parent in table.parents if isinstance(parent, Tag))])
    if images != source_images:
        findings.append(Finding("error", "image-count", f"Expected {source_images} images, found {int(images)} in DOCX."))
    if tables != source_tables:
        findings.append(Finding("error", "table-count", f"Expected {source_tables} content tables, found {int(tables)} in DOCX."))
    footnote_targets = {
        str(tag.get("href", ""))[1:] for tag in soup.select('[role="doc-noteref"][href^="#"]')
        if soup.find(id=str(tag.get("href", ""))[1:]) and str(soup.find(id=str(tag.get("href", ""))[1:]).get("role", "")).casefold() == "doc-footnote"
    }
    expected_footnotes = sum(1 for tag in soup.select('[role="doc-noteref"][href^="#"]') if str(tag.get("href", ""))[1:] in footnote_targets)
    expected_endnotes = len(soup.select('[role="doc-noteref"][href^="#"]')) - expected_footnotes
    if int(footnote_refs) != expected_footnotes or int(endnote_refs) != expected_endnotes:
        findings.append(Finding("error", "note-count", f"Expected {expected_footnotes} footnotes and {expected_endnotes} endnotes, found {int(footnote_refs)} and {int(endnote_refs)}."))
    footer_fields = []
    invalid_footers = []
    for name, payload in files.items():
        if name.startswith("word/footer") and name.endswith(".xml"):
            footer = etree.fromstring(payload)
            fields = [value.strip() for value in footer.xpath(".//w:instrText/text()", namespaces=NS)]
            visible = [value.strip() for value in footer.xpath(".//w:t/text()", namespaces=NS) if value.strip()]
            footer_fields.extend(fields)
            if fields != ["PAGE"] or any(not value.isdecimal() for value in visible):
                invalid_footers.append(name)
    if not any("PAGE" in value for value in footer_fields):
        findings.append(Finding("error", "page-number-field", "No native PAGE field exists in the footer."))
    if invalid_footers:
        findings.append(Finding("error", "footer-content", "Footers may contain only one native PAGE field.", {"parts": invalid_footers}))
    if not has_body_section:
        findings.append(Finding("warning", "body-boundary-missing", "No body boundary was detected, so Arabic page numbering was not started."))

    status = "failed" if any(item.severity == "error" for item in findings) else ("passed_with_warnings" if findings else "passed")
    return {
        "status": status,
        "source": str(source),
        "artifact": str(docx_path),
        "findings": [item.json() for item in findings],
        "metrics": {
            "textCoverage": round(coverage, 6), "textOrder": round(order, 6),
            "sourceTokens": len(source_tokens), "outputTokens": len(output_tokens),
            "headings": source_headings,
            "bookmarks": int(bookmarks), "hyperlinks": int(hyperlinks), "images": int(images),
            "tables": int(tables), "footnotes": int(footnote_refs), "endnotes": int(endnote_refs),
            "visualValidation": False,
        },
    }
