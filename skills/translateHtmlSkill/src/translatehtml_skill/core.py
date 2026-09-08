from __future__ import annotations

from collections import Counter
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


TRANSLATABLE_TAGS = {
    "title", "h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "dt",
    "dd", "th", "td", "caption", "figcaption", "blockquote", "button",
    "label", "summary", "option", "legend",
}
SKIP_TAGS = {"script", "style", "code", "pre", "kbd", "samp", "math", "svg"}
HUMAN_ATTRIBUTES = {"alt", "title", "aria-label"}
URL_ATTRIBUTES = {"href", "src", "poster", "action", "formaction"}
VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
}
TOKEN_RE = re.compile(r"⟦(?P<kind>OPEN|CLOSE|VOID):(?P<id>T\d{6})⟧")
PROTECTED_RE = re.compile(
    r"(?:https?://|mailto:|www\.)[^\s<>()]+|"
    r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b|"
    r"\b10\.\d{4,9}/[-._;()/:A-Z0-9]+",
    re.IGNORECASE,
)
MARKER_UNIT = "data-translatehtml-unit"
MARKER_NODE = "data-translatehtml-node"
MARKER_WRAPPER = "data-translatehtml-wrapper"
TRANSLATION_META_NAMES = {
    "translation-generator",
    "translation-source-language",
    "translation-target-language",
    "translation-source-sha256",
}
RTL_LANGUAGES = {
    "ar", "arc", "dv", "fa", "ha", "he", "khw", "ks", "ku", "ps", "sd",
    "ug", "ur", "yi",
}
BATCH_MAXIMUM_CHARS = 32_000
MAX_PARALLEL_BATCHES = 4
REPETITIVE_LABEL_RE = re.compile(
    r"^(?P<prefix>.*?\D)(?P<number>\d+)(?P<suffix>\D*)$", re.UNICODE
)


class TranslateHtmlError(RuntimeError):
    pass


