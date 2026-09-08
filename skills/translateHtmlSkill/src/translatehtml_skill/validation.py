from __future__ import annotations

from collections import Counter
from pathlib import Path
import re
from typing import Any

from bs4 import BeautifulSoup, Tag
from .core import (
    HUMAN_ATTRIBUTES,
    SKIP_TAGS,
    TRANSLATION_META_NAMES,
    URL_ATTRIBUTES,
    rewrite_css_urls,
    rewrite_reference,
    rewrite_srcset,
)


BLOCK_TAGS = {
    "p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "dt", "dd", "th",
    "td", "caption", "figcaption", "blockquote",
}
SCRIPT_PATTERNS = {
    "arabic": re.compile(r"[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]"),
    "cyrillic": re.compile(r"[\u0400-\u052f]"),
    "devanagari": re.compile(r"[\u0900-\u097f]"),
    "greek": re.compile(r"[\u0370-\u03ff]"),
    "han": re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]"),
    "hebrew": re.compile(r"[\u0590-\u05ff]"),
    "japanese": re.compile(r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]"),
    "korean": re.compile(r"[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]"),
}
LANGUAGE_SCRIPTS = {
    "ar": "arabic", "fa": "arabic", "ps": "arabic", "ur": "arabic",
    "bg": "cyrillic", "mk": "cyrillic", "ru": "cyrillic", "sr": "cyrillic",
    "uk": "cyrillic", "hi": "devanagari", "mr": "devanagari", "ne": "devanagari",
    "el": "greek", "zh": "han", "he": "hebrew", "yi": "hebrew",
    "ja": "japanese", "ko": "korean",
}


def _translation_meta(tag: Tag) -> bool:
    return tag.name == "meta" and str(tag.get("name", "")) in TRANSLATION_META_NAMES


def _elements(soup: BeautifulSoup) -> list[Tag]:
    return [tag for tag in soup.find_all(True) if not _translation_meta(tag)]


def _normalized(value: Any) -> Any:
    if isinstance(value, list):
        return tuple(value)
    return str(value)


