from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from .converter import convert_html
from .models import Html2DocError
from .preflight import doctor
from .validation import validate_docx


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="html2doc", description="Convert Scripta semantic HTML books to editable DOCX files.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("doctor", help="Check the local deterministic runtime.")
    convert = commands.add_parser("convert", help="Convert and validate one Scripta HTML book.")
    convert.add_argument("input", type=Path)
    convert.add_argument("--output", type=Path)
    convert.add_argument("--title")
    convert.add_argument("--author")
    convert.add_argument("--lang")
    convert.add_argument("--overwrite", action="store_true")
    validate = commands.add_parser("validate", help="Validate a DOCX against its source HTML.")
    validate.add_argument("input", type=Path)
    validate.add_argument("--docx", type=Path, required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "doctor":
            result = doctor()
        elif args.command == "convert":
            result = convert_html(args.input, args.output, title=args.title, author=args.author, language=args.lang, overwrite=args.overwrite)
        else:
            result = validate_docx(args.input, args.docx)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0 if result.get("status") != "failed" else 1
    except (Html2DocError, OSError, ValueError) as error:
        print(f"html2doc: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
