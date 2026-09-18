"""FFmpeg packaging and independent artifact verification."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from .book import Book, BookError, ISO3
from .runtime import run


def file_hash(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def probe(path: Path) -> dict:
    info = json.loads(run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-show_chapters", "-of", "json", str(path)]))
    if not any(s.get("codec_type") == "audio" for s in info.get("streams", [])):
        raise BookError(f"No audio stream: {path}")
    if float(info.get("format", {}).get("duration", 0)) <= 0:
        raise BookError(f"Empty audio: {path}")
    return info


def ffmeta(value: str) -> str:
    for char in ("\\", "=", ";", "#", "\n"):
        value = value.replace(char, "\\" + char)
    return value


def package(book: Book, waves: list[Path], output: Path) -> dict:
    if not waves or len(waves) != len(book.chapters):
        raise BookError("Every prepared chapter must have exactly one audio file.")
    mp3_dir = output / "chapters"
    mp3_dir.mkdir()
    entries = []
    total_ms = 0
    metadata = [";FFMETADATA1", f"title={ffmeta(book.title)}", f"language={ISO3[book.language]}"]
    if book.author:
        metadata.append(f"artist={ffmeta(book.author)}")
    for i, (chapter, wave) in enumerate(zip(book.chapters, waves), 1):
        # PCM duration defines the exact M4B chapter boundaries; MP3 includes encoder padding.
        info = probe(wave)
        duration_ms = round(float(info["format"]["duration"]) * 1000 / book.speed)
        destination = mp3_dir / f"{i:04d}.mp3"
        cmd = ["ffmpeg", "-nostdin", "-v", "error", "-i", str(wave), "-vn", "-af", f"atempo={book.speed}",
               "-c:a", "libmp3lame", "-b:a", "128k", "-metadata", f"title={chapter.title}",
               "-metadata", f"album={book.title}", "-metadata", f"track={i}/{len(waves)}",
               "-metadata", f"language={ISO3[book.language]}"]
        if book.author:
            cmd.extend(["-metadata", f"artist={book.author}"])
        run(cmd + [str(destination)])
        metadata.extend(["[CHAPTER]", "TIMEBASE=1/1000", f"START={total_ms}",
                         f"END={total_ms + duration_ms}", f"title={ffmeta(chapter.title)}"])
        entries.append({"file": f"chapters/{i:04d}.mp3", "title": chapter.title,
                        "start_ms": total_ms, "end_ms": total_ms + duration_ms,
                        "sha256": file_hash(destination)})
        total_ms += duration_ms
    # All cached WAVs have the same PCM format. A playlist avoids argument-size limits.
    listing = output / "concat.txt"
    listing.write_text("".join("file '" + str(p).replace("'", "'\\''") + "'\n" for p in waves), encoding="utf-8")
    meta_path = output / "metadata.txt"
    meta_path.write_text("\n".join(metadata) + "\n", encoding="utf-8")
    audiobook = output / "book.m4b"
    run(["ffmpeg", "-nostdin", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(listing),
         "-f", "ffmetadata", "-i", str(meta_path), "-map", "0:a", "-map_metadata", "1",
         "-map_chapters", "1", "-af", f"atempo={book.speed}", "-c:a", "aac", "-b:a", "128k",
         "-movflags", "+faststart", str(audiobook)])
    listing.unlink()
    meta_path.unlink()
    return {"artifact": "book.m4b", "sha256": file_hash(audiobook), "duration_seconds": total_ms / 1000,
            "chapters": entries}


def validate(output: Path) -> dict:
    output = output.resolve(strict=True)
    report = json.loads((output / "report.json").read_text(encoding="utf-8"))
    if report.get("owner") != "html2audiobook-skill":
        raise BookError("Output is not owned by html2audiobook.")

    def artifact(relative: str) -> Path:
        if (output / relative).is_symlink():
            raise BookError("Artifact cannot be a symlink.")
        path = (output / relative).resolve(strict=True)
        if not path.is_relative_to(output) or path.is_symlink():
            raise BookError("Artifact escapes audiobook directory.")
        return path

    audio = artifact(report["artifact"])
    info = probe(audio)
    chapters = info.get("chapters", [])
    if not chapters or len(chapters) != len(report["chapters"]):
        raise BookError("M4B chapter count differs from manifest.")
    tags = info["format"].get("tags", {})
    if tags.get("title") != report["title"]:
        raise BookError("M4B title differs from manifest.")
    if report.get("author") and tags.get("artist") != report["author"]:
        raise BookError("M4B author differs from manifest.")
    if abs(float(info["format"]["duration"]) - report["duration_seconds"]) > max(0.5, len(chapters) * 0.1):
        raise BookError("M4B duration differs from chapter durations.")
    paths = [(audio, report["sha256"])]
    for index, (expected, actual) in enumerate(zip(report["chapters"], chapters), 1):
        if actual.get("tags", {}).get("title") != expected["title"]:
            raise BookError("M4B chapter title differs from manifest.")
        for key in ("start", "end"):
            if abs(float(actual[f"{key}_time"]) * 1000 - expected[f"{key}_ms"]) > 120:
                raise BookError("M4B chapter timing differs from manifest.")
        mp3 = artifact(expected["file"])
        mp3_info = probe(mp3)
        mp3_tags = mp3_info["format"].get("tags", {})
        if mp3_tags.get("title") != expected["title"]:
            raise BookError("MP3 chapter title differs from manifest.")
        if mp3_tags.get("album") != report["title"] or mp3_tags.get("track") != f"{index}/{len(chapters)}":
            raise BookError("MP3 album or track number differs from manifest.")
        if report.get("author") and mp3_tags.get("artist") != report["author"]:
            raise BookError("MP3 author differs from manifest.")
        expected_duration = (expected["end_ms"] - expected["start_ms"]) / 1000
        if abs(float(mp3_info["format"]["duration"]) - expected_duration) > 0.5:
            raise BookError("MP3 chapter duration differs from manifest.")
        paths.append((mp3, expected["sha256"]))
    for path, checksum in paths:
        if file_hash(path) != checksum:
            raise BookError(f"Artifact checksum mismatch: {path.name}")
        run(["ffmpeg", "-nostdin", "-v", "error", "-xerror", "-i", str(path), "-map", "0:a:0", "-f", "null", "-"])
    return {"status": "passed", "files": len(paths), "chapters": len(chapters),
            "duration_seconds": float(info["format"]["duration"]), "listening_review": "not_performed"}
