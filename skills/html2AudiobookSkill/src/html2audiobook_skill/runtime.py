"""External runtime discovery and bounded process execution."""
from __future__ import annotations

from dataclasses import dataclass
import os
import json
from pathlib import Path
import shutil
import signal
import subprocess

from .book import BookError, VOICES


@dataclass
class Engine:
    home: Path
    python: Path


def discover(home: str | None = None, python: str | None = None) -> Engine | None:
    configured = home or os.environ.get("EBOOK2AUDIOBOOK_HOME")
    skill = Path(__file__).resolve().parents[2]
    candidates = [Path(configured).expanduser()] if configured else [skill / "runtime" / "ebook2audiobook"]
    executable = shutil.which("ebook2audiobook")
    if not configured and executable:
        candidates.extend([Path(executable).resolve().parent, Path(executable).resolve().parents[2]])
    for root in candidates:
        if not (root / "app.py").is_file() or not (root / "lib" / "core.py").is_file():
            continue
        override = python or os.environ.get("EBOOK2AUDIOBOOK_PYTHON")
        interpreters = [Path(override).expanduser()] if override else [root / "python_env/bin/python", root / ".venv/bin/python", root / "python_env/Scripts/python.exe"]
        for interpreter in interpreters:
            if interpreter.is_file() and os.access(interpreter, os.X_OK):
                # Preserve the virtualenv executable path: resolving its symlink loses the environment.
                return Engine(root.resolve(), interpreter.absolute())
    return None


def run(command: list[str], *, log: Path | None = None, cwd: Path | None = None,
        timeout: float | None = None) -> str:
    if log:
        with log.open("w", encoding="utf-8") as output:
            process = subprocess.Popen(command, cwd=cwd, stdin=subprocess.DEVNULL,
                                       stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
            try:
                code = process.wait(timeout=timeout)
            except BaseException:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
                raise
        if code:
            raise BookError(f"External process failed ({code}). See {log}")
        return ""
    result = subprocess.run(command, cwd=cwd, stdin=subprocess.DEVNULL, capture_output=True,
                            text=True, timeout=timeout)
    if result.returncode:
        raise BookError(f"{Path(command[0]).name} failed: {result.stderr[-2000:]}")
    return result.stdout


def doctor(home: str | None = None, python: str | None = None) -> dict:
    engine = discover(home, python)
    checks = {name: shutil.which(name) for name in ("ffmpeg", "ffprobe", "ebook-convert")}
    checks["ebook2audiobook"] = str(engine.home) if engine else None
    checks["engine_python"] = str(engine.python) if engine else None
    model_paths = {}
    missing_modules = []
    if engine:
        modules = ["piper", "torch", "torchaudio", "gradio", "ebooklib", "pymupdf",
                   "pytesseract", "stanza", "pykakasi", "regex", "num2words2", "bs4",
                   "psutil", "requests", "iso639", "pydub", "PIL", "markdown", "TTS"]
        code = "import importlib.util,json; print(json.dumps([m for m in " + repr(modules) + " if importlib.util.find_spec(m) is None]))"
        try:
            missing_modules = json.loads(run([str(engine.python), "-c", code], timeout=20))
        except (BookError, subprocess.TimeoutExpired, ValueError):
            missing_modules = ["engine interpreter check failed"]
        for lang, voice in VOICES.items():
            found = next((engine.home / "models").rglob(f"{voice}.onnx"), None)
            model_paths[lang] = str(found) if found else "downloaded on first use"
    ready = bool(engine and checks["ffmpeg"] and checks["ffprobe"] and not missing_modules)
    return {"status": "ready" if ready else "missing_dependencies", "checks": checks,
            "voices": VOICES, "cached_models": model_paths, "missing_python_modules": missing_modules,
            "notes": ["Calibre is reported for diagnostics; prepared EPUBs bypass its conversion step.",
                      "Runtime discovery does not establish successful model loading or audio quality.",
                      "Set EBOOK2AUDIOBOOK_HOME to an installed checkout; its python_env is used automatically."]}
