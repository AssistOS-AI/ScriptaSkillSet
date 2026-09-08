from __future__ import annotations

import argparse
import json
import platform
from pathlib import Path
import sys

from bs4 import __version__ as beautifulsoup_version
import langcodes

from .core import (
    DEFAULT_WPM,
    ComprehensiveSummaryError,
    build_job,
    job_status,
    prepare_job,
)
from .validation import validate_summary


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="comprehensivesummary",
        description="Prepare, build, and validate reading-time-targeted HTML book summaries.",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("doctor", help="Check the deterministic local runtime.")
    status = commands.add_parser("status", help="Report resumable chapter-analysis progress.")
    status.add_argument("job", type=Path)

    prepare = commands.add_parser("prepare", help="Extract a semantic HTML book into chapter batches.")
    prepare.add_argument("input", type=Path)
    prepare.add_argument("--minutes", required=True, type=float)
    prepare.add_argument("--wpm", type=int, default=DEFAULT_WPM)
    prepare.add_argument("--language", help="Override missing or incorrect BCP 47 source metadata.")
    prepare.add_argument("--output", type=Path)
    prepare.add_argument("--job-dir", type=Path)

    build = commands.add_parser("build", help="Validate synthesis and draft, render HTML, and publish atomically.")
    build.add_argument("job", type=Path)
    build.add_argument("--overwrite", action="store_true")

    validate = commands.add_parser("validate", help="Independently validate a generated summary HTML.")
    validate.add_argument("source", type=Path)
    validate.add_argument("--html", type=Path, required=True)
    validate.add_argument("--language", help="Override missing or incorrect BCP 47 source metadata.")
    return parser


def doctor() -> dict[str, object]:
    return {
        "ok": True,
        "python": platform.python_version(),
        "beautifulsoup": beautifulsoup_version,
        "langcodes": getattr(langcodes, "__version__", "available"),
        "analysisModel": "provided by the active LLM session",
        "defaultWordsPerMinute": DEFAULT_WPM,
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
                args.input, minutes=args.minutes, words_per_minute=args.wpm,
                language=args.language, output=args.output, job_dir=args.job_dir,
            )
        elif args.command == "build":
            result = build_job(args.job, overwrite=args.overwrite)
        else:
            result = validate_summary(args.source, args.html, expected_language=args.language)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0 if result.get("status") != "failed" else 1
    except (ComprehensiveSummaryError, OSError, ValueError, json.JSONDecodeError) as error:
        print(f"comprehensivesummary: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
