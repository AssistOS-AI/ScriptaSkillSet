from __future__ import annotations

from difflib import SequenceMatcher
from hashlib import sha256
from html import escape
import json
import os
from pathlib import Path
import re
import shutil
from typing import Any

from bs4 import BeautifulSoup, Tag


MAX_BATCH_CHARACTERS = 32_000
SEMANTIC_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "blockquote", "figcaption", "caption", "th", "td"}
THEME_TYPES = {"subject", "scope", "context", "question", "tension", "premise", "setting", "character", "starting-conflict"}
REVELATION_TYPES = {"answer", "solution", "conclusion", "recommendation", "verdict", "twist", "identity", "resolution", "outcome", "fate", "ending"}
NON_CONTENT_RE = re.compile(
    r"\b(contents?|cuprins|sommaire|indice|inhaltsverzeichnis|bibliograph(?:y|ie)|bibliograf(?:ie|ia)|"
    r"references?|referințe|copyright|drepturi de autor|impressum)\b",
    re.IGNORECASE,
)
FACT_RE = re.compile(
    r"(?:https?://\S+|www\.\S+|\b[\w.+-]+@[\w.-]+\.\w+\b|\b10\.\d{4,9}/\S+|"
    r"\b\d+(?:[.,]\d+)*(?:%|‰|°|[A-Za-z]{1,5})?\b)",
    re.UNICODE,
)
LANGUAGE_RE = re.compile(r"^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$")
ANALYSIS_KEYS = {"batch", "chapterId", "segment", "modeSignals", "themes", "protectedRevelations", "audit"}


class ShortDescriptionError(RuntimeError):
    pass


