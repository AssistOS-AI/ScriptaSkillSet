from __future__ import annotations

import argparse
import json
import platform
from pathlib import Path
import sys

from bs4 import __version__ as beautifulsoup_version
import langcodes

from .core import HumaniseHtmlError, build_job, job_status, prepare_job
from .validation import validate_humanisation


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="humanisehtml",
        description="Prepare, build, and validate structure-preserving HTML humanisation.",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("doctor", help="Check the deterministic local runtime.")
    status = commands.add_parser("status", help="Report resumable editorial progress.")
    status.add_argument("job", type=Path)

    prepare = commands.add_parser(
        "prepare", help="Extract protected text into a local, chapter-aware job."
    )
    prepare.add_argument("input", type=Path)
    prepare.add_argument("--language", help="Override a missing or incorrect BCP 47 html lang.")
    prepare.add_argument("--output", type=Path)
    prepare.add_argument("--job-dir", type=Path)
    prepare.add_argument("--in-place", action="store_true")

    build = commands.add_parser("build", help="Validate completed batches and publish atomically.")
    build.add_argument("job", type=Path)
    build.add_argument("--overwrite", action="store_true")

    validate = commands.add_parser("validate", help="Independently compare a humanised HTML file.")
    validate.add_argument("source", type=Path)
    validate.add_argument("--html", type=Path, required=True)
    return parser


def doctor() -> dict[str, object]:
    return {
        "ok": True, "python": platform.python_version(),
        "beautifulsoup": beautifulsoup_version,
        "langcodes": getattr(langcodes, "__version__", "available"),
        "editorialModel": "provided by the active LLM session",
        "intermediateApprovals": False,
    }


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "doctor":
            result = doctor()
        elif args.command == "status":
            result = job_status(args.job)
        elif args.command == "prepare":
            result = prepare_job(
                args.input, language=args.language, output=args.output,
                job_dir=args.job_dir, in_place=args.in_place,
            )
        elif args.command == "build":
            result = build_job(args.job, overwrite=args.overwrite)
        else:
            result = validate_humanisation(args.source, args.html)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0 if result.get("status") != "failed" else 1
    except (HumaniseHtmlError, OSError, ValueError, json.JSONDecodeError) as error:
        print(f"humanisehtml: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
