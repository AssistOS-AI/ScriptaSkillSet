from __future__ import annotations

from collections import Counter, OrderedDict
from copy import deepcopy
from hashlib import sha256
import json
import os
from pathlib import Path
import re
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from bs4 import BeautifulSoup, Comment, NavigableString, Tag
import langcodes


TEXT_TAGS = {
    "title", "h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "dt",
    "dd", "th", "td", "caption", "figcaption", "blockquote", "button",
    "label", "summary", "option", "legend",
}
BLOCK_TAGS = TEXT_TAGS - {"title", "button", "label", "summary", "option", "legend"}
SKIP_TAGS = {"script", "style", "code", "pre", "kbd", "samp", "math", "svg"}
HUMAN_ATTRIBUTES = {"alt", "title", "aria-label"}
URL_ATTRIBUTES = {"href", "src", "poster", "action", "formaction"}
VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
}
MARKER_UNIT = "data-humanisehtml-unit"
MARKER_NODE = "data-humanisehtml-node"
MARKER_WRAPPER = "data-humanisehtml-wrapper"
TOKEN_RE = re.compile(r"⟦(?P<kind>OPEN|CLOSE|VOID):(?P<id>T\d{6})⟧")
PROTECTION_TOKEN_RE = re.compile(r"⟦PROTECT:P\d{6}⟧")
PROTECTED_RE = re.compile(
    r"(?:https?://|mailto:|www\.)[^\s<>()]+|"
    r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b|"
    r"\b10\.\d{4,9}/[-._;()/:A-Z0-9]+|"
    r"\[(?:\d{1,4}(?:\s*[-,;]\s*\d{1,4})*|[A-Z][^\]\n]{0,60}\d{4}[^\]\n]{0,30})\]|"
    r"(?<![\w])(?:\d{1,4}[-/.]){1,2}\d{1,4}(?![\w])|"
    r"(?<![\w])[+-]?\d+(?:[.,:]\d+)*(?:\s?%|[A-Za-z]{1,4})?(?![\w])",
    re.IGNORECASE,
)
HUMANISATION_META_NAMES = {
    "humanisation-generator", "humanisation-source-sha256", "humanisation-language",
}
BATCH_MAXIMUM_CHARS = 32_000
MAX_PARALLEL_BATCHES = 4
BIBLIOGRAPHY_HEADINGS = {
    "bibliography", "references", "works cited", "sources", "bibliografie",
    "referințe", "referinte", "bibliografía", "referencias", "bibliographie",
    "références", "bibliografia", "riferimenti", "literaturverzeichnis",
    "quellen", "quellenverzeichnis",
}
COPYRIGHT_RE = re.compile(
    r"(?:©|copyright|all rights reserved|toate drepturile rezervate|"
    r"todos los derechos reservados|tutti i diritti riservati|"
    r"alle rechte vorbehalten|isbn\b)", re.IGNORECASE,
)
PAGE_LABEL_RE = re.compile(
    r"^(?:pdf\s+)?(?:page|pagina|página|seite|page du pdf)\s+\d+\s*$",
    re.IGNORECASE,
)
IDENTIFIER_RE = re.compile(
    r"^(?:(?:isbn(?:-1[03])?|issn|doi)\s*[:#]?\s*)?[\dXx./:_-]{6,}\s*$"
)
RUBRIC = {
    "remove": [
        "generic openings and summaries", "repeated conclusions",
        "mechanical transitions", "excessive signposting", "inflated abstractions",
        "artificial antitheses", "repetitive triads", "uniform sentence rhythm",
        "needless hedging", "canned phrases",
    ],
    "preserve": [
        "meaning", "facts", "uncertainty", "terminology", "tone", "chronology",
        "examples", "quotations", "citations", "language",
    ],
    "never": [
        "translate", "invent facts or sources", "add anecdotes or personal experience",
        "change the thesis", "force colloquial or quirky variation",
    ],
}


class HumaniseHtmlError(RuntimeError):
    pass