def _structure_findings(
    source: BeautifulSoup,
    target: BeautifulSoup,
    source_path: Path,
    target_path: Path,
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    source_elements = _elements(source)
    target_elements = _elements(target)
    if len(source_elements) != len(target_elements):
        findings.append({
            "severity": "error",
            "code": "element-count",
            "message": "Source and translation have different element counts.",
            "details": {"source": len(source_elements), "target": len(target_elements)},
        })
        return findings
    for index, (left, right) in enumerate(zip(source_elements, target_elements), start=1):
        if left.name != right.name:
            findings.append({
                "severity": "error",
                "code": "element-topology",
                "message": f"Element {index} changed from {left.name} to {right.name}.",
            })
            continue
        names = set(left.attrs) | set(right.attrs)
        for name in names:
            if left.name == "html" and name in {"lang", "dir"}:
                continue
            if name in HUMAN_ATTRIBUTES or (
                left.name == "meta"
                and str(left.get("name", "")).casefold() == "description"
                and name == "content"
            ):
                if left.has_attr(name) != right.has_attr(name):
                    findings.append({
                        "severity": "error", "code": "human-attribute-missing",
                        "message": f"Element {index} changed the presence of {name}."
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
                expected = _normalized(left.get(name, ""))
                actual = _normalized(right.get(name, ""))
            if expected != actual:
                findings.append({
                    "severity": "error",
                    "code": "protected-attribute",
                    "message": f"Element {index} changed protected attribute {name}.",
                    "details": {"expected": expected, "actual": actual},
                })
    source_program = [(tag.name, tag.decode_contents()) for tag in source.find_all(SKIP_TAGS)]
    target_program = [(tag.name, tag.decode_contents()) for tag in target.find_all(SKIP_TAGS)]
    if source_program != target_program:
        findings.append({
            "severity": "error",
            "code": "protected-content",
            "message": "Script, style, code, or another protected region changed.",
        })
    return findings


def _visible_text(soup: BeautifulSoup) -> str:
    clone = BeautifulSoup(str(soup), "html.parser")
    for tag in clone.find_all(SKIP_TAGS):
        tag.decompose()
    return clone.get_text(" ", strip=True)


def _script_result(text: str, target_language: str) -> tuple[str | None, float | None]:
    primary = target_language.split("-", 1)[0].casefold()
    script = LANGUAGE_SCRIPTS.get(primary)
    if script is None:
        return None, None
    letters = re.findall(r"[^\W\d_]", text, re.UNICODE)
    if len(letters) < 100:
        return None, None
    matches = len(SCRIPT_PATTERNS[script].findall(text))
    return script, matches / len(letters)


def _word_ngrams(text: str, size: int = 5) -> set[tuple[str, ...]]:
    words = [
        word.casefold()
        for word in re.findall(r"\b[^\W\d_]+\b", text, re.UNICODE)
        if len(word) > 2
    ]
    return set(zip(*(words[offset:] for offset in range(size)))) if len(words) >= size else set()


def _ngram_overlap(source: str, target: str) -> float:
    source_ngrams = _word_ngrams(source)
    if not source_ngrams:
        return 0.0
    return len(source_ngrams & _word_ngrams(target)) / len(source_ngrams)


def _normalized_text(text: str) -> str:
    return " ".join(text.casefold().split())


def _eligible_unchanged(source: str, target: str) -> bool:
    words = re.findall(r"\b[^\W\d_]+\b", source, re.UNICODE)
    return len(words) >= 4 and _normalized_text(source) == _normalized_text(target)


def _asset_findings(target: BeautifulSoup, target_path: Path) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for tag in target.find_all(True):
        for name in URL_ATTRIBUTES:
            value = str(tag.get(name, ""))
            if not value or value.startswith(("#", "/", "//")):
                continue
            if re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", value):
                continue
            local = (target_path.parent / value.split("?", 1)[0].split("#", 1)[0]).resolve()
            if name in {"src", "poster"} or tag.name == "link":
                if not local.is_file():
                    findings.append({
                        "severity": "error",
                        "code": "missing-local-resource",
                        "message": f"Local resource does not exist: {value}",
                    })
    return findings


def validate_translation(
    source_path: Path,
    target_path: Path,
    *,
    target_language: str,
    intended_target: Path | None = None,
    units: list[dict[str, Any]] | None = None,
    translations: dict[str, str] | None = None,
) -> dict[str, Any]:
    source_path = source_path.expanduser().resolve()
    target_path = target_path.expanduser().resolve()
    reference_target = intended_target.expanduser().resolve() if intended_target else target_path
    source = BeautifulSoup(source_path.read_text(encoding="utf-8"), "html.parser")
    target = BeautifulSoup(target_path.read_text(encoding="utf-8"), "html.parser")
    findings = _structure_findings(source, target, source_path, reference_target)
    findings.extend(_asset_findings(target, reference_target))

    counts_source = Counter(tag.name for tag in source.find_all(BLOCK_TAGS))
    counts_target = Counter(tag.name for tag in target.find_all(BLOCK_TAGS))
    if counts_source != counts_target:
        findings.append({
            "severity": "error",
            "code": "block-count",
            "message": "Paragraph or semantic block counts changed.",
            "details": {"source": dict(counts_source), "target": dict(counts_target)},
        })

    target_text = _visible_text(target)
    source_text = _visible_text(source)
    expected_script, script_ratio = _script_result(target_text, target_language)
    if expected_script is not None and script_ratio is not None and script_ratio < 0.20:
        findings.append({
            "severity": "error",
            "code": "target-script",
            "message": f"Too little text uses the expected {expected_script} script.",
            "details": {"ratio": round(script_ratio, 4)},
        })

    unchanged_count = 0
    eligible_count = 0
    if units is not None and translations is not None:
        for unit in units:
            source_unit = re.sub(r"⟦(?:OPEN|CLOSE|VOID):T\d{6}⟧", "", unit["source"])
            target_unit = translations[unit["id"]]
            target_unit = re.sub(r"⟦(?:OPEN|CLOSE|VOID):T\d{6}⟧", "", target_unit)
            words = re.findall(r"\b[^\W\d_]+\b", source_unit, re.UNICODE)
            if len(words) >= 4:
                eligible_count += 1
                unchanged_count += int(_eligible_unchanged(source_unit, target_unit))
    else:
        source_blocks = source.find_all(BLOCK_TAGS)
        target_blocks = target.find_all(BLOCK_TAGS)
        for left, right in zip(source_blocks, target_blocks):
            source_unit = left.get_text(" ", strip=True)
            target_unit = right.get_text(" ", strip=True)
            words = re.findall(r"\b[^\W\d_]+\b", source_unit, re.UNICODE)
            if len(words) >= 4:
                eligible_count += 1
                unchanged_count += int(_eligible_unchanged(source_unit, target_unit))
    unchanged_ratio = unchanged_count / eligible_count if eligible_count else 0.0
    if unchanged_count >= 5 and unchanged_ratio > 0.10:
        findings.append({
            "severity": "error",
            "code": "untranslated-content",
            "message": "Too many substantial blocks appear untranslated.",
            "details": {"count": unchanged_count, "ratio": round(unchanged_ratio, 4)},
        })
    elif unchanged_count >= 2 or unchanged_ratio > 0.02:
        findings.append({
            "severity": "warning",
            "code": "possibly-untranslated-content",
            "message": "Some substantial blocks may be untranslated.",
            "details": {"count": unchanged_count, "ratio": round(unchanged_ratio, 4)},
        })

    ngram_overlap = _ngram_overlap(source_text, target_text)
    if ngram_overlap > 0.20:
        findings.append({
            "severity": "error",
            "code": "source-text-overlap",
            "message": "The translation retains too many source-language word sequences.",
            "details": {"ratio": round(ngram_overlap, 4)},
        })
    elif ngram_overlap > 0.08:
        findings.append({
            "severity": "warning",
            "code": "source-text-overlap",
            "message": "The translation retains a notable amount of source text.",
            "details": {"ratio": round(ngram_overlap, 4)},
        })

    duplicate_ratio = 0.0
    if translations:
        model_translation_ids = (
            {
                unit["id"] for unit in units
                if not unit.get("reuseOf") and not unit.get("reuseTemplateOf")
            }
            if units is not None
            else set(translations)
        )
        substantial = [
            _normalized_text(value)
            for unit_id, value in translations.items()
            if unit_id in model_translation_ids
            if len(re.findall(r"[^\W\d_]", value, re.UNICODE)) >= 30
        ]
        counts = Counter(substantial)
        duplicates = sum(count - 1 for count in counts.values() if count > 1)
        duplicate_ratio = duplicates / len(substantial) if substantial else 0.0
        if duplicate_ratio > 0.15:
            findings.append({
                "severity": "error",
                "code": "duplicate-translations",
                "message": "Too many distinct units have identical translations.",
                "details": {"ratio": round(duplicate_ratio, 4)},
            })
        elif duplicate_ratio > 0.05:
            findings.append({
                "severity": "warning",
                "code": "duplicate-translations",
                "message": "Several distinct units have identical translations.",
                "details": {"ratio": round(duplicate_ratio, 4)},
            })
    source_letters = len(re.findall(r"[^\W\d_]", source_text, re.UNICODE))
    target_letters = len(re.findall(r"[^\W\d_]", target_text, re.UNICODE))
    length_ratio = target_letters / source_letters if source_letters else 1.0
    if not 0.45 <= length_ratio <= 2.2:
        findings.append({
            "severity": "warning",
            "code": "translation-length",
            "message": "Translation length is outside the expected heuristic range.",
            "details": {"ratio": round(length_ratio, 4)},
        })

    status = (
        "failed" if any(item["severity"] == "error" for item in findings)
        else "passed_with_warnings" if findings
        else "passed"
    )
    return {
        "status": status,
        "findings": findings,
        "metrics": {
            "sourceBlocks": dict(counts_source),
            "targetBlocks": dict(counts_target),
            "sourceElements": len(_elements(source)),
            "targetElements": len(_elements(target)),
            "expectedScript": expected_script,
            "expectedScriptRatio": round(script_ratio, 4) if script_ratio is not None else None,
            "eligibleTranslationUnits": eligible_count,
            "unchangedUnits": unchanged_count,
            "unchangedRatio": round(unchanged_ratio, 4),
            "sourceNgramOverlap": round(ngram_overlap, 4),
            "duplicateTranslationRatio": round(duplicate_ratio, 4),
            "lengthRatio": round(length_ratio, 4),
        },
    }
