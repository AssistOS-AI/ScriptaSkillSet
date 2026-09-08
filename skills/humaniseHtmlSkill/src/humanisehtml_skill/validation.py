from __future__ import annotations

from collections import Counter
from pathlib import Path
import re
from statistics import mean, pstdev
from typing import Any

from bs4 import BeautifulSoup, Tag

from .core import (
    BLOCK_TAGS,
    HUMANISATION_META_NAMES,
    HUMAN_ATTRIBUTES,
    SKIP_TAGS,
    TOKEN_RE,
    PROTECTION_TOKEN_RE,
    URL_ATTRIBUTES,
    rewrite_css_urls,
    rewrite_reference,
    rewrite_srcset,
)


CANNED_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\bit is important to (?:note|remember)\b",
        r"\bin today's (?:world|fast-paced world|digital age)\b",
        r"\bin conclusion\b", r"\bdelve(?:s|d)? into\b",
        r"\bserves as a testament\b", r"\bnot only\b.{0,90}\bbut also\b",
        r"\beste important de (?:menționat|reținut|observat)\b",
        r"\bîn concluzie\b", r"\bîn lumea de astăzi\b",
        r"\bes importante (?:señalar|destacar|recordar)\b",
        r"\ben conclusión\b", r"\bnel mondo di oggi\b",
        r"\bè importante (?:notare|ricordare|sottolineare)\b",
        r"\babschließend lässt sich sagen\b", r"\bes ist wichtig zu beachten\b",
        r"\bil est important de (?:noter|rappeler)\b", r"\ben conclusion\b",
    )
]
SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")
WORD_RE = re.compile(r"\b[^\W\d_]+(?:['’\-][^\W\d_]+)*\b", re.UNICODE)


def _humanisation_meta(tag: Tag) -> bool:
    return tag.name == "meta" and str(tag.get("name", "")) in HUMANISATION_META_NAMES


def _elements(soup: BeautifulSoup) -> list[Tag]:
    return [tag for tag in soup.find_all(True) if not _humanisation_meta(tag)]


def _normalized_attr(value: Any) -> Any:
    return tuple(value) if isinstance(value, list) else str(value)


