from __future__ import annotations

from difflib import SequenceMatcher
from hashlib import sha256
from html import escape
import json
import os
from pathlib import Path
import re
from typing import Any

from bs4 import BeautifulSoup, Tag
import langcodes


MAX_BATCH_CHARACTERS = 32_000
EXACT_ANALYSIS_KEYS = {"batch", "chapterId", "segment", "modeSignals", "safeHooks", "protectedRevelations", "audit"}
HOOK_TYPES = {"premise", "question", "stakes", "approach", "atmosphere", "starting-conflict", "reader-fit"}
REVELATION_TYPES = {"answer", "conclusion", "solution", "recommendation", "twist", "resolution", "outcome"}
OUTLINE_ROLES = {"stakes", "questions", "approach", "reader-fit", "open-loop"}
SEMANTIC_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "blockquote", "figcaption", "caption", "th", "td"}
NON_CONTENT_RE = re.compile(
    r"\b(contents?|cuprins|sommaire|indice|inhaltsverzeichnis|bibliograph(?:y|ie)|bibliograf(?:ie|ia)|references?|referințe|"
    r"copyright|drepturi de autor|impressum)\b", re.IGNORECASE
)
FACT_RE = re.compile(
    r"(?:https?://\S+|www\.\S+|\b[\w.+-]+@[\w.-]+\.\w+\b|\b10\.\d{4,9}/\S+|"
    r"\b\d+(?:[.,]\d+)*(?:%|‰|°|[A-Za-z]{1,5})?\b)", re.UNICODE
)


class MarketingSummaryError(RuntimeError):
    pass


