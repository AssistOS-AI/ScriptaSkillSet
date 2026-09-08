from __future__ import annotations

import json
from pathlib import Path
import re

from bs4 import BeautifulSoup
import pytest

from translatehtml_skill.core import (
    BATCH_MAXIMUM_CHARS,
    TranslateHtmlError,
    _batch_units,
    _bootstrap_pages,
    build_job,
    job_status,
    prepare_job,
    rewrite_css_urls,
    rewrite_reference,
    rewrite_srcset,
)


def _source_book(tmp_path: Path) -> Path:
    source = tmp_path / "book" / "en" / "index.html"
    assets = source.parent / "assets"
    (assets / "images").mkdir(parents=True)
    (assets / "styles.css").write_text("body { color: black; }", encoding="utf-8")
    (assets / "images" / "figure.png").write_bytes(b"png")
    source.write_text(
        """<!doctype html><html lang="en"><head><title>Example book</title>
        <link rel="stylesheet" href="assets/styles.css"><style>.x{color:red}</style></head>
        <body><main data-reader-content><section data-source-page="1">
        <h1>A <strong>careful</strong> title</h1>
        <p>Hello <em>thoughtful</em> reader.</p>
        <p aria-label="Closing paragraph">A short final paragraph.</p>
        <img src="assets/images/figure.png" alt="A blue figure">
        </section></main><script>window.reader = true;</script></body></html>""",
        encoding="utf-8",
    )
    return source


def _complete_job(job_dir: Path) -> None:
    job = json.loads((job_dir / "job.json").read_text(encoding="utf-8"))
    context = json.loads((job_dir / "context.json").read_text(encoding="utf-8"))
    context.update({
        "bootstrapReviewed": True,
        "documentProfile": "Use clear Romanian prose.",
        "glossary": [],
    })
    (job_dir / "context.json").write_text(
        json.dumps(context, ensure_ascii=False), encoding="utf-8"
    )
    token_pattern = re.compile(r"⟦(?:OPEN|CLOSE|VOID):T\d{6}⟧|⟦PROTECT:P\d{6}⟧")
    word_pattern = re.compile(r"[^\W\d_]+", re.UNICODE)
    word_number = 0

    def translated_text(source: str) -> str:
        nonlocal word_number
        pieces: list[str] = []
        cursor = 0
        base = "ترجمة" if job["targetLanguage"] == "ar" else "traducere"

        def replace_word(_: re.Match[str]) -> str:
            nonlocal word_number
            word_number += 1
            return f"{base}{word_number}"

        for match in token_pattern.finditer(source):
            segment = source[cursor:match.start()]
            pieces.append(word_pattern.sub(replace_word, segment))
            pieces.append(match.group(0))
            cursor = match.end()
        pieces.append(word_pattern.sub(replace_word, source[cursor:]))
        return "".join(pieces)

    for name in job["batches"]:
        batch = json.loads((job_dir / "batches" / name).read_text(encoding="utf-8"))
        translated = [
            {
                "id": unit["id"],
                "translation": translated_text(unit["source"]),
            }
            for unit in batch["units"]
            if not unit.get("reuseOf") and not unit.get("reuseTemplateOf")
        ]
        (job_dir / "translations" / name).write_text(
            json.dumps({"units": translated}, ensure_ascii=False), encoding="utf-8"
        )


def test_prepare_extracts_units_and_defaults_to_sibling_language(tmp_path: Path) -> None:
    source = _source_book(tmp_path)
    original = source.read_bytes()
    job_dir = tmp_path / "job"
    result = prepare_job(source, target_language="ro", job_dir=job_dir)
    job = json.loads((job_dir / "job.json").read_text(encoding="utf-8"))
    units = []
    for name in job["batches"]:
        units.extend(json.loads((job_dir / "batches" / name).read_text())["units"])

    assert result["output"].endswith("/book/ro/index.html")
    assert source.read_bytes() == original
    assert any("⟦OPEN:T" in unit["source"] for unit in units)
    assert any(unit["kind"] == "attribute:alt" for unit in units)
    assert "window.reader" in (job_dir / "template.html").read_text()
    status = job_status(job_dir)
    assert status["completedBatches"] == 0
    assert status["nextBatch"] == job["batches"][0]


def test_default_job_stays_inside_document_workspace(tmp_path: Path) -> None:
    source = _source_book(tmp_path)
    result = prepare_job(source, target_language="es")

    assert Path(result["job"]).parent == source.parent.parent / ".translatehtml-jobs"