def file_sha256(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_language(value: str) -> str:
    if not value or not langcodes.tag_is_valid(value):
        raise TranslateHtmlError(f"Invalid BCP 47 language tag: {value!r}")
    return langcodes.standardize_tag(value)


def _source_language(soup: BeautifulSoup, explicit: str | None) -> str:
    value = explicit or (str(soup.html.get("lang", "")) if soup.html else "")
    if not value:
        raise TranslateHtmlError(
            "Source language is missing. Add <html lang> or pass --from."
        )
    return normalize_language(value)


def default_output_path(source: Path, source_language: str, target_language: str) -> Path:
    source_parent = source.parent.name.casefold()
    valid_source_names = {
        source_language.casefold(), source_language.split("-", 1)[0].casefold()
    }
    if source_parent not in valid_source_names:
        raise TranslateHtmlError(
            "Default output requires the source HTML to live in a language "
            "directory. Pass --output explicitly."
        )
    return source.parent.parent / target_language.casefold() / source.name


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
    return bool(re.search(r"\w", tag.get_text(" ", strip=True), re.UNICODE))


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
        return (
            f"⟦OPEN:{placeholder_id}⟧{inner}"
            f"⟦CLOSE:{placeholder_id}⟧"
        )

    return "".join(encode(child) for child in tag.children), placeholders, protections


def _page_identity(tag: Tag) -> str | None:
    page = tag.find_parent("section", attrs={"data-source-page": True})
    if page is None and tag.name == "section" and tag.has_attr("data-source-page"):
        page = tag
    if page is None:
        return None
    return str(page.get("data-source-page"))


def _new_unit(
    unit_id: str,
    *,
    kind: str,
    source: str,
    page: str | None,
    placeholders: dict[str, Any] | None = None,
    protections: dict[str, str] | None = None,
    attribute: str | None = None,
    node_id: str | None = None,
) -> dict[str, Any]:
    return {
        "id": unit_id,
        "kind": kind,
        "page": page,
        "source": source,
        "plainText": TOKEN_RE.sub("", source),
        "placeholders": placeholders or {},
        "protections": protections or {},
        **({"attribute": attribute, "nodeId": node_id} if attribute else {}),
    }


def extract_units(soup: BeautifulSoup) -> list[dict[str, Any]]:
    units: list[dict[str, Any]] = []
    candidates = [
        tag for tag in soup.find_all(TRANSLATABLE_TAGS)
        if not _is_excluded(tag) and _meaningful_text(tag)
    ]
    roots = [
        tag for tag in candidates
        if not any(descendant in candidates for descendant in tag.find_all(TRANSLATABLE_TAGS))
    ]

    for tag in roots:
        unit_id = f"u{len(units) + 1:06d}"
        tag[MARKER_UNIT] = unit_id
        source, placeholders, protections = _encode_children(tag)
        units.append(
            _new_unit(
                unit_id,
                kind=tag.name,
                source=source,
                page=_page_identity(tag),
                placeholders=placeholders,
                protections=protections,
            )
        )

    uncovered = []
    for node in list(soup.find_all(string=True)):
        if (
            isinstance(node, Comment)
            or not str(node).strip()
            or _is_excluded(node)
            or node.find_parent(attrs={MARKER_UNIT: True}) is not None
        ):
            continue
        uncovered.append(node)
    for node in uncovered:
        wrapper = soup.new_tag("span")
        wrapper[MARKER_WRAPPER] = ""
        node.wrap(wrapper)
        unit_id = f"u{len(units) + 1:06d}"
        wrapper[MARKER_UNIT] = unit_id
        source, placeholders, protections = _encode_children(wrapper)
        units.append(
            _new_unit(
                unit_id,
                kind="text",
                source=source,
                page=_page_identity(wrapper),
                placeholders=placeholders,
                protections=protections,
            )
        )

    node_counter = 0
    for tag in soup.find_all(True):
        if _is_excluded(tag):
            continue
        attributes = [name for name in HUMAN_ATTRIBUTES if tag.has_attr(name)]
        if tag.name == "meta" and str(tag.get("name", "")).casefold() == "description":
            if tag.has_attr("content"):
                attributes.append("content")
        for attribute in sorted(set(attributes)):
            value = str(tag.get(attribute, ""))
            if not re.search(r"\w", value, re.UNICODE):
                continue
            if not tag.has_attr(MARKER_NODE):
                node_counter += 1
                tag[MARKER_NODE] = f"n{node_counter:06d}"
            protections: dict[str, str] = {}
            source = _protect_text(value, protections)
            unit_id = f"u{len(units) + 1:06d}"
            units.append(
                _new_unit(
                    unit_id,
                    kind=f"attribute:{attribute}",
                    source=source,
                    page=_page_identity(tag),
                    protections=protections,
                    attribute=attribute,
                    node_id=str(tag[MARKER_NODE]),
                )
            )
    return units


def _translation_memory_key(unit: dict[str, Any]) -> str:
    """Return an exact, markup-aware key safe for translation reuse."""
    payload = {
        "kind": unit["kind"],
        "source": unit["source"],
        "placeholders": unit.get("placeholders", {}),
        "protections": unit.get("protections", {}),
        "attribute": unit.get("attribute"),
    }
    return json.dumps(payload, sort_keys=True, ensure_ascii=False)


def _annotate_translation_memory(units: list[dict[str, Any]]) -> dict[str, int]:
    """Mark exact repeats and parameterized numeric labels for deterministic reuse."""
    exact: dict[str, str] = {}
    label_templates: dict[tuple[str, str, str], tuple[str, str]] = {}
    exact_reuses = 0
    templated_labels = 0

    for unit in units:
        key = _translation_memory_key(unit)
        if key in exact:
            unit["reuseOf"] = exact[key]
            exact_reuses += 1
            continue
        exact[key] = unit["id"]

        if not unit["kind"].startswith("attribute:"):
            continue
        if unit.get("placeholders") or unit.get("protections"):
            continue
        match = REPETITIVE_LABEL_RE.fullmatch(unit["source"].strip())
        if match is None or not re.search(r"\w", match.group("prefix"), re.UNICODE):
            continue
        template_key = (
            unit["kind"],
            match.group("prefix").casefold(),
            match.group("suffix").casefold(),
        )
        canonical = label_templates.get(template_key)
        if canonical is None:
            label_templates[template_key] = (unit["id"], match.group("number"))
            continue
        unit["reuseTemplateOf"] = canonical[0]
        unit["templateNumber"] = canonical[1]
        unit["sourceNumber"] = match.group("number")
        templated_labels += 1

    return {
        "exactMatches": exact_reuses,
        "templatedLabels": templated_labels,
        "modelUnitsSaved": exact_reuses + templated_labels,
    }


def _requires_model_translation(unit: dict[str, Any]) -> bool:
    return not unit.get("reuseOf") and not unit.get("reuseTemplateOf")


def _word_count(text: str) -> int:
    return len(re.findall(r"\b[^\W\d_]+\b", text, re.UNICODE))


def _bootstrap_pages(soup: BeautifulSoup) -> list[str]:
    qualified: list[str] = []
    fallback: list[tuple[int, str]] = []
    for section in soup.find_all("section", attrs={"data-source-page": True}):
        page = str(section.get("data-source-page"))
        paragraphs = [p for p in section.find_all("p") if not _is_excluded(p)]
        prose_words = sum(_word_count(p.get_text(" ", strip=True)) for p in paragraphs)
        total_words = _word_count(section.get_text(" ", strip=True))
        table_words = sum(_word_count(t.get_text(" ", strip=True)) for t in section.find_all("table"))
        fallback.append((prose_words, page))
        if (
            len(paragraphs) >= 2
            and prose_words >= 150
            and total_words > 0
            and prose_words / total_words >= 0.65
            and table_words / total_words < 0.35
            and "source-page-full-image" not in section.get("class", [])
        ):
            qualified.append(page)
        if len(qualified) == 2:
            break
    if qualified:
        return qualified[:2]
    return [page for _score, page in sorted(fallback, reverse=True)[:2]]


def _batch_units(
    units: list[dict[str, Any]],
    bootstrap_ids: set[str],
    maximum_chars: int = BATCH_MAXIMUM_CHARS,
) -> list[list[dict[str, Any]]]:
    bootstrap = [unit for unit in units if unit["id"] in bootstrap_ids]
    remaining = [unit for unit in units if unit["id"] not in bootstrap_ids]
    batches: list[list[dict[str, Any]]] = [bootstrap] if bootstrap else []
    current: list[dict[str, Any]] = []
    size = 0
    current_page: str | None = None
    for unit in remaining:
        unit_size = len(unit["source"]) if _requires_model_translation(unit) else 0
        page_changed = current_page is not None and unit["page"] != current_page
        if current and size + unit_size > maximum_chars and page_changed:
            batches.append(current)
            current = []
            size = 0
        current.append(unit)
        size += unit_size
        current_page = unit["page"]
    if current:
        batches.append(current)
    return batches


def _outline(soup: BeautifulSoup) -> dict[str, Any]:
    headings = [tag.get_text(" ", strip=True) for tag in soup.find_all(re.compile(r"^h[1-6]$"))]
    captions = [tag.get_text(" ", strip=True) for tag in soup.find_all(["caption", "figcaption"])]
    return {
        "title": soup.title.get_text(" ", strip=True) if soup.title else "",
        "headings": headings,
        "captions": captions,
    }


def _representative_samples(soup: BeautifulSoup, excluded_pages: set[str]) -> list[str]:
    pages = [
        section for section in soup.find_all("section", attrs={"data-source-page": True})
        if str(section.get("data-source-page")) not in excluded_pages
    ]
    if not pages:
        return []
    indexes = sorted({len(pages) // 4, len(pages) // 2, max(0, len(pages) - 2)})
    samples: list[str] = []
    for index in indexes:
        paragraph = pages[index].find("p")
        if paragraph:
            samples.append(paragraph.get_text(" ", strip=True)[:1200])
    return samples[:3]


def prepare_job(
    source: Path,
    *,
    target_language: str,
    source_language: str | None = None,
    output: Path | None = None,
    job_dir: Path | None = None,
) -> dict[str, Any]:
    source = source.expanduser().resolve()
    if not source.is_file():
        raise TranslateHtmlError(f"HTML input does not exist: {source}")
    soup = BeautifulSoup(source.read_text(encoding="utf-8"), "html.parser")
    if soup.html is None:
        raise TranslateHtmlError("Input must be a complete HTML document.")
    source_language = _source_language(soup, source_language)
    target_language = normalize_language(target_language)
    if source_language.casefold() == target_language.casefold():
        raise TranslateHtmlError("Source and target languages must differ.")
    output_was_explicit = output is not None
    output = (
        output.expanduser().resolve()
        if output
        else default_output_path(source, source_language, target_language)
    )
    if output.resolve() == source:
        raise TranslateHtmlError("Output must not overwrite the source HTML.")
    source_hash = file_sha256(source)
    if job_dir is None:
        identity = sha256(
            (
                f"{source}\0{source_hash}\0{target_language}\0{output}\0"
                f"{BATCH_MAXIMUM_CHARS}\0{MAX_PARALLEL_BATCHES}"
            ).encode("utf-8")
        ).hexdigest()[:16]
        job_root = (
            source.parent / ".translatehtml-jobs"
            if output_was_explicit
            else source.parent.parent / ".translatehtml-jobs"
        )
        job_dir = job_root / f"{source.stem}-{target_language.casefold()}-{identity}"
        existing_job = job_dir / "job.json"
        if existing_job.is_file():
            existing = json.loads(existing_job.read_text(encoding="utf-8"))
            if (
                existing.get("sourceSha256") == source_hash
                and existing.get("output") == str(output)
            ):
                return {**job_status(job_dir), "resumed": True}
            raise TranslateHtmlError(f"Existing job identity mismatch: {job_dir}")
        job_dir.mkdir(parents=True, exist_ok=False)
    else:
        job_dir = job_dir.expanduser().resolve()
        job_dir.mkdir(parents=True, exist_ok=False)
    (job_dir / "batches").mkdir()
    (job_dir / "translations").mkdir()

    outline_source = BeautifulSoup(str(soup), "html.parser")
    bootstrap_pages = _bootstrap_pages(outline_source)
    units = extract_units(soup)
    memory_metrics = _annotate_translation_memory(units)
    bootstrap_ids = {
        unit["id"] for unit in units if unit.get("page") in set(bootstrap_pages)
    }
    batches = _batch_units(units, bootstrap_ids)
    batch_names: list[str] = []
    for index, batch in enumerate(batches, start=1):
        name = f"batch-{index:04d}.json"
        batch_names.append(name)
        payload = {
            "batch": index,
            "bootstrap": index == 1,
            "sourceLanguage": source_language,
            "targetLanguage": target_language,
            "units": batch,
        }
        (job_dir / "batches" / name).write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )

    job = {
        "source": str(source),
        "sourceSha256": source_hash,
        "output": str(output),
        "sourceLanguage": source_language,
        "targetLanguage": target_language,
        "bootstrapPages": bootstrap_pages,
        "bootstrapUnitIds": sorted(bootstrap_ids),
        "batches": batch_names,
        "unitCount": len(units),
        "modelUnitCount": sum(_requires_model_translation(unit) for unit in units),
        "batchMaximumChars": BATCH_MAXIMUM_CHARS,
        "translationMemory": memory_metrics,
        "parallelTranslation": {
            "enabledAfterBootstrap": True,
            "maxBatches": MAX_PARALLEL_BATCHES,
        },
        "elementCounts": dict(Counter(tag.name for tag in outline_source.find_all(True))),
    }
    (job_dir / "job.json").write_text(
        json.dumps(job, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (job_dir / "template.html").write_text(str(soup), encoding="utf-8")
    bootstrap = {
        **_outline(outline_source),
        "bootstrapPages": bootstrap_pages,
        "representativeSamples": _representative_samples(
            outline_source, set(bootstrap_pages)
        ),
        "instructions": (
            "Create a compact translation profile, translate and review the bootstrap "
            "units first, then set bootstrapReviewed to true in context.json."
        ),
    }
    (job_dir / "bootstrap.json").write_text(
        json.dumps(bootstrap, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    context = {
        "bootstrapReviewed": False,
        "documentProfile": "",
        "glossary": [],
        "previousBatchSummary": "",
        "previousPairs": [],
    }
    (job_dir / "context.json").write_text(
        json.dumps(context, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return {
        "status": "prepared",
        "job": str(job_dir),
        "source": str(source),
        "output": str(output),
        "sourceLanguage": source_language,
        "targetLanguage": target_language,
        "units": len(units),
        "modelUnits": sum(_requires_model_translation(unit) for unit in units),
        "batches": len(batches),
        "batchMaximumChars": BATCH_MAXIMUM_CHARS,
        "translationMemory": memory_metrics,
        "parallelTranslation": True,
        "bootstrapPages": bootstrap_pages,
        "completedBatches": 0,
        "remainingBatches": len(batches),
        "nextBatch": batch_names[0] if batch_names else None,
    }


def job_status(job_dir: Path) -> dict[str, Any]:
    """Return resumable progress, including batches ready for parallel work."""
    job_dir = job_dir.expanduser().resolve()
    job_path = job_dir / "job.json"
    if not job_path.is_file():
        raise TranslateHtmlError(f"Translation job does not exist: {job_dir}")
    job = json.loads(job_path.read_text(encoding="utf-8"))
    completed_batches = 0
    completed_units = 0
    incomplete: list[str] = []
    bootstrap_complete = True
    for name in job["batches"]:
        source_payload = json.loads(
            (job_dir / "batches" / name).read_text(encoding="utf-8")
        )
        expected = {
            unit["id"] for unit in source_payload["units"]
            if _requires_model_translation(unit)
        }
        translated_path = job_dir / "translations" / name
        valid = not expected
        if expected and translated_path.is_file():
            try:
                translated_payload = json.loads(translated_path.read_text(encoding="utf-8"))
                entries = translated_payload.get("units", [])
                actual = {str(entry.get("id", "")) for entry in entries}
                valid = len(entries) == len(expected) and actual == expected
            except (json.JSONDecodeError, AttributeError, TypeError):
                valid = False
        if valid:
            completed_batches += 1
            completed_units += len(source_payload["units"])
        else:
            incomplete.append(name)
        if source_payload.get("bootstrap"):
            bootstrap_complete = valid
    remaining = len(job["batches"]) - completed_batches
    context_path = job_dir / "context.json"
    context_ready = False
    if context_path.is_file():
        try:
            context = json.loads(context_path.read_text(encoding="utf-8"))
            context_ready = bool(
                context.get("bootstrapReviewed")
                and str(context.get("documentProfile", "")).strip()
            )
        except (json.JSONDecodeError, AttributeError, TypeError):
            context_ready = False
    if not bootstrap_complete:
        ready_batches = [
            name for name in incomplete
            if json.loads(
                (job_dir / "batches" / name).read_text(encoding="utf-8")
            ).get("bootstrap")
        ]
    elif context_ready:
        ready_batches = incomplete
    else:
        ready_batches = []
    parallel_limit = int(job["parallelTranslation"]["maxBatches"])
    return {
        "status": "ready_to_build" if remaining == 0 else "in_progress",
        "job": str(job_dir),
        "source": job["source"],
        "output": job["output"],
        "sourceLanguage": job["sourceLanguage"],
        "targetLanguage": job["targetLanguage"],
        "units": job["unitCount"],
        "modelUnits": job["modelUnitCount"],
        "completedUnits": completed_units,
        "batches": len(job["batches"]),
        "completedBatches": completed_batches,
        "remainingBatches": remaining,
        "nextBatch": ready_batches[0] if ready_batches else (incomplete[0] if incomplete else None),
        "readyBatches": ready_batches,
        "recommendedParallelBatches": min(parallel_limit, len(ready_batches)),
    }


def _restore_protections(text: str, unit: dict[str, Any]) -> str:
    for token, value in unit.get("protections", {}).items():
        if text.count(token) != 1:
            raise TranslateHtmlError(
                f"Unit {unit['id']} must preserve protected token {token} exactly once."
            )
        text = text.replace(token, value)
    return text


def _decode_fragment(
    soup: BeautifulSoup, translated: str, unit: dict[str, Any]
) -> list[Any]:
    expected = Counter(TOKEN_RE.findall(unit["source"]))
    actual = Counter(TOKEN_RE.findall(translated))
    if expected != actual:
        raise TranslateHtmlError(
            f"Unit {unit['id']} changed its HTML placeholder set."
        )
    translated = _restore_protections(translated, unit)
    root = soup.new_tag("div")
    stack: list[tuple[str, Tag]] = [("ROOT", root)]
    position = 0
    for match in TOKEN_RE.finditer(translated):
        if match.start() > position:
            stack[-1][1].append(NavigableString(translated[position:match.start()]))
        kind = match.group("kind")
        placeholder_id = match.group("id")
        definition = unit.get("placeholders", {}).get(placeholder_id)
        if definition is None:
            raise TranslateHtmlError(
                f"Unit {unit['id']} contains unknown placeholder {placeholder_id}."
            )
        if kind in {"OPEN", "VOID"}:
            tag = soup.new_tag(definition["tag"])
            tag.attrs = deepcopy(definition.get("attrs", {}))
            stack[-1][1].append(tag)
            if kind == "OPEN":
                stack.append((placeholder_id, tag))
        elif len(stack) == 1 or stack[-1][0] != placeholder_id:
            raise TranslateHtmlError(
                f"Unit {unit['id']} has improperly nested placeholder {placeholder_id}."
            )
        else:
            stack.pop()
        position = match.end()
    if position < len(translated):
        stack[-1][1].append(NavigableString(translated[position:]))
    if len(stack) != 1:
        raise TranslateHtmlError(f"Unit {unit['id']} has unclosed HTML placeholders.")
    return list(root.contents)


def _load_translations(job_dir: Path, job: dict[str, Any]) -> dict[str, str]:
    translated: dict[str, str] = {}
    for name in job["batches"]:
        source_payload = json.loads(
            (job_dir / "batches" / name).read_text(encoding="utf-8")
        )
        required_ids = {
            unit["id"] for unit in source_payload["units"]
            if _requires_model_translation(unit)
        }
        path = job_dir / "translations" / name
        if not required_ids:
            continue
        if not path.is_file():
            raise TranslateHtmlError(f"Missing translated batch: {path}")
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise TranslateHtmlError(f"Translated batch must be a JSON object: {path}")
        entries = payload.get("units")
        if not isinstance(entries, list):
            raise TranslateHtmlError(f"Translated batch must contain a units list: {path}")
        for entry in entries:
            unit_id = str(entry.get("id", ""))
            if not unit_id or unit_id in translated:
                raise TranslateHtmlError(f"Duplicate or missing unit ID in {path}")
            if not isinstance(entry.get("translation"), str) or not entry["translation"].strip():
                raise TranslateHtmlError(f"Unit {unit_id} has an empty translation.")
            translated[unit_id] = entry["translation"]
        actual_ids = {str(entry.get("id", "")) for entry in entries}
        if actual_ids != required_ids or len(entries) != len(required_ids):
            raise TranslateHtmlError(
                f"Translated batch unit mismatch in {path}; "
                f"expected={sorted(required_ids)}, actual={sorted(actual_ids)}."
            )

    units = _all_units(job_dir, job)
    for unit in units:
        if unit["id"] in translated:
            continue
        canonical_id = unit.get("reuseOf") or unit.get("reuseTemplateOf")
        if not canonical_id or canonical_id not in translated:
            raise TranslateHtmlError(
                f"Unit {unit['id']} cannot resolve translation memory source {canonical_id}."
            )
        value = translated[canonical_id]
        if unit.get("reuseTemplateOf"):
            template_number = str(unit["templateNumber"])
            pattern = re.compile(rf"(?<!\d){re.escape(template_number)}(?!\d)")
            if len(pattern.findall(value)) != 1:
                raise TranslateHtmlError(
                    f"Template translation {canonical_id} must preserve numeric token "
                    f"{template_number} exactly once."
                )
            value = pattern.sub(str(unit["sourceNumber"]), value, count=1)
        translated[unit["id"]] = value
    return translated


def _all_units(job_dir: Path, job: dict[str, Any]) -> list[dict[str, Any]]:
    units: list[dict[str, Any]] = []
    for name in job["batches"]:
        payload = json.loads((job_dir / "batches" / name).read_text(encoding="utf-8"))
        units.extend(payload["units"])
    return units


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

    def replace(match: re.Match[str]) -> str:
        raw = match.group(2)
        rewritten = rewrite_reference(raw, source_html, target_html)
        quote = match.group(1)
        return f"url({quote}{rewritten}{quote})"

    return pattern.sub(replace, value)


def rewrite_local_references(soup: BeautifulSoup, source: Path, target: Path) -> None:
    for tag in soup.find_all(True):
        for attribute in URL_ATTRIBUTES:
            if tag.has_attr(attribute):
                tag[attribute] = rewrite_reference(str(tag[attribute]), source, target)
        if tag.has_attr("srcset"):
            tag["srcset"] = rewrite_srcset(str(tag["srcset"]), source, target)
        if tag.has_attr("style"):
            tag["style"] = rewrite_css_urls(str(tag["style"]), source, target)


def _owned_translation(path: Path) -> bool:
    if not path.is_file():
        return False
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    marker = soup.find("meta", attrs={"name": "translation-generator"})
    return marker is not None and marker.get("content") == "translatehtml-skill"


def build_job(job_dir: Path, *, overwrite: bool = False) -> dict[str, Any]:
    job_dir = job_dir.expanduser().resolve()
    job = json.loads((job_dir / "job.json").read_text(encoding="utf-8"))
    source = Path(job["source"])
    target = Path(job["output"])
    if file_sha256(source) != job["sourceSha256"]:
        raise TranslateHtmlError("Source HTML changed after the translation job was prepared.")
    context = json.loads((job_dir / "context.json").read_text(encoding="utf-8"))
    if not context.get("bootstrapReviewed") or not str(context.get("documentProfile", "")).strip():
        raise TranslateHtmlError(
            "context.json must contain a documentProfile and bootstrapReviewed=true."
        )
    units = _all_units(job_dir, job)
    translations = _load_translations(job_dir, job)
    expected_ids = {unit["id"] for unit in units}
    if set(translations) != expected_ids:
        missing = sorted(expected_ids - set(translations))
        unexpected = sorted(set(translations) - expected_ids)
        raise TranslateHtmlError(
            f"Translation unit mismatch; missing={missing}, unexpected={unexpected}."
        )

    soup = BeautifulSoup((job_dir / "template.html").read_text(encoding="utf-8"), "html.parser")
    for unit in units:
        translated = translations[unit["id"]]
        if unit.get("attribute"):
            node = soup.find(attrs={MARKER_NODE: unit["nodeId"]})
            if node is None:
                raise TranslateHtmlError(f"Missing attribute target for {unit['id']}.")
            node[unit["attribute"]] = _restore_protections(translated, unit)
            continue
        node = soup.find(attrs={MARKER_UNIT: unit["id"]})
        if node is None:
            raise TranslateHtmlError(f"Missing content target for {unit['id']}.")
        replacement = _decode_fragment(soup, translated, unit)
        node.clear()
        node.extend(replacement)

    for wrapper in list(soup.find_all(attrs={MARKER_WRAPPER: True})):
        wrapper.unwrap()
    for tag in soup.find_all(True):
        tag.attrs.pop(MARKER_UNIT, None)
        tag.attrs.pop(MARKER_NODE, None)
        tag.attrs.pop(MARKER_WRAPPER, None)
    soup.html["lang"] = job["targetLanguage"]
    primary = job["targetLanguage"].split("-", 1)[0].casefold()
    if primary in RTL_LANGUAGES:
        soup.html["dir"] = "rtl"
    else:
        soup.html.attrs.pop("dir", None)
    rewrite_local_references(soup, source, target)
    for existing in list(soup.head.find_all("meta", attrs={"name": True})):
        if str(existing.get("name", "")) in TRANSLATION_META_NAMES:
            existing.decompose()
    for name, value in (
        ("translation-generator", "translatehtml-skill"),
        ("translation-source-language", job["sourceLanguage"]),
        ("translation-target-language", job["targetLanguage"]),
        ("translation-source-sha256", job["sourceSha256"]),
    ):
        meta = soup.new_tag("meta")
        meta["name"] = name
        meta["content"] = value
        soup.head.append(meta)

    candidate = job_dir / "candidate.html"
    candidate.write_text("<!doctype html>\n" + str(soup), encoding="utf-8")
    from .validation import validate_translation

    report = validate_translation(
        source,
        candidate,
        target_language=job["targetLanguage"],
        intended_target=target,
        units=units,
        translations=translations,
    )
    if report["status"] == "failed":
        raise TranslateHtmlError(
            "Translation validation failed; candidate retained at "
            f"{candidate}. Findings: {report['findings']}"
        )
    if target.exists() and (not overwrite or not _owned_translation(target)):
        raise TranslateHtmlError(
            f"Refusing to replace {target}; use --overwrite on translatehtml-owned output."
        )
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.parent / f".{target.name}.translatehtml-stage"
    temporary.write_bytes(candidate.read_bytes())
    os.replace(temporary, target)
    report_path = job_dir / "report.json"
    report_path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return {
        "status": report["status"],
        "artifact": str(target),
        "job": str(job_dir),
        "validation": report,
    }
