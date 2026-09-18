"""Owned workspaces, chapter cache, resumable synthesis and atomic publication."""
from __future__ import annotations

from contextlib import contextmanager
from dataclasses import replace
import fcntl
import json
import os
from pathlib import Path
import tempfile
import time
import sys
import uuid

from .book import Book, BookError, digest, write_epub
from .media import file_hash, package, probe, validate
from .runtime import Engine, discover, doctor, run

OWNER = "html2audiobook-skill"


def write_json(path: Path, value: object) -> None:
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("w", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)


def destination(book: Book, override: str | None = None) -> Path:
    source = Path(book.source)
    result = Path(override).expanduser().absolute() if override else source.with_name(source.stem + "-audiobook")
    if result.is_symlink():
        raise BookError("Output directory cannot be a symlink.")
    result = result.resolve()
    if result == source.parent or result == source or source.is_relative_to(result):
        raise BookError("Output must be a separate directory, not the source or its parent.")
    return result


@contextmanager
def workspace(output: Path):
    output.parent.mkdir(parents=True, exist_ok=True)
    work = output.with_name(f".{output.name}.html2audiobook-work")
    if work.is_symlink():
        raise BookError("Work directory cannot be a symlink.")
    if work.exists():
        try:
            marker = json.loads((work / "owner.json").read_text())
        except (OSError, ValueError) as exc:
            raise BookError(f"Refusing unrelated work directory: {work}") from exc
        if marker != {"owner": OWNER, "output": str(output)}:
            raise BookError(f"Work directory belongs to another task: {work}")
    else:
        work.mkdir()
        write_json(work / "owner.json", {"owner": OWNER, "output": str(output)})
    with (work / "lock").open("a") as lock:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise BookError("Another conversion is using this output directory.") from exc
        try:
            yield work
        finally:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def prepare(book: Book, work: Path) -> dict:
    write_json(work / "prepared.json", book.data())
    write_epub(book, work / "book.epub")
    return {"status": "prepared", "manifest": str(work / "prepared.json"),
            "epub": str(work / "book.epub"), "chapters": len(book.chapters),
            "language": book.language, "voice": book.voice, "speed": book.speed,
            "warnings": book.warnings}


def engine_identity(engine: Engine) -> str:
    files = [engine.home / p for p in ("app.py", "lib/core.py", "lib/conf_models.py",
             "lib/classes/tts_engines/piper.py", "lib/classes/tts_engines/common/utils.py")]
    bridge = Path(__file__).with_name("engine_bridge.py")
    return digest([str(engine.home)] + [file_hash(p) for p in files if p.is_file()] + [file_hash(bridge)])


def synthesize(book: Book, index: int, work: Path, engine: Engine, identity: str) -> tuple[Path, bool]:
    chapter = book.chapters[index]
    key = digest({"paragraphs": chapter.paragraphs, "heading_indices": chapter.heading_indices, "lang": book.language,
                  "voice": book.voice, "engine": identity})
    cache = work / "cache" / key
    cache.mkdir(parents=True, exist_ok=True)
    wave = cache / "audio.wav"
    complete = cache / "complete.json"
    if wave.is_file() and complete.is_file():
        saved = json.loads(complete.read_text())
        if saved.get("key") == key and saved.get("sha256") == file_hash(wave):
            probe(wave)
            return wave, True
    job = Path(tempfile.mkdtemp(prefix="attempt-", dir=cache))
    raw = job / "raw"
    raw.mkdir()
    epub_path = job / "chapter.epub"
    write_epub(replace(book, chapters=[chapter]), epub_path)
    audit_path = job / "audit.json"
    request = {"engine_home": str(engine.home), "job_dir": str(job), "epub": str(epub_path),
               "raw_output": str(raw), "audit": str(audit_path), "language": book.language,
               "voice": book.voice, "paragraphs": chapter.paragraphs,
               "heading_indices": chapter.heading_indices}
    request_path = job / "request.json"
    write_json(request_path, request)
    bridge = Path(__file__).with_name("engine_bridge.py")
    run([str(engine.python), str(bridge), str(request_path)], cwd=engine.home, log=job / "engine.log")
    if not audit_path.is_file():
        raise BookError(f"Engine did not produce a narration audit. See {job}")
    audit = json.loads(audit_path.read_text())
    if not all(audit.get(k) for k in ("epub_matches_manifest", "segmentation_preserves_text", "synthesis_completed")):
        raise BookError(f"Narration audit failed. See {audit_path}")
    results = list(raw.glob("*.wav"))
    if len(results) != 1:
        raise BookError(f"Expected one chapter WAV, received {len(results)}. See {job}")
    normalized = cache / "audio.pending.wav"
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(results[0]), "-vn",
         "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(normalized)])
    probe(normalized)
    normalized.replace(wave)
    write_json(complete, {"key": key, "sha256": file_hash(wave), "audit": audit})
    return wave, False


def convert(book: Book, output: Path, work: Path, *, overwrite: bool = False,
            engine_home: str | None = None, engine_python: str | None = None) -> dict:
    started = time.monotonic()
    if output.exists():
        if not overwrite:
            raise BookError(f"Output exists: {output}. Use --overwrite to replace this skill's output.")
        try:
            owner = json.loads((output / "report.json").read_text()).get("owner")
        except (OSError, ValueError) as exc:
            raise BookError("Refusing to overwrite an unrelated directory.") from exc
        if owner != OWNER:
            raise BookError("Refusing to overwrite an unrelated directory.")
    engine = discover(engine_home, engine_python)
    dependencies = doctor(engine_home, engine_python)
    if not engine or dependencies["status"] != "ready":
        raise BookError("Conversion runtime missing. Run html2audiobook doctor; install ebook2audiobook "
                        "and set EBOOK2AUDIOBOOK_HOME. FFmpeg and FFprobe are required.")
    prepare(book, work)
    identity = engine_identity(engine)
    waves = []
    reused = 0
    for index in range(len(book.chapters)):
        print(f"Chapter {index + 1}/{len(book.chapters)}: {book.chapters[index].title}", flush=True, file=sys.stderr)
        wave, cached = synthesize(book, index, work, engine, identity)
        waves.append(wave)
        reused += int(cached)
        write_json(work / "progress.json", {"completed_chapters": index + 1, "total_chapters": len(book.chapters),
                                            "reused_chapters": reused, "source_hash": book.source_hash})
    staging = Path(tempfile.mkdtemp(prefix="delivery-", dir=work))
    media = package(book, waves, staging)
    report = {"owner": OWNER, "title": book.title, "author": book.author, "source": book.source,
              "source_hash": book.source_hash, "language": book.language, "voice": book.voice,
              "speed": book.speed, "warnings": book.warnings, "reused_chapters": reused,
              "listening_review": "not_performed", **media}
    write_json(staging / "report.json", report)
    report["validation"] = validate(staging)
    report["processing_seconds"] = round(time.monotonic() - started, 2)
    write_json(staging / "report.json", report)
    backup = None
    if output.exists():
        backup = work / f"previous-delivery-{uuid.uuid4().hex}"
        output.rename(backup)
    try:
        staging.rename(output)
    except BaseException:
        if backup is not None and not output.exists():
            backup.rename(output)
        raise
    return {"status": "passed", "artifact": str(output / "book.m4b"),
            "mp3_directory": str(output / "chapters"), "report": str(output / "report.json"),
            "previous_delivery": str(backup) if backup else None, "warnings": book.warnings,
            "reused_chapters": reused, "duration_seconds": media["duration_seconds"]}
