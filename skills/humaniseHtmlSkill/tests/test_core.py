from __future__ import annotations

import json
from pathlib import Path

from bs4 import BeautifulSoup
import pytest

from humanisehtml_skill.core import (
    BATCH_MAXIMUM_CHARS,
    HumaniseHtmlError,
    batch_units,
    build_job,
    extract_units,
    job_status,
    prepare_job,
)


def _book(tmp_path: Path) -> Path:
    source = tmp_path / "book" / "index.html"
    assets = source.parent / "assets"
    assets.mkdir(parents=True)
    (assets / "book.css").write_text("body{color:#222}", encoding="utf-8")
    (assets / "figure.png").write_bytes(b"png")
    source.write_text(
        """<!doctype html><html lang="en"><head><title>A useful book</title>
        <meta name="description" content="A careful description">
        <link rel="stylesheet" href="assets/book.css"><style>.x{color:red}</style></head>
        <body><main data-reader-content>
        <section data-source-page="1" aria-label="PDF page 1"><h1>First chapter</h1>
        <p>It is important to note that the result in 2024 was <em>carefully</em> tested.</p>
        <p>Repeated editorial sentence.</p></section>
        <section data-source-page="2" aria-label="PDF page 2"><p>Repeated editorial sentence.</p>
        <figure><img src="assets/figure.png" alt="A blue diagram"><figcaption>Measured at 42%.</figcaption></figure></section>
        <section data-source-page="3"><h1>Bibliography</h1><p>Doe, J. (2020). Example. doi:10.1000/xyz123</p></section>
        </main><script>window.reader = true;</script></body></html>""",
        encoding="utf-8",
    )
    return source


def _approve_profile(job_dir: Path) -> None:
    context = json.loads((job_dir / "context.json").read_text(encoding="utf-8"))
    context.update({
        "profileReviewed": True,
        "documentProfile": "Clear, restrained expository English; preserve technical terms.",
        "preserveTerms": ["doi"],
        "avoidPatterns": ["It is important to note"],
    })
    (job_dir / "context.json").write_text(json.dumps(context), encoding="utf-8")


def _complete_with_keeps(job_dir: Path, rewrite_first: bool = False) -> None:
    job = json.loads((job_dir / "job.json").read_text(encoding="utf-8"))
    rewritten = False
    for name in job["batches"]:
        batch = json.loads((job_dir / "batches" / name).read_text(encoding="utf-8"))
        entries = []
        for unit in batch["units"]:
            if unit.get("reuseOf"):
                continue
            action, text = "keep", unit["source"]
            if rewrite_first and not rewritten and unit["kind"] == "p" and unit["policy"] == "editable":
                text = text.replace("It is important to note that ", "")
                if text != unit["source"]:
                    action, rewritten = "rewrite", True
            entries.append({
                "id": unit["id"], "action": action, "text": text,
                "audit": {
                    "meaningPreserved": True, "factsPreserved": True,
                    "natural": True, "noSlop": True, "notes": "",
                },
            })
        (job_dir / "rewrites" / name).write_text(
            json.dumps({"units": entries}, ensure_ascii=False), encoding="utf-8"
        )


def test_prepare_is_local_unversioned_and_preserves_every_text_kind(tmp_path: Path) -> None:
    source = _book(tmp_path)
    original = source.read_bytes()
    result = prepare_job(source)
    job_dir = Path(result["job"])
    job = json.loads((job_dir / "job.json").read_text(encoding="utf-8"))
    units = []
    for name in job["batches"]:
        units.extend(json.loads((job_dir / "batches" / name).read_text())["units"])

    assert Path(result["output"]) == source.with_name("index.humanised.html")
    assert job_dir.parent == source.parent / ".humanisehtml-jobs"
    assert "version" not in job
    assert source.read_bytes() == original == (job_dir / "source-original.html").read_bytes()
    assert {"title", "h1", "p", "figcaption", "attribute:alt", "attribute:aria-label"} <= {u["kind"] for u in units}
    assert any("⟦OPEN:T" in unit["source"] for unit in units)
    assert any("⟦PROTECT:P" in unit["source"] for unit in units)
    assert any(unit.get("reuseOf") for unit in units)
    assert "window.reader" in (job_dir / "template.html").read_text()


def test_h1_chapters_and_bibliography_are_verify_only(tmp_path: Path) -> None:
    soup = BeautifulSoup(_book(tmp_path).read_text(encoding="utf-8"), "html.parser")
    units, chapters = extract_units(soup)
    bibliography = [unit for unit in units if unit["chapterTitle"] == "Bibliography"]

    assert [chapter["title"] for chapter in chapters] == ["Front matter", "First chapter", "Bibliography"]
    assert bibliography and all(unit["policy"] == "verify-only" for unit in bibliography)
    page_labels = [unit for unit in units if unit["kind"] == "attribute:aria-label"]
    assert page_labels and all(unit["policy"] == "verify-only" for unit in page_labels)