def _structure_findings(
    source: BeautifulSoup,
    target: BeautifulSoup,
    source_path: Path,
    target_path: Path,
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    left_elements, right_elements = _elements(source), _elements(target)
    if len(left_elements) != len(right_elements):
        return [{
            "severity": "error", "code": "element-count",
            "message": "Source and humanised HTML have different element counts.",
            "details": {"source": len(left_elements), "target": len(right_elements)},
        }]
    for index, (left, right) in enumerate(zip(left_elements, right_elements), start=1):
        if left.name != right.name:
            findings.append({
                "severity": "error", "code": "element-topology",
                "message": f"Element {index} changed from {left.name} to {right.name}.",
            })
            continue
        names = set(left.attrs) | set(right.attrs)
        for name in names:
            is_human = name in HUMAN_ATTRIBUTES or (
                left.name == "meta"
                and str(left.get("name", "")).casefold() == "description"
                and name == "content"
            )
            if is_human:
                if left.has_attr(name) != right.has_attr(name):
                    findings.append({
                        "severity": "error", "code": "human-attribute-missing",
                        "message": f"Element {index} changed the presence of {name}.",
                    })
                continue
            if name in URL_ATTRIBUTES:
                expected = rewrite_reference(str(left.get(name, "")), source_path, target_path)
                actual = str(right.get(name, ""))
            elif name == "srcset":
                expected = rewrite_srcset(str(left.get(name, "")), source_path, target_path)
                actual = str(right.get(name, ""))
            elif name == "style":
                expected = rewrite_css_urls(str(left.get(name, "")), source_path, target_path)
                actual = str(right.get(name, ""))
            else:
                expected, actual = _normalized_attr(left.get(name, "")), _normalized_attr(right.get(name, ""))
            if expected != actual:
                findings.append({
                    "severity": "error", "code": "protected-attribute",
                    "message": f"Element {index} changed protected attribute {name}.",
                    "details": {"expected": expected, "actual": actual},
                })
    left_program = [(tag.name, tag.decode_contents()) for tag in source.find_all(SKIP_TAGS)]
    right_program = [(tag.name, tag.decode_contents()) for tag in target.find_all(SKIP_TAGS)]
    if left_program != right_program:
        findings.append({
            "severity": "error", "code": "protected-content",
            "message": "A script, style, code, or other protected region changed.",
        })
    return findings


def _visible_blocks(soup: BeautifulSoup) -> list[str]:
    return [tag.get_text(" ", strip=True) for tag in soup.find_all(BLOCK_TAGS)]


def _normalized_text(text: str) -> str:
    return " ".join(text.casefold().split())


def _sentences(text: str) -> list[str]:
    return [sentence.strip() for sentence in SENTENCE_RE.split(text) if len(WORD_RE.findall(sentence)) >= 3]


def style_penalty(text: str) -> int:
    sentences = _sentences(text)
    score = sum(len(pattern.findall(text)) for pattern in CANNED_PATTERNS)
    words = WORD_RE.findall(text)
    if words:
        for punctuation in ("—", ":", ";"):
            count = text.count(punctuation)
            if count >= 3 and count / len(words) > 0.025:
                score += count - 2
    beginnings = Counter(
        " ".join(WORD_RE.findall(sentence)[:2]).casefold()
        for sentence in sentences if len(WORD_RE.findall(sentence)) >= 2
    )
    score += sum(count - 2 for start, count in beginnings.items() if start and count > 2)
    return score


def _style_metrics(blocks: list[str]) -> dict[str, Any]:
    sentences = [sentence for block in blocks for sentence in _sentences(block)]
    starts = Counter(
        " ".join(WORD_RE.findall(sentence)[:2]).casefold()
        for sentence in sentences if len(WORD_RE.findall(sentence)) >= 2
    )
    repeated_starts = sum(count - 2 for start, count in starts.items() if start and count > 2)
    lengths = [len(WORD_RE.findall(sentence)) for sentence in sentences]
    uniformity = None
    if len(lengths) >= 8 and mean(lengths) > 0:
        uniformity = pstdev(lengths) / mean(lengths)
    normalized = [_normalized_text(block) for block in blocks if len(WORD_RE.findall(block)) >= 6]
    counts = Counter(normalized)
    duplicate_blocks = sum(count - 1 for count in counts.values() if count > 1)
    return {
        "stylePenalty": sum(style_penalty(block) for block in blocks),
        "sentences": len(sentences), "repeatedSentenceBeginnings": repeated_starts,
        "sentenceLengthCoefficientOfVariation": round(uniformity, 4) if uniformity is not None else None,
        "duplicateBlocks": duplicate_blocks,
    }


def _asset_findings(target: BeautifulSoup, target_path: Path) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for tag in target.find_all(True):
        for name in URL_ATTRIBUTES:
            value = str(tag.get(name, ""))
            if not value or value.startswith(("#", "/", "//")) or re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", value):
                continue
            local = (target_path.parent / value.split("?", 1)[0].split("#", 1)[0]).resolve()
            if (name in {"src", "poster"} or tag.name == "link") and not local.is_file():
                findings.append({
                    "severity": "error", "code": "missing-local-resource",
                    "message": f"Local resource does not exist: {value}",
                })
    return findings


def _clean_tokenized(text: str) -> str:
    return PROTECTION_TOKEN_RE.sub("", TOKEN_RE.sub("", text))


def validate_humanisation(
    source_path: Path,
    target_path: Path,
    *,
    intended_source: Path | None = None,
    intended_target: Path | None = None,
    units: list[dict[str, Any]] | None = None,
    results: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    source_path = source_path.expanduser().resolve()
    target_path = target_path.expanduser().resolve()
    reference_source = intended_source.expanduser().resolve() if intended_source else source_path
    reference_target = intended_target.expanduser().resolve() if intended_target else target_path
    source = BeautifulSoup(source_path.read_text(encoding="utf-8"), "html.parser")
    target = BeautifulSoup(target_path.read_text(encoding="utf-8"), "html.parser")
    findings = _structure_findings(source, target, reference_source, reference_target)
    findings.extend(_asset_findings(target, reference_target))

    source_counts = Counter(tag.name for tag in source.find_all(BLOCK_TAGS))
    target_counts = Counter(tag.name for tag in target.find_all(BLOCK_TAGS))
    if source_counts != target_counts:
        findings.append({
            "severity": "error", "code": "block-count",
            "message": "Paragraph or semantic block counts changed.",
            "details": {"source": dict(source_counts), "target": dict(target_counts)},
        })
    empty = [index for index, block in enumerate(_visible_blocks(target), start=1) if not block.strip()]
    if empty:
        findings.append({
            "severity": "error", "code": "empty-blocks",
            "message": "Humanisation created empty semantic blocks.", "details": {"indexes": empty[:30]},
        })

    source_blocks, target_blocks = _visible_blocks(source), _visible_blocks(target)
    source_style, target_style = _style_metrics(source_blocks), _style_metrics(target_blocks)
    if target_style["duplicateBlocks"] > source_style["duplicateBlocks"]:
        findings.append({
            "severity": "error", "code": "new-duplicate-blocks",
            "message": "Humanisation introduced duplicate substantial blocks.",
        })
    if target_style["repeatedSentenceBeginnings"] > source_style["repeatedSentenceBeginnings"] + 2:
        findings.append({
            "severity": "warning", "code": "repeated-sentence-beginnings",
            "message": "Repeated sentence openings increased.",
        })
    target_cv = target_style["sentenceLengthCoefficientOfVariation"]
    source_cv = source_style["sentenceLengthCoefficientOfVariation"]
    if target_cv is not None and source_cv is not None and target_cv < 0.18 and target_cv < source_cv:
        findings.append({
            "severity": "warning", "code": "uniform-sentence-length",
            "message": "Sentence lengths became unusually uniform.",
        })

    changed_units = 0
    kept_units = 0
    if units is not None and results is not None:
        for unit in units:
            entry = results.get(unit["id"])
            if entry is None:
                findings.append({
                    "severity": "error", "code": "missing-unit-result",
                    "message": f"Unit {unit['id']} has no result.",
                })
                continue
            value = str(entry.get("text", ""))
            action = entry.get("action")
            changed_units += int(action == "rewrite")
            kept_units += int(action == "keep")
            source_plain, target_plain = _clean_tokenized(unit["source"]), _clean_tokenized(value)
            source_letters = len(re.findall(r"[^\W\d_]", source_plain, re.UNICODE))
            target_letters = len(re.findall(r"[^\W\d_]", target_plain, re.UNICODE))
            ratio = target_letters / source_letters if source_letters else 1.0
            if action == "rewrite" and not 0.55 <= ratio <= 1.75:
                findings.append({
                    "severity": "error", "code": "unit-length",
                    "message": f"Unit {unit['id']} changed length beyond conservative limits.",
                    "details": {"ratio": round(ratio, 4)},
                })
            if action == "rewrite" and style_penalty(target_plain) > style_penalty(source_plain):
                findings.append({
                    "severity": "error", "code": "style-regression",
                    "message": f"Unit {unit['id']} added detectable canned or repetitive style signals.",
                })
        if source_style["stylePenalty"] > 0 and target_style["stylePenalty"] >= source_style["stylePenalty"]:
            findings.append({
                "severity": "warning", "code": "style-not-improved",
                "message": "Flagged source mannerisms did not decrease overall.",
            })

    status = (
        "failed" if any(item["severity"] == "error" for item in findings)
        else "passed_with_warnings" if findings else "passed"
    )
    return {
        "status": status,
        "findings": findings,
        "metrics": {
            "sourceElements": len(_elements(source)), "targetElements": len(_elements(target)),
            "sourceBlocks": dict(source_counts), "targetBlocks": dict(target_counts),
            "sourceStyle": source_style, "targetStyle": target_style,
            "auditedUnits": len(results) if results is not None else None,
            "rewrittenUnits": changed_units if results is not None else None,
            "keptUnits": kept_units if results is not None else None,
        },
        "limitations": (
            "Deterministic checks and LLM self-audit cannot prove human authorship or "
            "guarantee factual correctness; no detector-evasion claim is made."
        ),
    }