def file_sha256(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_language(value: str) -> str:
    if not value or not langcodes.tag_is_valid(value):
        raise HumaniseHtmlError(f"Invalid BCP 47 language tag: {value!r}")
    return langcodes.standardize_tag(value)


def _document_language(soup: BeautifulSoup, explicit: str | None) -> str:
    value = explicit or (str(soup.html.get("lang", "")) if soup.html else "")
    if not value:
        raise HumaniseHtmlError(
            "Document language is missing. Add <html lang> or pass --language."
        )
    return normalize_language(value)


def default_output_path(source: Path) -> Path:
    return source.with_name(f"{source.stem}.humanised{source.suffix}")


def _is_excluded(node: Tag | NavigableString) -> bool:
    parents = [node, *node.parents] if isinstance(node, Tag) else list(node.parents)
    for parent in parents:
        if not isinstance(parent, Tag):
            continue
        if parent.name in SKIP_TAGS:
            return True
        if str(parent.get("translate", "")).casefold() == "no":
            return True
    return False


def _meaningful_text(tag: Tag) -> bool:
    return bool(re.search(r"[^\W_]", tag.get_text(" ", strip=True), re.UNICODE))


def _protect_text(text: str, protections: dict[str, str]) -> str:
    def replace(match: re.Match[str]) -> str:
        token = f"⟦PROTECT:P{len(protections) + 1:06d}⟧"
        protections[token] = match.group(0)
        return token

    return PROTECTED_RE.sub(replace, text)


def _encode_children(tag: Tag) -> tuple[str, dict[str, Any], dict[str, str]]:
    placeholders: dict[str, Any] = {}
    protections: dict[str, str] = {}

    def encode(node: Any) -> str:
        if isinstance(node, Comment):
            token = f"⟦PROTECT:P{len(protections) + 1:06d}⟧"
            protections[token] = f"<!--{node}-->"
            return token
        if isinstance(node, NavigableString):
            return _protect_text(str(node), protections)
        if not isinstance(node, Tag):
            return str(node)
        placeholder_id = f"T{len(placeholders) + 1:06d}"
        placeholders[placeholder_id] = {
            "tag": node.name,
            "attrs": deepcopy(dict(node.attrs)),
        }
        if node.name in VOID_TAGS:
            return f"⟦VOID:{placeholder_id}⟧"
        inner = "".join(encode(child) for child in node.children)
        return f"⟦OPEN:{placeholder_id}⟧{inner}⟦CLOSE:{placeholder_id}⟧"

    return "".join(encode(child) for child in tag.children), placeholders, protections


def _page_identity(tag: Tag) -> str | None:
    page = tag.find_parent("section", attrs={"data-source-page": True})
    if page is None and tag.name == "section" and tag.has_attr("data-source-page"):
        page = tag
    return str(page.get("data-source-page")) if page is not None else None


def _root_text_tags(soup: BeautifulSoup) -> list[Tag]:
    candidates = [
        tag for tag in soup.find_all(TEXT_TAGS)
        if not _is_excluded(tag) and _meaningful_text(tag)
    ]
    candidate_ids = {id(tag) for tag in candidates}
    return [
        tag for tag in candidates
        if not any(id(descendant) in candidate_ids for descendant in tag.find_all(TEXT_TAGS))
    ]


def _chapter_map(soup: BeautifulSoup, roots: list[Tag]) -> tuple[dict[int, tuple[str, str]], list[dict[str, str]]]:
    mapping: dict[int, tuple[str, str]] = {}
    chapters: list[dict[str, str]] = []
    meaningful_h1 = [tag for tag in soup.find_all("h1") if not _is_excluded(tag) and _meaningful_text(tag)]
    if meaningful_h1:
        current_id = "front-matter"
        current_title = "Front matter"
        chapters.append({"id": current_id, "title": current_title})
        h1_ids = {id(tag) for tag in meaningful_h1}
        chapter_number = 0
        for tag in roots:
            if id(tag) in h1_ids:
                chapter_number += 1
                current_id = f"chapter-{chapter_number:04d}"
                current_title = tag.get_text(" ", strip=True)
                chapters.append({"id": current_id, "title": current_title})
            mapping[id(tag)] = (current_id, current_title)
        used = {chapter_id for chapter_id, _title in mapping.values()}
        chapters = [chapter for chapter in chapters if chapter["id"] in used]
        return mapping, chapters

    boundaries: list[Tag] = []
    scope = soup.find("main") or soup.body
    if scope is not None:
        direct = [tag for tag in scope.find_all(["article", "section"], recursive=False)]
        boundaries = direct or scope.find_all("article", recursive=False)
    if boundaries:
        for index, boundary in enumerate(boundaries, start=1):
            heading = boundary.find(re.compile(r"^h[1-6]$"))
            title = heading.get_text(" ", strip=True) if heading else f"Section {index}"
            chapter = {"id": f"chapter-{index:04d}", "title": title}
            chapters.append(chapter)
            boundary_ids = {id(boundary), *(id(tag) for tag in boundary.find_all(True))}
            for tag in roots:
                if id(tag) in boundary_ids:
                    mapping[id(tag)] = (chapter["id"], chapter["title"])
        for tag in roots:
            mapping.setdefault(id(tag), ("front-matter", "Front matter"))
        if any(value[0] == "front-matter" for value in mapping.values()):
            chapters.insert(0, {"id": "front-matter", "title": "Front matter"})
        return mapping, chapters

    chapter = {"id": "document", "title": soup.title.get_text(" ", strip=True) if soup.title else "Document"}
    chapters.append(chapter)
    for tag in roots:
        mapping[id(tag)] = (chapter["id"], chapter["title"])
    return mapping, chapters


def _plain_token_text(value: str) -> str:
    return PROTECTION_TOKEN_RE.sub("", TOKEN_RE.sub("", value))


def _verify_only(kind: str, plain_text: str, chapter_title: str) -> bool:
    text = " ".join(plain_text.split())
    normalized_title = " ".join(chapter_title.casefold().strip(" :.-").split())
    if normalized_title in BIBLIOGRAPHY_HEADINGS:
        return True
    if kind == "attribute:aria-label" and PAGE_LABEL_RE.fullmatch(text):
        return True
    if COPYRIGHT_RE.search(text) or IDENTIFIER_RE.fullmatch(text):
        return True
    if re.fullmatch(r"(?:\[[^\]]+\]|\([^)]*\d{4}[^)]*\)|\s|[,;:.])+", text):
        return True
    return False


def _new_unit(
    unit_id: str,
    *,
    kind: str,
    source: str,
    chapter: tuple[str, str],
    page: str | None,
    placeholders: dict[str, Any] | None = None,
    protections: dict[str, str] | None = None,
    attribute: str | None = None,
    node_id: str | None = None,
) -> dict[str, Any]:
    plain = TOKEN_RE.sub("", source)
    for token, protected_value in (protections or {}).items():
        plain = plain.replace(token, protected_value)
    policy = "verify-only" if _verify_only(kind, plain, chapter[1]) else "editable"
    return {
        "id": unit_id,
        "kind": kind,
        "chapterId": chapter[0],
        "chapterTitle": chapter[1],
        "page": page,
        "policy": policy,
        "source": source,
        "plainText": plain,
        "placeholders": placeholders or {},
        "protections": protections or {},
        **({"attribute": attribute, "nodeId": node_id} if attribute else {}),
    }


def extract_units(soup: BeautifulSoup) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    units: list[dict[str, Any]] = []
    roots = _root_text_tags(soup)
    chapter_mapping, chapters = _chapter_map(soup, roots)

    for tag in roots:
        unit_id = f"u{len(units) + 1:06d}"
        tag[MARKER_UNIT] = unit_id
        source, placeholders, protections = _encode_children(tag)
        units.append(_new_unit(
            unit_id, kind=tag.name, source=source,
            chapter=chapter_mapping[id(tag)], page=_page_identity(tag),
            placeholders=placeholders, protections=protections,
        ))

    uncovered = []
    for node in list(soup.find_all(string=True)):
        if (
            isinstance(node, Comment) or not str(node).strip() or _is_excluded(node)
            or node.find_parent(attrs={MARKER_UNIT: True}) is not None
        ):
            continue
        uncovered.append(node)
    for node in uncovered:
        wrapper = soup.new_tag("span")
        wrapper[MARKER_WRAPPER] = ""
        node.wrap(wrapper)
        parent_root = next((root for root in roots if root is node.parent or root in node.parents), None)
        chapter = chapter_mapping.get(id(parent_root), ("document", "Document"))
        unit_id = f"u{len(units) + 1:06d}"
        wrapper[MARKER_UNIT] = unit_id
        source, placeholders, protections = _encode_children(wrapper)
        units.append(_new_unit(
            unit_id, kind="text", source=source, chapter=chapter,
            page=_page_identity(wrapper), placeholders=placeholders, protections=protections,
        ))

    node_counter = 0
    for tag in soup.find_all(True):
        if _is_excluded(tag):
            continue
        attributes = [name for name in HUMAN_ATTRIBUTES if tag.has_attr(name)]
        if tag.name == "meta" and str(tag.get("name", "")).casefold() == "description" and tag.has_attr("content"):
            attributes.append("content")
        for attribute in sorted(set(attributes)):
            value = str(tag.get(attribute, ""))
            if not re.search(r"[^\W_]", value, re.UNICODE):
                continue
            if not tag.has_attr(MARKER_NODE):
                node_counter += 1
                tag[MARKER_NODE] = f"n{node_counter:06d}"
            protections: dict[str, str] = {}
            source = _protect_text(value, protections)
            ancestor = next((root for root in reversed(roots) if root is tag or root in tag.parents), None)
            chapter = chapter_mapping.get(id(ancestor), ("document", "Document"))
            unit_id = f"u{len(units) + 1:06d}"
            units.append(_new_unit(
                unit_id, kind=f"attribute:{attribute}", source=source,
                chapter=chapter, page=_page_identity(tag), protections=protections,
                attribute=attribute, node_id=str(tag[MARKER_NODE]),
            ))
    return units, chapters


def _memory_key(unit: dict[str, Any]) -> str:
    payload = {
        "kind": unit["kind"], "policy": unit["policy"], "source": unit["source"],
        "placeholders": unit.get("placeholders", {}),
        "protections": unit.get("protections", {}),
        "attribute": unit.get("attribute"),
    }
    return json.dumps(payload, sort_keys=True, ensure_ascii=False)


def annotate_memory(units: list[dict[str, Any]]) -> dict[str, int]:
    seen: dict[str, str] = {}
    reused = 0
    for unit in units:
        key = _memory_key(unit)
        if key in seen:
            unit["reuseOf"] = seen[key]
            reused += 1
        else:
            seen[key] = unit["id"]
    return {"exactMatches": reused, "modelUnitsSaved": reused}


def _requires_model(unit: dict[str, Any]) -> bool:
    return not unit.get("reuseOf")


def batch_units(units: list[dict[str, Any]], maximum_chars: int = BATCH_MAXIMUM_CHARS) -> list[list[dict[str, Any]]]:
    grouped: OrderedDict[str, list[dict[str, Any]]] = OrderedDict()
    for unit in units:
        grouped.setdefault(unit["chapterId"], []).append(unit)

    chapter_chunks: list[list[dict[str, Any]]] = []
    for chapter_units in grouped.values():
        chunk: list[dict[str, Any]] = []
        size = 0
        for unit in chapter_units:
            unit_size = len(unit["source"]) if _requires_model(unit) else 0
            if chunk and size + unit_size > maximum_chars:
                chapter_chunks.append(chunk)
                chunk = []
                size = 0
            chunk.append(unit)
            size += unit_size
        if chunk:
            chapter_chunks.append(chunk)

    batches: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    size = 0
    for chunk in chapter_chunks:
        chunk_size = sum(len(unit["source"]) for unit in chunk if _requires_model(unit))
        if current and size + chunk_size > maximum_chars:
            batches.append(current)
            current = []
            size = 0
        current.extend(chunk)
        size += chunk_size
    if current:
        batches.append(current)
    return batches


def _outline(soup: BeautifulSoup, chapters: list[dict[str, str]], units: list[dict[str, Any]]) -> dict[str, Any]:
    samples = [
        unit["plainText"][:1600] for unit in units
        if unit["kind"] == "p" and len(unit["plainText"].split()) >= 30
    ]
    if samples:
        indexes = sorted({0, len(samples) // 2, len(samples) - 1})
        samples = [samples[index] for index in indexes]
    return {
        "title": soup.title.get_text(" ", strip=True) if soup.title else "",
        "chapters": chapters,
        "headings": [tag.get_text(" ", strip=True) for tag in soup.find_all(re.compile(r"^h[1-6]$"))],
        "representativeSamples": samples[:3],
        "rubric": RUBRIC,
        "instructions": (
            "Infer a compact same-language voice and register profile. Fill context.json "
            "and set profileReviewed=true before any batch is edited."
        ),
    }


def prepare_job(
    source: Path,
    *,
    language: str | None = None,
    output: Path | None = None,
    job_dir: Path | None = None,
    in_place: bool = False,
) -> dict[str, Any]:
    source = source.expanduser().resolve()
    if not source.is_file():
        raise HumaniseHtmlError(f"HTML input does not exist: {source}")
    if in_place and output is not None:
        raise HumaniseHtmlError("Use either --output or --in-place, not both.")
    original_bytes = source.read_bytes()
    source_text = original_bytes.decode("utf-8")
    original_soup = BeautifulSoup(source_text, "html.parser")
    if original_soup.html is None:
        raise HumaniseHtmlError("Input must be a complete HTML document.")
    document_language = _document_language(original_soup, language)
    target = source if in_place else (output.expanduser().resolve() if output else default_output_path(source))
    if target == source and not in_place:
        raise HumaniseHtmlError("Replacing the source requires explicit --in-place.")
    source_hash = sha256(original_bytes).hexdigest()
    if job_dir is None:
        identity = sha256(
            f"{source}\0{source_hash}\0{target}\0{document_language}\0{in_place}".encode("utf-8")
        ).hexdigest()[:16]
        job_dir = source.parent / ".humanisehtml-jobs" / f"{source.stem}-{identity}"
        existing = job_dir / "job.json"
        if existing.is_file():
            saved = json.loads(existing.read_text(encoding="utf-8"))
            if saved.get("sourceSha256") == source_hash and saved.get("output") == str(target):
                return {**job_status(job_dir), "resumed": True}
            raise HumaniseHtmlError(f"Existing job identity mismatch: {job_dir}")
    else:
        job_dir = job_dir.expanduser().resolve()
    job_dir.mkdir(parents=True, exist_ok=False)
    (job_dir / "batches").mkdir()
    (job_dir / "rewrites").mkdir()
    (job_dir / "source-original.html").write_bytes(original_bytes)

    template_soup = BeautifulSoup(source_text, "html.parser")
    units, chapters = extract_units(template_soup)
    memory = annotate_memory(units)
    batches = batch_units(units)
    batch_names: list[str] = []
    for index, batch in enumerate(batches, start=1):
        name = f"batch-{index:04d}.json"
        batch_names.append(name)
        chapter_ids = list(dict.fromkeys(unit["chapterId"] for unit in batch))
        payload = {
            "batch": index,
            "language": document_language,
            "chapterIds": chapter_ids,
            "rubric": RUBRIC,
            "units": batch,
        }
        (job_dir / "batches" / name).write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )

    job = {
        "source": str(source), "sourceSha256": source_hash, "output": str(target),
        "inPlace": in_place, "language": document_language, "batches": batch_names,
        "unitCount": len(units), "modelUnitCount": sum(_requires_model(unit) for unit in units),
        "chapterCount": len(chapters), "batchMaximumChars": BATCH_MAXIMUM_CHARS,
        "memory": memory,
        "parallel": {"enabledAfterProfile": True, "maxBatches": MAX_PARALLEL_BATCHES},
        "elementCounts": dict(Counter(tag.name for tag in original_soup.find_all(True))),
    }
    (job_dir / "job.json").write_text(json.dumps(job, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (job_dir / "template.html").write_text(str(template_soup), encoding="utf-8")
    (job_dir / "bootstrap.json").write_text(
        json.dumps(_outline(original_soup, chapters, units), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    context = {
        "profileReviewed": False, "documentProfile": "", "preserveTerms": [],
        "avoidPatterns": [], "notes": "",
    }
    (job_dir / "context.json").write_text(json.dumps(context, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {
        "status": "prepared", "job": str(job_dir), "source": str(source),
        "output": str(target), "inPlace": in_place, "language": document_language,
        "chapters": len(chapters), "units": len(units),
        "modelUnits": job["modelUnitCount"], "batches": len(batches),
        "batchMaximumChars": BATCH_MAXIMUM_CHARS, "memory": memory,
        "completedBatches": 0, "remainingBatches": len(batches),
        "readyBatches": [], "recommendedParallelBatches": 0,
    }


def _read_context(job_dir: Path) -> tuple[dict[str, Any], bool]:
    context = json.loads((job_dir / "context.json").read_text(encoding="utf-8"))
    required_lists = ("preserveTerms", "avoidPatterns")
    ready = bool(
        context.get("profileReviewed")
        and str(context.get("documentProfile", "")).strip()
        and all(isinstance(context.get(key), list) for key in required_lists)
    )
    if ready:
        frozen_payload = {
            key: context.get(key)
            for key in ("documentProfile", "preserveTerms", "avoidPatterns", "notes")
        }
        digest = sha256(
            json.dumps(frozen_payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
        ).hexdigest()
        lock_path = job_dir / "context.sha256"
        if lock_path.is_file():
            if lock_path.read_text(encoding="utf-8").strip() != digest:
                raise HumaniseHtmlError(
                    "The document profile changed after it was frozen. Restore context.json "
                    "or prepare a new job."
                )
        else:
            lock_path.write_text(digest + "\n", encoding="utf-8")
    return context, ready


def _required_ids(payload: dict[str, Any]) -> set[str]:
    return {unit["id"] for unit in payload["units"] if _requires_model(unit)}


def _audit_valid(entry: dict[str, Any]) -> bool:
    audit = entry.get("audit")
    return isinstance(audit, dict) and set(audit) == {
        "meaningPreserved", "factsPreserved", "natural", "noSlop", "notes"
    } and all(
        audit.get(key) is True
        for key in ("meaningPreserved", "factsPreserved", "natural", "noSlop")
    ) and isinstance(audit.get("notes", ""), str)


def _rewrite_file_complete(path: Path, expected: set[str]) -> bool:
    if not expected:
        return True
    if not path.is_file():
        return False
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict) or set(payload) != {"units"}:
            return False
        entries = payload.get("units") if isinstance(payload, dict) else None
        if not isinstance(entries, list) or len(entries) != len(expected):
            return False
        ids = [str(entry.get("id", "")) for entry in entries if isinstance(entry, dict)]
        return set(ids) == expected and len(ids) == len(set(ids)) and all(
            set(entry) == {"id", "action", "text", "audit"}
            and entry.get("action") in {"keep", "rewrite"}
            and isinstance(entry.get("text"), str) and bool(entry["text"].strip())
            and _audit_valid(entry) for entry in entries
        )
    except (json.JSONDecodeError, OSError, TypeError, AttributeError):
        return False


def job_status(job_dir: Path) -> dict[str, Any]:
    job_dir = job_dir.expanduser().resolve()
    job_path = job_dir / "job.json"
    if not job_path.is_file():
        raise HumaniseHtmlError(f"Humanisation job does not exist: {job_dir}")
    job = json.loads(job_path.read_text(encoding="utf-8"))
    _context, profile_ready = _read_context(job_dir)
    complete: list[str] = []
    incomplete: list[str] = []
    completed_units = 0
    for name in job["batches"]:
        payload = json.loads((job_dir / "batches" / name).read_text(encoding="utf-8"))
        if _rewrite_file_complete(job_dir / "rewrites" / name, _required_ids(payload)):
            complete.append(name)
            completed_units += len(payload["units"])
        else:
            incomplete.append(name)
    ready = incomplete if profile_ready else []
    remaining = len(incomplete)
    return {
        "status": "ready_to_build" if remaining == 0 else ("in_progress" if profile_ready else "profile_required"),
        "job": str(job_dir), "source": job["source"], "output": job["output"],
        "inPlace": job["inPlace"], "language": job["language"],
        "chapters": job["chapterCount"], "units": job["unitCount"],
        "modelUnits": job["modelUnitCount"], "completedUnits": completed_units,
        "batches": len(job["batches"]), "completedBatches": len(complete),
        "remainingBatches": remaining, "nextBatch": ready[0] if ready else None,
        "readyBatches": ready,
        "recommendedParallelBatches": min(int(job["parallel"]["maxBatches"]), len(ready)),
    }


def _restore_protections(text: str, unit: dict[str, Any]) -> str:
    expected_tokens = set(unit.get("protections", {}))
    actual = PROTECTION_TOKEN_RE.findall(text)
    if Counter(actual) != Counter(expected_tokens):
        raise HumaniseHtmlError(f"Unit {unit['id']} changed its protected token set.")
    for token, value in unit.get("protections", {}).items():
        text = text.replace(token, value)
    return text


def _validate_tokenized_text(text: str, unit: dict[str, Any]) -> None:
    expected_html = Counter(match.group(0) for match in TOKEN_RE.finditer(unit["source"]))
    actual_html = Counter(match.group(0) for match in TOKEN_RE.finditer(text))
    if expected_html != actual_html:
        raise HumaniseHtmlError(f"Unit {unit['id']} changed its HTML placeholder set.")
    expected_protected = Counter(PROTECTION_TOKEN_RE.findall(unit["source"]))
    actual_protected = Counter(PROTECTION_TOKEN_RE.findall(text))
    if expected_protected != actual_protected:
        raise HumaniseHtmlError(f"Unit {unit['id']} changed its protected token set.")


def _decode_fragment(soup: BeautifulSoup, value: str, unit: dict[str, Any]) -> list[Any]:
    _validate_tokenized_text(value, unit)
    value = _restore_protections(value, unit)
    root = soup.new_tag("div")
    stack: list[tuple[str, Tag]] = [("ROOT", root)]
    position = 0
    for match in TOKEN_RE.finditer(value):
        if match.start() > position:
            stack[-1][1].append(NavigableString(value[position:match.start()]))
        kind, placeholder_id = match.group("kind"), match.group("id")
        definition = unit.get("placeholders", {}).get(placeholder_id)
        if definition is None:
            raise HumaniseHtmlError(f"Unit {unit['id']} contains unknown placeholder {placeholder_id}.")
        if kind in {"OPEN", "VOID"}:
            tag = soup.new_tag(definition["tag"])
            tag.attrs = deepcopy(definition.get("attrs", {}))
            stack[-1][1].append(tag)
            if kind == "OPEN":
                stack.append((placeholder_id, tag))
        elif len(stack) == 1 or stack[-1][0] != placeholder_id:
            raise HumaniseHtmlError(f"Unit {unit['id']} has improperly nested placeholder {placeholder_id}.")
        else:
            stack.pop()
        position = match.end()
    if position < len(value):
        stack[-1][1].append(NavigableString(value[position:]))
    if len(stack) != 1:
        raise HumaniseHtmlError(f"Unit {unit['id']} has unclosed HTML placeholders.")
    return list(root.contents)


def _all_units(job_dir: Path, job: dict[str, Any]) -> list[dict[str, Any]]:
    units: list[dict[str, Any]] = []
    for name in job["batches"]:
        payload = json.loads((job_dir / "batches" / name).read_text(encoding="utf-8"))
        units.extend(payload["units"])
    return units


def load_rewrites(job_dir: Path, job: dict[str, Any]) -> dict[str, dict[str, Any]]:
    results: dict[str, dict[str, Any]] = {}
    units_by_id = {unit["id"]: unit for unit in _all_units(job_dir, job)}
    for name in job["batches"]:
        batch = json.loads((job_dir / "batches" / name).read_text(encoding="utf-8"))
        required = _required_ids(batch)
        path = job_dir / "rewrites" / name
        if required and not path.is_file():
            raise HumaniseHtmlError(f"Missing rewritten batch: {path}")
        if not required:
            entries = []
        else:
            rewritten_payload = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(rewritten_payload, dict) or set(rewritten_payload) != {"units"}:
                raise HumaniseHtmlError(f"Rewritten batch has an invalid root schema: {path}")
            entries = rewritten_payload.get("units")
        if not isinstance(entries, list):
            raise HumaniseHtmlError(f"Rewritten batch must contain a units list: {path}")
        actual = [str(entry.get("id", "")) for entry in entries if isinstance(entry, dict)]
        if set(actual) != required or len(actual) != len(required):
            raise HumaniseHtmlError(
                f"Rewrite unit mismatch in {path}; expected={sorted(required)}, actual={sorted(actual)}."
            )
        for entry in entries:
            if not isinstance(entry, dict) or set(entry) != {"id", "action", "text", "audit"}:
                raise HumaniseHtmlError(f"Rewritten unit has an invalid schema in {path}.")
            unit_id = str(entry.get("id", ""))
            if unit_id in results:
                raise HumaniseHtmlError(f"Duplicate unit ID: {unit_id}")
            unit = units_by_id[unit_id]
            action, value = entry.get("action"), entry.get("text")
            if action not in {"keep", "rewrite"} or not isinstance(value, str) or not value.strip():
                raise HumaniseHtmlError(f"Unit {unit_id} has an invalid action or empty text.")
            if not _audit_valid(entry):
                raise HumaniseHtmlError(f"Unit {unit_id} does not contain a complete affirmative audit.")
            if action == "keep" and value != unit["source"]:
                raise HumaniseHtmlError(f"Unit {unit_id} uses keep but changed its text.")
            if unit["policy"] == "verify-only" and (action != "keep" or value != unit["source"]):
                raise HumaniseHtmlError(f"Verify-only unit {unit_id} must be kept exactly.")
            _validate_tokenized_text(value, unit)
            results[unit_id] = deepcopy(entry)

    for unit in units_by_id.values():
        if unit["id"] in results:
            continue
        canonical = unit.get("reuseOf")
        if not canonical or canonical not in results:
            raise HumaniseHtmlError(f"Unit {unit['id']} cannot resolve memory source {canonical}.")
        copied = deepcopy(results[canonical])
        copied["id"] = unit["id"]
        results[unit["id"]] = copied
    return results


def rewrite_reference(value: str, source_html: Path, target_html: Path) -> str:
    if not value or value.startswith(("#", "/", "//")):
        return value
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc:
        return value
    absolute = (source_html.parent / parsed.path).resolve()
    relative = Path(os.path.relpath(absolute, target_html.parent)).as_posix()
    return urlunsplit(("", "", relative, parsed.query, parsed.fragment))


def rewrite_srcset(value: str, source_html: Path, target_html: Path) -> str:
    rewritten: list[str] = []
    for candidate in value.split(","):
        parts = candidate.strip().split()
        if parts:
            parts[0] = rewrite_reference(parts[0], source_html, target_html)
        rewritten.append(" ".join(parts))
    return ", ".join(rewritten)


def rewrite_css_urls(value: str, source_html: Path, target_html: Path) -> str:
    pattern = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.IGNORECASE)
    return pattern.sub(
        lambda match: f"url({match.group(1)}{rewrite_reference(match.group(2), source_html, target_html)}{match.group(1)})",
        value,
    )


def rewrite_local_references(soup: BeautifulSoup, source: Path, target: Path) -> None:
    for tag in soup.find_all(True):
        for attribute in URL_ATTRIBUTES:
            if tag.has_attr(attribute):
                tag[attribute] = rewrite_reference(str(tag[attribute]), source, target)
        if tag.has_attr("srcset"):
            tag["srcset"] = rewrite_srcset(str(tag["srcset"]), source, target)
        if tag.has_attr("style"):
            tag["style"] = rewrite_css_urls(str(tag["style"]), source, target)


def _owned_output(path: Path) -> bool:
    if not path.is_file():
        return False
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    marker = soup.find("meta", attrs={"name": "humanisation-generator"})
    return marker is not None and marker.get("content") == "humanisehtml-skill"


def build_job(job_dir: Path, *, overwrite: bool = False) -> dict[str, Any]:
    job_dir = job_dir.expanduser().resolve()
    job_path = job_dir / "job.json"
    if not job_path.is_file():
        raise HumaniseHtmlError(f"Humanisation job does not exist: {job_dir}")
    job = json.loads(job_path.read_text(encoding="utf-8"))
    source, target = Path(job["source"]), Path(job["output"])
    if file_sha256(source) != job["sourceSha256"]:
        raise HumaniseHtmlError("Source HTML changed after the humanisation job was prepared.")
    _context, profile_ready = _read_context(job_dir)
    if not profile_ready:
        raise HumaniseHtmlError("context.json requires a documentProfile and profileReviewed=true.")
    units = _all_units(job_dir, job)
    results = load_rewrites(job_dir, job)
    if set(results) != {unit["id"] for unit in units}:
        raise HumaniseHtmlError("Humanisation result coverage is incomplete.")

    soup = BeautifulSoup((job_dir / "template.html").read_text(encoding="utf-8"), "html.parser")
    for unit in units:
        value = results[unit["id"]]["text"]
        if unit.get("attribute"):
            node = soup.find(attrs={MARKER_NODE: unit["nodeId"]})
            if node is None:
                raise HumaniseHtmlError(f"Missing attribute target for {unit['id']}.")
            node[unit["attribute"]] = _restore_protections(value, unit)
            continue
        node = soup.find(attrs={MARKER_UNIT: unit["id"]})
        if node is None:
            raise HumaniseHtmlError(f"Missing content target for {unit['id']}.")
        replacement = _decode_fragment(soup, value, unit)
        node.clear()
        node.extend(replacement)
    for wrapper in list(soup.find_all(attrs={MARKER_WRAPPER: True})):
        wrapper.unwrap()
    for tag in soup.find_all(True):
        tag.attrs.pop(MARKER_UNIT, None)
        tag.attrs.pop(MARKER_NODE, None)
        tag.attrs.pop(MARKER_WRAPPER, None)
    rewrite_local_references(soup, source, target)
    if soup.head is None:
        head = soup.new_tag("head")
        soup.html.insert(0, head)
    for existing in list(soup.head.find_all("meta", attrs={"name": True})):
        if str(existing.get("name", "")) in HUMANISATION_META_NAMES:
            existing.decompose()
    for name, value in (
        ("humanisation-generator", "humanisehtml-skill"),
        ("humanisation-source-sha256", job["sourceSha256"]),
        ("humanisation-language", job["language"]),
    ):
        meta = soup.new_tag("meta")
        meta["name"], meta["content"] = name, value
        soup.head.append(meta)

    candidate = job_dir / "candidate.html"
    candidate.write_text("<!doctype html>\n" + str(soup), encoding="utf-8")
    from .validation import validate_humanisation
    snapshot = job_dir / "source-original.html"
    report = validate_humanisation(
        snapshot, candidate, intended_source=source, intended_target=target,
        units=units, results=results
    )
    if report["status"] == "failed":
        (job_dir / "report.json").write_text(
            json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        raise HumaniseHtmlError(
            f"Humanisation validation failed; candidate retained at {candidate}. Findings: {report['findings']}"
        )
    if target.exists() and not job["inPlace"] and (not overwrite or not _owned_output(target)):
        raise HumaniseHtmlError(
            f"Refusing to replace {target}; use --overwrite only for skill-owned output."
        )
    target.parent.mkdir(parents=True, exist_ok=True)
    stage = target.parent / f".{target.name}.humanisehtml-stage"
    stage.write_bytes(candidate.read_bytes())
    os.replace(stage, target)
    (job_dir / "report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return {
        "status": report["status"], "artifact": str(target), "job": str(job_dir),
        "inPlace": job["inPlace"], "report": str(job_dir / "report.json"),
        "findings": report["findings"], "metrics": report["metrics"],
    }