def test_semantic_sections_and_single_document_fallback() -> None:
    semantic = BeautifulSoup(
        "<html lang='en'><body><main><section><h2>One</h2><p>Text one.</p></section>"
        "<section><h2>Two</h2><p>Text two.</p></section></main></body></html>", "html.parser",
    )
    _units, chapters = extract_units(semantic)
    assert [chapter["title"] for chapter in chapters] == ["One", "Two"]

    fallback = BeautifulSoup("<html lang='en'><body><p>Only text.</p></body></html>", "html.parser")
    _units, chapters = extract_units(fallback)
    assert chapters == [{"id": "document", "title": "Document"}]


def test_batches_are_near_32000_and_never_split_a_unit() -> None:
    units = [
        {
            "id": f"u{index}", "chapterId": "chapter-0001" if index < 5 else "chapter-0002",
            "source": "x" * 10_000,
        }
        for index in range(1, 7)
    ]
    batches = batch_units(units)
    assert BATCH_MAXIMUM_CHARS == 32_000
    assert [len(batch) for batch in batches] == [3, 3]
    assert [sum(len(unit["source"]) for unit in batch) for batch in batches] == [30_000, 30_000]


def test_profile_gate_opens_all_batches_for_parallel_work(tmp_path: Path) -> None:
    job_dir = tmp_path / "job"
    prepare_job(_book(tmp_path), job_dir=job_dir)
    assert job_status(job_dir)["status"] == "profile_required"
    assert job_status(job_dir)["readyBatches"] == []
    _approve_profile(job_dir)
    status = job_status(job_dir)
    assert status["status"] == "in_progress"
    assert status["readyBatches"]
    assert status["recommendedParallelBatches"] == min(4, status["remainingBatches"])
    assert (job_dir / "context.sha256").is_file()

    context = json.loads((job_dir / "context.json").read_text())
    context["documentProfile"] = "A changed profile"
    (job_dir / "context.json").write_text(json.dumps(context), encoding="utf-8")
    with pytest.raises(HumaniseHtmlError, match="changed after it was frozen"):
        job_status(job_dir)


def test_build_preserves_dom_assets_language_programs_and_facts(tmp_path: Path) -> None:
    source = _book(tmp_path)
    job_dir = tmp_path / "job"
    prepare_job(source, job_dir=job_dir)
    _approve_profile(job_dir)
    _complete_with_keeps(job_dir, rewrite_first=True)

    result = build_job(job_dir)
    target = Path(result["artifact"])
    before = BeautifulSoup(source.read_text(encoding="utf-8"), "html.parser")
    after = BeautifulSoup(target.read_text(encoding="utf-8"), "html.parser")
    assert result["status"] in {"passed", "passed_with_warnings"}
    assert after.html["lang"] == "en"
    assert after.script.string == before.script.string
    assert after.link["href"] == "assets/book.css"
    assert after.img["src"] == "assets/figure.png"
    assert "2024" in after.get_text() and "42%" in after.get_text() and "10.1000/xyz123" in after.get_text()
    assert len(after.find_all("p")) == len(before.find_all("p"))
    assert after.find("meta", attrs={"name": "humanisation-generator"})["content"] == "humanisehtml-skill"


def test_strict_schema_rejects_verify_only_change_and_bad_audit(tmp_path: Path) -> None:
    job_dir = tmp_path / "job"
    prepare_job(_book(tmp_path), job_dir=job_dir)
    _approve_profile(job_dir)
    _complete_with_keeps(job_dir)
    job = json.loads((job_dir / "job.json").read_text())
    for name in job["batches"]:
        path = job_dir / "rewrites" / name
        payload = json.loads(path.read_text())
        if payload["units"]:
            payload["units"][0]["audit"]["factsPreserved"] = False
            path.write_text(json.dumps(payload), encoding="utf-8")
            break
    with pytest.raises(HumaniseHtmlError, match="affirmative audit"):
        build_job(job_dir)


def test_strict_schema_rejects_legacy_or_extra_fields(tmp_path: Path) -> None:
    job_dir = tmp_path / "job"
    prepare_job(_book(tmp_path), job_dir=job_dir)
    _approve_profile(job_dir)
    _complete_with_keeps(job_dir)
    job = json.loads((job_dir / "job.json").read_text())
    path = job_dir / "rewrites" / job["batches"][0]
    payload = json.loads(path.read_text())
    payload["version"] = 1
    path.write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(HumaniseHtmlError, match="invalid root schema"):
        build_job(job_dir)


def test_in_place_requires_explicit_flag_and_keeps_snapshot(tmp_path: Path) -> None:
    source = _book(tmp_path)
    with pytest.raises(HumaniseHtmlError, match="--in-place"):
        prepare_job(source, output=source, job_dir=tmp_path / "bad")
    job_dir = tmp_path / "in-place"
    prepare_job(source, in_place=True, job_dir=job_dir)
    _approve_profile(job_dir)
    _complete_with_keeps(job_dir)
    original = (job_dir / "source-original.html").read_bytes()
    result = build_job(job_dir)
    assert result["inPlace"] is True
    assert source.read_bytes() != original
    assert b"humanisation-generator" in source.read_bytes()
    assert (job_dir / "source-original.html").read_bytes() == original
