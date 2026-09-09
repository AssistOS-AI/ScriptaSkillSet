from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path

import pytest

from shortdescription_skill.core import (
    ShortDescriptionError,
    _guard_leaks,
    build_job,
    job_status,
    normalize_language,
    prepare_job,
    split_sentences,
)


def _source(path: Path, *, marker: str = "") -> Path:
    article_attr = " data-marketing-summary" if "marketing-summary-generator" in marker else ""
    path.write_text(
        f"""<!doctype html><html lang="en"><head><title>Test Book</title>{marker}</head><body>
        <article{article_attr}><h1>Questions of evidence</h1>
        <p>The book examines how evidence shapes public judgment.</p>
        <p>It asks why uncertainty creates tension between institutions and individuals.</p>
        <p>The final answer recommends a confidential verification framework for institutions.</p>
        </article></body></html>""",
        encoding="utf-8",
    )
    return path


def _fiction_source(path: Path) -> Path:
    path.write_text(
        """<!doctype html><html lang="en"><head><title>The Silent City</title></head><body><article>
        <h1>An unknown city</h1><p>The story follows a traveler entering an isolated city.</p>
        <p>Memory and identity come under pressure as the traveler questions the city's past.</p>
        <p>The initial conflict concerns trust, belonging, and hidden history.</p>
        <p>The ending reveals that the guide is the lost ruler.</p></article></body></html>""",
        encoding="utf-8",
    )
    return path


def _complete_job(job_dir: Path, *, mode: str = "nonfiction") -> None:
    job = json.loads((job_dir / "job.json").read_text(encoding="utf-8"))
    chapter_themes: dict[str, list[str]] = {chapter: [] for chapter in job["contentChapterIds"]}
    all_themes: list[tuple[str, str, str]] = []
    revelations: list[str] = []
    for name in job["batchNames"]:
        batch = json.loads((job_dir / "batches" / name).read_text(encoding="utf-8"))
        theme_id = f"{name[:-5]}-theme-001"
        unit_id = batch["units"][0]["id"]
        all_themes.append((theme_id, unit_id, batch["chapterId"]))
        chapter_themes[batch["chapterId"]].append(theme_id)
        protected = []
        if not revelations:
            revelation_id = f"{name[:-5]}-revelation-001"
            revelations.append(revelation_id)
            fiction = mode == "fiction"
            protected.append({
                "id": revelation_id,
                "type": "ending" if fiction else "solution",
                "statement": "The ending reveals that the guide is the lost ruler." if fiction else "The final answer recommends a confidential verification framework for institutions.",
                "guardTerms": ["guide is the lost ruler"] if fiction else ["confidential verification framework"],
                "sourceUnitIds": [batch["units"][-1]["id"]],
            })
        analysis = {
            "batch": name,
            "chapterId": batch["chapterId"],
            "segment": batch["segment"],
            "modeSignals": [mode],
            "themes": [{"id": theme_id, "type": "subject", "statement": "Evidence and public judgment", "sourceUnitIds": [unit_id]}],
            "protectedRevelations": protected,
            "audit": {"chapterCovered": True, "themeIdentified": True, "revelationsSeparated": True, "factsPreserved": True, "notes": ""},
        }
        (job_dir / "analyses" / name).write_text(json.dumps(analysis), encoding="utf-8")
    theme_id, unit_id, _chapter = all_themes[0]
    texts = (
        [
            "The story follows a traveler entering an isolated city.",
            "Its setting places memory and identity under pressure.",
            "The initial conflict grows from uncertainty about the city's past.",
            "The narrative explores trust, belonging, and hidden history.",
        ]
        if mode == "fiction"
        else [
            "The document explores the role of evidence in public judgment.",
            "Its subject connects uncertainty with institutional and individual perspectives.",
            "It focuses on questions that shape how claims are understood.",
            "The central tension concerns how people interpret uncertain evidence.",
        ]
    )
    draft = {
        "mode": mode,
        "sentences": [{"index": index, "text": text, "themeIds": [theme_id], "sourceUnitIds": [unit_id]} for index, text in enumerate(texts, 1)],
        "protectedRevelationIds": revelations,
        "chapterCoverage": [{"chapterId": chapter, "themeIds": chapter_themes[chapter]} for chapter in job["contentChapterIds"]],
        "audit": {"sameLanguage": True, "themeOnly": True, "noSolutions": True, "noSpoilers": True, "neutralTone": True, "notes": ""},
    }
    draft_path = job_dir / "draft.json"
    draft_path.write_text(json.dumps(draft), encoding="utf-8")
    review = {
        "draftSha256": sha256(draft_path.read_bytes()).hexdigest(),
        "sentences": [{"index": index, "solutionRisk": False, "spoilerRisk": False, "matchedRevelationIds": [], "notes": ""} for index in range(1, 5)],
        "passed": True,
        "solutionsWithheld": True,
        "conclusionsWithheld": True,
        "spoilersWithheld": True,
        "notes": "",
    }
    (job_dir / "review.json").write_text(json.dumps(review), encoding="utf-8")


def test_language_and_sentence_helpers() -> None:
    assert normalize_language("ro_ro") == "ro-RO"
    assert len(split_sentences("One sentence. Another question? Final answer!")) == 3
    with pytest.raises(ShortDescriptionError):
        normalize_language("und")


def test_guard_phrase_detects_protected_solution() -> None:
    analyses = [{"protectedRevelations": [{"id": "r1", "statement": "The source recommends a confidential verification framework.", "guardTerms": ["confidential verification framework"]}]}]
    assert _guard_leaks("It recommends a confidential verification framework.", analyses) == ["r1"]


def test_prepare_detects_marketing_summary_and_preserves_source(tmp_path: Path) -> None:
    marker = '<meta name="marketing-summary-generator" content="marketingsummary-skill">'
    source = _source(tmp_path / "index.marketing.html", marker=marker)
    original = source.read_bytes()
    status = prepare_job(source)
    assert status["status"] == "analysis_required"
    assert status["sourceKind"] == "marketing-summary"
    assert Path(status["output"]).name == "shortDescription.html"
    assert source.read_bytes() == original


def test_complete_build_publishes_and_removes_job(tmp_path: Path) -> None:
    source = _source(tmp_path / "index.html")
    original = source.read_bytes()
    status = prepare_job(source)
    job_dir = Path(status["job"])
    _complete_job(job_dir)
    assert job_status(job_dir)["status"] == "ready_to_build"
    result = build_job(job_dir)
    output = Path(result["artifact"])
    assert output.is_file()
    assert not job_dir.exists()
    assert source.read_bytes() == original
    assert result["metrics"]["sentences"] == 4


def test_existing_unowned_output_is_not_overwritten(tmp_path: Path) -> None:
    source = _source(tmp_path / "index.html")
    status = prepare_job(source)
    job_dir = Path(status["job"])
    _complete_job(job_dir)
    (tmp_path / "shortDescription.html").write_text("user file", encoding="utf-8")
    with pytest.raises(ShortDescriptionError, match="Output exists"):
        build_job(job_dir, overwrite=True)


def test_fiction_build_withholds_ending_and_cleans_job(tmp_path: Path) -> None:
    source = _fiction_source(tmp_path / "fiction.html")
    status = prepare_job(source)
    job_dir = Path(status["job"])
    _complete_job(job_dir, mode="fiction")
    result = build_job(job_dir)
    output = Path(result["artifact"]).read_text(encoding="utf-8")
    assert "lost ruler" not in output
    assert "traveler entering an isolated city" in output
    assert not job_dir.exists()
