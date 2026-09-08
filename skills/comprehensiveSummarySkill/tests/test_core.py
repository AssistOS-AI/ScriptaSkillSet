from __future__ import annotations

import json
from pathlib import Path

from bs4 import BeautifulSoup
import pytest

from comprehensivesummary_skill.core import (
    BATCH_MAXIMUM_CHARS,
    ComprehensiveSummaryError,
    _chapter_batches,
    build_job,
    draft_text,
    extract_document,
    job_status,
    prepare_job,
    validate_synthesis,
    word_count,
)


def _book(tmp_path: Path) -> Path:
    source = tmp_path / "book" / "index.html"
    source.parent.mkdir(parents=True)
    base = (
        "The argument examines evidence, uncertainty, interpretation, method, context, "
        "history, consequences, objections, and practical judgment. It distinguishes a "
        "plausible observation from a stronger causal claim and asks what evidence would "
        "change the conclusion. The discussion preserves ambiguity where the record is "
        "incomplete and compares competing explanations before reaching a measured result. "
    )
    source.write_text(
        f"""<!doctype html><html lang="en"><head><title>Measured Arguments</title></head><body>
        <main data-reader-content>
        <h1 id="contents">Contents</h1><p>Origins Methods Consequences</p>
        <h1 id="origins">Origins</h1><p>{base} {base}</p>
        <h1 id="methods">Methods</h1><p>{base} {base}</p>
        <h1 id="consequences">Consequences</h1><p>{base} {base}</p>
        <h1 id="references">Selective Bibliography</h1><p>Author, A. Example source.</p>
        </main><script>window.reader=true</script></body></html>""",
        encoding="utf-8",
    )
    return source


def _write_analyses(job_dir: Path) -> list[dict]:
    job = json.loads((job_dir / "job.json").read_text(encoding="utf-8"))
    analyses = []
    for name in job["batches"]:
        batch = json.loads((job_dir / "batches" / name).read_text(encoding="utf-8"))
        unit_id = batch["units"][-1]["id"]
        stem = name.removesuffix(".json")
        analysis = {
            "batch": name,
            "chapterId": batch["chapterId"],
            "segment": batch["segment"],
            "thesis": f"The chapter develops the role of {batch['chapterTitle']}.",
            "role": "It contributes one part of the book's measured argument.",
            "ideas": [{
                "id": f"{stem}-idea-001",
                "statement": "Evidence must be weighed against uncertainty and alternatives.",
                "centrality": 0.8,
                "originality": 0.6,
                "recurrenceCandidate": "evidence and uncertainty",
                "sourceUnitIds": [unit_id],
            }],
            "evidenceAndExamples": [],
            "objectionsAndQualifications": [{
                "statement": "The record may remain incomplete.",
                "sourceUnitIds": [unit_id],
            }],
            "audit": {
                "chapterCovered": True,
                "meaningPreserved": True,
                "factsPreserved": True,
                "notes": "",
            },
        }
        (job_dir / "analyses" / name).write_text(json.dumps(analysis), encoding="utf-8")
        analyses.append(analysis)
    return analyses


def _write_synthesis(job_dir: Path, analyses: list[dict]) -> dict:
    clusters = []
    coverage = []
    for index, analysis in enumerate(analyses, start=1):
        idea = analysis["ideas"][0]
        cluster_id = f"cluster-{index:03d}"
        clusters.append({
            "id": cluster_id,
            "label": f"Theme {index}",
            "synthesis": idea["statement"],
            "centrality": 0.8,
            "recurrence": 0.4,
            "originality": 0.6,
            "score": 0.65,
            "selected": True,
            "chapterIds": [analysis["chapterId"]],
            "sourceUnitIds": idea["sourceUnitIds"],
            "ideaIds": [idea["id"]],
        })
        coverage.append({"chapterId": analysis["chapterId"], "clusterIds": [cluster_id]})
    split = max(1, len(clusters) - 1)
    synthesis = {
        "centralMessage": "Sound judgment weighs evidence, uncertainty, and alternatives.",
        "clusters": clusters,
        "outline": [
            {
                "id": "section-01", "title": "Evidence and interpretation",
                "purpose": "Establish the central method.", "budgetWords": 100,
                "clusterIds": [item["id"] for item in clusters[:split]],
            },
            {
                "id": "section-02", "title": "Consequences",
                "purpose": "Integrate implications.", "budgetWords": 80,
                "clusterIds": [item["id"] for item in clusters[split:]],
            },
        ],
        "chapterCoverage": coverage,
        "audit": {
            "allAnalysesUsed": True, "centralMessageCovered": True,
            "redundancyMerged": True, "notes": "",
        },
    }
    (job_dir / "synthesis.json").write_text(json.dumps(synthesis), encoding="utf-8")
    return synthesis


