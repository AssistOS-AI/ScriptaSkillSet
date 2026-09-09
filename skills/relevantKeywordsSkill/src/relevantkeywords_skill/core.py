from __future__ import annotations

import html as html_module
import json
import math
import os
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from typing import Protocol, Sequence

import numpy as np
import regex
from bs4 import BeautifulSoup


os.environ.setdefault("ORT_DISABLE_TELEMETRY", "1")


DEFAULT_MODEL = "intfloat/multilingual-e5-small"
MODEL_FOLDER = "multilingual-e5-small-onnx-qint8"
MODEL_REQUIRED_FILES = (
    "model.onnx",
    "sentencepiece.bpe.model",
)
SEMANTIC_CLUSTER_THRESHOLD = 0.94
MAX_EMBEDDING_CANDIDATES = 600
MAX_CONTENT_CHUNKS = 64

EXCLUDED_SELECTORS = ",".join(
    (
        "script",
        "style",
        "noscript",
        "template",
        "nav",
        "header",
        "footer",
        "[hidden]",
        '[aria-hidden="true"]',
        '[role="doc-toc"]',
        '[role="doc-bibliography"]',
        ".toc",
        "#toc",
        ".table-of-contents",
        "#table-of-contents",
        ".bibliography",
        "#bibliography",
        ".references",
        "#references",
    )
)
CONTENT_TAGS = ("h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "blockquote", "figcaption", "td", "th")
WORD_PATTERN = regex.compile(
    r"[\p{Han}\p{Hiragana}\p{Katakana}]+|[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*",
    flags=regex.VERSION1,
)
CJK_PATTERN = regex.compile(r"^[\p{Han}\p{Hiragana}\p{Katakana}]+$", flags=regex.VERSION1)
DOCUMENT_BOILERPLATE = {
    "appendix",
    "bibliography",
    "chapter",
    "conclusion",
    "contents",
    "doi",
    "epilogue",
    "figure",
    "http",
    "https",
    "introduction",
    "page",
    "pages",
    "part",
    "pdf",
    "reference",
    "references",
    "section",
    "table",
    "www",
}


class KeywordError(RuntimeError):
    pass


class Embedder(Protocol):
    model_name: str

    def encode(self, texts: Sequence[str], *, query: bool = False) -> np.ndarray: ...


class OnnxEmbedder:
    def __init__(self, model_path: Path, model_name: str = DEFAULT_MODEL) -> None:
        missing = [name for name in MODEL_REQUIRED_FILES if not (model_path / name).is_file()]
        if missing:
            raise KeywordError(
                f"Semantic model is incomplete at {model_path} (missing {', '.join(missing)}). "
                "Run `scripts/relevantkeywords install` first."
            )
        self.model_name = model_name
        try:
            import onnxruntime as ort
            import sentencepiece as spm
        except ImportError as exc:
            raise KeywordError(f"ONNX runtime is incomplete: {exc}") from exc
        try:
            self._sentencepiece = spm.SentencePieceProcessor(
                model_file=str(model_path / "sentencepiece.bpe.model")
            )
            self._session = ort.InferenceSession(
                str(model_path / "model.onnx"),
                providers=["CPUExecutionProvider"],
            )
        except Exception as exc:
            raise KeywordError(f"Cannot initialize the ONNX model: {exc}") from exc
        self._input_names = {item.name for item in self._session.get_inputs()}

    def encode(self, texts: Sequence[str], *, query: bool = False) -> np.ndarray:
        prefix = "query: " if query else "passage: "
        values = [prefix + value for value in texts]
        batches: list[np.ndarray] = []
        for start in range(0, len(values), 32):
            rows: list[list[int]] = []
            for value in values[start : start + 32]:
                piece_ids = self._sentencepiece.encode(value, out_type=int)
                # XLM-R reserves IDs 0..3 and shifts normal SentencePiece IDs by one.
                converted = [3 if piece_id == 0 else piece_id + 1 for piece_id in piece_ids]
                rows.append([0, *converted[:510], 2])
            width = max(len(row) for row in rows)
            input_ids = np.asarray([row + [1] * (width - len(row)) for row in rows], dtype=np.int64)
            attention_mask = np.asarray(
                [[1] * len(row) + [0] * (width - len(row)) for row in rows], dtype=np.int64
            )
            feed: dict[str, np.ndarray] = {}
            if "input_ids" in self._input_names:
                feed["input_ids"] = input_ids
            if "attention_mask" in self._input_names:
                feed["attention_mask"] = attention_mask
            if "token_type_ids" in self._input_names:
                feed["token_type_ids"] = np.zeros_like(input_ids)
            outputs = self._session.run(None, feed)
            hidden = np.asarray(outputs[0], dtype=np.float32)
            if hidden.ndim == 3:
                mask = attention_mask[..., None].astype(np.float32)
                embeddings = (hidden * mask).sum(axis=1) / np.maximum(mask.sum(axis=1), 1e-9)
            elif hidden.ndim == 2:
                embeddings = hidden
            else:
                raise KeywordError(f"Unexpected ONNX output shape: {hidden.shape}")
            norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
            batches.append(embeddings / np.maximum(norms, 1e-12))
        return np.concatenate(batches, axis=0).astype(np.float32, copy=False)


@dataclass(frozen=True)
class TextSegment:
    text: str
    heading_weight: float = 0.0


@dataclass
class Candidate:
    normalized: str
    display: str
    frequency: int
    segment_count: int
    heading_hits: float
    lexical_score: float = 0.0
    semantic_score: float = 0.0
    score: float = 0.0
    forms: Counter[str] = field(default_factory=Counter)


@dataclass
class KeywordResult:
    keyword: str
    normalized: str
    score: float
    frequency: int
    segment_count: int
    variants: list[str]


@dataclass
class AnalysisResult:
    language: str
    language_method: str
    language_confidence: float | None
    keywords: list[KeywordResult]
    statistics: dict[str, int | float]
    warnings: list[str]
    model: str

    def to_dict(self) -> dict[str, object]:
        return {
            "language": {
                "code": self.language,
                "method": self.language_method,
                "confidence": self.language_confidence,
            },
            "model": self.model,
            "statistics": self.statistics,
            "warnings": self.warnings,
            "keywords": [
                {
                    "keyword": item.keyword,
                    "normalized": item.normalized,
                    "score": round(item.score, 6),
                    "frequency": item.frequency,
                    "segmentCount": item.segment_count,
                    "variants": item.variants,
                }
                for item in self.keywords
            ],
        }


@dataclass(frozen=True)
class SynonymDictionary:
    language: str | None
    aliases: dict[str, str]
    canonical_display: dict[str, str]


def primary_language(value: str | None) -> str:
    if not value:
        return "und"
    cleaned = value.strip().replace("_", "-").lower()
    match = re.match(r"^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$", cleaned)
    return cleaned.split("-", 1)[0] if match else "und"


def _fold(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def load_synonym_dictionary(path: Path | None, language: str = "und") -> SynonymDictionary:
    if path is None:
        return SynonymDictionary(None, {}, {})
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise KeywordError(f"Cannot read synonym dictionary {path}: {exc}") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("groups"), list):
        raise KeywordError("Synonym dictionary must contain a `groups` array.")
    dictionary_language = primary_language(payload.get("language")) if payload.get("language") else None
    if dictionary_language and language != "und" and dictionary_language != language:
        raise KeywordError(
            f"Synonym dictionary targets {dictionary_language}, but the document language is {language}."
        )
    aliases: dict[str, str] = {}
    displays: dict[str, str] = {}
    for index, group in enumerate(payload["groups"]):
        if not isinstance(group, dict) or not isinstance(group.get("canonical"), str):
            raise KeywordError(f"Synonym group {index} has no valid canonical string.")
        if not isinstance(group.get("variants", []), list):
            raise KeywordError(f"Synonym group {index} variants must be an array.")
        canonical_display = " ".join(group["canonical"].split())
        canonical = _fold(canonical_display)
        if not canonical:
            raise KeywordError(f"Synonym group {index} has an empty canonical value.")
        displays[canonical] = canonical_display
        for variant in [canonical_display, *group.get("variants", [])]:
            if not isinstance(variant, str) or not _fold(variant):
                raise KeywordError(f"Synonym group {index} contains an invalid variant.")
            key = _fold(variant)
            previous = aliases.get(key)
            if previous is not None and previous != canonical:
                raise KeywordError(f"Synonym variant `{variant}` occurs in multiple groups.")
            aliases[key] = canonical
    return SynonymDictionary(dictionary_language, aliases, displays)


def _script_language(text: str) -> tuple[str, float] | None:
    script_rules = (
        (r"\p{Hiragana}|\p{Katakana}", "ja"),
        (r"\p{Hangul}", "ko"),
        (r"\p{Han}", "zh"),
        (r"\p{Greek}", "el"),
        (r"\p{Hebrew}", "he"),
        (r"\p{Armenian}", "hy"),
        (r"\p{Georgian}", "ka"),
        (r"\p{Thai}", "th"),
    )
    letters = max(1, len(regex.findall(r"\p{L}", text)))
    for pattern, language in script_rules:
        hits = len(regex.findall(pattern, text))
        if hits >= 8 and hits / letters >= 0.35:
            return language, min(0.99, 0.7 + hits / letters * 0.25)
    return None


def detect_language_lightweight(text: str) -> tuple[str, float | None]:
    script = _script_language(text)
    if script:
        return script
    try:
        import stopwordsiso
    except ImportError:
        return "und", None
    words = [_fold(word) for word in WORD_PATTERN.findall(text)]
    counts = Counter(word for word in words if 1 < len(word) < 24)
    scores: list[tuple[int, str]] = []
    for language in sorted(stopwordsiso.langs()):
        stopwords = stopwordsiso.stopwords(language)
        score = sum(counts[word] for word in stopwords)
        if score:
            scores.append((score, language))
    if not scores:
        return "und", None
    scores.sort(reverse=True)
    best_score, best_language = scores[0]
    second_score = scores[1][0] if len(scores) > 1 else 0
    if best_score < 4 or (second_score and best_score < second_score * 1.15):
        return "und", None
    confidence = min(0.95, best_score / max(1, best_score + second_score))
    return best_language, round(confidence, 3)


def extract_segments(html: str) -> tuple[list[TextSegment], str | None]:
    soup = BeautifulSoup(html, "html.parser")
    html_language = soup.html.get("lang") if soup.html else None
    root = (
        soup.select_one("main[data-reader-content]")
        or soup.find("main")
        or soup.find("article")
        or soup.find("body")
    )
    if root is None:
        raise KeywordError("Input must be a complete HTML document with body content.")
    for element in root.select(EXCLUDED_SELECTORS):
        element.decompose()
    segments: list[TextSegment] = []
    for element in root.find_all(CONTENT_TAGS):
        if element.find(CONTENT_TAGS):
            continue
        text = " ".join(element.get_text(" ", strip=True).split())
        if not text:
            continue
        heading_weight = 2.0 if element.name == "h1" else 1.3 if element.name in {"h2", "h3"} else 0.0
        segments.append(TextSegment(text, heading_weight))
    if not segments:
        text = " ".join(root.get_text(" ", strip=True).split())
        if text:
            segments.append(TextSegment(text))
    if not segments:
        raise KeywordError("No analyzable text was found in the HTML document.")
    return segments, html_language


def _tokenize(text: str) -> list[str]:
    result: list[str] = []
    for token in WORD_PATTERN.findall(text):
        if CJK_PATTERN.fullmatch(token) and len(token) > 1:
            result.extend(list(token))
        else:
            result.append(token)
    return result


def _lemmatize(token: str, language: str, warnings: list[str], state: dict[str, bool]) -> str:
    folded = _fold(token)
    if language == "und" or len(folded) <= 2:
        return folded
    if state.get("unsupported"):
        return folded
    try:
        import simplemma

        return _fold(simplemma.lemmatize(folded, lang=language))
    except (KeyError, ValueError, TypeError):
        state["unsupported"] = True
        warnings.append(f"No Simplemma lemmatization data for `{language}`; Unicode normalization was used.")
        return folded


def _stopwords(language: str, warnings: list[str]) -> set[str]:
    if language == "und":
        warnings.append("Language is undetermined; language-specific stopword filtering was skipped.")
        return set(DOCUMENT_BOILERPLATE)
    import stopwordsiso

    values = {_fold(word) for word in stopwordsiso.stopwords(language)}
    if not values:
        warnings.append(f"No stopword list for `{language}`; statistical filtering was used.")
    return values | DOCUMENT_BOILERPLATE


def _candidate_key(parts: Sequence[str]) -> str:
    separator = "" if parts and all(len(value) == 1 and CJK_PATTERN.fullmatch(value) for value in parts) else " "
    return separator.join(parts)


def _collect_candidates(
    segments: Sequence[TextSegment], language: str, synonyms: SynonymDictionary, warnings: list[str]
) -> tuple[list[Candidate], int, int]:
    stopwords = _stopwords(language, warnings)
    lemma_state: dict[str, bool] = {}
    total_tokens = 0
    removed_tokens = 0
    frequency: Counter[str] = Counter()
    forms: defaultdict[str, Counter[str]] = defaultdict(Counter)
    segment_presence: defaultdict[str, set[int]] = defaultdict(set)
    heading_hits: Counter[str] = Counter()

    for segment_index, segment in enumerate(segments):
        raw_tokens = _tokenize(segment.text)
        normalized_tokens: list[tuple[str, str] | None] = []
        for raw in raw_tokens:
            total_tokens += 1
            lemma = _lemmatize(raw, language, warnings, lemma_state)
            if not lemma or lemma in stopwords or (len(lemma) == 1 and not CJK_PATTERN.fullmatch(lemma)):
                normalized_tokens.append(None)
                removed_tokens += 1
            else:
                normalized_tokens.append((lemma, raw))
        for size in (1, 2, 3, 4):
            if size == 4 and not any(item and CJK_PATTERN.fullmatch(item[0]) for item in normalized_tokens):
                continue
            for start in range(0, len(normalized_tokens) - size + 1):
                window = normalized_tokens[start : start + size]
                if any(item is None for item in window):
                    continue
                lemmas = [item[0] for item in window if item]
                raw_parts = [item[1] for item in window if item]
                key = _candidate_key(lemmas)
                surface = _candidate_key(raw_parts)
                alias_key = _fold(surface)
                canonical = synonyms.aliases.get(alias_key) or synonyms.aliases.get(_fold(key))
                if canonical:
                    key = canonical
                frequency[key] += 1
                forms[key][surface] += 1
                segment_presence[key].add(segment_index)
                heading_hits[key] += segment.heading_weight

    raw_candidates: list[Candidate] = []
    segment_total = max(1, len(segments))
    for key, count in frequency.items():
        heading = heading_hits[key]
        if count < 2 and heading <= 0:
            continue
        word_count = len(key.split()) if " " in key else 1
        if word_count == 1 and key in DOCUMENT_BOILERPLATE:
            continue
        if word_count == 1 and len(key) < 3 and not CJK_PATTERN.fullmatch(key):
            continue
        # Publish a stable lemma/canonical form; original spellings remain in variants.
        display = synonyms.canonical_display.get(key) or key
        dispersion = len(segment_presence[key]) / segment_total
        length_bonus = 1.0 + min(0.75, max(0, word_count - 1) * 0.28)
        lexical = math.log1p(count) * (0.55 + 0.45 * math.sqrt(dispersion)) * length_bonus
        lexical += min(2.0, heading * 0.35)
        raw_candidates.append(
            Candidate(
                normalized=key,
                display=display,
                frequency=count,
                segment_count=len(segment_presence[key]),
                heading_hits=heading,
                lexical_score=lexical,
                forms=forms[key],
            )
        )
    raw_candidates.sort(key=lambda item: (-item.lexical_score, -item.frequency, item.normalized))
    return raw_candidates[:MAX_EMBEDDING_CANDIDATES], total_tokens, removed_tokens


def _content_chunks(segments: Sequence[TextSegment]) -> list[str]:
    chunks: list[str] = []
    current: list[str] = []
    size = 0
    for segment in segments:
        if current and size + len(segment.text) > 1400:
            chunks.append(" ".join(current))
            current = []
            size = 0
        current.append(segment.text)
        size += len(segment.text) + 1
    if current:
        chunks.append(" ".join(current))
    if len(chunks) <= MAX_CONTENT_CHUNKS:
        return chunks
    step = len(chunks) / MAX_CONTENT_CHUNKS
    return [chunks[min(len(chunks) - 1, int(index * step))] for index in range(MAX_CONTENT_CHUNKS)]


def _rank_and_cluster(
    candidates: list[Candidate], segments: Sequence[TextSegment], count: int, embedder: Embedder
) -> list[KeywordResult]:
    if not candidates:
        return []
    candidate_vectors = embedder.encode([candidate.display for candidate in candidates], query=True)
    chunks = _content_chunks(segments)
    chunk_vectors = embedder.encode(chunks, query=False)
    similarities = candidate_vectors @ chunk_vectors.T
    top_count = min(3, similarities.shape[1])
    semantic_scores = np.mean(np.sort(similarities, axis=1)[:, -top_count:], axis=1)
    lexical_values = np.asarray([candidate.lexical_score for candidate in candidates], dtype=np.float32)
    lexical_min = float(lexical_values.min())
    lexical_range = max(1e-9, float(lexical_values.max()) - lexical_min)
    for index, candidate in enumerate(candidates):
        candidate.semantic_score = float(semantic_scores[index])
        normalized_lexical = (candidate.lexical_score - lexical_min) / lexical_range
        candidate.score = 0.45 * normalized_lexical + 0.55 * max(0.0, candidate.semantic_score)
    order = sorted(
        range(len(candidates)),
        key=lambda index: (-candidates[index].score, -candidates[index].frequency, candidates[index].normalized),
    )
    groups: list[list[int]] = []
    representatives: list[int] = []
    for index in order:
        assigned = False
        candidate_tokens = set(candidates[index].normalized.split())
        for group_index, representative in enumerate(representatives):
            representative_tokens = set(candidates[representative].normalized.split())
            overlap = bool(candidate_tokens and representative_tokens) and (
                candidate_tokens <= representative_tokens or representative_tokens <= candidate_tokens
            )
            similarity = float(candidate_vectors[index] @ candidate_vectors[representative])
            if similarity >= SEMANTIC_CLUSTER_THRESHOLD or (overlap and similarity >= 0.86):
                groups[group_index].append(index)
                assigned = True
                break
        if not assigned:
            representatives.append(index)
            groups.append([index])
        if len(representatives) >= count and len(groups) >= count and len(order) > count * 2:
            # Continue only through strong candidates so their variants remain auditable.
            if candidates[index].score < candidates[representatives[count - 1]].score * 0.55:
                break
    results: list[KeywordResult] = []
    for representative, group in zip(representatives[:count], groups[:count]):
        base = candidates[representative]
        variant_counts: Counter[str] = Counter()
        frequency = base.frequency
        segment_count = 0
        for member_index in group:
            member = candidates[member_index]
            segment_count = max(segment_count, member.segment_count)
            variant_counts.update(member.forms)
            if member.display != base.display:
                variant_counts[member.display] += member.frequency
        variants = [value for value, _ in variant_counts.most_common() if _fold(value) != _fold(base.display)]
        results.append(
            KeywordResult(
                keyword=base.display,
                normalized=base.normalized,
                score=base.score,
                frequency=frequency,
                segment_count=segment_count,
                variants=variants[:12],
            )
        )
    return results


def analyze_html(
    html: str,
    *,
    count: int,
    language: str,
    synonyms: SynonymDictionary,
    embedder: Embedder,
) -> AnalysisResult:
    if count < 1 or count > 200:
        raise KeywordError("Keyword count must be between 1 and 200.")
    segments, html_language = extract_segments(html)
    warnings: list[str] = []
    if language != "auto":
        resolved_language = primary_language(language)
        if resolved_language == "und":
            raise KeywordError(f"Invalid language tag: {language}")
        language_method = "cli"
        confidence: float | None = 1.0
    elif primary_language(html_language) != "und":
        resolved_language = primary_language(html_language)
        language_method = "html-lang"
        confidence = 1.0
    else:
        resolved_language, confidence = detect_language_lightweight(" ".join(item.text for item in segments))
        language_method = "lightweight" if resolved_language != "und" else "fallback"
        if resolved_language == "und":
            warnings.append("Language could not be determined confidently; semantic Unicode fallback is active.")
    if synonyms.language and synonyms.language != resolved_language:
        raise KeywordError(
            f"Synonym dictionary targets {synonyms.language}, but the resolved language is {resolved_language}."
        )
    candidates, total_tokens, removed_tokens = _collect_candidates(
        segments, resolved_language, synonyms, warnings
    )
    keywords = _rank_and_cluster(candidates, segments, count, embedder)
    return AnalysisResult(
        language=resolved_language,
        language_method=language_method,
        language_confidence=confidence,
        keywords=keywords,
        statistics={
            "segments": len(segments),
            "tokens": total_tokens,
            "filteredTokens": removed_tokens,
            "candidateCount": len(candidates),
            "requestedKeywords": count,
            "returnedKeywords": len(keywords),
        },
        warnings=list(dict.fromkeys(warnings)),
        model=embedder.model_name,
    )


class _MetaLocator(HTMLParser):
    def __init__(self, source: str) -> None:
        super().__init__(convert_charrefs=False)
        self.source = source
        self.line_offsets = [0]
        for match in re.finditer("\n", source):
            self.line_offsets.append(match.end())
        self.keyword_ranges: list[tuple[int, int]] = []
        self.head_insert: int | None = None
        self.html_insert: int | None = None

    def _offset(self) -> int:
        line, column = self.getpos()
        return self.line_offsets[line - 1] + column

    def _handle(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        raw = self.get_starttag_text() or ""
        start = self._offset()
        end = start + len(raw)
        lowered = tag.lower()
        if lowered == "head" and self.head_insert is None:
            self.head_insert = end
        elif lowered == "html" and self.html_insert is None:
            self.html_insert = end
        elif lowered == "meta":
            attrs_map = {key.lower(): (value or "") for key, value in attrs}
            if attrs_map.get("name", "").casefold() == "keywords":
                self.keyword_ranges.append((start, end))

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._handle(tag, attrs)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._handle(tag, attrs)


def upsert_keywords_meta(source: str, keywords: Sequence[str]) -> str:
    if not keywords:
        raise KeywordError("Cannot write an empty keywords metadata value.")
    locator = _MetaLocator(source)
    locator.feed(source)
    value = ", ".join(keywords)
    tag = f'<meta name="keywords" content="{html_module.escape(value, quote=True)}">'
    if locator.keyword_ranges:
        edits: list[tuple[int, int, str]] = []
        for index, (start, end) in enumerate(locator.keyword_ranges):
            edits.append((start, end, tag if index == 0 else ""))
        result = source
        for start, end, replacement in sorted(edits, reverse=True):
            result = result[:start] + replacement + result[end:]
    elif locator.head_insert is not None:
        result = source[: locator.head_insert] + "\n  " + tag + source[locator.head_insert :]
    elif locator.html_insert is not None:
        head = "\n<head>\n  " + tag + "\n</head>"
        result = source[: locator.html_insert] + head + source[locator.html_insert :]
    else:
        raise KeywordError("Input has no HTML root element; metadata cannot be inserted safely.")
    verification = BeautifulSoup(result, "html.parser").find_all(
        "meta", attrs={"name": lambda value: value and value.casefold() == "keywords"}
    )
    if len(verification) != 1 or verification[0].get("content") != value:
        raise KeywordError("Generated HTML failed keyword metadata validation.")
    return result
