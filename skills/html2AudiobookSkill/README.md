# html2AudiobookSkill

Turn a local HTML book into `book.m4b` with chapter navigation and separate chapter
MP3s, through an external local ebook2audiobook/Piper runtime.

## Use

```bash
scripts/html2audiobook convert /books/carte.html
```

Only the HTML path is required. The default destination is
`/books/carte-audiobook/`; language comes from HTML or text detection; the voice
matches that language; speed is normal (`1.0`). Initial model downloads need an
internet connection. No book content is sent to a speech service.

Default inserted pauses are 0.5 seconds between sentences, 1 second between
paragraphs and 1.5 seconds after headings, including subheadings. A paragraph or
heading pause replaces the sentence pause at that boundary. These silences are
additional to the voice's natural punctuation timing and refer to normal speed.
Segmentation prefers sentence endings; sentences exceeding the engine's 320-character
limit fall back to word boundaries. Sentence detection is heuristic, with protection
for decimals, initials and common abbreviations.

```bash
scripts/html2audiobook doctor
scripts/html2audiobook prepare /books/carte.html
scripts/html2audiobook convert /books/carte.html --output /books/audio --lang ro --speed 1.1
scripts/html2audiobook validate /books/audio
```

`--voice` accepts a native Piper model identifier, e.g. `ro_RO-mihai-medium`.
`--title` and `--author` override HTML metadata. `--overwrite` replaces only
skill-owned output, keeping a recoverable previous delivery. No options require
interactive input. Unsupported languages and missing runtime dependencies return
explicit errors.

## Setup

The launcher provisions the skill's own Python environment with `uv`. Install
FFmpeg and an ebook2audiobook runtime separately, then set
`EBOOK2AUDIOBOOK_HOME` to that checkout; its `python_env` interpreter is discovered
automatically. The skill also checks `runtime/ebook2audiobook` inside this folder.
See [runtime setup](references/runtime.md).

The host launcher and locking support macOS and Linux. The skill uses no host
project imports. Native ebook2audiobook dependencies are separate from the small
preparation/packaging environment.

## Preservation and resumption

Source HTML remains unchanged. The skill generates its own EPUB chapters and
supplies audited prose to the engine so upstream chapter detection and editorial
section filtering cannot omit text. Literal engine control tags are escaped.
Inline CSS hiding is respected; external stylesheets are not evaluated.

The hidden sibling `.carte-audiobook.html2audiobook-work` directory stores
`prepared.json`, `book.epub`, chapter WAV caches, logs and progress. Rerun after an
interruption to reuse finished chapters. Incomplete chapters restart. Speed is
applied during FFmpeg export, preserving pitch and avoiding a second synthesis.

Automatic checks do not replace listening review. See
[validation](references/validation.md) and [design](DS.md).

## Development

```bash
uv sync --extra dev
uv run pytest
uv run python -m compileall -q src tests
```

Tests cover extraction, defaults, all language mappings, EPUB content, the engine
adapter's pre-synthesis audit, cache invalidation, interruption recovery and real
FFmpeg packaging/decoding. Simulated synthesis tests are explicitly distinct from
tests against a downloaded speech model.
