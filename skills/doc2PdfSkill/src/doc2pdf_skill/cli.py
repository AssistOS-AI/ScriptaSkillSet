from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import pikepdf

from .converter import convert_document, validate_existing
from .models import Doc2PdfError
from .preflight import doctor, install_dependencies


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="doc2pdf", description="Convert DOC and DOCX documents to optimized, validated PDFs.")
    commands = parser.add_subparsers(dest="command", required=True)
    doctor_command = commands.add_parser("doctor", help="Check Python and native runtime dependencies.")
    doctor_command.add_argument("--json", action="store_true", help=argparse.SUPPRESS)
    install = commands.add_parser("install-deps", help="Explicitly install missing native dependencies.")
    install.add_argument("--yes", action="store_true", help="Skip the interactive confirmation after external approval.")
    convert = commands.add_parser("convert", help="Convert and validate one Word document.")
    convert.add_argument("input", type=Path)
    convert.add_argument("--output", type=Path)
    convert.add_argument("--profile", choices=("fidelity", "balanced", "compact"), default="fidelity")
    convert.add_argument("--overwrite", action="store_true")
    convert.add_argument("--keep-qa-artifacts", action="store_true")
    validate = commands.add_parser("validate", help="Validate an existing PDF against a fresh LibreOffice export.")
    validate.add_argument("input", type=Path)
    validate.add_argument("--pdf", type=Path, required=True)
    validate.add_argument("--keep-qa-artifacts", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "doctor":
            result = doctor()
        elif args.command == "install-deps":
            result = install_dependencies(assume_yes=args.yes)
        elif args.command == "convert":
            result = convert_document(
                args.input, args.output, profile=args.profile, overwrite=args.overwrite,
                keep_qa_artifacts=args.keep_qa_artifacts,
            )
        else:
            result = validate_existing(args.input, args.pdf, keep_qa_artifacts=args.keep_qa_artifacts)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0 if result.get("status") not in {"failed", "cancelled"} and result.get("ok", True) else 1
    except (Doc2PdfError, OSError, ValueError, pikepdf.PdfError) as error:
        print(f"doc2pdf: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