def test_first_batch_is_bootstrap_without_page_sections(tmp_path: Path) -> None:
    source = tmp_path / "book" / "en" / "index.html"
    source.parent.mkdir(parents=True)
    source.write_text(
        "<!doctype html><html lang='en'><head><title>Title</title></head>"
        "<body><p>A paragraph without PDF page metadata.</p></body></html>",
        encoding="utf-8",
    )
    job_dir = tmp_path / "job"
    prepare_job(source, target_language="ro", job_dir=job_dir)
    job = json.loads((job_dir / "job.json").read_text(encoding="utf-8"))
    first = json.loads(
        (job_dir / "batches" / job["batches"][0]).read_text(encoding="utf-8")
    )

    assert first["bootstrap"] is True
    assert job_status(job_dir)["readyBatches"] == [job["batches"][0]]


def test_status_advances_only_for_a_complete_batch(tmp_path: Path) -> None:
    source = _source_book(tmp_path)
    job_dir = tmp_path / "job"
    prepare_job(source, target_language="ro", job_dir=job_dir)
    _complete_job(job_dir)
    status = job_status(job_dir)
    assert status["status"] == "ready_to_build"
    assert status["remainingBatches"] == 0
    assert status["completedUnits"] == status["units"]


def test_build_preserves_structure_and_references_source_assets(tmp_path: Path) -> None:
    source = _source_book(tmp_path)
    job_dir = tmp_path / "job"
    prepare_job(source, target_language="ro", job_dir=job_dir)
    _complete_job(job_dir)

    result = build_job(job_dir)
    target = Path(result["artifact"])
    soup = BeautifulSoup(target.read_text(encoding="utf-8"), "html.parser")
    source_soup = BeautifulSoup(source.read_text(encoding="utf-8"), "html.parser")

    assert result["status"] in {"passed", "passed_with_warnings"}
    assert soup.html["lang"] == "ro"
    assert soup.link["href"] == "../en/assets/styles.css"
    assert soup.img["src"] == "../en/assets/images/figure.png"
    assert soup.find("meta", attrs={"name": "translation-generator"})["content"] == "translatehtml-skill"
    assert soup.script.string == source_soup.script.string
    assert len(soup.find_all("p")) == len(source_soup.find_all("p"))
    assert soup.strong is not None and soup.em is not None


def test_build_rejects_changed_placeholder(tmp_path: Path) -> None:
    source = _source_book(tmp_path)
    job_dir = tmp_path / "job"
    prepare_job(source, target_language="ro", job_dir=job_dir)
    _complete_job(job_dir)
    job = json.loads((job_dir / "job.json").read_text())
    path = job_dir / "translations" / job["batches"][0]
    payload = json.loads(path.read_text())
    changed = next(unit for unit in payload["units"] if "⟦OPEN:T" in unit["translation"])
    changed["translation"] = changed["translation"].replace("⟦OPEN:", "⟦BROKEN:", 1)
    path.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(TranslateHtmlError, match="placeholder"):
        build_job(job_dir)


def test_bootstrap_uses_first_two_prose_dominant_pages() -> None:
    prose = " ".join(["narrative"] * 170)
    soup = BeautifulSoup(
        f"""<html><body>
        <section data-source-page="1"><img src="cover.png"></section>
        <section data-source-page="2"><table><tr><td>Contents</td></tr></table></section>
        <section data-source-page="3"><p>{prose}</p><p>{prose}</p></section>
        <section data-source-page="4"><p>{prose}</p><p>{prose}</p></section>
        </body></html>""",
        "html.parser",
    )
    assert _bootstrap_pages(soup) == ["3", "4"]


def test_batches_target_approximately_32000_model_characters() -> None:
    units = [
        {"id": f"u{index}", "page": str(index), "source": "x" * 10_000}
        for index in range(1, 5)
    ]
    batches = _batch_units(units, set())

    assert BATCH_MAXIMUM_CHARS == 32_000
    assert [sum(len(unit["source"]) for unit in batch) for batch in batches] == [
        30_000,
        10_000,
    ]


