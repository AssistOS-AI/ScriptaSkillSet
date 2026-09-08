from __future__ import annotations

from collections import Counter, OrderedDict
from hashlib import sha256
from html import escape
import json
import math
import os
from pathlib import Path
import re
from typing import Any

from bs4 import BeautifulSoup, Comment, NavigableString, Tag
import langcodes


TEXT_TAGS = {
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "dt", "dd",
    "th", "td", "caption", "figcaption", "blockquote",
}
SKIP_TAGS = {"script", "style", "code", "pre", "kbd", "samp", "math", "svg", "nav"}
BATCH_MAXIMUM_CHARS = 32_000
MAX_PARALLEL_ANALYSES = 4
DEFAULT_WPM = 200
UI_STRINGS = {
    "ro": {"minutes": "min", "words": "cuvinte", "map": "Harta ideilor și capitolelor", "idea": "Idee", "summary": "Sinteză", "chapters": "Capitole-sursă", "front": "Material introductiv"},
    "en": {"minutes": "min", "words": "words", "map": "Idea and chapter map", "idea": "Idea", "summary": "Summary", "chapters": "Source chapters", "front": "Front matter"},
    "it": {"minutes": "min", "words": "parole", "map": "Mappa delle idee e dei capitoli", "idea": "Idea", "summary": "Sintesi", "chapters": "Capitoli fonte", "front": "Materiale introduttivo"},
    "es": {"minutes": "min", "words": "palabras", "map": "Mapa de ideas y capítulos", "idea": "Idea", "summary": "Síntesis", "chapters": "Capítulos fuente", "front": "Material introductorio"},
    "de": {"minutes": "Min.", "words": "Wörter", "map": "Ideen- und Kapitelübersicht", "idea": "Idee", "summary": "Zusammenfassung", "chapters": "Quellkapitel", "front": "Einführendes Material"},
    "fr": {"minutes": "min", "words": "mots", "map": "Carte des idées et des chapitres", "idea": "Idée", "summary": "Synthèse", "chapters": "Chapitres sources", "front": "Documents liminaires"},
}
CONTENTS_HEADINGS = {
    "contents", "table of contents", "cuprins", "contenido", "índice",
    "indice", "inhaltsverzeichnis", "sommaire", "table des matières",
}
BIBLIOGRAPHY_PREFIXES = {
    "bibliography", "references", "works cited", "sources", "bibliografie",
    "referințe", "referinte", "bibliografía", "referencias", "bibliographie",
    "références", "bibliografia", "riferimenti", "literaturverzeichnis", "quellen",
}
LEGAL_RE = re.compile(
    r"(?:©|copyright|all rights reserved|toate drepturile rezervate|"
    r"todos los derechos reservados|tutti i diritti riservati|alle rechte vorbehalten|isbn\b)",
    re.IGNORECASE,
)
FACT_RE = re.compile(
    r"(?:https?://|mailto:|www\.)[^\s<>()]+|"
    r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b|"
    r"\b10\.\d{4,9}/[-._;()/:A-Z0-9]+|"
    r"(?<![\w])[+-]?\d+(?:[.,:/-]\d+)*(?:\s?%|[A-Za-z]{1,4})?(?![\w])",
    re.IGNORECASE,
)
ANALYSIS_KEYS = {
    "batch", "chapterId", "segment", "thesis", "role", "ideas",
    "evidenceAndExamples", "objectionsAndQualifications", "audit",
}
IDEA_KEYS = {
    "id", "statement", "centrality", "originality", "recurrenceCandidate",
    "sourceUnitIds",
}
EVIDENCE_KEYS = {"statement", "sourceUnitIds"}
ANALYSIS_AUDIT_KEYS = {"chapterCovered", "meaningPreserved", "factsPreserved", "notes"}
SYNTHESIS_KEYS = {
    "centralMessage", "clusters", "outline", "chapterCoverage", "audit",
}
CLUSTER_KEYS = {
    "id", "label", "synthesis", "centrality", "recurrence", "originality",
    "score", "selected", "chapterIds", "sourceUnitIds", "ideaIds",
}
OUTLINE_KEYS = {"id", "title", "purpose", "budgetWords", "clusterIds"}
COVERAGE_KEYS = {"chapterId", "clusterIds"}
SYNTHESIS_AUDIT_KEYS = {
    "allAnalysesUsed", "centralMessageCovered", "redundancyMerged", "notes",
}
DRAFT_KEYS = {"title", "dek", "sections", "conclusion", "audit"}
SECTION_KEYS = {"id", "heading", "paragraphs"}
PARAGRAPH_KEYS = {"text", "clusterIds", "sourceUnitIds", "audit"}
PARAGRAPH_AUDIT_KEYS = {"meaningPreserved", "factsPreserved", "noUnsupportedClaim"}
DRAFT_AUDIT_KEYS = {"sameLanguage", "centralMessagePreserved", "coherentEssay", "notes"}


class ComprehensiveSummaryError(RuntimeError):
    pass


