from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path

import pytest

from marketingsummary_skill.core import (
    MarketingSummaryError,
    _budget,
    build_job,
    draft_text,
    job_status,
    prepare_job,
    word_count,
)
from marketingsummary_skill.validation import validate_marketing_summary


def _write(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2), encoding="utf-8")


def _book(tmp_path: Path, *, comprehensive: bool = False) -> Path:
    marker = '<meta name="summary-generator" content="comprehensivesummary-skill">' if comprehensive else ""
    source_map = '<details data-source-map><summary>Internal map</summary><p>Secret map data</p></details>' if comprehensive else ""
    article_attr = " data-summary-body" if comprehensive else ""
    body = " ".join(
        ["This book begins with difficult questions about identity evidence uncertainty and choice."] * 70
        + ["The final answer is hidden by design and should never appear in promotional copy."]
    )
    path = tmp_path / "book.html"
    path.write_text(
        f'<!doctype html><html lang="en"><head>{marker}<title>A Book of Questions</title></head>'
        f'<body><article{article_attr}><h1>A Book of Questions</h1><p>{body}</p></article>{source_map}</body></html>',
        encoding="utf-8",
    )
    return path


def _analysis(job_dir: Path, *, mode: str = "nonfiction") -> dict:
    job = json.loads((job_dir / "job.json").read_text())
    batch = json.loads((job_dir / "batches" / job["batchNames"][0]).read_text())
    prose_id = batch["units"][-1]["id"]
    value = {
        "batch": batch["batch"],
        "chapterId": batch["chapterId"],
        "segment": batch["segment"],
        "modeSignals": [mode],
        "safeHooks": [{
            "id": "batch-0001-hook-001",
            "type": "question",
            "statement": "The book explores difficult questions about identity, evidence, uncertainty, and choice.",
            "sourceUnitIds": [prose_id],
        }],
        "protectedRevelations": [{
            "id": "batch-0001-revelation-001",
            "type": "twist" if mode == "fiction" else "answer",
            "statement": "The final answer is hidden by design.",
            "guardTerms": ["final answer is hidden"],
            "sourceUnitIds": [prose_id],
        }],
        "audit": {
            "chapterCovered": True,
            "questionsIdentified": True,
            "revelationsSeparated": True,
            "factsPreserved": True,
            "notes": "",
        },
    }
    _write(job_dir / "analyses" / batch["batch"], value)
    return value


def _synthesis(job_dir: Path, analysis: dict, *, mode: str = "nonfiction") -> dict:
    job = json.loads((job_dir / "job.json").read_text())
    hook = analysis["safeHooks"][0]
    value = {
        "mode": mode,
        "positioning": {
            "headlineAngle": "Questions that unsettle familiar assumptions",
            "readerPromise": "An invitation to investigate",
            "audience": "general educated reader",
            "tone": "editorial, persuasive, restrained",
        },
        "selectedHooks": [{
            "id": "selected-hook-001",
            "statement": hook["statement"],
            "hookIds": [hook["id"]],
            "sourceUnitIds": hook["sourceUnitIds"],
        }],
        "protectedRevelationIds": [analysis["protectedRevelations"][0]["id"]],
        "outline": [{
            "id": "section-01",
            "role": "questions",
            "title": "Questions worth following",
            "budgetWords": 230,
            "selectedHookIds": ["selected-hook-001"],
        }],
        "chapterCoverage": [{"chapterId": job["contentChapterIds"][0], "hookIds": [hook["id"]]}],
        "audit": {
            "allAnalysesUsed": True,
            "spoilerBoundaryDefined": True,
            "noAnswersSelected": True,
            "notes": "",
        },
    }
    _write(job_dir / "synthesis.json", value)
    return value


def _draft(job_dir: Path) -> dict:
    paragraph = " ".join(["Questions about identity evidence uncertainty and choice invite curiosity and thoughtful reading"] * 22)
    value = {
        "title": "Questions Worth Following",
        "dek": "A thoughtful invitation into uncertainty identity evidence and choice.",
        "sections": [{
            "id": "section-01",
            "role": "questions",
            "heading": "Where certainty begins to shift",
            "paragraphs": [{
                "text": paragraph,
                "selectedHookIds": ["selected-hook-001"],
                "sourceUnitIds": ["u000002"],
                "audit": {"factsPreserved": True, "noUnsupportedPromise": True, "noSpoiler": True},
            }],
        }],
        "closing": {
            "text": "The most revealing question may be the one still waiting beyond these pages.",
            "selectedHookIds": ["selected-hook-001"],
            "sourceUnitIds": ["u000002"],
            "audit": {"factsPreserved": True, "noUnsupportedPromise": True, "noSpoiler": True},
        },
        "audit": {"sameLanguage": True, "salesPageShape": True, "subtleClosing": True, "notes": ""},
    }
    assert 250 <= word_count(draft_text(value)) <= 300
    _write(job_dir / "draft.json", value)
    return value


