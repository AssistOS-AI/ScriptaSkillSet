from __future__ import annotations

import argparse
import json
import platform
from pathlib import Path
import sys

from bs4 import __version__ as beautifulsoup_version

from .core import ShortDescriptionError, build_job, job_status, prepare_job
from .validation import validate_short_description


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="shortdescription", description="Create and validate 4–6-sentence thematic HTML descriptions.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("doctor", help="Check the deterministic local runtime.")
    status = commands.add_parser("status", help="Report resumable analysis progress.")
    status.add_argument("job", type=Path)
    prepare = commands.add_parser("prepare", help="Extract semantic HTML into thematic-analysis batches.")
    prepare.add_argument("input", type=Path)
    prepare.add_argument("--language", help="Override missing or incorrect source language metadata.")
    prepare.add_argument("--output", type=Path)
    prepare.add_argument("--job-dir", type=Path)
    build = commands.add_parser("build", help="Validate, publish, and clean a completed job.")
    build.add_argument("job", type=Path)
    build.add_argument("--overwrite", action="store_true")
    validate = commands.add_parser("validate", help="Independently validate a published description.")
    validate.add_argument("source", type=Path)
    validate.add_argument("--html", required=True, type=Path)
    validate.add_argument("--language")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "doctor":
            result = {"status": "ok", "python": platform.python_version(), "beautifulsoup4": beautifulsoup_version}
        elif args.command == "prepare":
            result = prepare_job(args.input, language=args.language, output=args.output, job_dir=args.job_dir)
        elif args.command == "status":
            result = job_status(args.job)
        elif args.command == "build":
            result = build_job(args.job, overwrite=args.overwrite)
        else:
            result = validate_short_description(args.source, args.html, expected_language=args.language)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0 if result.get("status") != "failed" else 1
    except (ShortDescriptionError, OSError, ValueError, json.JSONDecodeError) as error:
        print(f"shortdescription: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
