from __future__ import annotations

import argparse
import json
import platform
from pathlib import Path
import sys

from bs4 import __version__ as beautifulsoup_version
import langcodes

from .core import TranslateHtmlError, build_job, job_status, normalize_language, prepare_job
from .validation import validate_translation


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="translatehtml",
        description="Prepare, build, and validate structure-preserving HTML translations.",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("doctor", help="Check the local deterministic runtime.")
    status = commands.add_parser("status", help="Report resumable translation progress.")
    status.add_argument("job", type=Path)

    prepare = commands.add_parser(
        "prepare", help="Extract protected translation units into a local resumable job."
    )
    prepare.add_argument("input", type=Path)
    prepare.add_argument("--to", required=True, dest="target_language")
    prepare.add_argument("--from", dest="source_language")
    prepare.add_argument("--output", type=Path)
    prepare.add_argument("--job-dir", type=Path)

    build = commands.add_parser(
        "build", help="Apply completed translation batches, validate, and publish."
    )
    build.add_argument("job", type=Path)
    build.add_argument("--overwrite", action="store_true")

    validate = commands.add_parser(
        "validate", help="Validate an existing HTML translation."
    )
    validate.add_argument("source", type=Path)
    validate.add_argument("--html", type=Path, required=True)
    validate.add_argument("--to", required=True, dest="target_language")
    return parser


def doctor() -> dict[str, object]:
    return {
        "ok": True,
        "python": platform.python_version(),
        "beautifulsoup": beautifulsoup_version,
        "langcodes": getattr(langcodes, "__version__", "available"),
        "translationModel": "provided by the active LLM session",
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
                args.input,
                target_language=args.target_language,
                source_language=args.source_language,
                output=args.output,
                job_dir=args.job_dir,
            )
        elif args.command == "build":
            result = build_job(args.job, overwrite=args.overwrite)
        else:
            result = validate_translation(
                args.source,
                args.html,
                target_language=normalize_language(args.target_language),
            )
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0 if result.get("status") != "failed" else 1
    except (TranslateHtmlError, OSError, ValueError, json.JSONDecodeError) as error:
        print(f"translatehtml: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
