from dataclasses import replace
import json
from pathlib import Path
import shutil
import sys
from types import SimpleNamespace

import pytest

from html2audiobook_skill.book import Book, BookError, Chapter, write_epub
from html2audiobook_skill.engine_bridge import ascii_url, configure_voice_downloads, install_hooks
from html2audiobook_skill import pipeline
from html2audiobook_skill.media import package, validate
from html2audiobook_skill.runtime import Engine, run


@pytest.fixture
def book(tmp_path):
    return Book(str(tmp_path / "input.html"), "source-hash", 'Titlu = „Carte”', "Ana", "ro",
                "ro_RO-mihai-medium", 1.0,
                [Chapter("Început", ["Început", "Știința are întrebări."]), Chapter("Anexă", ["Anexă", "Sfârșit."])], [])


@pytest.fixture
def waves(tmp_path):
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        pytest.skip("FFmpeg integration tests require ffmpeg and ffprobe")
    paths = []
    for i in range(2):
        path = tmp_path / f"audio {i}.wav"
        run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", f"sine=frequency={220+i*100}:duration=1.2",
             "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(path)])
        paths.append(path)
    return paths


@pytest.mark.parametrize("speed", [0.5, 1.0, 1.5, 2.0])
def test_actual_ffmpeg_packaging_and_validation(tmp_path, book, waves, speed):
    output = tmp_path / "delivery"
    output.mkdir()
    book = replace(book, speed=speed)
    report = {"owner": pipeline.OWNER, "title": book.title, "author": book.author, **package(book, waves, output)}
    pipeline.write_json(output / "report.json", report)
    result = validate(output)
    assert result["status"] == "passed"
    assert result["chapters"] == 2
    assert abs(result["duration_seconds"] - 2.4 / speed) < 0.2
    (output / "chapters/0001.mp3").write_bytes(b"broken")
    with pytest.raises(BookError):
        validate(output)


def test_bridge_checks_input_before_synthesis(tmp_path, book):
    epub = tmp_path / "chapter.epub"
    book = replace(book, chapters=book.chapters[:1])
    write_epub(book, epub)
    request = {"epub": str(epub), "paragraphs": book.chapters[0].paragraphs,
               "voice": book.voice, "audit": str(tmp_path / "audit.json")}
    with pytest.raises(RuntimeError, match="differs"):
        install_hooks(None, None, {**request, "paragraphs": ["Wrong text"]})
    session = {"blocks_current": {"blocks": [{"keep": True, "text": "\n".join(request["paragraphs"])}]}}
    called = []
    core = SimpleNamespace(**{name: lambda *a: None for name in
                             ("convert2epub", "get_blocks", "get_sentences", "convert_ebook")},
                           context=SimpleNamespace(get_session=lambda _: session),
                           finalize_audiobook=lambda _: (called.append(True), True))
    class Piper:
        def load_engine(self):
            return object()
    audit = install_hooks(core, Piper, request)
    core.finalize_audiobook("session")
    assert called and audit["synthesis_completed"]
    assert session["cover"] is None
    session["blocks_current"]["blocks"][0]["text"] = "Missing prose"
    with pytest.raises(RuntimeError, match="differ"):
        core.finalize_audiobook("session")


def test_resume_and_overwrite_preserve_previous_delivery(tmp_path, book, waves, monkeypatch):
    engine = Engine(tmp_path, Path(sys.executable))
    monkeypatch.setattr(pipeline, "discover", lambda *a: engine)
    monkeypatch.setattr(pipeline, "doctor", lambda *a: {"status": "ready"})
    monkeypatch.setattr(pipeline, "engine_identity", lambda _: "engine")
    cached = set()
    interrupted = [True]

    def fake_synthesis(book, index, *args):
        if index == 1 and interrupted[0]:
            interrupted[0] = False
            raise KeyboardInterrupt
        reused = index in cached
        cached.add(index)
        return waves[index], reused

    monkeypatch.setattr(pipeline, "synthesize", fake_synthesis)
    output = tmp_path / "audiobook"
    with pipeline.workspace(output) as work:
        with pytest.raises(KeyboardInterrupt):
            pipeline.convert(book, output, work)
        assert not output.exists()
        assert json.loads((work / "progress.json").read_text())["completed_chapters"] == 1
        result = pipeline.convert(book, output, work)
        assert result["reused_chapters"] == 1
        with pytest.raises(BookError, match="Output exists"):
            pipeline.convert(book, output, work)
        replaced = pipeline.convert(book, output, work, overwrite=True)
        assert Path(replaced["previous_delivery"]).is_dir()
        assert validate(output)["status"] == "passed"


def test_real_cache_invalidation(tmp_path, book, waves, monkeypatch):
    calls = []
    original_run = pipeline.run

    def external(command, **kwargs):
        if command[0] == sys.executable:
            request = json.loads(Path(command[-1]).read_text())
            calls.append(request)
            shutil.copyfile(waves[0], Path(request["raw_output"]) / "chapter.wav")
            pipeline.write_json(Path(request["audit"]), {"epub_matches_manifest": True,
                                "segmentation_preserves_text": True, "synthesis_completed": True})
            return ""
        return original_run(command, **kwargs)

    monkeypatch.setattr(pipeline, "run", external)
    engine = Engine(tmp_path, Path(sys.executable))
    work = tmp_path / "work"
    work.mkdir()
    assert pipeline.synthesize(book, 0, work, engine, "engine")[1] is False
    assert pipeline.synthesize(book, 0, work, engine, "engine")[1] is True
    assert pipeline.synthesize(replace(book, speed=1.5), 0, work, engine, "engine")[1] is True
    changed = replace(book, chapters=[Chapter("New", ["Changed prose."])])
    assert pipeline.synthesize(changed, 0, work, engine, "engine")[1] is False
    assert len(calls) == 2
    headings = replace(book, chapters=[replace(book.chapters[0], heading_indices=[0])])
    assert pipeline.synthesize(headings, 0, work, engine, "engine")[1] is False
    assert calls[-1]["heading_indices"] == [0]
    assert pipeline.synthesize(headings, 0, work, engine, "engine")[1] is True


def test_unicode_voice_urls_and_atomic_downloads(tmp_path):
    assert ascii_url("https://example.com/pt/tugão/file?download=true") == "https://example.com/pt/tug%C3%A3o/file?download=true"
    assert ascii_url("https://example.com/tug%C3%A3o") == "https://example.com/tug%C3%A3o"
    attempts = []
    def original(voice, path, force_redownload=False):
        attempts.append(voice)
        (path / f"{voice}.onnx").write_bytes(b"model")
        if len(attempts) == 1:
            raise OSError("interrupted download")
        (path / f"{voice}.onnx.json").write_text('{}')
    downloader = SimpleNamespace(urlopen=lambda url: url, download_voice=original)
    configure_voice_downloads(downloader)
    with pytest.raises(OSError):
        downloader.download_voice("voice", tmp_path)
    assert not (tmp_path / "voice.onnx").exists()
    downloader.download_voice("voice", tmp_path)
    downloader.download_voice("voice", tmp_path)
    assert attempts == ["voice", "voice"]
