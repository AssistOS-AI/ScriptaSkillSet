---
name: html2Audiobook
description: Convert a local semantic or legacy HTML book into a locally generated audiobook using ebook2audiobook and Piper. Prepare and audit reading-order text, preserve editorial sections, resume completed chapters, and deliver a chaptered M4B plus separate chapter MP3s. All options have normal defaults; only the HTML path is required. Supports English, French, German, Spanish, Portuguese, Italian, Romanian, and Polish.
---

# HTML to audiobook

Use this skill when the user asks to narrate an HTML book, produce an audiobook,
or convert a Scripta book into M4B or MP3 chapters.

## Boundaries

- Preserve source HTML and assets. Do not translate, summarize, rewrite, execute
  embedded scripts, fetch linked resources, OCR images, or clone voices.
- Use local ebook2audiobook with native Piper voices. Initial installation/model
  downloads need network access; do not upload the book to a speech API.
- Include prose, headings, lists, captions, prefaces, appendices and other
  editorial sections. Exclude UI, structured contents, page numbers and hidden
  HTML. Plain contents are removed only when a repeated heading establishes the
  body boundary; ambiguous contents are retained with a warning.
- Inputs can use `main[data-reader-content]` or legacy HTML `body`. A ScriptaHub
  landing page (`book.html`) is not the book: use its `full_content.html`.
- All user options are optional. Do not ask the user to select a destination,
  language, voice or speed merely because they did not specify one.
- Never claim listening verification, natural pronunciation, measured generation
  speed, or complete offline operation without the corresponding actual test.

## Launcher and defaults

Resolve this directory from SKILL.md. Run from any directory:

```bash
<skill-directory>/scripts/html2audiobook convert /books/carte.html
```

Defaults:

- Destination: `/books/carte-audiobook/`.
- Language: HTML language; otherwise seeded text detection; English with a
  warning if inconclusive. A confidently identified unsupported language fails.
- Voice: Alan (EN), Tom (FR), Thorsten emotional (DE), Davefx (ES), Tugão (PT),
  Paola (IT), Mihai (RO), Darkman (PL).
- Speed: 1.0. Both M4B and chapter MP3s are always produced.
- Explicit pauses: 0.5 seconds between sentences, 1.0 between paragraphs,
  1.5 after HTML headings. Boundary pauses replace rather than accumulate.
  Prefer sentence boundaries; oversized sentences still split at the engine limit.
- Title: HTML metadata/title, then filename. Author: metadata or omitted.
- Existing output is protected. Completed chapter synthesis is reused automatically.

## Workflow

1. Run `doctor` to locate FFmpeg, FFprobe and an installed ebook2audiobook runtime.
   See `references/runtime.md` for one-time setup. Calibre is reported but prepared
   EPUBs bypass its chapter inference, so it is not required by the adapter.
2. Run `prepare` to inspect the manifest, source sections, chapter boundaries and
   language when the HTML is unfamiliar. `convert` includes this step automatically.
3. Run `convert`. Only supply optional overrides requested by the user or justified
   by inspection. Review warnings, especially inferred chapter boundaries.
4. If interrupted, rerun the same command. Completed chapters are cached; an
   unfinished chapter restarts. Changing voice/text invalidates affected audio;
   speed changes reuse synthesis and repackage the audio.
5. Deliver only output with a passing validation. `validate <output-directory>`
   independently checks files, hashes, chapter timing, titles and audio decoding.

```bash
<skill-directory>/scripts/html2audiobook doctor
<skill-directory>/scripts/html2audiobook prepare /books/carte.html
<skill-directory>/scripts/html2audiobook convert /books/carte.html --speed 1.1
<skill-directory>/scripts/html2audiobook validate /books/carte-audiobook
```

## Output and completion

Deliver `book.m4b`, `chapters/0001.mp3`, subsequent chapter MP3s, and `report.json`.
Name links using the book/chapter titles from the report. The hidden sibling work
directory holds prepared text, EPUB, chapter audio, logs, and progress for resumption.
`--overwrite` only replaces skill-owned output and retains the previous delivery
inside that work directory; mention the returned backup path when replacing output.

Report inferred boundaries and language fallbacks honestly. Automated validation
checks preparation, packaging and decodability; it does not prove that a speech
model pronounced every word correctly. See `references/validation.md`.