def file_sha256(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def _bytes_sha256(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def _json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _is_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _exact_keys(value: Any, keys: set[str]) -> bool:
    return isinstance(value, dict) and set(value) == keys


def _string_list(value: Any, *, nonempty: bool = False) -> bool:
    return isinstance(value, list) and (bool(value) or not nonempty) and all(isinstance(item, str) for item in value)


def word_count(text: str) -> int:
    return len(re.findall(r"\b[^\W_]+(?:[’'\-][^\W_]+)*\b", text, re.UNICODE))


def normalize_language(value: str) -> str:
    if not _is_string(value):
        raise MarketingSummaryError("Source HTML needs a valid language or --language override.")
    try:
        tag = langcodes.Language.get(value.strip()).to_tag()
    except Exception as error:
        raise MarketingSummaryError(f"Invalid language tag: {value}") from error
    if tag.casefold() == "und":
        raise MarketingSummaryError("Source language is undetermined; use --language.")
    return tag


def _budget(source_words: int) -> tuple[int, int, int]:
    if source_words <= 5_000:
        return 275, 250, 300
    if source_words <= 20_000:
        return 425, 375, 475
    return 600, 550, 650


def _fact_tokens(text: str) -> set[str]:
    return {match.group(0).rstrip(".,;:!?)\"]}").casefold() for match in FACT_RE.finditer(text)}


def _normalize_text(text: str) -> str:
    return " ".join(re.findall(r"[^\W_]+", text.casefold(), re.UNICODE))


def _source_kind(soup: BeautifulSoup) -> str:
    marker = soup.find("meta", attrs={"name": "summary-generator"})
    if marker and marker.get("content") == "comprehensivesummary-skill":
        return "comprehensive-summary"
    return "semantic-html"


def _extract_units(soup: BeautifulSoup, source_kind: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if source_kind == "comprehensive-summary":
        root = soup.find("article", attrs={"data-summary-body": True})
        if root is None:
            raise MarketingSummaryError("Comprehensive summary marker exists but its summary article is missing.")
    else:
        root = soup.body or soup
    clone = BeautifulSoup(str(root), "html.parser")
    for tag in clone.select("script,style,noscript,nav,svg,template,details[data-source-map],[hidden],[aria-hidden='true']"):
        tag.decompose()

    candidates: list[Tag] = []
    for tag in clone.find_all(SEMANTIC_TAGS):
        if any(isinstance(child, Tag) and child.name in SEMANTIC_TAGS for child in tag.descendants):
            continue
        text = " ".join(tag.get_text(" ", strip=True).split())
        if text:
            candidates.append(tag)
    if not candidates:
        raise MarketingSummaryError("No semantic reader-facing text was found in the HTML input.")

    heading_counts = {
        level: sum(1 for tag in candidates if tag.name == level)
        for level in ("h1", "h2")
    }
    boundary = "h1" if heading_counts["h1"] >= 2 else "h2" if heading_counts["h2"] >= 2 else None
    chapters: list[dict[str, Any]] = []
    units: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    unit_number = 0

    def new_chapter(title: str) -> dict[str, Any]:
        chapter_id = f"chapter-{len(chapters) + 1:04d}"
        item = {"id": chapter_id, "title": title or "Front matter", "content": True, "unitIds": []}
        chapters.append(item)
        return item

    for tag in candidates:
        text = " ".join(tag.get_text(" ", strip=True).split())
        if boundary and tag.name == boundary:
            current = new_chapter(text)
        elif current is None:
            current = new_chapter("Front matter")
        unit_number += 1
        unit_id = f"u{unit_number:06d}"
        unit = {"id": unit_id, "chapterId": current["id"], "tag": tag.name, "text": text}
        units.append(unit)
        current["unitIds"].append(unit_id)

    excluded: list[dict[str, Any]] = []
    for chapter in chapters:
        chapter_units = [unit for unit in units if unit["chapterId"] == chapter["id"]]
        prose_words = sum(word_count(unit["text"]) for unit in chapter_units if not unit["tag"].startswith("h"))
        if NON_CONTENT_RE.search(chapter["title"]) or prose_words < 8:
            chapter["content"] = False
            reason = "recognized non-content section" if NON_CONTENT_RE.search(chapter["title"]) else "insufficient prose"
            excluded.append({"chapterId": chapter["id"], "title": chapter["title"], "reason": reason})
    if not any(chapter["content"] for chapter in chapters):
        raise MarketingSummaryError("The HTML contains no substantial content chapters.")
    return units, excluded


def _chapters_from_units(units: list[dict[str, Any]], excluded: list[dict[str, Any]]) -> list[dict[str, Any]]:
    excluded_ids = {item["chapterId"] for item in excluded}
    result: list[dict[str, Any]] = []
    seen: dict[str, dict[str, Any]] = {}
    for unit in units:
        chapter_id = unit["chapterId"]
        if chapter_id not in seen:
            title = unit["text"] if unit["tag"] in {"h1", "h2"} else "Front matter"
            seen[chapter_id] = {"id": chapter_id, "title": title, "content": chapter_id not in excluded_ids, "unitIds": []}
            result.append(seen[chapter_id])
        seen[chapter_id]["unitIds"].append(unit["id"])
    return result


def _make_batches(chapters: list[dict[str, Any]], units: list[dict[str, Any]], language: str) -> list[dict[str, Any]]:
    unit_map = {unit["id"]: unit for unit in units}
    batches: list[dict[str, Any]] = []
    for chapter in chapters:
        if not chapter["content"]:
            continue
        chapter_units = [unit_map[unit_id] for unit_id in chapter["unitIds"]]
        parts: list[list[dict[str, Any]]] = [[]]
        current_chars = 0
        for unit in chapter_units:
            size = len(unit["text"])
            if parts[-1] and current_chars + size > MAX_BATCH_CHARACTERS:
                parts.append([])
                current_chars = 0
            parts[-1].append(unit)
            current_chars += size
        for segment, part in enumerate(parts, 1):
            batch_id = f"batch-{len(batches) + 1:04d}"
            batches.append({
                "batch": f"{batch_id}.json",
                "chapterId": chapter["id"],
                "chapterTitle": chapter["title"],
                "segment": segment,
                "language": language,
                "characterCount": sum(len(unit["text"]) for unit in part),
                "units": [{"id": unit["id"], "tag": unit["tag"], "text": unit["text"]} for unit in part],
            })
    return batches


def prepare_job(
    input_path: Path,
    *,
    language: str | None = None,
    output: Path | None = None,
    job_dir: Path | None = None,
) -> dict[str, Any]:
    source = input_path.expanduser().resolve()
    if source.suffix.casefold() not in {".html", ".htm"}:
        raise MarketingSummaryError("Input must be an .html or .htm document.")
    if not source.is_file():
        raise MarketingSummaryError(f"Input does not exist: {source}")
    source_bytes = source.read_bytes()
    try:
        source_text = source_bytes.decode("utf-8")
    except UnicodeDecodeError as error:
        raise MarketingSummaryError("Input HTML must be UTF-8 encoded.") from error
    soup = BeautifulSoup(source_text, "html.parser")
    document_language = normalize_language(language or (str(soup.html.get("lang", "")) if soup.html else ""))
    kind = _source_kind(soup)
    units, excluded = _extract_units(soup, kind)
    chapters = _chapters_from_units(units, excluded)
    content_ids = {chapter["id"] for chapter in chapters if chapter["content"]}
    source_words = sum(word_count(unit["text"]) for unit in units if unit["chapterId"] in content_ids)
    target_words, minimum_words, maximum_words = _budget(source_words)
    target = (output or source.with_name(f"{source.stem}.marketing.html")).expanduser().resolve()
    if target == source:
        raise MarketingSummaryError("Marketing output must be separate from the source.")
    digest = sha256(source_bytes).hexdigest()[:16]
    workspace = (job_dir or source.parent / ".marketingsummary-jobs" / f"{source.stem}-{digest}").expanduser().resolve()
    if workspace.exists() and any(workspace.iterdir()):
        raise MarketingSummaryError(f"Job directory already exists and is not empty: {workspace}")
    workspace.mkdir(parents=True, exist_ok=True)
    for name in ("batches", "analyses"):
        (workspace / name).mkdir()
    snapshot = workspace / "source-original.html"
    snapshot.write_bytes(source_bytes)
    batches = _make_batches(chapters, units, document_language)
    for batch in batches:
        _write_json(workspace / "batches" / batch["batch"], batch)
    source_title = ""
    if soup.title and soup.title.get_text(strip=True):
        source_title = soup.title.get_text(" ", strip=True)
    if not source_title:
        first_heading = soup.find(["h1", "h2"])
        source_title = first_heading.get_text(" ", strip=True) if first_heading else source.stem
    job = {
        "source": str(source),
        "output": str(target),
        "sourceSha256": sha256(source_bytes).hexdigest(),
        "sourceKind": kind,
        "sourceTitle": source_title,
        "language": document_language,
        "sourceWords": source_words,
        "targetWords": target_words,
        "minimumWords": minimum_words,
        "maximumWords": maximum_words,
        "contentChapterIds": [chapter["id"] for chapter in chapters if chapter["content"]],
        "batchNames": [batch["batch"] for batch in batches],
    }
    context = {
        "sourceTitle": source_title,
        "language": document_language,
        "sourceKind": kind,
        "audience": "general educated reader",
        "tone": "editorial, persuasive, restrained",
        "outputShape": ["hero", "stakes", "questions", "approach", "reader-fit", "open-loop"],
        "spoilerPolicy": {
            "nonfiction": "withhold answers, conclusions, solutions, prescriptions, and final recommendations",
            "fiction": "withhold twists, revelations, relationship outcomes, character fates, and endings",
            "hybrid": "apply the stricter local rule",
        },
        "wordRange": [minimum_words, maximum_words],
        "excluded": excluded,
    }
    _write_json(workspace / "job.json", job)
    _write_json(workspace / "context.json", context)
    _write_json(workspace / "chapters.json", chapters)
    return job_status(workspace)


def _validate_analysis(value: Any, batch: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if not _exact_keys(value, EXACT_ANALYSIS_KEYS):
        return ["analysis has incorrect top-level keys"]
    if value["batch"] != batch["batch"] or value["chapterId"] != batch["chapterId"] or value["segment"] != batch["segment"]:
        errors.append("analysis batch identity does not match")
    signals = value["modeSignals"]
    if not _string_list(signals, nonempty=True) or len(signals) != len(set(signals)) or not set(signals) <= {"fiction", "nonfiction"}:
        errors.append("modeSignals must contain unique fiction/nonfiction values")
    unit_ids = {unit["id"] for unit in batch["units"]}
    hooks = value["safeHooks"]
    if not isinstance(hooks, list) or not hooks:
        errors.append("analysis needs at least one safe hook")
        hooks = []
    hook_ids: set[str] = set()
    for index, hook in enumerate(hooks, 1):
        if not _exact_keys(hook, {"id", "type", "statement", "sourceUnitIds"}):
            errors.append("safe hook has incorrect keys")
            continue
        expected = f"{batch['batch'][:-5]}-hook-{index:03d}"
        if hook["id"] != expected or hook["id"] in hook_ids:
            errors.append("safe hook IDs must be sequential and unique")
        hook_ids.add(hook["id"])
        if hook["type"] not in HOOK_TYPES or not _is_string(hook["statement"]):
            errors.append("safe hook type or statement is invalid")
        sources = hook["sourceUnitIds"]
        if not _string_list(sources, nonempty=True) or not set(sources) <= unit_ids:
            errors.append("safe hook source units do not belong to the batch")
    revelations = value["protectedRevelations"]
    if not isinstance(revelations, list):
        errors.append("protectedRevelations must be a list")
        revelations = []
    revelation_ids: set[str] = set()
    for index, revelation in enumerate(revelations, 1):
        if not _exact_keys(revelation, {"id", "type", "statement", "guardTerms", "sourceUnitIds"}):
            errors.append("protected revelation has incorrect keys")
            continue
        expected = f"{batch['batch'][:-5]}-revelation-{index:03d}"
        if revelation["id"] != expected or revelation["id"] in revelation_ids:
            errors.append("protected revelation IDs must be sequential and unique")
        revelation_ids.add(revelation["id"])
        if revelation["type"] not in REVELATION_TYPES or not _is_string(revelation["statement"]):
            errors.append("protected revelation type or statement is invalid")
        guards = revelation["guardTerms"]
        if not _string_list(guards, nonempty=True) or any(not _is_string(term) or word_count(term) < 3 for term in guards):
            errors.append("protected revelation needs guard phrases of at least three words")
        sources = revelation["sourceUnitIds"]
        if not _string_list(sources, nonempty=True) or not set(sources) <= unit_ids:
            errors.append("protected revelation source units do not belong to the batch")
    audit = value["audit"]
    audit_keys = {"chapterCovered", "questionsIdentified", "revelationsSeparated", "factsPreserved", "notes"}
    if not _exact_keys(audit, audit_keys) or any(audit.get(key) is not True for key in audit_keys - {"notes"}) or not isinstance(audit.get("notes"), str):
        errors.append("analysis audit is incomplete")
    return errors


def load_analyses(job_dir: Path, job: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    completed: list[dict[str, Any]] = []
    ready: list[dict[str, Any]] = []
    for name in job["batchNames"]:
        batch = _json(job_dir / "batches" / name)
        path = job_dir / "analyses" / name
        if not path.is_file():
            ready.append({"batch": str(job_dir / "batches" / name), "analysis": str(path), "errors": []})
            continue
        try:
            analysis = _json(path)
            errors = _validate_analysis(analysis, batch)
        except (json.JSONDecodeError, OSError) as error:
            errors = [str(error)]
            analysis = None
        if errors:
            ready.append({"batch": str(job_dir / "batches" / name), "analysis": str(path), "errors": errors})
        else:
            completed.append(analysis)
    return completed, ready


def _analysis_maps(analyses: list[dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    hooks: dict[str, dict[str, Any]] = {}
    revelations: dict[str, dict[str, Any]] = {}
    for analysis in analyses:
        for hook in analysis["safeHooks"]:
            hooks[hook["id"]] = hook
        for revelation in analysis["protectedRevelations"]:
            revelations[revelation["id"]] = revelation
    return hooks, revelations


def validate_synthesis(value: Any, job: dict[str, Any], analyses: list[dict[str, Any]]) -> list[str]:
    errors: list[str] = []
    keys = {"mode", "positioning", "selectedHooks", "protectedRevelationIds", "outline", "chapterCoverage", "audit"}
    if not _exact_keys(value, keys):
        return ["synthesis has incorrect top-level keys"]
    signals = {signal for analysis in analyses for signal in analysis["modeSignals"]}
    expected_mode = "hybrid" if signals == {"fiction", "nonfiction"} else next(iter(signals))
    if value["mode"] != expected_mode:
        errors.append(f"synthesis mode must be {expected_mode}")
    positioning = value["positioning"]
    if not _exact_keys(positioning, {"headlineAngle", "readerPromise", "audience", "tone"}) or any(not _is_string(positioning.get(key)) for key in positioning or {}):
        errors.append("positioning is incomplete")
    hook_map, revelation_map = _analysis_maps(analyses)
    protected_ids = value["protectedRevelationIds"]
    if (
        not isinstance(protected_ids, list)
        or any(not isinstance(item, str) for item in protected_ids)
        or set(protected_ids) != set(revelation_map)
        or len(protected_ids) != len(set(protected_ids))
    ):
        errors.append("synthesis must register every protected revelation exactly once")
    selected = value["selectedHooks"]
    if not isinstance(selected, list) or not selected:
        errors.append("synthesis needs selected hooks")
        selected = []
    selected_map: dict[str, dict[str, Any]] = {}
    for index, item in enumerate(selected, 1):
        if not _exact_keys(item, {"id", "statement", "hookIds", "sourceUnitIds"}):
            errors.append("selected hook has incorrect keys")
            continue
        if item["id"] != f"selected-hook-{index:03d}" or item["id"] in selected_map:
            errors.append("selected hook IDs must be sequential and unique")
        selected_map[item["id"]] = item
        hook_ids = item["hookIds"]
        if not isinstance(hook_ids, list) or not hook_ids or any(not isinstance(hook_id, str) for hook_id in hook_ids) or not set(hook_ids) <= set(hook_map):
            errors.append("selected hook references invalid analysis hooks")
            continue
        allowed_sources = {source for hook_id in hook_ids for source in hook_map[hook_id]["sourceUnitIds"]}
        if not isinstance(item["sourceUnitIds"], list) or not item["sourceUnitIds"] or any(not isinstance(source, str) for source in item["sourceUnitIds"]) or not set(item["sourceUnitIds"]) <= allowed_sources:
            errors.append("selected hook source units are unsupported")
        if not _is_string(item["statement"]):
            errors.append("selected hook statement is empty")
    outline = value["outline"]
    if not isinstance(outline, list) or not outline:
        errors.append("synthesis outline is empty")
        outline = []
    outlined: list[str] = []
    for index, section in enumerate(outline, 1):
        if not _exact_keys(section, {"id", "role", "title", "budgetWords", "selectedHookIds"}):
            errors.append("outline section has incorrect keys")
            continue
        if section["id"] != f"section-{index:02d}" or section["role"] not in OUTLINE_ROLES or not _is_string(section["title"]):
            errors.append("outline identity, role, or title is invalid")
        if not isinstance(section["budgetWords"], int) or section["budgetWords"] <= 0:
            errors.append("outline budget must be positive")
        hook_ids = section["selectedHookIds"]
        if not isinstance(hook_ids, list) or not hook_ids or any(not isinstance(hook_id, str) for hook_id in hook_ids) or not set(hook_ids) <= set(selected_map):
            errors.append("outline references invalid selected hooks")
        outlined.extend(hook_ids if isinstance(hook_ids, list) else [])
    if set(outlined) != set(selected_map):
        errors.append("every selected hook must appear in the outline")
    coverage = value["chapterCoverage"]
    if not isinstance(coverage, list) or [item.get("chapterId") for item in coverage if isinstance(item, dict)] != job["contentChapterIds"]:
        errors.append("chapterCoverage must list every content chapter once in source order")
    else:
        for item in coverage:
            if (
                not _exact_keys(item, {"chapterId", "hookIds"})
                or not isinstance(item["hookIds"], list)
                or any(not isinstance(hook_id, str) for hook_id in item["hookIds"])
                or not set(item["hookIds"]) <= set(hook_map)
            ):
                errors.append("chapterCoverage contains invalid hooks")
                break
    audit = value["audit"]
    audit_keys = {"allAnalysesUsed", "spoilerBoundaryDefined", "noAnswersSelected", "notes"}
    if not _exact_keys(audit, audit_keys) or any(audit.get(key) is not True for key in audit_keys - {"notes"}) or not isinstance(audit.get("notes"), str):
        errors.append("synthesis audit is incomplete")
    return errors


def _paragraph_locations(draft: dict[str, Any]) -> list[str]:
    locations = ["hero:title", "hero:dek"]
    for section in draft.get("sections", []):
        for index, _paragraph in enumerate(section.get("paragraphs", []), 1):
            locations.append(f"{section.get('id')}:p{index:03d}")
    locations.append("closing:p001")
    return locations


def draft_text(draft: dict[str, Any]) -> str:
    pieces = [draft["title"], draft["dek"]]
    for section in draft["sections"]:
        pieces.append(section["heading"])
        pieces.extend(paragraph["text"] for paragraph in section["paragraphs"])
    pieces.append(draft["closing"]["text"])
    return "\n".join(pieces)


def validate_draft(value: Any, job: dict[str, Any], synthesis: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if not _exact_keys(value, {"title", "dek", "sections", "closing", "audit"}):
        return ["draft has incorrect top-level keys"]
    if not _is_string(value["title"]) or not _is_string(value["dek"]):
        errors.append("draft title and dek are required")
    selected_map = {item["id"]: item for item in synthesis["selectedHooks"]}
    sections = value["sections"]
    outline = synthesis["outline"]
    if not isinstance(sections, list) or len(sections) != len(outline):
        errors.append("draft sections must match the synthesis outline")
        sections = []

    def check_paragraph(paragraph: Any, allowed_hooks: set[str]) -> None:
        if not _exact_keys(paragraph, {"text", "selectedHookIds", "sourceUnitIds", "audit"}):
            errors.append("draft paragraph has incorrect keys")
            return
        if not _is_string(paragraph["text"]):
            errors.append("draft paragraph text is empty")
        hook_ids = paragraph["selectedHookIds"]
        if not isinstance(hook_ids, list) or not hook_ids or any(not isinstance(hook_id, str) for hook_id in hook_ids) or not set(hook_ids) <= allowed_hooks:
            errors.append("draft paragraph references hooks outside its section")
            return
        sources = {source for hook_id in hook_ids for source in selected_map[hook_id]["sourceUnitIds"]}
        if not isinstance(paragraph["sourceUnitIds"], list) or not paragraph["sourceUnitIds"] or any(not isinstance(source, str) for source in paragraph["sourceUnitIds"]) or not set(paragraph["sourceUnitIds"]) <= sources:
            errors.append("draft paragraph source units are unsupported")
        audit = paragraph["audit"]
        audit_keys = {"factsPreserved", "noUnsupportedPromise", "noSpoiler"}
        if not _exact_keys(audit, audit_keys) or any(audit.get(key) is not True for key in audit_keys):
            errors.append("draft paragraph audit is incomplete")

    for section, planned in zip(sections, outline):
        if not _exact_keys(section, {"id", "role", "heading", "paragraphs"}):
            errors.append("draft section has incorrect keys")
            continue
        if section["id"] != planned["id"] or section["role"] != planned["role"] or not _is_string(section["heading"]):
            errors.append("draft section does not match the outline")
        if not isinstance(section["paragraphs"], list) or not section["paragraphs"]:
            errors.append("draft section needs paragraphs")
            continue
        for paragraph in section["paragraphs"]:
            check_paragraph(paragraph, set(planned["selectedHookIds"]))
    if not isinstance(value["closing"], dict):
        errors.append("draft closing is missing")
    else:
        check_paragraph(value["closing"], set(selected_map))
    audit = value["audit"]
    audit_keys = {"sameLanguage", "salesPageShape", "subtleClosing", "notes"}
    if not _exact_keys(audit, audit_keys) or any(audit.get(key) is not True for key in audit_keys - {"notes"}) or not isinstance(audit.get("notes"), str):
        errors.append("draft audit is incomplete")
    if not errors:
        count = word_count(draft_text(value))
        if not job["minimumWords"] <= count <= job["maximumWords"]:
            errors.append(f"draft word count {count} is outside {job['minimumWords']}..{job['maximumWords']}")
    return errors


def validate_review(value: Any, draft_path: Path, draft: dict[str, Any], revelation_ids: set[str]) -> list[str]:
    errors: list[str] = []
    keys = {"draftSha256", "paragraphs", "passed", "answersWithheld", "twistsWithheld", "openLoopsPreserved", "notes"}
    if not _exact_keys(value, keys):
        return ["review has incorrect top-level keys"]
    if value["draftSha256"] != _bytes_sha256(draft_path):
        errors.append("review is stale because draft.json changed")
    expected_locations = _paragraph_locations(draft)
    reviews = value["paragraphs"]
    if not isinstance(reviews, list) or [item.get("location") for item in reviews if isinstance(item, dict)] != expected_locations:
        errors.append("review must cover every visible draft item exactly once")
        reviews = []
    any_risk = False
    for item in reviews:
        if not _exact_keys(item, {"location", "spoilerRisk", "matchedRevelationIds", "notes"}):
            errors.append("review paragraph has incorrect keys")
            continue
        if (
            not isinstance(item["spoilerRisk"], bool)
            or not isinstance(item["matchedRevelationIds"], list)
            or any(not isinstance(revelation_id, str) for revelation_id in item["matchedRevelationIds"])
            or not set(item["matchedRevelationIds"]) <= revelation_ids
            or not isinstance(item["notes"], str)
        ):
            errors.append("review paragraph values are invalid")
        if item["spoilerRisk"] or item["matchedRevelationIds"]:
            any_risk = True
    if value["passed"] is not True or value["answersWithheld"] is not True or value["twistsWithheld"] is not True or value["openLoopsPreserved"] is not True or any_risk:
        errors.append("semantic spoiler review did not pass")
    if not isinstance(value["notes"], str):
        errors.append("review notes must be text")
    return errors


def _guard_leaks(text: str, analyses: list[dict[str, Any]]) -> list[str]:
    normalized = _normalize_text(text)
    leaks: list[str] = []
    for analysis in analyses:
        for revelation in analysis["protectedRevelations"]:
            for guard in revelation["guardTerms"]:
                normalized_guard = _normalize_text(guard)
                if normalized_guard and normalized_guard in normalized:
                    leaks.append(revelation["id"])
                    break
            else:
                statement = _normalize_text(revelation["statement"])
                if len(statement.split()) >= 10 and SequenceMatcher(None, statement, normalized).ratio() >= 0.72:
                    leaks.append(revelation["id"])
    return sorted(set(leaks))


def job_status(job_dir: Path) -> dict[str, Any]:
    workspace = job_dir.expanduser().resolve()
    job = _json(workspace / "job.json")
    analyses, ready = load_analyses(workspace, job)
    base = {
        "job": str(workspace),
        "source": job["source"],
        "output": job["output"],
        "language": job["language"],
        "sourceKind": job["sourceKind"],
        "wordRange": [job["minimumWords"], job["maximumWords"]],
        "contentChapters": len(job["contentChapterIds"]),
        "batches": len(job["batchNames"]),
        "completedAnalyses": len(analyses),
        "remainingAnalyses": len(ready),
        "readyAnalyses": ready[:4],
        "recommendedParallelAnalyses": min(4, len(ready)),
    }
    if ready:
        return {"status": "analysis_required", **base}
    synthesis_path = workspace / "synthesis.json"
    if not synthesis_path.is_file():
        return {"status": "synthesis_required", **base, "synthesisErrors": None}
    try:
        synthesis = _json(synthesis_path)
        synthesis_errors = validate_synthesis(synthesis, job, analyses)
    except (json.JSONDecodeError, OSError) as error:
        synthesis_errors = [str(error)]
        synthesis = None
    if synthesis_errors:
        return {"status": "synthesis_required", **base, "synthesisErrors": synthesis_errors}
    draft_path = workspace / "draft.json"
    if not draft_path.is_file():
        return {"status": "draft_required", **base, "synthesisErrors": [], "draftErrors": None}
    try:
        draft = _json(draft_path)
        draft_errors = validate_draft(draft, job, synthesis)
    except (json.JSONDecodeError, OSError) as error:
        draft_errors = [str(error)]
        draft = None
    if draft_errors:
        return {"status": "draft_required", **base, "synthesisErrors": [], "draftErrors": draft_errors}
    review_path = workspace / "review.json"
    if not review_path.is_file():
        return {"status": "review_required", **base, "draftErrors": [], "reviewErrors": None}
    try:
        review = _json(review_path)
        _hooks, revelations = _analysis_maps(analyses)
        review_errors = validate_review(review, draft_path, draft, set(revelations))
    except (json.JSONDecodeError, OSError) as error:
        review_errors = [str(error)]
    if review_errors:
        status = "revision_required" if "semantic spoiler review did not pass" in review_errors else "review_required"
        return {"status": status, **base, "draftErrors": [], "reviewErrors": review_errors}
    return {"status": "ready_to_build", **base, "synthesisErrors": [], "draftErrors": [], "reviewErrors": []}


def _owned_output(path: Path) -> bool:
    if not path.is_file():
        return False
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    marker = soup.find("meta", attrs={"name": "marketing-summary-generator"})
    return marker is not None and marker.get("content") == "marketingsummary-skill"


def _render(job: dict[str, Any], synthesis: dict[str, Any], draft: dict[str, Any]) -> str:
    sections: list[str] = []
    for section in draft["sections"]:
        paragraphs = "".join(f"<p>{escape(paragraph['text'])}</p>" for paragraph in section["paragraphs"])
        sections.append(
            f'<section class="sales-section sales-{escape(section["role"])}">'
            f'<h2>{escape(section["heading"])}</h2>{paragraphs}</section>'
        )
    actual_words = word_count(draft_text(draft))
    css = """
:root{color-scheme:light dark;--bg:#f1ece3;--paper:#fffdf8;--ink:#201d19;--muted:#6d6258;--accent:#8b4c32;--line:#d8c9ba}
*{box-sizing:border-box}body{margin:0;background:linear-gradient(150deg,var(--bg),#e7ded2);color:var(--ink);font-family:Georgia,'Times New Roman',serif;line-height:1.7}
main{width:min(820px,calc(100% - 2rem));margin:3rem auto;background:var(--paper);padding:clamp(1.5rem,6vw,5rem);box-shadow:0 18px 55px #33251b1a;border-top:5px solid var(--accent)}
h1{font-size:clamp(2.25rem,7vw,4.6rem);line-height:1.02;letter-spacing:-.025em;margin:0 0 .5em}.dek{font-size:clamp(1.1rem,2.5vw,1.35rem);color:var(--muted);margin:0 0 2.5rem}
h2{font-size:1.45rem;line-height:1.25;margin:2.5rem 0 .75rem;color:var(--accent)}p{margin:.8rem 0}.sales-questions{border-block:1px solid var(--line);padding:1rem 0 1.5rem;margin-top:2rem}
.closing{font-size:1.18rem;font-style:italic;margin-top:3rem;padding-top:1.4rem;border-top:1px solid var(--line)}
@media(max-width:620px){main{width:100%;margin:0;padding:1.4rem;box-shadow:none}}
@media(prefers-color-scheme:dark){:root{--bg:#171411;--paper:#211d19;--ink:#f1e9df;--muted:#c1b3a5;--accent:#e3a17f;--line:#50453c}body{background:var(--bg)}}
""".strip()
    return f"""<!doctype html>
<html lang="{escape(job['language'])}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="marketing-summary-generator" content="marketingsummary-skill">
<meta name="marketing-summary-source-sha256" content="{escape(job['sourceSha256'])}">
<meta name="marketing-summary-mode" content="{escape(synthesis['mode'])}">
<meta name="marketing-summary-target-words" content="{job['targetWords']}">
<meta name="marketing-summary-minimum-words" content="{job['minimumWords']}">
<meta name="marketing-summary-maximum-words" content="{job['maximumWords']}">
<meta name="marketing-summary-actual-words" content="{actual_words}">
<title>{escape(draft['title'])}</title>
<style>{css}</style>
</head>
<body><main><article data-marketing-summary>
<header><h1>{escape(draft['title'])}</h1><p class="dek">{escape(draft['dek'])}</p></header>
{''.join(sections)}
<p class="closing">{escape(draft['closing']['text'])}</p>
</article></main></body></html>
"""


def build_job(job_dir: Path, *, overwrite: bool = False) -> dict[str, Any]:
    workspace = job_dir.expanduser().resolve()
    status = job_status(workspace)
    if status["status"] != "ready_to_build":
        raise MarketingSummaryError(f"Job is not ready to build: {status['status']}")
    job = _json(workspace / "job.json")
    source = Path(job["source"])
    target = Path(job["output"])
    if file_sha256(source) != job["sourceSha256"]:
        raise MarketingSummaryError("Source HTML changed after the job was prepared.")
    analyses, _ready = load_analyses(workspace, job)
    synthesis = _json(workspace / "synthesis.json")
    draft = _json(workspace / "draft.json")
    leaks = _guard_leaks(draft_text(draft), analyses)
    if leaks:
        raise MarketingSummaryError(f"Draft contains protected spoiler guard phrases: {', '.join(leaks)}")
    source_text = BeautifulSoup(source.read_text(encoding="utf-8"), "html.parser").get_text(" ", strip=True)
    unsupported = sorted(_fact_tokens(draft_text(draft)) - _fact_tokens(source_text))
    if unsupported:
        raise MarketingSummaryError(f"Draft contains unsupported factual tokens: {unsupported}")
    if target.exists() and (not overwrite or not _owned_output(target)):
        raise MarketingSummaryError("Output exists; --overwrite is allowed only for skill-owned output.")
    html = _render(job, synthesis, draft)
    candidate = workspace / "candidate.html"
    candidate.write_text(html, encoding="utf-8")
    from .validation import validate_marketing_summary
    validation = validate_marketing_summary(source, candidate, expected_language=job["language"])
    if validation["status"] != "passed":
        _write_json(workspace / "report.json", validation)
        raise MarketingSummaryError("Candidate validation failed: " + "; ".join(item["message"] for item in validation["findings"]))
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f".{target.name}.marketingsummary.tmp")
    temporary.write_text(html, encoding="utf-8")
    os.replace(temporary, target)
    report = {**validation, "artifact": str(target), "source": str(source)}
    _write_json(workspace / "report.json", report)
    return {"status": "passed", "artifact": str(target), "job": str(workspace), "report": str(workspace / "report.json"), "findings": [], "metrics": report["metrics"]}
