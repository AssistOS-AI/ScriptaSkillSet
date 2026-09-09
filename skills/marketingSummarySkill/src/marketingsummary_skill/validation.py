from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup

from .core import _fact_tokens, file_sha256, normalize_language, word_count


def _finding(severity: str, code: str, message: str, details: Any = None) -> dict[str, Any]:
    item: dict[str, Any] = {"severity": severity, "code": code, "message": message}
    if details is not None:
        item["details"] = details
    return item


def validate_marketing_summary(
    source_path: Path,
    target_path: Path,
    *,
    expected_language: str | None = None,
) -> dict[str, Any]:
    source_path = source_path.expanduser().resolve()
    target_path = target_path.expanduser().resolve()
    source = BeautifulSoup(source_path.read_text(encoding="utf-8"), "html.parser")
    target = BeautifulSoup(target_path.read_text(encoding="utf-8"), "html.parser")
    findings: list[dict[str, Any]] = []

    marker = target.find("meta", attrs={"name": "marketing-summary-generator"})
    if marker is None or marker.get("content") != "marketingsummary-skill":
        findings.append(_finding("error", "ownership-marker", "Marketing summary ownership metadata is missing."))
    hash_marker = target.find("meta", attrs={"name": "marketing-summary-source-sha256"})
    if hash_marker is None or hash_marker.get("content") != file_sha256(source_path):
        findings.append(_finding("error", "source-hash", "Marketing summary does not identify this source revision."))

    source_lang = expected_language or (str(source.html.get("lang", "")) if source.html else "")
    target_lang = str(target.html.get("lang", "")) if target.html else ""
    try:
        if normalize_language(source_lang) != normalize_language(target_lang):
            findings.append(_finding("error", "language", "Output language metadata differs from the source."))
    except Exception:
        findings.append(_finding("error", "language", "Source or output has invalid language metadata."))

    article = target.find("article", attrs={"data-marketing-summary": True})
    if article is None:
        findings.append(_finding("error", "marketing-body", "The reader-facing marketing article is missing."))
        main_text = ""
        actual_words = 0
    else:
        main_text = article.get_text(" ", strip=True)
        actual_words = word_count(main_text)
        if article.find("h1") is None or article.find("h2") is None or len(article.find_all("p")) < 3:
            findings.append(_finding("error", "semantic-shape", "The sales page needs a headline, sections, and prose."))
        for paragraph in article.find_all("p"):
            if not paragraph.get_text(" ", strip=True):
                findings.append(_finding("error", "empty-paragraph", "The sales page contains an empty paragraph."))

    def meta_int(name: str) -> int | None:
        tag = target.find("meta", attrs={"name": name})
        try:
            return int(str(tag.get("content"))) if tag else None
        except (TypeError, ValueError):
            return None

    minimum = meta_int("marketing-summary-minimum-words")
    maximum = meta_int("marketing-summary-maximum-words")
    declared = meta_int("marketing-summary-actual-words")
    if minimum is None or maximum is None or declared is None:
        findings.append(_finding("error", "word-metadata", "Adaptive word-budget metadata is incomplete."))
    else:
        if actual_words != declared:
            findings.append(_finding("error", "word-count", "Declared and actual word counts differ.", {"declared": declared, "actual": actual_words}))
        if not minimum <= actual_words <= maximum:
            findings.append(_finding("error", "word-budget", "Sales copy is outside its adaptive word range.", {"minimum": minimum, "maximum": maximum, "actual": actual_words}))

    unsupported = sorted(_fact_tokens(main_text) - _fact_tokens(source.get_text(" ", strip=True)))
    if unsupported:
        findings.append(_finding("error", "unsupported-factual-token", "Sales copy contains factual tokens absent from the source.", unsupported))
    forbidden_visible = target.select(".reading-time, details[data-source-map], [data-source-units], [data-hook-ids]")
    if forbidden_visible:
        findings.append(_finding("error", "internal-data-visible", "Reader-facing output exposes internal metrics or traceability data."))
    if target.find(["script", "button", "form"]):
        findings.append(_finding("error", "interactive-or-scripted", "Sales output must remain a text-first page without scripts, forms, or CTA buttons."))
    if target.find("a", href=True):
        findings.append(_finding("error", "direct-link", "Sales output must not add direct promotional links."))
    ids = [str(tag["id"]) for tag in target.find_all(attrs={"id": True})]
    duplicates = [item for item, count in Counter(ids).items() if count > 1]
    if duplicates:
        findings.append(_finding("error", "duplicate-ids", "Output contains duplicate IDs.", duplicates))

    errors = [item for item in findings if item["severity"] == "error"]
    return {
        "status": "failed" if errors else "passed",
        "findings": findings,
        "metrics": {
            "actualWords": actual_words,
            "minimumWords": minimum,
            "maximumWords": maximum,
            "unsupportedFactualTokens": len(unsupported),
        },
        "limitations": "Deterministic checks supplement but cannot replace the active LLM's semantic spoiler review.",
    }
