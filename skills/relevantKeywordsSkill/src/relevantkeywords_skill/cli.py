from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

from .core import (
    DEFAULT_MODEL,
    MODEL_FOLDER,
    MODEL_REQUIRED_FILES,
    KeywordError,
    OnnxEmbedder,
    analyze_html,
    load_synonym_dictionary,
)
from .io import write_keywords


SKILL_ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = SKILL_ROOT / ".models" / MODEL_FOLDER
MODEL_REVISION = "614241f622f53c4eeff9890bdc4f31cfecc418b3e"
MODEL_DOWNLOADS = {
    "onnx/model_qint8_avx512_vnni.onnx": (
        "model.onnx",
        "dd476dd0c2514e9b9be83aeb3853fac0763e0bdf4a71645407587d77c48a2d88",
    ),
    "onnx/sentencepiece.bpe.model": (
        "sentencepiece.bpe.model",
        "cfc8146abe2a0488e9e2a0c56de7952f7c11ab059eca145a0a727afce0db2865",
    ),
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _model_ready() -> bool:
    if not all((MODEL_PATH / name).is_file() for name in MODEL_REQUIRED_FILES):
        return False
    return all(_sha256(MODEL_PATH / local_name) == expected for local_name, expected in MODEL_DOWNLOADS.values())


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="relevantkeywords",
        description="Extract fundamental multilingual keywords from semantic HTML.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    install = subparsers.add_parser("install", help="Download and validate the default semantic model.")
    install.add_argument("--force", action="store_true", help="Download again even when the model is present.")

    subparsers.add_parser("doctor", help="Check runtime dependencies and the local semantic model.")

    analyze = subparsers.add_parser("analyze", help="Analyze an HTML document and write relevantKeywords.txt.")
    analyze.add_argument("input", type=Path, help="UTF-8 HTML input path.")
    analyze.add_argument("--count", type=int, default=20, help="Requested keyword count (default: 20).")
    analyze.add_argument("--language", default="auto", help="BCP 47 language tag or auto (default).")
    analyze.add_argument("--synonyms", type=Path, help="Optional JSON synonym dictionary.")
    return parser


def _download_model_file(remote_name: str, local_name: str, expected: str, force: bool) -> None:
    destination = MODEL_PATH / local_name
    if destination.is_file() and not force and _sha256(destination) == expected:
        return
    MODEL_PATH.mkdir(parents=True, exist_ok=True)
    url = f"https://huggingface.co/{DEFAULT_MODEL}/resolve/{MODEL_REVISION}/{remote_name}"
    request = urllib.request.Request(url, headers={"User-Agent": "Scripta-relevantKeywords/0.1"})
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{local_name}.", dir=MODEL_PATH)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as target, urllib.request.urlopen(request, timeout=60) as response:
            shutil.copyfileobj(response, target, length=1024 * 1024)
            target.flush()
            os.fsync(target.fileno())
        if _sha256(temporary) != expected:
            raise KeywordError(f"Checksum verification failed for {remote_name}.")
        os.replace(temporary, destination)
    except (OSError, urllib.error.URLError, KeywordError) as exc:
        temporary.unlink(missing_ok=True)
        if isinstance(exc, KeywordError):
            raise
        raise KeywordError(f"Could not download {remote_name}: {exc}") from exc


def _install(force: bool) -> int:
    if _model_ready() and not force:
        print(json.dumps({"status": "ok", "model": DEFAULT_MODEL, "path": str(MODEL_PATH)}))
        return 0
    for remote_name, (local_name, expected) in MODEL_DOWNLOADS.items():
        print(f"Downloading {remote_name}...", file=sys.stderr)
        _download_model_file(remote_name, local_name, expected, force)
    OnnxEmbedder(MODEL_PATH)
    print(json.dumps({"status": "installed", "model": DEFAULT_MODEL, "path": str(MODEL_PATH)}))
    return 0


def _doctor() -> int:
    checks: dict[str, object] = {
        "python": sys.version.split()[0],
        "skillRoot": str(SKILL_ROOT),
        "model": DEFAULT_MODEL,
    }
    missing: list[str] = []
    for module in ("bs4", "numpy", "onnxruntime", "regex", "sentencepiece", "simplemma", "stopwordsiso"):
        try:
            __import__(module)
            checks[module] = "ok"
        except ImportError:
            checks[module] = "missing"
            missing.append(module)
    model_ready = _model_ready()
    checks["modelPath"] = str(MODEL_PATH)
    checks["modelReady"] = model_ready
    if not model_ready:
        missing.append("semantic-model")
    checks["status"] = "ok" if not missing else "not-ready"
    checks["missing"] = missing
    print(json.dumps(checks, ensure_ascii=False, indent=2))
    if missing:
        print("Run `scripts/relevantkeywords install` to install the semantic model.", file=sys.stderr)
        return 1
    return 0


def _analyze(args: argparse.Namespace) -> int:
    source: Path = args.input.resolve()
    if not source.is_file():
        raise KeywordError(f"Input HTML does not exist: {source}")
    if source.suffix.lower() not in {".html", ".htm"}:
        raise KeywordError("Input must have an .html or .htm extension.")
    try:
        html = source.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise KeywordError("Input must be valid UTF-8 HTML.") from exc
    synonyms = load_synonym_dictionary(args.synonyms)
    embedder = OnnxEmbedder(MODEL_PATH)
    result = analyze_html(
        html,
        count=args.count,
        language=args.language,
        synonyms=synonyms,
        embedder=embedder,
    )
    if not result.keywords:
        raise KeywordError("No defensible keywords were extracted; the HTML was not modified.")
    keywords = [item.keyword for item in result.keywords]
    output = write_keywords(source, keywords)
    print(
        json.dumps(
            {"output": str(output.resolve()), "count": len(keywords), "keywords": keywords},
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "install":
            return _install(args.force)
        if args.command == "doctor":
            return _doctor()
        return _analyze(args)
    except KeywordError as exc:
        print(f"relevantkeywords: {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("relevantkeywords: interrupted", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
