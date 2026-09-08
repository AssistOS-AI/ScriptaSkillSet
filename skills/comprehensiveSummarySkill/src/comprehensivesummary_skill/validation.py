from __future__ import annotations

from collections import Counter
from pathlib import Path
import re
from typing import Any

from bs4 import BeautifulSoup

from .core import _fact_tokens, normalize_language, word_count


def _finding(severity: str, code: str, message: str, details: Any = None) -> dict[str, Any]:
    item: dict[str, Any] = {"severity": severity, "code": code, "message": message}
    if details is not None:
        item["details"] = details
    return item


def validate_summary(
    source_path: Path,
    target_path: Path,
    *,
    intended_source: Path | None = None,
    expected_language: str | None = None,
) -> dict[str, Any]:
    source_path = source_path.expanduser().resolve()
    target_path = target_path.expanduser().resolve()
    source = BeautifulSoup(source_path.read_text(encoding="utf-8"), "html.parser")
    target = BeautifulSoup(target_path.read_text(encoding="utf-8"), "html.parser")
    findings: list[dict[str, Any]] = []

    marker = target.find("meta", attrs={"name": "summary-generator"})
    if marker is None or marker.get("content") != "comprehensivesummary-skill":
        findings.append(_finding("error", "ownership-marker", "Summary ownership metadata is missing."))
    source_lang = expected_language or (str(source.html.get("lang", "")) if source.html else "")
    target_lang = str(target.html.get("lang", "")) if target.html else ""
    try:
        if normalize_language(source_lang) != normalize_language(target_lang):
            findings.append(_finding("error", "language", "Summary language metadata differs from the source."))
    except Exception:
        findings.append(_finding("error", "language", "Source or summary has invalid language metadata."))

    article = target.find("article", attrs={"data-summary-body": True})
    if article is None:
        findings.append(_finding("error", "summary-body", "The main summary article is missing."))
        actual_words = 0
        main_text = ""
    else:
        clone = BeautifulSoup(str(article), "html.parser")
        main_text = clone.get_text(" ", strip=True)
        actual_words = word_count(main_text)
        if not clone.find("h1") or not clone.find("h2") or not clone.find_all("p"):
            findings.append(_finding("error", "semantic-shape", "Summary requires a title, thematic headings, and paragraphs."))
        for paragraph in clone.find_all("p"):
            if not paragraph.get_text(" ", strip=True):
                findings.append(_finding("error", "empty-paragraph", "Summary contains an empty paragraph."))
            if "dek" not in paragraph.get("class", []) and (
                not str(paragraph.get("data-clusters", "")).strip()
                or not str(paragraph.get("data-source-units", "")).strip()
            ):
                findings.append(_finding("error", "paragraph-traceability", "A summary paragraph lacks source tracing."))

    def meta_int(name: str) -> int | None:
        tag = target.find("meta", attrs={"name": name})
        try:
            return int(str(tag.get("content"))) if tag else None
        except (TypeError, ValueError):
            return None

    minimum, maximum, declared, words_per_minute = (
        meta_int("summary-minimum-words"), meta_int("summary-maximum-words"),
        meta_int("summary-actual-words"), meta_int("summary-words-per-minute"),
    )
    if minimum is None or maximum is None or declared is None or words_per_minute is None:
        findings.append(_finding("error", "word-metadata", "Word-budget metadata is incomplete."))
    else:
        if declared != actual_words:
            findings.append(_finding("error", "word-count", "Declared and actual summary word counts differ.", {"declared": declared, "actual": actual_words}))
        if not minimum <= actual_words <= maximum:
            findings.append(_finding("error", "word-budget", "Summary is outside the requested reading-time range.", {"minimum": minimum, "maximum": maximum, "actual": actual_words}))

    source_text = source.get_text(" ", strip=True)
    unsupported = sorted(_fact_tokens(main_text) - _fact_tokens(source_text))
    if unsupported:
        findings.append(_finding("error", "unsupported-factual-token", "Summary contains numbers, dates, URLs, emails, or DOI values absent from the source.", unsupported))

    source_map = target.find("details", attrs={"data-source-map": True})
    if source_map is None or source_map.find("table") is None:
        findings.append(_finding("error", "source-map", "The collapsible source map is missing."))
    else:
        for link in source_map.find_all("a", href=True):
            href = str(link["href"])
            if re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", href) or href.startswith(("#", "/", "//")):
                continue
            path_part = href.split("#", 1)[0].split("?", 1)[0]
            base = intended_source.parent if intended_source else target_path.parent
            local = (target_path.parent / path_part).resolve()
            if intended_source and Path(path_part).name == intended_source.name:
                local = intended_source
            if not local.is_file():
                findings.append(_finding("error", "source-link", f"Source-map link does not resolve: {href}"))

    ids = [str(tag["id"]) for tag in target.find_all(attrs={"id": True})]
    duplicates = [value for value, count in Counter(ids).items() if count > 1]
    if duplicates:
        findings.append(_finding("error", "duplicate-ids", "Summary contains duplicate element IDs.", duplicates))
    if target.find("script"):
        findings.append(_finding("error", "script", "Standalone summaries must not contain scripts."))
    paragraphs = [] if article is None else [
        " ".join(tag.get_text(" ", strip=True).casefold().split())
        for tag in article.find_all("p") if "dek" not in tag.get("class", [])
        if word_count(tag.get_text(" ", strip=True)) >= 8
    ]
    paragraph_counts = Counter(paragraphs)
    repeated = sum(count - 1 for count in paragraph_counts.values() if count > 1)
    if repeated:
        findings.append(_finding("error", "duplicate-paragraphs", "Summary contains duplicate substantial paragraphs.", {"count": repeated}))

    status = (
        "failed" if any(item["severity"] == "error" for item in findings)
        else "passed_with_warnings" if findings else "passed"
    )
    return {
        "status": status,
        "findings": findings,
        "metrics": {
            "actualWords": actual_words,
            "minimumWords": minimum,
            "maximumWords": maximum,
            "wordsPerMinute": words_per_minute,
            "estimatedMinutes": round(actual_words / words_per_minute, 2) if words_per_minute else None,
            "sourceMapRows": len(source_map.find_all("tr")) - 1 if source_map else 0,
            "unsupportedFactualTokens": len(unsupported),
            "duplicateParagraphs": repeated,
        },
        "limitations": (
            "Source tracing and deterministic checks cannot guarantee perfect factual or "
            "interpretive accuracy; semantic fidelity still depends partly on LLM review."
        ),
    }