def file_sha256(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_language(value: str) -> str:
    if not value or not langcodes.tag_is_valid(value):
        raise ComprehensiveSummaryError(f"Invalid BCP 47 language tag: {value!r}")
    return langcodes.standardize_tag(value)


def word_count(text: str) -> int:
    return len(re.findall(r"\b[^\W_]+(?:['’\-][^\W_]+)*\b", text, re.UNICODE))


def _normalized(value: str) -> str:
    return " ".join(value.split())


def _normalized_heading(value: str) -> str:
    return _normalized(value.casefold().strip(" .:;—–-"))


def _is_excluded(node: Tag | NavigableString) -> bool:
    parents = [node, *node.parents] if isinstance(node, Tag) else list(node.parents)
    for parent in parents:
        if not isinstance(parent, Tag):
            continue
        if parent.name in SKIP_TAGS or str(parent.get("translate", "")).casefold() == "no":
            return True
        if parent.get("aria-hidden") == "true" or parent.has_attr("hidden"):
            return True
    return False


def _content_scope(soup: BeautifulSoup) -> Tag:
    return soup.find("main", attrs={"data-reader-content": True}) or soup.find("main") or soup.body


def _root_text_tags(scope: Tag) -> list[Tag]:
    candidates = [
        tag for tag in scope.find_all(TEXT_TAGS)
        if not _is_excluded(tag) and word_count(tag.get_text(" ", strip=True))
    ]
    candidate_ids = {id(tag) for tag in candidates}
    return [
        tag for tag in candidates
        if not any(id(child) in candidate_ids for child in tag.find_all(TEXT_TAGS))
    ]


def _chapter_assignments(scope: Tag, roots: list[Tag]) -> tuple[dict[int, str], list[dict[str, Any]]]:
    mapping: dict[int, str] = {}
    chapters: list[dict[str, Any]] = []
    h1s = [tag for tag in scope.find_all("h1") if not _is_excluded(tag) and word_count(tag.get_text(" ", strip=True))]
    if h1s:
        chapters.append({"id": "front-matter", "title": "Front matter", "anchor": None})
        h1_ids = {id(tag) for tag in h1s}
        current = "front-matter"
        number = 0
        for root in roots:
            if id(root) in h1_ids:
                number += 1
                current = f"chapter-{number:04d}"
                chapters.append({
                    "id": current,
                    "title": _normalized(root.get_text(" ", strip=True)),
                    "anchor": str(root.get("id")) if root.get("id") else None,
                })
            mapping[id(root)] = current
        used = set(mapping.values())
        return mapping, [chapter for chapter in chapters if chapter["id"] in used]

    boundaries = scope.find_all(["article", "section"], recursive=False)
    if boundaries:
        for index, boundary in enumerate(boundaries, start=1):
            chapter_id = f"chapter-{index:04d}"
            heading = boundary.find(re.compile(r"^h[1-6]$"))
            chapters.append({
                "id": chapter_id,
                "title": _normalized(heading.get_text(" ", strip=True)) if heading else f"Section {index}",
                "anchor": str(heading.get("id")) if heading and heading.get("id") else None,
            })
            descendants = {id(boundary), *(id(tag) for tag in boundary.find_all(True))}
            for root in roots:
                if id(root) in descendants:
                    mapping[id(root)] = chapter_id
        unmapped = [root for root in roots if id(root) not in mapping]
        if unmapped:
            chapters.insert(0, {"id": "front-matter", "title": "Front matter", "anchor": None})
            for root in unmapped:
                mapping[id(root)] = "front-matter"
        return mapping, chapters

    title = "Document"
    first_heading = scope.find(re.compile(r"^h[1-6]$"))
    if first_heading:
        title = _normalized(first_heading.get_text(" ", strip=True))
    chapters = [{"id": "document", "title": title, "anchor": None}]
    return {id(root): "document" for root in roots}, chapters


def _chapter_exclusion(title: str, chapter_id: str, units: list[dict[str, Any]]) -> str | None:
    normalized = _normalized_heading(title)
    if normalized in CONTENTS_HEADINGS:
        return "contents"
    if any(
        normalized == prefix
        or normalized.startswith(prefix + " ")
        or normalized.endswith(" " + prefix)
        for prefix in BIBLIOGRAPHY_PREFIXES
    ):
        return "bibliography"
    prose = " ".join(unit["text"] for unit in units if unit["kind"] == "p")
    total_words = sum(unit["wordCount"] for unit in units)
    if chapter_id != "front-matter" and word_count(prose) < 40 and total_words < 80:
        return "structural-or-title-page"
    meaningful = [unit for unit in units if not LEGAL_RE.search(unit["text"])]
    if chapter_id == "front-matter" and word_count(prose) < 80:
        return "structural-front-matter"
    if units and not meaningful:
        return "legal-or-metadata"
    return None


def extract_document(soup: BeautifulSoup) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if soup.html is None or soup.body is None:
        raise ComprehensiveSummaryError("Input must be a complete HTML document with html and body.")
    scope = _content_scope(soup)
    roots = _root_text_tags(scope)
    mapping, chapters = _chapter_assignments(scope, roots)
    units: list[dict[str, Any]] = []
    for root in roots:
        text = _normalized(root.get_text(" ", strip=True))
        if not text:
            continue
        units.append({
            "id": f"u{len(units) + 1:06d}",
            "chapterId": mapping[id(root)],
            "kind": root.name,
            "text": text,
            "sourceAnchor": str(root.get("id")) if root.get("id") else None,
            "wordCount": word_count(text),
        })
    by_chapter: dict[str, list[dict[str, Any]]] = OrderedDict()
    for unit in units:
        by_chapter.setdefault(unit["chapterId"], []).append(unit)
    for chapter in chapters:
        chapter_units = by_chapter.get(chapter["id"], [])
        reason = _chapter_exclusion(chapter["title"], chapter["id"], chapter_units)
        chapter["included"] = reason is None
        chapter["exclusionReason"] = reason
        chapter["unitIds"] = [unit["id"] for unit in chapter_units]
        chapter["wordCount"] = sum(unit["wordCount"] for unit in chapter_units)
        chapter["batches"] = []
    return units, chapters


def _chapter_batches(
    units: list[dict[str, Any]], chapters: list[dict[str, Any]], maximum_chars: int = BATCH_MAXIMUM_CHARS
) -> list[dict[str, Any]]:
    lookup = {chapter["id"]: chapter for chapter in chapters}
    grouped: OrderedDict[str, list[dict[str, Any]]] = OrderedDict()
    for unit in units:
        if lookup[unit["chapterId"]]["included"]:
            grouped.setdefault(unit["chapterId"], []).append(unit)
    batches: list[dict[str, Any]] = []
    for chapter_id, chapter_units in grouped.items():
        segment: list[dict[str, Any]] = []
        chars = 0
        segment_number = 1
        for unit in chapter_units:
            size = len(unit["text"])
            if segment and chars + size > maximum_chars and size <= maximum_chars:
                batches.append({"chapterId": chapter_id, "segment": segment_number, "units": segment})
                segment_number += 1
                segment, chars = [], 0
            segment.append(unit)
            chars += size
            if chars > maximum_chars:
                batches.append({"chapterId": chapter_id, "segment": segment_number, "units": segment})
                segment_number += 1
                segment, chars = [], 0
        if segment:
            batches.append({"chapterId": chapter_id, "segment": segment_number, "units": segment})
    return batches


def _number_label(value: float) -> str:
    return str(int(value)) if value.is_integer() else str(value).rstrip("0").rstrip(".")


def prepare_job(
    source: Path,
    *,
    minutes: float,
    words_per_minute: int = DEFAULT_WPM,
    language: str | None = None,
    output: Path | None = None,
    job_dir: Path | None = None,
) -> dict[str, Any]:
    source = source.expanduser().resolve()
    if not source.is_file():
        raise ComprehensiveSummaryError(f"HTML input does not exist: {source}")
    if minutes <= 0 or not math.isfinite(minutes):
        raise ComprehensiveSummaryError("--minutes must be a positive finite number.")
    if words_per_minute < 50 or words_per_minute > 500:
        raise ComprehensiveSummaryError("--wpm must be between 50 and 500.")
    original = source.read_bytes()
    soup = BeautifulSoup(original.decode("utf-8"), "html.parser")
    detected = language or (str(soup.html.get("lang", "")) if soup.html else "")
    if not detected:
        raise ComprehensiveSummaryError("Document language is missing; add html lang or pass --language.")
    document_language = normalize_language(detected)
    units, chapters = extract_document(soup)
    ui = UI_STRINGS.get(document_language.split("-", 1)[0].casefold(), UI_STRINGS["en"])
    for chapter in chapters:
        if chapter["id"] == "front-matter":
            chapter["title"] = ui["front"]
    included_ids = {chapter["id"] for chapter in chapters if chapter["included"]}
    source_words = sum(unit["wordCount"] for unit in units if unit["chapterId"] in included_ids)
    target_words = round(minutes * words_per_minute)
    minimum_words = target_words * 90 // 100
    maximum_words = (target_words * 110 + 99) // 100
    if minimum_words >= source_words:
        raise ComprehensiveSummaryError(
            f"Requested summary lower bound ({minimum_words} words) is not shorter than "
            f"the content source ({source_words} words)."
        )
    label = _number_label(float(minutes))
    target = output.expanduser().resolve() if output else source.with_name(
        f"{source.stem}.summary-{label}min{source.suffix}"
    )
    if target == source:
        raise ComprehensiveSummaryError("Summary output must not replace the source HTML.")
    source_hash = sha256(original).hexdigest()
    if job_dir is None:
        identity = sha256(
            f"{source}\0{source_hash}\0{target}\0{minutes}\0{words_per_minute}".encode("utf-8")
        ).hexdigest()[:16]
        job_dir = source.parent / ".comprehensivesummary-jobs" / f"{source.stem}-{label}min-{identity}"
        existing = job_dir / "job.json"
        if existing.is_file():
            saved = json.loads(existing.read_text(encoding="utf-8"))
            if saved.get("sourceSha256") == source_hash and saved.get("output") == str(target):
                return {**job_status(job_dir), "resumed": True}
            raise ComprehensiveSummaryError(f"Existing job identity mismatch: {job_dir}")
    else:
        job_dir = job_dir.expanduser().resolve()
    job_dir.mkdir(parents=True, exist_ok=False)
    for name in ("batches", "analyses"):
        (job_dir / name).mkdir()
    (job_dir / "source-original.html").write_bytes(original)

    batches = _chapter_batches(units, chapters)
    batch_names: list[str] = []
    chapter_by_id = {chapter["id"]: chapter for chapter in chapters}
    for index, batch in enumerate(batches, start=1):
        name = f"batch-{index:04d}.json"
        batch_names.append(name)
        chapter = chapter_by_id[batch["chapterId"]]
        chapter["batches"].append(name)
        payload = {
            "batch": name,
            "language": document_language,
            "audience": "educated general reader",
            "chapterId": batch["chapterId"],
            "chapterTitle": chapter["title"],
            "segment": batch["segment"],
            "selectionWeights": {"centrality": 0.50, "recurrence": 0.25, "originality": 0.25},
            "instructions": (
                "Analyze this chapter segment faithfully. Capture its thesis, role, ideas, "
                "representative evidence, objections, and qualifications. Cite source unit IDs."
            ),
            "units": batch["units"],
        }
        (job_dir / "batches" / name).write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
    (job_dir / "chapters.json").write_text(
        json.dumps({"chapters": chapters}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    title = _normalized(soup.title.get_text(" ", strip=True)) if soup.title else source.stem
    context = {
        "language": document_language,
        "sourceTitle": title,
        "audience": "educated general reader",
        "format": "unified thematic essay",
        "traceability": "collapsible source map excluded from reading time",
        "shortDurationPolicy": "prioritize the central message and highest-ranked ideas",
        "selectionWeights": {"centrality": 0.50, "recurrence": 0.25, "originality": 0.25},
        "instructions": (
            "Stay in the source language. Preserve uncertainty and disagreement. Never invent "
            "facts, examples, quotations, citations, names, dates, or numbers."
        ),
    }
    (job_dir / "context.json").write_text(
        json.dumps(context, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    job = {
        "source": str(source), "sourceSha256": source_hash, "output": str(target),
        "language": document_language, "sourceTitle": title, "minutes": minutes,
        "wordsPerMinute": words_per_minute, "targetWords": target_words,
        "minimumWords": minimum_words, "maximumWords": maximum_words,
        "sourceWords": source_words, "batches": batch_names,
        "contentChapterIds": [chapter["id"] for chapter in chapters if chapter["included"]],
        "excludedChapters": [
            {"chapterId": chapter["id"], "reason": chapter["exclusionReason"]}
            for chapter in chapters if not chapter["included"]
        ],
        "unitCount": len(units), "batchMaximumChars": BATCH_MAXIMUM_CHARS,
        "parallelAnalyses": MAX_PARALLEL_ANALYSES,
    }
    (job_dir / "job.json").write_text(
        json.dumps(job, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return {
        "status": "prepared", "job": str(job_dir), "source": str(source),
        "output": str(target), "language": document_language, "minutes": minutes,
        "targetWords": target_words, "wordRange": [minimum_words, maximum_words],
        "sourceWords": source_words, "contentChapters": len(job["contentChapterIds"]),
        "excludedChapters": job["excludedChapters"], "batches": len(batch_names),
        "readyAnalyses": batch_names, "recommendedParallelAnalyses": min(4, len(batch_names)),
    }


def _json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _exact_dict(value: Any, keys: set[str]) -> bool:
    return isinstance(value, dict) and set(value) == keys


def _true_audit(value: Any, keys: set[str]) -> bool:
    return _exact_dict(value, keys) and all(
        value[key] is True for key in keys if key != "notes"
    ) and isinstance(value.get("notes", ""), str)


def validate_analysis(payload: Any, batch: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if not _exact_dict(payload, ANALYSIS_KEYS):
        return ["analysis root schema is invalid"]
    if payload["batch"] != batch["batch"] or payload["chapterId"] != batch["chapterId"] or payload["segment"] != batch["segment"]:
        errors.append("analysis identity does not match its batch")
    if not all(isinstance(payload[key], str) and payload[key].strip() for key in ("thesis", "role")):
        errors.append("analysis thesis and role must be non-empty strings")
    valid_units = {unit["id"] for unit in batch["units"]}
    ideas = payload.get("ideas")
    if not isinstance(ideas, list) or not ideas:
        errors.append("analysis ideas must be a non-empty list")
    else:
        ids: list[str] = []
        prefix = batch["batch"].removesuffix(".json") + "-idea-"
        for idea in ideas:
            if not _exact_dict(idea, IDEA_KEYS):
                errors.append("idea schema is invalid")
                continue
            ids.append(str(idea["id"]))
            if not str(idea["id"]).startswith(prefix):
                errors.append(f"idea ID {idea['id']} has the wrong namespace")
            if not all(isinstance(idea[key], str) and idea[key].strip() for key in ("statement", "recurrenceCandidate")):
                errors.append(f"idea {idea['id']} has empty text")
            for score in ("centrality", "originality"):
                if not isinstance(idea[score], (int, float)) or not 0 <= idea[score] <= 1:
                    errors.append(f"idea {idea['id']} has invalid {score}")
            if not isinstance(idea["sourceUnitIds"], list) or not idea["sourceUnitIds"] or not set(idea["sourceUnitIds"]) <= valid_units:
                errors.append(f"idea {idea['id']} has invalid source units")
        if len(ids) != len(set(ids)):
            errors.append("idea IDs are duplicated")
    for key in ("evidenceAndExamples", "objectionsAndQualifications"):
        entries = payload.get(key)
        if not isinstance(entries, list):
            errors.append(f"{key} must be a list")
            continue
        for entry in entries:
            if not _exact_dict(entry, EVIDENCE_KEYS) or not isinstance(entry["statement"], str) or not entry["statement"].strip():
                errors.append(f"{key} entry schema is invalid")
            elif not isinstance(entry["sourceUnitIds"], list) or not entry["sourceUnitIds"] or not set(entry["sourceUnitIds"]) <= valid_units:
                errors.append(f"{key} contains invalid source units")
    if not _true_audit(payload.get("audit"), ANALYSIS_AUDIT_KEYS):
        errors.append("analysis audit is incomplete")
    return errors


def load_analyses(job_dir: Path, job: dict[str, Any], require_all: bool = True) -> tuple[list[dict[str, Any]], list[str]]:
    analyses: list[dict[str, Any]] = []
    incomplete: list[str] = []
    for name in job["batches"]:
        batch = _json(job_dir / "batches" / name)
        path = job_dir / "analyses" / name
        if not path.is_file():
            incomplete.append(name)
            continue
        try:
            analysis = _json(path)
            errors = validate_analysis(analysis, batch)
        except (json.JSONDecodeError, OSError, TypeError, KeyError):
            errors = ["analysis is unreadable"]
            analysis = None
        if errors:
            incomplete.append(name)
        elif analysis is not None:
            analyses.append(analysis)
    if require_all and incomplete:
        raise ComprehensiveSummaryError(f"Missing or invalid chapter analyses: {incomplete}")
    return analyses, incomplete


def _analysis_indexes(analyses: list[dict[str, Any]]) -> tuple[set[str], set[str], set[str]]:
    idea_ids: set[str] = set()
    unit_ids: set[str] = set()
    chapter_ids: set[str] = set()
    for analysis in analyses:
        chapter_ids.add(analysis["chapterId"])
        for idea in analysis["ideas"]:
            idea_ids.add(idea["id"])
            unit_ids.update(idea["sourceUnitIds"])
        for key in ("evidenceAndExamples", "objectionsAndQualifications"):
            for entry in analysis[key]:
                unit_ids.update(entry["sourceUnitIds"])
    return idea_ids, unit_ids, chapter_ids


def validate_synthesis(payload: Any, job: dict[str, Any], analyses: list[dict[str, Any]]) -> list[str]:
    errors: list[str] = []
    if not _exact_dict(payload, SYNTHESIS_KEYS):
        return ["synthesis root schema is invalid"]
    if not isinstance(payload["centralMessage"], str) or not payload["centralMessage"].strip():
        errors.append("centralMessage is empty")
    idea_ids, unit_ids, _analysis_chapters = _analysis_indexes(analyses)
    content_chapters = set(job["contentChapterIds"])
    clusters = payload.get("clusters")
    cluster_ids: list[str] = []
    selected: set[str] = set()
    if not isinstance(clusters, list) or not clusters:
        errors.append("clusters must be a non-empty list")
        clusters = []
    for cluster in clusters:
        if not _exact_dict(cluster, CLUSTER_KEYS):
            errors.append("cluster schema is invalid")
            continue
        cluster_id = str(cluster["id"])
        cluster_ids.append(cluster_id)
        if not re.fullmatch(r"cluster-\d{3,}", cluster_id):
            errors.append(f"invalid cluster ID {cluster_id}")
        if not all(isinstance(cluster[key], str) and cluster[key].strip() for key in ("label", "synthesis")):
            errors.append(f"cluster {cluster_id} has empty text")
        numeric_ok = True
        for key in ("centrality", "recurrence", "originality", "score"):
            if not isinstance(cluster[key], (int, float)) or not 0 <= cluster[key] <= 1:
                errors.append(f"cluster {cluster_id} has invalid {key}")
                numeric_ok = False
        if numeric_ok:
            expected = 0.5 * cluster["centrality"] + 0.25 * cluster["recurrence"] + 0.25 * cluster["originality"]
            if abs(cluster["score"] - expected) > 0.011:
                errors.append(f"cluster {cluster_id} has an incorrect weighted score")
        if type(cluster["selected"]) is not bool:
            errors.append(f"cluster {cluster_id} selected must be boolean")
        elif cluster["selected"]:
            selected.add(cluster_id)
        if not isinstance(cluster["chapterIds"], list) or not cluster["chapterIds"] or not set(cluster["chapterIds"]) <= content_chapters:
            errors.append(f"cluster {cluster_id} has invalid chapters")
        if not isinstance(cluster["sourceUnitIds"], list) or not cluster["sourceUnitIds"] or not set(cluster["sourceUnitIds"]) <= unit_ids:
            errors.append(f"cluster {cluster_id} has invalid source units")
        if not isinstance(cluster["ideaIds"], list) or not cluster["ideaIds"] or not set(cluster["ideaIds"]) <= idea_ids:
            errors.append(f"cluster {cluster_id} has invalid idea IDs")
    if len(cluster_ids) != len(set(cluster_ids)):
        errors.append("cluster IDs are duplicated")
    cluster_set = set(cluster_ids)
    outline = payload.get("outline")
    outline_ids: list[str] = []
    if not isinstance(outline, list) or not outline:
        errors.append("outline must be a non-empty list")
        outline = []
    for section in outline:
        if not _exact_dict(section, OUTLINE_KEYS):
            errors.append("outline section schema is invalid")
            continue
        outline_ids.append(str(section["id"]))
        if not all(isinstance(section[key], str) and section[key].strip() for key in ("title", "purpose")):
            errors.append(f"outline section {section['id']} has empty text")
        if not isinstance(section["budgetWords"], int) or section["budgetWords"] <= 0:
            errors.append(f"outline section {section['id']} has invalid budget")
        if not isinstance(section["clusterIds"], list) or not section["clusterIds"] or not set(section["clusterIds"]) <= selected:
            errors.append(f"outline section {section['id']} must use selected clusters")
    if len(outline_ids) != len(set(outline_ids)):
        errors.append("outline section IDs are duplicated")
    used_selected = {cluster_id for section in outline for cluster_id in section.get("clusterIds", [])}
    if used_selected != selected:
        errors.append("selected clusters and outline coverage differ")
    coverage = payload.get("chapterCoverage")
    if not isinstance(coverage, list) or any(not _exact_dict(item, COVERAGE_KEYS) for item in coverage):
        errors.append("chapterCoverage schema is invalid")
    else:
        coverage_ids = [item["chapterId"] for item in coverage]
        if len(coverage_ids) != len(set(coverage_ids)) or set(coverage_ids) != content_chapters:
            errors.append("chapterCoverage must contain every content chapter exactly once")
        if any(not isinstance(item["clusterIds"], list) or not set(item["clusterIds"]) <= cluster_set for item in coverage):
            errors.append("chapterCoverage contains invalid cluster IDs")
    if not _true_audit(payload.get("audit"), SYNTHESIS_AUDIT_KEYS):
        errors.append("synthesis audit is incomplete")
    return errors


def _paragraph_valid(
    paragraph: Any, *, selected: set[str], valid_units: set[str], cluster_units: dict[str, set[str]]
) -> list[str]:
    if not _exact_dict(paragraph, PARAGRAPH_KEYS):
        return ["paragraph schema is invalid"]
    errors: list[str] = []
    if not isinstance(paragraph["text"], str) or not paragraph["text"].strip():
        errors.append("paragraph text is empty")
    if not isinstance(paragraph["clusterIds"], list) or not paragraph["clusterIds"] or not set(paragraph["clusterIds"]) <= selected:
        errors.append("paragraph contains invalid cluster IDs")
    if not isinstance(paragraph["sourceUnitIds"], list) or not paragraph["sourceUnitIds"] or not set(paragraph["sourceUnitIds"]) <= valid_units:
        errors.append("paragraph contains invalid source unit IDs")
    else:
        supported = set().union(*(cluster_units.get(item, set()) for item in paragraph.get("clusterIds", [])))
        if not set(paragraph["sourceUnitIds"]) <= supported:
            errors.append("paragraph source units are not supported by its clusters")
    audit = paragraph.get("audit")
    if not _exact_dict(audit, PARAGRAPH_AUDIT_KEYS) or not all(audit.get(key) is True for key in PARAGRAPH_AUDIT_KEYS):
        errors.append("paragraph audit is incomplete")
    return errors


def draft_text(payload: dict[str, Any]) -> str:
    parts = [payload["title"], payload["dek"]]
    for section in payload["sections"]:
        parts.append(section["heading"])
        parts.extend(paragraph["text"] for paragraph in section["paragraphs"])
    parts.extend(paragraph["text"] for paragraph in payload["conclusion"])
    return "\n".join(parts)


def validate_draft(payload: Any, job: dict[str, Any], synthesis: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if not _exact_dict(payload, DRAFT_KEYS):
        return ["draft root schema is invalid"]
    if not all(isinstance(payload[key], str) and payload[key].strip() for key in ("title", "dek")):
        errors.append("draft title and dek must be non-empty strings")
    selected_clusters = {cluster["id"] for cluster in synthesis["clusters"] if cluster["selected"]}
    cluster_units = {cluster["id"]: set(cluster["sourceUnitIds"]) for cluster in synthesis["clusters"]}
    valid_units = set().union(*cluster_units.values()) if cluster_units else set()
    outline_ids = [section["id"] for section in synthesis["outline"]]
    sections = payload.get("sections")
    if not isinstance(sections, list) or any(not _exact_dict(section, SECTION_KEYS) for section in sections):
        errors.append("draft section schema is invalid")
        sections = []
    if [section["id"] for section in sections] != outline_ids:
        errors.append("draft sections must match synthesis outline order")
    for section in sections:
        if not isinstance(section["heading"], str) or not section["heading"].strip():
            errors.append(f"section {section['id']} has an empty heading")
        if not isinstance(section["paragraphs"], list) or not section["paragraphs"]:
            errors.append(f"section {section['id']} has no paragraphs")
            continue
        outline = next((item for item in synthesis["outline"] if item["id"] == section["id"]), None)
        allowed = set(outline["clusterIds"]) if outline else set()
        for paragraph in section["paragraphs"]:
            errors.extend(_paragraph_valid(
                paragraph, selected=selected_clusters, valid_units=valid_units,
                cluster_units=cluster_units,
            ))
            if isinstance(paragraph, dict) and not set(paragraph.get("clusterIds", [])) <= allowed:
                errors.append(f"section {section['id']} uses a cluster outside its outline")
    conclusion = payload.get("conclusion")
    if not isinstance(conclusion, list) or not conclusion:
        errors.append("draft conclusion must contain paragraphs")
    else:
        for paragraph in conclusion:
            errors.extend(_paragraph_valid(
                paragraph, selected=selected_clusters, valid_units=valid_units,
                cluster_units=cluster_units,
            ))
    if not _true_audit(payload.get("audit"), DRAFT_AUDIT_KEYS):
        errors.append("draft audit is incomplete")
    count = word_count(draft_text(payload)) if not errors or all("schema" not in error for error in errors) else 0
    if count and not job["minimumWords"] <= count <= job["maximumWords"]:
        errors.append(
            f"draft word count {count} is outside {job['minimumWords']}..{job['maximumWords']}"
        )
    return errors


def job_status(job_dir: Path) -> dict[str, Any]:
    job_dir = job_dir.expanduser().resolve()
    path = job_dir / "job.json"
    if not path.is_file():
        raise ComprehensiveSummaryError(f"Summary job does not exist: {job_dir}")
    job = _json(path)
    analyses, incomplete = load_analyses(job_dir, job, require_all=False)
    synthesis_path = job_dir / "synthesis.json"
    synthesis_errors: list[str] | None = None
    draft_errors: list[str] | None = None
    if incomplete:
        stage = "chapter_analysis"
    elif not synthesis_path.is_file():
        stage = "synthesis_required"
    else:
        try:
            synthesis = _json(synthesis_path)
            synthesis_errors = validate_synthesis(synthesis, job, analyses)
        except (json.JSONDecodeError, OSError, KeyError, TypeError):
            synthesis_errors = ["synthesis is unreadable"]
            synthesis = None
        if synthesis_errors:
            stage = "synthesis_required"
        elif not (job_dir / "draft.json").is_file():
            stage = "draft_required"
        else:
            try:
                draft = _json(job_dir / "draft.json")
                draft_errors = validate_draft(draft, job, synthesis)
            except (json.JSONDecodeError, OSError, KeyError, TypeError):
                draft_errors = ["draft is unreadable"]
            stage = "draft_required" if draft_errors else "ready_to_build"
    return {
        "status": stage, "job": str(job_dir), "source": job["source"],
        "output": job["output"], "language": job["language"], "minutes": job["minutes"],
        "targetWords": job["targetWords"], "wordRange": [job["minimumWords"], job["maximumWords"]],
        "contentChapters": len(job["contentChapterIds"]), "batches": len(job["batches"]),
        "completedAnalyses": len(analyses), "remainingAnalyses": len(incomplete),
        "readyAnalyses": incomplete if incomplete else [],
        "recommendedParallelAnalyses": min(job["parallelAnalyses"], len(incomplete)),
        "synthesisErrors": synthesis_errors, "draftErrors": draft_errors,
    }


def _fact_tokens(text: str) -> set[str]:
    return {match.group(0).casefold().rstrip(".,;:") for match in FACT_RE.finditer(text)}


def render_summary(
    job: dict[str, Any], chapters: list[dict[str, Any]], synthesis: dict[str, Any], draft: dict[str, Any]
) -> str:
    source = Path(job["source"])
    target = Path(job["output"])
    relative_source = Path(os.path.relpath(source, target.parent)).as_posix()
    chapter_map = {chapter["id"]: chapter for chapter in chapters}
    cluster_map = {cluster["id"]: cluster for cluster in synthesis["clusters"]}
    primary_language = job["language"].split("-", 1)[0].casefold()
    ui = UI_STRINGS.get(primary_language, UI_STRINGS["en"])

    sections_html: list[str] = []
    for section in draft["sections"]:
        paragraphs = "".join(
            f'<p data-clusters="{escape(" ".join(paragraph["clusterIds"]))}" '
            f'data-source-units="{escape(" ".join(paragraph["sourceUnitIds"]))}">{escape(paragraph["text"])}</p>'
            for paragraph in section["paragraphs"]
        )
        sections_html.append(
            f'<section id="{escape(section["id"])}"><h2>{escape(section["heading"])}</h2>{paragraphs}</section>'
        )
    conclusion_html = "".join(
        f'<p data-clusters="{escape(" ".join(paragraph["clusterIds"]))}" '
        f'data-source-units="{escape(" ".join(paragraph["sourceUnitIds"]))}">{escape(paragraph["text"])}</p>'
        for paragraph in draft["conclusion"]
    )
    rows: list[str] = []
    for cluster in synthesis["clusters"]:
        if not cluster["selected"]:
            continue
        chapter_links: list[str] = []
        for chapter_id in cluster["chapterIds"]:
            chapter = chapter_map[chapter_id]
            href = relative_source + (f'#{chapter["anchor"]}' if chapter.get("anchor") else "")
            chapter_title = ui["front"] if chapter_id == "front-matter" else chapter["title"]
            chapter_links.append(f'<a href="{escape(href)}">{escape(chapter_title)}</a>')
        rows.append(
            f'<tr data-cluster="{escape(cluster["id"])}" '
            f'data-source-units="{escape(" ".join(cluster["sourceUnitIds"]))}">'
            f'<th scope="row">{escape(cluster["label"])}</th>'
            f'<td>{escape(cluster["synthesis"])}</td><td>{"; ".join(chapter_links)}</td></tr>'
        )
    actual_words = word_count(draft_text(draft))
    css = """
:root{color-scheme:light dark;--bg:#f6f2e9;--paper:#fffdf8;--ink:#24211d;--muted:#6d655b;--accent:#73523a;--line:#d9cdbf}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Georgia,'Times New Roman',serif;line-height:1.68}
main{width:min(760px,calc(100% - 2rem));margin:3rem auto;background:var(--paper);padding:clamp(1.5rem,5vw,4.5rem);box-shadow:0 12px 40px #0001}
h1{font-size:clamp(2rem,6vw,3.6rem);line-height:1.05;margin:.2em 0}.dek{font-size:1.18rem;color:var(--muted);margin:1rem 0 2rem}
h2{font-size:1.55rem;line-height:1.2;margin:2.2em 0 .7em}p{margin:.8em 0}details{margin-top:3rem;border-top:1px solid var(--line);padding-top:1rem}
summary{cursor:pointer;font:600 1rem system-ui,sans-serif;color:var(--accent)}table{width:100%;border-collapse:collapse;margin-top:1rem;font-size:.88rem}
th,td{text-align:left;vertical-align:top;padding:.65rem;border-bottom:1px solid var(--line)}a{color:var(--accent)}
@media(max-width:620px){main{width:100%;margin:0;box-shadow:none}table,tbody,tr,th,td{display:block}th{border-bottom:0;padding-bottom:0}}
@media(prefers-color-scheme:dark){:root{--bg:#171513;--paper:#211e1a;--ink:#eee7dd;--muted:#b9ada0;--accent:#d8ab83;--line:#4b433b}}
""".strip()
    return f"""<!doctype html>
<html lang="{escape(job['language'])}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="summary-generator" content="comprehensivesummary-skill">
<meta name="summary-source-sha256" content="{escape(job['sourceSha256'])}">
<meta name="summary-target-words" content="{job['targetWords']}">
<meta name="summary-minimum-words" content="{job['minimumWords']}">
<meta name="summary-maximum-words" content="{job['maximumWords']}">
<meta name="summary-actual-words" content="{actual_words}">
<meta name="summary-words-per-minute" content="{job['wordsPerMinute']}">
<title>{escape(draft['title'])}</title>
<style>{css}</style>
</head>
<body><main>
<article data-summary-body>
<h1>{escape(draft['title'])}</h1>
<p class="dek">{escape(draft['dek'])}</p>
{''.join(sections_html)}
<section id="conclusion">{conclusion_html}</section>
</article>
<details data-source-map><summary>{escape(ui['map'])}</summary>
<table><thead><tr><th>{escape(ui['idea'])}</th><th>{escape(ui['summary'])}</th><th>{escape(ui['chapters'])}</th></tr></thead><tbody>{''.join(rows)}</tbody></table>
</details>
</main></body></html>
"""


def _owned_output(path: Path) -> bool:
    if not path.is_file():
        return False
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    marker = soup.find("meta", attrs={"name": "summary-generator"})
    return marker is not None and marker.get("content") == "comprehensivesummary-skill"


def build_job(job_dir: Path, *, overwrite: bool = False) -> dict[str, Any]:
    job_dir = job_dir.expanduser().resolve()
    job = _json(job_dir / "job.json")
    source, target = Path(job["source"]), Path(job["output"])
    if file_sha256(source) != job["sourceSha256"]:
        raise ComprehensiveSummaryError("Source HTML changed after the summary job was prepared.")
    analyses, _incomplete = load_analyses(job_dir, job)
    synthesis = _json(job_dir / "synthesis.json")
    synthesis_errors = validate_synthesis(synthesis, job, analyses)
    if synthesis_errors:
        raise ComprehensiveSummaryError(f"Synthesis validation failed: {synthesis_errors}")
    draft = _json(job_dir / "draft.json")
    draft_errors = validate_draft(draft, job, synthesis)
    if draft_errors:
        raise ComprehensiveSummaryError(f"Draft validation failed: {draft_errors}")
    source_evidence_text = "\n".join(
        unit["text"]
        for name in job["batches"]
        for unit in _json(job_dir / "batches" / name)["units"]
    )
    unsupported_facts = sorted(_fact_tokens(draft_text(draft)) - _fact_tokens(source_evidence_text))
    if unsupported_facts:
        raise ComprehensiveSummaryError(f"Draft contains unsupported factual tokens: {unsupported_facts}")
    chapters = _json(job_dir / "chapters.json")["chapters"]
    candidate = job_dir / "candidate.html"
    candidate.write_text(render_summary(job, chapters, synthesis, draft), encoding="utf-8")
    from .validation import validate_summary
    report = validate_summary(
        job_dir / "source-original.html", candidate, intended_source=source,
        expected_language=job["language"],
    )
    (job_dir / "report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    if report["status"] == "failed":
        raise ComprehensiveSummaryError(
            f"Summary validation failed; candidate retained at {candidate}. Findings: {report['findings']}"
        )
    if target.exists() and (not overwrite or not _owned_output(target)):
        raise ComprehensiveSummaryError(
            f"Refusing to replace {target}; use --overwrite only for skill-owned output."
        )
    target.parent.mkdir(parents=True, exist_ok=True)
    stage = target.parent / f".{target.name}.comprehensivesummary-stage"
    stage.write_bytes(candidate.read_bytes())
    os.replace(stage, target)
    return {
        "status": report["status"], "artifact": str(target), "job": str(job_dir),
        "report": str(job_dir / "report.json"), "findings": report["findings"],
        "metrics": report["metrics"],
    }