def _paragraph(text: str, cluster_ids: list[str], source_ids: list[str]) -> dict:
    return {
        "text": text, "clusterIds": cluster_ids, "sourceUnitIds": source_ids,
        "audit": {
            "meaningPreserved": True, "factsPreserved": True,
            "noUnsupportedClaim": True,
        },
    }


def _write_draft(job_dir: Path, synthesis: dict) -> dict:
    clusters = synthesis["clusters"]
    first_ids = synthesis["outline"][0]["clusterIds"]
    second_ids = synthesis["outline"][1]["clusterIds"]
    unit_for = {item["id"]: item["sourceUnitIds"][0] for item in clusters}
    p1 = (
        "The book asks readers to weigh evidence without hiding uncertainty. Its argument "
        "separates plausible observations from stronger causal claims, then compares the "
        "available explanations before accepting a conclusion. This approach makes method "
        "part of the message rather than a technical detail added after interpretation."
    )
    p2 = (
        "Across the discussion, historical context explains why an idea can appear reasonable "
        "without proving that the idea is correct. Evidence matters most when it could change "
        "the conclusion, survives comparison with alternatives, and remains useful beyond the "
        "examples from which the initial interpretation was formed."
    )
    p3 = (
        "The resulting judgment is measured. Incomplete records justify qualification rather "
        "than confidence, while practical consequences deserve attention even when causal "
        "claims remain unsettled. The strongest synthesis therefore preserves disagreement, "
        "identifies what is genuinely supported, and leaves open the questions that evidence "
        "cannot yet resolve."
    )
    conclusion = (
        "The central lesson is a disciplined balance: understand why a claim attracts belief, "
        "test it against competing accounts, and state the conclusion no more strongly than "
        "the evidence permits. Context enriches judgment, but it does not replace proof."
    )
    draft = {
        "title": "A measured account of evidence",
        "dek": "A unified summary of the book's argument, method, and implications.",
        "sections": [
            {
                "id": "section-01", "heading": "How the argument works",
                "paragraphs": [
                    _paragraph(p1, first_ids, [unit_for[item] for item in first_ids]),
                    _paragraph(p2, first_ids, [unit_for[item] for item in first_ids]),
                ],
            },
            {
                "id": "section-02", "heading": "What follows from it",
                "paragraphs": [_paragraph(p3, second_ids, [unit_for[item] for item in second_ids])],
            },
        ],
        "conclusion": [_paragraph(
            conclusion, [item["id"] for item in clusters],
            [item["sourceUnitIds"][0] for item in clusters],
        )],
        "audit": {
            "sameLanguage": True, "centralMessagePreserved": True,
            "coherentEssay": True, "notes": "",
        },
    }
    minimum = json.loads((job_dir / "job.json").read_text())["minimumWords"]
    missing = minimum - word_count(draft_text(draft))
    if missing > 0:
        draft["conclusion"][0]["text"] += " " + " ".join(["context"] * missing)
    (job_dir / "draft.json").write_text(json.dumps(draft), encoding="utf-8")
    return draft


def _complete_job(job_dir: Path) -> tuple[list[dict], dict, dict]:
    analyses = _write_analyses(job_dir)
    synthesis = _write_synthesis(job_dir, analyses)
    draft = _write_draft(job_dir, synthesis)
    return analyses, synthesis, draft


