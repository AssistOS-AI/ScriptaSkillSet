"""User interface: only the source path is required for conversion."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from .book import BookError, read_book
from .media import validate
from .pipeline import convert, destination, prepare, workspace
from .runtime import doctor


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="html2audiobook", description="Convert a local HTML book to M4B and chapter MP3s.")
    commands = root.add_subparsers(dest="command", required=True)
    for name in ("prepare", "convert"):
        command = commands.add_parser(name)
        command.add_argument("source", type=Path)
        command.add_argument("--output", "--destination", help="Default: <source-stem>-audiobook beside the HTML")
        command.add_argument("--lang", "--language", help="Default: HTML language, text detection, then English")
        command.add_argument("--voice", help="Default: Piper voice for the selected language")
        command.add_argument("--speed", type=float, default=1.0, help="0.5–2.0; default 1.0 (normal)")
        command.add_argument("--title", help="Default: HTML title or filename")
        command.add_argument("--author", help="Default: HTML author, otherwise omitted")
        if name == "convert":
            command.add_argument("--overwrite", action="store_true", help="Replace owned output, retaining a recoverable backup")
            command.add_argument("--engine-home", help="Default: EBOOK2AUDIOBOOK_HOME or skill runtime directory")
            command.add_argument("--engine-python", help="Default: ebook2audiobook's Python environment")
    check = commands.add_parser("doctor")
    check.add_argument("--engine-home")
    check.add_argument("--engine-python")
    commands.add_parser("validate").add_argument("output", type=Path)
    return root


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.command == "doctor":
            result = doctor(args.engine_home, args.engine_python)
        elif args.command == "validate":
            result = validate(args.output)
        else:
            book = read_book(args.source, lang=args.lang, voice=args.voice, speed=args.speed,
                             title=args.title, author=args.author)
            output = destination(book, args.output)
            with workspace(output) as work:
                result = prepare(book, work) if args.command == "prepare" else convert(
                    book, output, work, overwrite=args.overwrite,
                    engine_home=args.engine_home, engine_python=args.engine_python)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result["status"] != "missing_dependencies" else 1
    except (BookError, OSError, ValueError) as exc:
        print(json.dumps({"status": "failed", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print('{"status":"interrupted","message":"Completed chapters are cached; rerun the same command to resume."}', file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