def _review(job_dir: Path, draft: dict) -> None:
    draft_path = job_dir / "draft.json"
    value = {
        "draftSha256": sha256(draft_path.read_bytes()).hexdigest(),
        "paragraphs": [
            {"location": "hero:title", "spoilerRisk": False, "matchedRevelationIds": [], "notes": ""},
            {"location": "hero:dek", "spoilerRisk": False, "matchedRevelationIds": [], "notes": ""},
            {"location": "section-01:p001", "spoilerRisk": False, "matchedRevelationIds": [], "notes": ""},
            {"location": "closing:p001", "spoilerRisk": False, "matchedRevelationIds": [], "notes": ""},
        ],
        "passed": True,
        "answersWithheld": True,
        "twistsWithheld": True,
        "openLoopsPreserved": True,
        "notes": "",
    }
    _write(job_dir / "review.json", value)


def _complete(tmp_path: Path, *, comprehensive: bool = False, mode: str = "nonfiction") -> tuple[Path, Path, dict]:
    source = _book(tmp_path, comprehensive=comprehensive)
    job_dir = tmp_path / "job"
    prepare_job(source, job_dir=job_dir)
    analysis = _analysis(job_dir, mode=mode)
    _synthesis(job_dir, analysis, mode=mode)
    draft = _draft(job_dir)
    _review(job_dir, draft)
    return source, job_dir, draft


def test_adaptive_budget_boundaries() -> None:
    assert _budget(5_000) == (275, 250, 300)
    assert _budget(5_001) == (425, 375, 475)
    assert _budget(20_000) == (425, 375, 475)
    assert _budget(20_001) == (600, 550, 650)


def test_prepare_rejects_non_html(tmp_path: Path) -> None:
    source = tmp_path / "book.md"
    source.write_text("# Book", encoding="utf-8")
    with pytest.raises(MarketingSummaryError, match="html or .htm"):
        prepare_job(source)


def test_prepare_detects_comprehensive_summary_and_excludes_map(tmp_path: Path) -> None:
    source = _book(tmp_path, comprehensive=True)
    result = prepare_job(source, job_dir=tmp_path / "job")
    assert result["sourceKind"] == "comprehensive-summary"
    batch_text = " ".join(
        unit["text"]
        for path in (tmp_path / "job" / "batches").glob("*.json")
        for unit in json.loads(path.read_text())["units"]
    )
    assert "Secret map data" not in batch_text


def test_prepare_excludes_romanian_bibliography(tmp_path: Path) -> None:
    source = tmp_path / "romanian.html"
    source.write_text(
        '<html lang="ro"><body><h1>Cartea</h1><p>O întrebare importantă deschide această cercetare amplă pentru cititori.</p>'
        '<h1>Bibliografie selectivă</h1><p>Autor, Titlu, Editură, București.</p></body></html>',
        encoding="utf-8",
    )
    prepare_job(source, job_dir=tmp_path / "job")
    context = json.loads((tmp_path / "job" / "context.json").read_text())
    assert any(item["title"] == "Bibliografie selectivă" for item in context["excluded"])


def test_status_advances_and_build_preserves_source(tmp_path: Path) -> None:
    source, job_dir, _draft_value = _complete(tmp_path)
    original = source.read_bytes()
    assert job_status(job_dir)["status"] == "ready_to_build"
    result = build_job(job_dir)
    assert result["status"] == "passed"
    assert source.read_bytes() == original
    assert validate_marketing_summary(source, Path(result["artifact"]))["status"] == "passed"
    html = Path(result["artifact"]).read_text(encoding="utf-8")
    assert "reading-time" not in html
    assert "data-source-units" not in html
    assert "data-source-map" not in html


def test_fiction_job_builds_with_twist_withheld(tmp_path: Path) -> None:
    _source, job_dir, _draft_value = _complete(tmp_path, mode="fiction")
    result = build_job(job_dir)
    assert result["status"] == "passed"
    assert validate_marketing_summary(_source, Path(result["artifact"]))["status"] == "passed"
    html = Path(result["artifact"]).read_text(encoding="utf-8")
    assert '<meta name="marketing-summary-mode" content="fiction">' in html


def test_guard_phrase_blocks_answer_even_after_review(tmp_path: Path) -> None:
    _source, job_dir, draft = _complete(tmp_path)
    draft["closing"]["text"] = "The final answer is hidden while every difficult question still invites thoughtful reading."
    _write(job_dir / "draft.json", draft)
    _review(job_dir, draft)
    with pytest.raises(MarketingSummaryError, match="protected spoiler guard phrases"):
        build_job(job_dir)


def test_stale_review_returns_to_review_stage(tmp_path: Path) -> None:
    _source, job_dir, draft = _complete(tmp_path)
    draft["dek"] += " Curiosity remains."
    _write(job_dir / "draft.json", draft)
    assert job_status(job_dir)["status"] == "review_required"
