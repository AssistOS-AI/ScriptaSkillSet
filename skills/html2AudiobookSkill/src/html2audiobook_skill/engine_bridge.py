"""Runs inside ebook2audiobook's Python environment, never in the skill environment.

The narrow adapter supplies already audited EPUB prose to the upstream synthesis
pipeline. No upstream files are edited. Incompatible internal APIs fail explicitly.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
import fcntl
from urllib.parse import quote, urlsplit, urlunsplit
from xml.etree import ElementTree as ET
from zipfile import ZipFile


def compact(text: str) -> str:
    return " ".join(text.split())


def ascii_url(url: str) -> str:
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, quote(parts.path, safe="/%"),
                       quote(parts.query, safe="=&%"), parts.fragment))


def configure_voice_downloads(downloader) -> None:
    original_open = downloader.urlopen
    original_download = downloader.download_voice
    downloader.urlopen = lambda url, *args, **kwargs: original_open(ascii_url(url), *args, **kwargs)

    def download_voice(voice, download_dir, force_redownload=False):
        directory = Path(download_dir)
        directory.mkdir(parents=True, exist_ok=True)
        filenames = [f"{voice}.onnx", f"{voice}.onnx.json"]
        with (directory / ".download.lock").open("a") as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
            if not force_redownload and all((directory / name).is_file() and
                                           (directory / name).stat().st_size > 0 for name in filenames):
                return
            # A failed network transfer must not leave a nonempty partial model
            # that upstream mistakes for a completed download on the next run.
            with tempfile.TemporaryDirectory(prefix="download-", dir=directory) as pending:
                original_download(voice, Path(pending), force_redownload=True)
                for name in filenames:
                    if not (Path(pending) / name).is_file() or (Path(pending) / name).stat().st_size == 0:
                        raise RuntimeError(f"Voice download incomplete: {name}")
                json.loads((Path(pending) / filenames[1]).read_text(encoding="utf-8"))
                for name in filenames:
                    (Path(pending) / name).replace(directory / name)

    downloader.download_voice = download_voice


PAUSES = {"sentence": 0.5, "paragraph": 1.0, "heading": 1.5}


def sentences(text: str) -> list[str]:
    """Conservative punctuation boundaries; keep decimals, initials and common abbreviations."""
    abbreviations = {"dr", "mr", "mrs", "ms", "prof", "etc", "nr", "art", "fig",
                     "pag", "dl", "dna", "dvs", "str", "vs", "st", "sr", "jr",
                     "mme", "mlle", "m", "herr", "hr", "z.b", "np", "pt", "p.ex"}
    result = []
    start = 0
    for match in re.finditer(r'''[.!?…]+[”’»"')\]]*(?=\s+|$)''', text):
        prefix = text[:match.start()]
        token = re.search(r"([\w.]+)$", prefix)
        word = token.group(1) if token else ""
        if match.group().startswith(".") and (word.casefold() in abbreviations or
                                              (len(word) == 1 and word.isalpha()) or
                                              re.fullmatch(r"(?:[A-Za-z]\.)+[A-Za-z]", word)):
            continue
        result.append(text[start:match.end()].strip())
        start = match.end()
    if text[start:].strip():
        result.append(text[start:].strip())
    return result


def segments(paragraphs: list[str], limit: int = 320,
             heading_indices: list[int] | None = None) -> list[str]:
    result: list[str] = []
    headings = set(heading_indices or [])
    for index, paragraph in enumerate(paragraphs):
        units = sentences(paragraph)
        for number, sentence in enumerate(units):
            pending = ""
            for word in sentence.split():
                if pending and len(pending) + len(word) + 1 > limit:
                    result.append(pending)
                    pending = ""
                # Only oversized sentences/tokens need a non-sentence boundary.
                while len(word) > limit:
                    if pending:
                        result.append(pending)
                        pending = ""
                    result.append(word[:limit])
                    word = word[limit:]
                pending = f"{pending} {word}".strip()
            if pending:
                result.append(pending)
            if number < len(units) - 1:
                result.append(f"[pause:{PAUSES['sentence']}]")
        # Replace, rather than stack, the sentence pause at a block boundary.
        kind = "heading" if index in headings else "paragraph"
        result.append(f"[pause:{PAUSES[kind]}]")
    return result


def epub_paragraphs(path: Path) -> list[str]:
    with ZipFile(path) as archive:
        package = ET.fromstring(archive.read("book.opf"))
        ns = {"o": "http://www.idpf.org/2007/opf"}
        items = {n.attrib["id"]: n.attrib["href"] for n in package.findall("o:manifest/o:item", ns)}
        paragraphs = []
        for node in package.findall("o:spine/o:itemref", ns):
            doc = ET.fromstring(archive.read(items[node.attrib["idref"]]))
            paragraphs.extend(compact("".join(p.itertext())) for p in doc.iter("{http://www.w3.org/1999/xhtml}p"))
        return paragraphs


def install_hooks(core, piper_class, request: dict) -> dict:
    expected = request["paragraphs"]
    actual = epub_paragraphs(Path(request["epub"]))
    if actual != expected:
        raise RuntimeError("Prepared EPUB differs from narration manifest; refusing synthesis.")
    narration = segments(expected, heading_indices=request.get("heading_indices"))
    # Ignore whitespace inserted when splitting unusually long tokens.
    spoken = "".join(s for s in narration if not re.fullmatch(r"\[pause:[0-9.]+\]", s))
    if re.sub(r"\s+", "", spoken) != re.sub(r"\s+", "", "".join(expected)):
        raise RuntimeError("Segmentation lost or duplicated source text.")
    audit = {"epub_matches_manifest": True, "segmentation_preserves_text": True,
             "synthesis_started": False, "synthesis_completed": False,
             "text_sha256": hashlib.sha256("\n".join(expected).encode()).hexdigest(),
             "segments": len(narration), "voice": request["voice"],
             "pause_seconds": PAUSES,
             "inserted_pause_seconds": sum(float(s[7:-1]) for s in narration
                                           if re.fullmatch(r"\[pause:[0-9.]+\]", s))}
    for name in ("convert2epub", "get_blocks", "get_sentences", "finalize_audiobook", "convert_ebook"):
        if not callable(getattr(core, name, None)):
            raise RuntimeError(f"Incompatible ebook2audiobook: missing {name}.")

    def prepared_epub(session_id):
        session = core.context.get_session(session_id)
        destination = Path(session["epub_path"])
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.resolve() != Path(request["epub"]).resolve():
            shutil.copyfile(request["epub"], destination)
        return True

    # Do not let upstream infer chapters, skip editorial sections, or normalize prose.
    core.convert2epub = prepared_epub
    core.get_blocks = lambda session_id, epub_book: ["\n".join(expected)]
    core.get_sentences = lambda session_id, text: list(narration)
    original_finalize = core.finalize_audiobook

    def audited_finalize(session_id):
        session = core.context.get_session(session_id)
        current = session["blocks_current"]
        blocks = [b for b in current["blocks"] if b["keep"] and b["text"].strip()]
        if len(blocks) != 1 or compact(blocks[0]["text"]) != compact(" ".join(expected)):
            raise RuntimeError("Upstream narration blocks differ from prepared text.")
        blocks[0]["sentences"] = list(narration)
        current["blocks"] = blocks
        session["blocks_current"] = current
        # Prepared EPUBs deliberately have no cover. Upstream's get_cover returns
        # True for that case; its exporter otherwise treats True as file descriptor 1.
        session["cover"] = None
        audit["synthesis_started"] = True
        Path(request["audit"]).write_text(json.dumps(audit, indent=2), encoding="utf-8")
        result = original_finalize(session_id)
        audit["synthesis_completed"] = bool(result[1])
        Path(request["audit"]).write_text(json.dumps(audit, indent=2), encoding="utf-8")
        return result

    core.finalize_audiobook = audited_finalize
    # Only this job's working directory may be cleaned up by the integration.
    core.delete_unused_tmp_dirs = lambda *args, **kwargs: None
    load_engine = piper_class.load_engine

    def selected_engine(self):
        locale = self.engine_langs[self.language]
        self.sub_list[locale] = [request["voice"], request["voice"]]
        engine = load_engine(self)
        # eSpeak also has a native path-length limit. Keep its phoneme data at a
        # short alias when the Python environment lives inside a deep skill path.
        if hasattr(engine, "espeak_data_dir"):
            short_data = Path(tempfile.gettempdir()) / "espeak-ng-data"
            if not short_data.exists():
                short_data.symlink_to(Path(engine.espeak_data_dir).resolve(), target_is_directory=True)
            engine.espeak_data_dir = short_data
        return engine

    piper_class.load_engine = selected_engine
    # Native Piper voices do not require XTTS speaker discovery or voice conversion.
    piper_class._load_engine_zs = lambda self, device: None
    piper_class._load_xtts_builtin_list = lambda self: []
    return audit


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("request", type=Path)
    args = parser.parse_args()
    request = json.loads(args.request.read_text(encoding="utf-8"))
    root = Path(request["engine_home"]).resolve()
    os.chdir(root)
    sys.path.insert(0, str(root))
    original_hf_token = os.environ.get("HF_TOKEN")
    import app
    import lib.core as core
    import lib.classes.tts_engines.piper as piper_module
    import piper.download_voices as downloader
    configure_voice_downloads(downloader)
    # Some upstream builds assign their own hub credential during import. Native
    # public voices need no such credential; preserve the caller's environment.
    if original_hf_token is None:
        os.environ.pop("HF_TOKEN", None)
    else:
        os.environ["HF_TOKEN"] = original_hf_token
    # Find the registered engine without depending on the upstream class spelling.
    candidates = [v for v in vars(piper_module).values() if isinstance(v, type)
                  and v.__module__ == piper_module.__name__ and hasattr(v, "load_engine")]
    if len(candidates) != 1:
        raise RuntimeError("Incompatible ebook2audiobook Piper engine class.")
    audit = install_hooks(core, candidates[0], request)
    # Upstream configuration is process-global. Give its jobs isolated temporary storage.
    import lib.conf as conf
    job_tmp = str(Path(request["job_dir"]) / "upstream-tmp")
    core.tmp_dir = conf.tmp_dir = app.tmp_dir = job_tmp
    # Setup is a separate operation. Never reinstall packages or download unrelated
    # cloning voices every time the installed runtime narrates a chapter.
    import lib.classes.device_installer as installer

    class InstalledRuntime:
        def check_device_info(self, script_mode):
            return '{"gpu_count": 0, "gpu_backend": null}'

        def install_device_packages(self, device_info):
            return 0

        def install_python_packages(self):
            return 0

    installer.DeviceInstaller = InstalledRuntime
    # Fresh job per attempt; completed chapter WAVs are reused by the parent pipeline.
    app.init_multiprocessing()
    sys.argv = [str(root / "app.py"), "--headless", "--ebook", request["epub"],
                "--language", request["language"], "--tts_engine", "piper",
                "--fine_tuned", "internal", "--device", "CPU", "--output_format", "wav",
                "--output_dir", request["raw_output"]]
    # Upstream sets tempfile.tempdir to a checkout-relative path. Deep skill
    # directories exceed macOS's Unix-socket path limit for multiprocessing.
    with tempfile.TemporaryDirectory(prefix="h2a-", dir="/tmp") as short_tmp:
        tempfile.tempdir = short_tmp
        os.environ["TMPDIR"] = short_tmp
        app.main()
    if not audit["synthesis_completed"]:
        raise RuntimeError("ebook2audiobook did not complete audited synthesis.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"html2audiobook engine bridge: {exc}", file=sys.stderr)
        raise
