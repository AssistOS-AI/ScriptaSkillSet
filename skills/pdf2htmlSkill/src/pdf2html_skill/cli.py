from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .batch import convert_many_in_place
from .converter import convert_pdf, validate_existing
from .preflight import Pdf2HtmlError, doctor


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="pdf2html", description="Convert born-digital PDFs to semantic HTML.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("doctor", help="Check local runtime dependencies.")

    convert = commands.add_parser("convert", help="Convert and validate one or more PDFs.")
    convert.add_argument("input", type=Path, nargs="*")
    convert.add_argument("--output", type=Path)
    convert.add_argument("--lang")
    convert.add_argument("--title")
    convert.add_argument("--image-scale", type=float, default=2.0)
    convert.add_argument("--overwrite", action="store_true")
    convert.add_argument("--keep-qa-artifacts", action="store_true")

    validate = commands.add_parser("validate", help="Validate an existing HTML conversion.")
    validate.add_argument("input", type=Path)
    validate.add_argument("--html", type=Path, required=True)
    validate.add_argument("--keep-qa-artifacts", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "doctor":
            result = doctor()
            print(json.dumps(result, indent=2))
            return 0 if result["ok"] else 1
        if args.command == "convert":
            if args.output:
                if len(args.input) != 1:
                    raise Pdf2HtmlError("--output requires exactly one input PDF.")
                result = convert_pdf(
                    args.input[0],
                    args.output,
                    language=args.lang or "und",
                    title=args.title,
                    image_scale=args.image_scale,
                    overwrite=args.overwrite,
                    keep_qa_artifacts=args.keep_qa_artifacts,
                )
            else:
                result = convert_many_in_place(
                    args.input,
                    invocation_dir=Path.cwd(),
                    default_language=args.lang,
                    title=args.title,
                    image_scale=args.image_scale,
                    overwrite=args.overwrite,
                    keep_qa_artifacts=args.keep_qa_artifacts,
                )
        else:
            result = validate_existing(args.input, args.html, args.keep_qa_artifacts)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except (Pdf2HtmlError, OSError, ValueError) as error:
        print(f"pdf2html: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