def file_sha256(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def _json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _exact_keys(value: Any, keys: set[str]) -> bool:
    return isinstance(value, dict) and set(value) == keys


def _text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _string_list(value: Any, *, nonempty: bool = False) -> bool:
    return isinstance(value, list) and (bool(value) or not nonempty) and all(isinstance(item, str) for item in value)


def word_count(text: str) -> int:
    return len(re.findall(r"\b[^\W_]+(?:[’'\-][^\W_]+)*\b", text, re.UNICODE))


def split_sentences(text: str) -> list[str]:
    return [item.strip() for item in re.findall(r".+?[.!?]+(?:[\"”’')\]]+)?(?=\s|$)", text.strip(), re.DOTALL) if item.strip()]


def normalize_language(value: str) -> str:
    candidate = value.strip().replace("_", "-") if isinstance(value, str) else ""
    if not candidate or not LANGUAGE_RE.fullmatch(candidate) or candidate.casefold() == "und":
        raise ShortDescriptionError("Source HTML needs a valid language tag or --language override.")
    parts = candidate.split("-")
    normalized = [parts[0].lower()]
    for part in parts[1:]:
        if len(part) == 4 and part.isalpha():
            normalized.append(part.title())
        elif (len(part) == 2 and part.isalpha()) or (len(part) == 3 and part.isdigit()):
            normalized.append(part.upper())
        else:
            normalized.append(part.lower())
    return "-".join(normalized)


def _fact_tokens(text: str) -> set[str]:
    return {match.group(0).rstrip(".,;:!?)\"]}").casefold() for match in FACT_RE.finditer(text)}


def _normalized(text: str) -> str:
    return " ".join(re.findall(r"[^\W_]+", text.casefold(), re.UNICODE))


def _source_kind(soup: BeautifulSoup) -> str:
    marketing = soup.find("meta", attrs={"name": "marketing-summary-generator"})
    if marketing and marketing.get("content") == "marketingsummary-skill":
        return "marketing-summary"
    summary = soup.find("meta", attrs={"name": "summary-generator"})
    if summary and summary.get("content") == "comprehensivesummary-skill":
        return "comprehensive-summary"
    return "semantic-html"


def _content_root(soup: BeautifulSoup, kind: str) -> Tag:
    if kind == "marketing-summary":
        root = soup.find("article", attrs={"data-marketing-summary": True})
    elif kind == "comprehensive-summary":
        root = soup.find("article", attrs={"data-summary-body": True})
    else:
        root = soup.select_one("main[data-reader-content], main, article") or soup.body
    if not isinstance(root, Tag):
        raise ShortDescriptionError(f"{kind} input has no usable semantic content container.")
    return root


def _extract(source_text: str) -> tuple[str, str, list[dict[str, Any]], list[dict[str, Any]]]:
    soup = BeautifulSoup(source_text, "html.parser")
    kind = _source_kind(soup)
    clone = BeautifulSoup(str(_content_root(soup, kind)), "html.parser")
    for tag in clone.select("script,style,noscript,nav,svg,template,details[data-source-map],[hidden],[aria-hidden='true']"):
        tag.decompose()
    leaves: list[Tag] = []
    for tag in clone.find_all(SEMANTIC_TAGS):
        if any(isinstance(child, Tag) and child.name in SEMANTIC_TAGS for child in tag.descendants):
            continue
        if " ".join(tag.get_text(" ", strip=True).split()):
            leaves.append(tag)
    if not leaves:
        raise ShortDescriptionError("No semantic reader-facing text was found in the HTML input.")

    h1_count = sum(tag.name == "h1" for tag in leaves)
    h2_count = sum(tag.name == "h2" for tag in leaves)
    boundary = "h1" if h1_count >= 2 else "h2" if h2_count >= 2 else None
    chapters: list[dict[str, Any]] = []
    units: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    def new_chapter(title: str) -> dict[str, Any]:
        item = {"id": f"chapter-{len(chapters) + 1:04d}", "title": title or "Front matter", "content": True, "unitIds": []}
        chapters.append(item)
        return item

    for tag in leaves:
        value = " ".join(tag.get_text(" ", strip=True).split())
        if boundary and tag.name == boundary:
            current = new_chapter(value)
        elif current is None:
            current = new_chapter("Front matter")
        unit = {"id": f"u{len(units) + 1:06d}", "chapterId": current["id"], "tag": tag.name, "text": value}
        units.append(unit)
        current["unitIds"].append(unit["id"])

    for chapter in chapters:
        chapter_units = [unit for unit in units if unit["chapterId"] == chapter["id"]]
        prose_words = sum(word_count(unit["text"]) for unit in chapter_units if not unit["tag"].startswith("h"))
        if NON_CONTENT_RE.search(chapter["title"]) or prose_words < 8:
            chapter["content"] = False
    if not any(chapter["content"] for chapter in chapters):
        raise ShortDescriptionError("The HTML contains no substantial content chapters.")

    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    if not title:
        heading = soup.find(["h1", "h2"])
        title = heading.get_text(" ", strip=True) if heading else "Document"
    return kind, title, chapters, units


def _make_batches(chapters: list[dict[str, Any]], units: list[dict[str, Any]], language: str) -> list[dict[str, Any]]:
    unit_map = {unit["id"]: unit for unit in units}
    batches: list[dict[str, Any]] = []
    for chapter in chapters:
        if not chapter["content"]:
            continue
        parts: list[list[dict[str, Any]]] = [[]]
        size = 0
        for unit_id in chapter["unitIds"]:
            unit = unit_map[unit_id]
            if parts[-1] and size + len(unit["text"]) > MAX_BATCH_CHARACTERS:
                parts.append([])
                size = 0
            parts[-1].append(unit)
            size += len(unit["text"])
        for segment, part in enumerate(parts, 1):
            name = f"batch-{len(batches) + 1:04d}.json"
            batches.append({
                "batch": name,
                "chapterId": chapter["id"],
                "chapterTitle": chapter["title"],
                "segment": segment,
                "language": language,
                "characterCount": sum(len(unit["text"]) for unit in part),
                "units": [{"id": unit["id"], "tag": unit["tag"], "text": unit["text"]} for unit in part],
            })
    return batches


def prepare_job(input_path: Path, *, language: str | None = None, output: Path | None = None, job_dir: Path | None = None) -> dict[str, Any]:
    source = input_path.expanduser().resolve()
    if source.suffix.casefold() not in {".html", ".htm"}:
        raise ShortDescriptionError("Input must be an .html or .htm document.")
    if not source.is_file():
        raise ShortDescriptionError(f"Input does not exist: {source}")
    source_bytes = source.read_bytes()
    try:
        source_text = source_bytes.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ShortDescriptionError("Input HTML must be UTF-8 encoded.") from error
    soup = BeautifulSoup(source_text, "html.parser")
    html_language = str(soup.html.get("lang", "")) if soup.html else ""
    document_language = normalize_language(language or html_language)
    kind, title, chapters, units = _extract(source_text)
    target = (output or source.with_name("shortDescription.html")).expanduser().resolve()
    if target == source:
        raise ShortDescriptionError("Short-description output must be separate from the source.")
    identity = sha256(source_bytes).hexdigest()[:16]
    workspace = (job_dir or source.parent / ".shortdescription-jobs" / f"{source.stem}-{identity}").expanduser().resolve()
    if workspace.exists() and any(workspace.iterdir()):
        raise ShortDescriptionError(f"Job directory already exists and is not empty: {workspace}")
    (workspace / "batches").mkdir(parents=True, exist_ok=True)
    (workspace / "analyses").mkdir(exist_ok=True)
    (workspace / "source-original.html").write_bytes(source_bytes)
    batches = _make_batches(chapters, units, document_language)
    for batch in batches:
        _write_json(workspace / "batches" / batch["batch"], batch)
    content_chapters = [chapter["id"] for chapter in chapters if chapter["content"]]
    job = {
        "source": str(source),
        "output": str(target),
        "sourceSha256": sha256(source_bytes).hexdigest(),
        "sourceKind": kind,
        "sourceTitle": title,
        "language": document_language,
        "contentChapterIds": content_chapters,
        "batchNames": [batch["batch"] for batch in batches],
    }
    context = {
        "sourceTitle": title,
        "language": document_language,
        "sourceKind": kind,
        "audience": "general reader",
        "tone": "neutral, informative, compact",
        "sentenceRange": [4, 6],
        "allowed": ["subject", "scope", "context", "central questions", "thematic tensions", "premise", "setting", "starting conflict"],
        "withhold": ["answers", "solutions", "conclusions", "recommendations", "verdicts", "twists", "identities", "resolutions", "outcomes", "fates", "ending"],
    }
    _write_json(workspace / "job.json", job)
    _write_json(workspace / "context.json", context)
    _write_json(workspace / "chapters.json", chapters)
    return job_status(workspace)


def _validate_analysis(value: Any, batch: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if not _exact_keys(value, ANALYSIS_KEYS):
        return ["analysis has incorrect top-level keys"]
    if value["batch"] != batch["batch"] or value["chapterId"] != batch["chapterId"] or value["segment"] != batch["segment"]:
        errors.append("analysis batch identity does not match")
    signals = value["modeSignals"]
    if not _string_list(signals, nonempty=True) or len(signals) != len(set(signals)) or not set(signals) <= {"fiction", "nonfiction"}:
        errors.append("modeSignals must contain unique fiction/nonfiction values")
    unit_ids = {unit["id"] for unit in batch["units"]}
    themes = value["themes"] if isinstance(value["themes"], list) else []
    if not themes:
        errors.append("analysis needs at least one theme")
    seen: set[str] = set()
    for index, item in enumerate(themes, 1):
        if not _exact_keys(item, {"id", "type", "statement", "sourceUnitIds"}):
            errors.append("theme has incorrect keys")
            continue
        expected = f"{batch['batch'][:-5]}-theme-{index:03d}"
        if item["id"] != expected or item["id"] in seen:
            errors.append("theme IDs must be sequential and unique")
        seen.add(item["id"])
        if item["type"] not in THEME_TYPES or not _text(item["statement"]):
            errors.append("theme type or statement is invalid")
        if not _string_list(item["sourceUnitIds"], nonempty=True) or not set(item["sourceUnitIds"]) <= unit_ids:
            errors.append("theme source units do not belong to the batch")
    revelations = value["protectedRevelations"] if isinstance(value["protectedRevelations"], list) else []
    if not isinstance(value["protectedRevelations"], list):
        errors.append("protectedRevelations must be a list")
    seen.clear()
    for index, item in enumerate(revelations, 1):
        if not _exact_keys(item, {"id", "type", "statement", "guardTerms", "sourceUnitIds"}):
            errors.append("protected revelation has incorrect keys")
            continue
        expected = f"{batch['batch'][:-5]}-revelation-{index:03d}"
        if item["id"] != expected or item["id"] in seen:
            errors.append("protected revelation IDs must be sequential and unique")
        seen.add(item["id"])
        if item["type"] not in REVELATION_TYPES or not _text(item["statement"]):
            errors.append("protected revelation type or statement is invalid")
        if not _string_list(item["guardTerms"], nonempty=True) or any(word_count(term) < 3 for term in item["guardTerms"]):
            errors.append("protected revelation needs guard phrases of at least three words")
        if not _string_list(item["sourceUnitIds"], nonempty=True) or not set(item["sourceUnitIds"]) <= unit_ids:
            errors.append("protected revelation source units do not belong to the batch")
    audit = value["audit"]
    audit_keys = {"chapterCovered", "themeIdentified", "revelationsSeparated", "factsPreserved", "notes"}
    if not _exact_keys(audit, audit_keys) or any(audit.get(key) is not True for key in audit_keys - {"notes"}) or not isinstance(audit.get("notes"), str):
        errors.append("analysis audit is incomplete")
    return errors


def _load_analyses(workspace: Path, job: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    complete: list[dict[str, Any]] = []
    ready: list[dict[str, Any]] = []
    for name in job["batchNames"]:
        batch = _json(workspace / "batches" / name)
        path = workspace / "analyses" / name
        if not path.is_file():
            ready.append({"batch": str(workspace / "batches" / name), "analysis": str(path), "errors": []})
            continue
        try:
            analysis = _json(path)
            errors = _validate_analysis(analysis, batch)
        except (OSError, json.JSONDecodeError) as error:
            analysis, errors = None, [str(error)]
        if errors:
            ready.append({"batch": str(workspace / "batches" / name), "analysis": str(path), "errors": errors})
        else:
            complete.append(analysis)
    return complete, ready


def _maps(analyses: list[dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]], dict[str, str]]:
    themes: dict[str, dict[str, Any]] = {}
    revelations: dict[str, dict[str, Any]] = {}
    theme_chapters: dict[str, str] = {}
    for analysis in analyses:
        for item in analysis["themes"]:
            themes[item["id"]] = item
            theme_chapters[item["id"]] = analysis["chapterId"]
        for item in analysis["protectedRevelations"]:
            revelations[item["id"]] = item
    return themes, revelations, theme_chapters


def draft_text(draft: dict[str, Any]) -> str:
    return " ".join(item["text"].strip() for item in draft["sentences"])


def _validate_draft(value: Any, job: dict[str, Any], analyses: list[dict[str, Any]]) -> list[str]:
    errors: list[str] = []
    keys = {"mode", "sentences", "protectedRevelationIds", "chapterCoverage", "audit"}
    if not _exact_keys(value, keys):
        return ["draft has incorrect top-level keys"]
    modes = {signal for analysis in analyses for signal in analysis["modeSignals"]}
    expected_mode = "hybrid" if modes == {"fiction", "nonfiction"} else next(iter(modes))
    if value["mode"] != expected_mode:
        errors.append(f"draft mode must be {expected_mode}")
    themes, revelations, theme_chapters = _maps(analyses)
    protected = value["protectedRevelationIds"]
    if not _string_list(protected) or len(protected) != len(set(protected)) or set(protected) != set(revelations):
        errors.append("draft must register every protected revelation exactly once")
    sentences = value["sentences"] if isinstance(value["sentences"], list) else []
    if not 4 <= len(sentences) <= 6:
        errors.append("draft needs 4 to 6 sentences")
    for index, item in enumerate(sentences, 1):
        if not _exact_keys(item, {"index", "text", "themeIds", "sourceUnitIds"}):
            errors.append("draft sentence has incorrect keys")
            continue
        if item["index"] != index or not _text(item["text"]) or len(split_sentences(item["text"])) != 1:
            errors.append("each draft item must be one numbered grammatical sentence")
        theme_ids = item["themeIds"]
        if not _string_list(theme_ids, nonempty=True) or not set(theme_ids) <= set(themes):
            errors.append("draft sentence references invalid themes")
            continue
        allowed_units = {unit_id for theme_id in theme_ids for unit_id in themes[theme_id]["sourceUnitIds"]}
        if not _string_list(item["sourceUnitIds"], nonempty=True) or not set(item["sourceUnitIds"]) <= allowed_units:
            errors.append("draft sentence source units are unsupported")
    coverage = value["chapterCoverage"] if isinstance(value["chapterCoverage"], list) else []
    if [item.get("chapterId") for item in coverage if isinstance(item, dict)] != job["contentChapterIds"]:
        errors.append("chapterCoverage must list every content chapter once and in order")
    for item in coverage:
        if not _exact_keys(item, {"chapterId", "themeIds"}) or not _string_list(item["themeIds"]):
            errors.append("chapter coverage item is invalid")
            continue
        if any(theme_id not in themes or theme_chapters[theme_id] != item["chapterId"] for theme_id in item["themeIds"]):
            errors.append("chapter coverage references a theme from another chapter")
    audit = value["audit"]
    audit_keys = {"sameLanguage", "themeOnly", "noSolutions", "noSpoilers", "neutralTone", "notes"}
    if not _exact_keys(audit, audit_keys) or any(audit.get(key) is not True for key in audit_keys - {"notes"}) or not isinstance(audit.get("notes"), str):
        errors.append("draft audit is incomplete")
    return errors


def _validate_review(value: Any, draft_path: Path, draft: dict[str, Any], revelation_ids: set[str]) -> list[str]:
    errors: list[str] = []
    keys = {"draftSha256", "sentences", "passed", "solutionsWithheld", "conclusionsWithheld", "spoilersWithheld", "notes"}
    if not _exact_keys(value, keys):
        return ["review has incorrect top-level keys"]
    if value["draftSha256"] != file_sha256(draft_path):
        errors.append("review is stale because draft.json changed")
    reviews = value["sentences"] if isinstance(value["sentences"], list) else []
    if [item.get("index") for item in reviews if isinstance(item, dict)] != list(range(1, len(draft["sentences"]) + 1)):
        errors.append("review must cover every sentence exactly once and in order")
    any_risk = False
    for item in reviews:
        if not _exact_keys(item, {"index", "solutionRisk", "spoilerRisk", "matchedRevelationIds", "notes"}):
            errors.append("review sentence has incorrect keys")
            continue
        matches = item["matchedRevelationIds"]
        if not isinstance(item["solutionRisk"], bool) or not isinstance(item["spoilerRisk"], bool) or not _string_list(matches) or not set(matches) <= revelation_ids or not isinstance(item["notes"], str):
            errors.append("review sentence values are invalid")
        if item["solutionRisk"] or item["spoilerRisk"] or matches:
            any_risk = True
    if any_risk or any(value.get(key) is not True for key in ("passed", "solutionsWithheld", "conclusionsWithheld", "spoilersWithheld")):
        errors.append("semantic revelation review did not pass")
    if not isinstance(value["notes"], str):
        errors.append("review notes must be text")
    return errors


def job_status(job_dir: Path) -> dict[str, Any]:
    workspace = job_dir.expanduser().resolve()
    if not (workspace / "job.json").is_file():
        raise ShortDescriptionError(f"Short-description job does not exist: {workspace}")
    job = _json(workspace / "job.json")
    analyses, ready = _load_analyses(workspace, job)
    base = {
        "job": str(workspace), "source": job["source"], "output": job["output"], "language": job["language"],
        "sourceKind": job["sourceKind"], "contentChapters": len(job["contentChapterIds"]), "batches": len(job["batchNames"]),
        "completedAnalyses": len(analyses), "remainingAnalyses": len(ready), "readyAnalyses": ready[:4],
        "recommendedParallelAnalyses": min(4, len(ready)),
    }
    if ready:
        return {"status": "analysis_required", **base}
    draft_path = workspace / "draft.json"
    if not draft_path.is_file():
        return {"status": "draft_required", **base, "draftErrors": None}
    try:
        draft = _json(draft_path)
        draft_errors = _validate_draft(draft, job, analyses)
    except (OSError, json.JSONDecodeError) as error:
        draft, draft_errors = None, [str(error)]
    if draft_errors:
        return {"status": "draft_required", **base, "draftErrors": draft_errors}
    review_path = workspace / "review.json"
    if not review_path.is_file():
        return {"status": "review_required", **base, "draftErrors": [], "reviewErrors": None}
    try:
        _themes, revelations, _chapters = _maps(analyses)
        review_errors = _validate_review(_json(review_path), draft_path, draft, set(revelations))
    except (OSError, json.JSONDecodeError) as error:
        review_errors = [str(error)]
    if review_errors:
        state = "revision_required" if "semantic revelation review did not pass" in review_errors else "review_required"
        return {"status": state, **base, "draftErrors": [], "reviewErrors": review_errors}
    return {"status": "ready_to_build", **base, "draftErrors": [], "reviewErrors": []}


def _guard_leaks(text: str, analyses: list[dict[str, Any]]) -> list[str]:
    normalized = _normalized(text)
    leaks: list[str] = []
    for analysis in analyses:
        for revelation in analysis["protectedRevelations"]:
            guards = [_normalized(term) for term in revelation["guardTerms"]]
            statement = _normalized(revelation["statement"])
            if any(guard and guard in normalized for guard in guards) or (len(statement.split()) >= 10 and SequenceMatcher(None, statement, normalized).ratio() >= 0.72):
                leaks.append(revelation["id"])
    return sorted(set(leaks))


def _owned_output(path: Path) -> bool:
    if not path.is_file():
        return False
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    marker = soup.find("meta", attrs={"name": "short-description-generator"})
    return marker is not None and marker.get("content") == "shortdescription-skill"


def _render(job: dict[str, Any], draft: dict[str, Any]) -> str:
    description = escape(draft_text(draft))
    title = escape(f"Short description — {job['sourceTitle']}")
    return f"""<!doctype html>
<html lang="{escape(job['language'])}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="short-description-generator" content="shortdescription-skill">
<meta name="short-description-source-sha256" content="{job['sourceSha256']}">
<title>{title}</title>
<style>html{{color-scheme:light dark}}body{{margin:0;background:#f5f3ee;color:#24211d;font:1.08rem/1.7 Georgia,serif}}main{{width:min(760px,calc(100% - 2rem));margin:clamp(2rem,8vw,6rem) auto}}article{{background:#fffdf8;padding:clamp(1.5rem,6vw,4rem);box-shadow:0 12px 40px #33251b18}}p{{margin:0}}@media(prefers-color-scheme:dark){{body{{background:#181614;color:#eee8df}}article{{background:#24211d}}}}@media(max-width:600px){{main{{width:100%;margin:0}}article{{box-shadow:none}}}}</style>
</head>
<body><main><article data-short-description><p>{description}</p></article></main></body>
</html>
"""


def build_job(job_dir: Path, *, overwrite: bool = False) -> dict[str, Any]:
    workspace = job_dir.expanduser().resolve()
    status = job_status(workspace)
    if status["status"] != "ready_to_build":
        raise ShortDescriptionError(f"Job is not ready to build: {status['status']}")
    job = _json(workspace / "job.json")
    source, target = Path(job["source"]), Path(job["output"])
    if file_sha256(source) != job["sourceSha256"]:
        raise ShortDescriptionError("Source HTML changed after the job was prepared.")
    analyses, _ready = _load_analyses(workspace, job)
    draft = _json(workspace / "draft.json")
    description = draft_text(draft)
    leaks = _guard_leaks(description, analyses)
    if leaks:
        raise ShortDescriptionError(f"Draft contains protected revelation guard phrases: {', '.join(leaks)}")
    source_text = BeautifulSoup(source.read_text(encoding="utf-8"), "html.parser").get_text(" ", strip=True)
    unsupported = sorted(_fact_tokens(description) - _fact_tokens(source_text))
    if unsupported:
        raise ShortDescriptionError(f"Draft contains unsupported factual tokens: {unsupported}")
    if target.exists() and (not overwrite or not _owned_output(target)):
        raise ShortDescriptionError("Output exists; --overwrite is allowed only for skill-owned output.")
    candidate = workspace / "candidate.html"
    candidate.write_text(_render(job, draft), encoding="utf-8")
    from .validation import validate_short_description
    report = validate_short_description(source, candidate, expected_language=job["language"])
    if report["status"] != "passed":
        raise ShortDescriptionError("Candidate validation failed: " + "; ".join(item["message"] for item in report["findings"]))
    target.parent.mkdir(parents=True, exist_ok=True)
    stage = target.with_name(f".{target.name}.shortdescription-stage")
    stage.write_text(candidate.read_text(encoding="utf-8"), encoding="utf-8")
    os.replace(stage, target)
    result = {"status": "passed", "artifact": str(target), "source": str(source), "findings": [], "metrics": report["metrics"], "jobRemoved": True}
    shutil.rmtree(workspace)
    parent = workspace.parent
    if parent.name == ".shortdescription-jobs" and not any(parent.iterdir()):
        parent.rmdir()
    return result
