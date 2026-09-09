from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup

from .core import ShortDescriptionError, _fact_tokens, file_sha256, normalize_language, split_sentences


def _finding(code: str, message: str, details: Any = None) -> dict[str, Any]:
    item: dict[str, Any] = {"severity": "error", "code": code, "message": message}
    if details is not None:
        item["details"] = details
    return item


def validate_short_description(source_path: Path, target_path: Path, *, expected_language: str | None = None) -> dict[str, Any]:
    source_path = source_path.expanduser().resolve()
    target_path = target_path.expanduser().resolve()
    source = BeautifulSoup(source_path.read_text(encoding="utf-8"), "html.parser")
    target = BeautifulSoup(target_path.read_text(encoding="utf-8"), "html.parser")
    findings: list[dict[str, Any]] = []

    marker = target.find("meta", attrs={"name": "short-description-generator"})
    if marker is None or marker.get("content") != "shortdescription-skill":
        findings.append(_finding("ownership-marker", "Short-description ownership metadata is missing."))
    source_hash = target.find("meta", attrs={"name": "short-description-source-sha256"})
    if source_hash is None or source_hash.get("content") != file_sha256(source_path):
        findings.append(_finding("source-hash", "Short description does not identify this source revision."))

    source_language = expected_language or (str(source.html.get("lang", "")) if source.html else "")
    target_language = str(target.html.get("lang", "")) if target.html else ""
    try:
        if normalize_language(source_language) != normalize_language(target_language):
            findings.append(_finding("language", "Output language differs from the source."))
    except ShortDescriptionError:
        findings.append(_finding("language", "Source or output has invalid language metadata."))

    article = target.find("article", attrs={"data-short-description": True})
    description = ""
    sentence_count = 0
    if article is None:
        findings.append(_finding("description-body", "The short-description article is missing."))
    else:
        paragraphs = article.find_all("p")
        if len(paragraphs) != 1 or article.find(["h1", "h2", "h3", "h4", "h5", "h6"]):
            findings.append(_finding("visible-shape", "Output must contain one paragraph and no visible heading."))
        if paragraphs:
            description = paragraphs[0].get_text(" ", strip=True)
            sentence_count = len(split_sentences(description))
            if not 4 <= sentence_count <= 6:
                findings.append(_finding("sentence-count", "Description must contain 4 to 6 sentences.", {"actual": sentence_count}))

    unsupported = sorted(_fact_tokens(description) - _fact_tokens(source.get_text(" ", strip=True)))
    if unsupported:
        findings.append(_finding("unsupported-factual-token", "Description contains factual tokens absent from the source.", unsupported))
    if target.find(["script", "button", "form", "a"]):
        findings.append(_finding("interactive-or-promotional", "Output must not contain scripts, links, forms, or calls to action."))
    if target.select("details,[data-source-units],[data-theme-ids],.reading-time"):
        findings.append(_finding("internal-data-visible", "Output exposes internal workflow data."))
    ids = [str(tag["id"]) for tag in target.find_all(attrs={"id": True})]
    duplicates = [value for value, count in Counter(ids).items() if count > 1]
    if duplicates:
        findings.append(_finding("duplicate-ids", "Output contains duplicate IDs.", duplicates))

    return {
        "status": "failed" if findings else "passed",
        "findings": findings,
        "metrics": {"sentences": sentence_count, "unsupportedFactualTokens": len(unsupported)},
        "limitations": "Deterministic checks supplement but cannot replace the active LLM semantic revelation review.",
    }