def test_translation_memory_reuses_exact_text_and_numbered_labels(tmp_path: Path) -> None:
    source = tmp_path / "book" / "en" / "index.html"
    source.parent.mkdir(parents=True)
    source.write_text(
        """<!doctype html><html lang="en"><head><title>Memory example</title></head>
        <body><main>
        <section data-source-page="1" aria-label="PDF page 1"><p>Repeated text.</p></section>
        <section data-source-page="2" aria-label="PDF page 2"><p>Repeated text.</p></section>
        <section data-source-page="3" aria-label="PDF page 3"><p>Different text.</p></section>
        </main></body></html>""",
        encoding="utf-8",
    )
    job_dir = tmp_path / "job"
    result = prepare_job(source, target_language="ro", job_dir=job_dir)
    job = json.loads((job_dir / "job.json").read_text(encoding="utf-8"))
    units = []
    for name in job["batches"]:
        units.extend(json.loads((job_dir / "batches" / name).read_text())["units"])

    assert result["translationMemory"] == {
        "exactMatches": 1,
        "templatedLabels": 2,
        "modelUnitsSaved": 3,
    }
    assert sum("reuseOf" in unit for unit in units) == 1
    assert sum("reuseTemplateOf" in unit for unit in units) == 2

    _complete_job(job_dir)
    target = Path(build_job(job_dir)["artifact"])
    soup = BeautifulSoup(target.read_text(encoding="utf-8"), "html.parser")
    labels = [section["aria-label"] for section in soup.select("section[aria-label]")]
    assert [re.search(r"\d+$", label).group(0) for label in labels] == ["1", "2", "3"]
    assert soup.find_all("p")[0].get_text() == soup.find_all("p")[1].get_text()


def test_status_exposes_parallel_batches_after_reviewed_bootstrap(tmp_path: Path) -> None:
    job_dir = tmp_path / "job"
    (job_dir / "batches").mkdir(parents=True)
    (job_dir / "translations").mkdir()
    names = [f"batch-{index:04d}.json" for index in range(1, 4)]
    job = {
        "source": "/tmp/source.html",
        "output": "/tmp/output.html",
        "sourceLanguage": "en",
        "targetLanguage": "ro",
        "unitCount": 3,
        "modelUnitCount": 3,
        "batches": names,
        "translationMemory": {
            "exactMatches": 0,
            "templatedLabels": 0,
            "modelUnitsSaved": 0,
        },
        "parallelTranslation": {"maxBatches": 4},
    }
    (job_dir / "job.json").write_text(json.dumps(job), encoding="utf-8")
    for index, name in enumerate(names, start=1):
        payload = {
            "bootstrap": index == 1,
            "units": [{"id": f"u{index}", "source": f"Text {index}"}],
        }
        (job_dir / "batches" / name).write_text(json.dumps(payload), encoding="utf-8")
    (job_dir / "context.json").write_text(
        json.dumps({"bootstrapReviewed": False, "documentProfile": ""}),
        encoding="utf-8",
    )

    assert job_status(job_dir)["readyBatches"] == [names[0]]
    (job_dir / "translations" / names[0]).write_text(
        json.dumps({"units": [{"id": "u1", "translation": "Text tradus 1"}]}),
        encoding="utf-8",
    )
    (job_dir / "context.json").write_text(
        json.dumps({"bootstrapReviewed": True, "documentProfile": "Clear prose."}),
        encoding="utf-8",
    )

    status = job_status(job_dir)
    assert status["readyBatches"] == names[1:]
    assert status["recommendedParallelBatches"] == 2


def test_reference_rewriting_handles_queries_srcset_and_css(tmp_path: Path) -> None:
    source = tmp_path / "book" / "en" / "index.html"
    target = tmp_path / "book" / "ro" / "index.html"
    assert rewrite_reference("assets/a.png?v=1#x", source, target) == "../en/assets/a.png?v=1#x"
    assert rewrite_reference("#page_2", source, target) == "#page_2"
    assert rewrite_reference("https://example.com/a", source, target) == "https://example.com/a"
    assert rewrite_srcset("assets/a.png 1x, assets/b.png 2x", source, target) == (
        "../en/assets/a.png 1x, ../en/assets/b.png 2x"
    )
    assert rewrite_css_urls("background:url('assets/a.png')", source, target) == (
        "background:url('../en/assets/a.png')"
    )


def test_rtl_target_sets_document_direction(tmp_path: Path) -> None:
    source = _source_book(tmp_path)
    job_dir = tmp_path / "job"
    prepare_job(source, target_language="ar", job_dir=job_dir)
    _complete_job(job_dir)
    target = Path(build_job(job_dir)["artifact"])
    soup = BeautifulSoup(target.read_text(encoding="utf-8"), "html.parser")
    assert soup.html["lang"] == "ar"
    assert soup.html["dir"] == "rtl"