def test_prepare_classifies_structural_chapters_and_sets_budget(tmp_path: Path) -> None:
    source = _book(tmp_path)
    original = source.read_bytes()
    result = prepare_job(source, minutes=1)
    job_dir = Path(result["job"])
    chapters = json.loads((job_dir / "chapters.json").read_text())["chapters"]

    assert result["targetWords"] == 200
    assert result["wordRange"] == [180, 220]
    assert Path(result["output"]).name == "index.summary-1min.html"
    assert {item["reason"] for item in result["excludedChapters"]} == {"contents", "bibliography"}
    assert [chapter["title"] for chapter in chapters if chapter["included"]] == ["Origins", "Methods", "Consequences"]
    assert source.read_bytes() == original == (job_dir / "source-original.html").read_bytes()
    assert job_status(job_dir)["status"] == "chapter_analysis"


def test_semantic_section_fallback_and_oversized_unit_is_not_split() -> None:
    huge = "word " * 7000
    soup = BeautifulSoup(
        f"<html lang='en'><body><main><section><h2>One</h2><p>{huge}</p></section>"
        "<section><h2>Two</h2><p>Useful argument repeated with context.</p></section></main></body></html>",
        "html.parser",
    )
    units, chapters = extract_document(soup)
    batches = _chapter_batches(units, chapters)
    assert [chapter["title"] for chapter in chapters] == ["One", "Two"]
    huge_batch = next(batch for batch in batches if batch["chapterId"] == "chapter-0001")
    assert any(len(unit["text"]) > BATCH_MAXIMUM_CHARS for unit in huge_batch["units"])


def test_status_advances_through_all_three_llm_stages(tmp_path: Path) -> None:
    job_dir = tmp_path / "job"
    prepare_job(_book(tmp_path), minutes=1, job_dir=job_dir)
    analyses = _write_analyses(job_dir)
    assert job_status(job_dir)["status"] == "synthesis_required"
    synthesis = _write_synthesis(job_dir, analyses)
    assert job_status(job_dir)["status"] == "draft_required"
    _write_draft(job_dir, synthesis)
    assert job_status(job_dir)["status"] == "ready_to_build"


def test_synthesis_rejects_bad_score_and_missing_chapter(tmp_path: Path) -> None:
    job_dir = tmp_path / "job"
    prepare_job(_book(tmp_path), minutes=1, job_dir=job_dir)
    analyses = _write_analyses(job_dir)
    synthesis = _write_synthesis(job_dir, analyses)
    job = json.loads((job_dir / "job.json").read_text())
    synthesis["clusters"][0]["score"] = 0.9
    synthesis["chapterCoverage"].pop()
    errors = validate_synthesis(synthesis, job, analyses)
    assert any("weighted score" in error for error in errors)
    assert any("every content chapter" in error for error in errors)


def test_build_renders_traceable_html_and_preserves_source(tmp_path: Path) -> None:
    source = _book(tmp_path)
    original = source.read_bytes()
    job_dir = tmp_path / "job"
    prepare_job(source, minutes=1, job_dir=job_dir)
    _complete_job(job_dir)
    result = build_job(job_dir)
    target = Path(result["artifact"])
    soup = BeautifulSoup(target.read_text(encoding="utf-8"), "html.parser")

    assert result["status"] == "passed"
    assert source.read_bytes() == original
    assert soup.html["lang"] == "en"
    assert soup.select_one("article[data-summary-body]") is not None
    assert soup.select_one(".reading-time") is None
    assert soup.select_one("details[data-source-map] table") is not None
    assert all(tag.get("data-source-units") for tag in soup.select("article p:not(.dek)"))
    assert soup.find("script") is None
    assert 180 <= result["metrics"]["actualWords"] <= 220


def test_build_rejects_unsupported_number(tmp_path: Path) -> None:
    job_dir = tmp_path / "job"
    prepare_job(_book(tmp_path), minutes=1, job_dir=job_dir)
    _analyses, _synthesis, draft = _complete_job(job_dir)
    draft["sections"][0]["paragraphs"][0]["text"] += " The unsupported year is 2099."
    draft["conclusion"][0]["text"] = draft["conclusion"][0]["text"].replace(" context", "", 6)
    (job_dir / "draft.json").write_text(json.dumps(draft), encoding="utf-8")
    with pytest.raises(ComprehensiveSummaryError, match="unsupported factual tokens"):
        build_job(job_dir)


def test_prepare_rejects_a_target_that_is_not_a_summary(tmp_path: Path) -> None:
    with pytest.raises(ComprehensiveSummaryError, match="not shorter"):
        prepare_job(_book(tmp_path), minutes=100, job_dir=tmp_path / "job")
