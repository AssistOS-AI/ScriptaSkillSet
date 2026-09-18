# Runtime setup

The skill's preparation and packaging environment needs `uv`, FFmpeg and FFprobe.
The native speech environment belongs to
[ebook2audiobook](https://github.com/DrewThomasson/ebook2audiobook).

Install ebook2audiobook following its current upstream instructions. Its launcher
may install Python packages, native dependencies and models, so run setup as a
separate initial operation, not as an unexplained side effect of HTML preparation.
Then configure:

```bash
export EBOOK2AUDIOBOOK_HOME=/absolute/path/to/ebook2audiobook
<skill-directory>/scripts/html2audiobook doctor
```

The engine's `python_env/bin/python` or `.venv/bin/python` is selected automatically.
For a differently located environment, set `EBOOK2AUDIOBOOK_PYTHON` or use
`--engine-python`. `--engine-home` overrides checkout discovery. No engine option
is required when the checkout lives at `<skill-directory>/runtime/ebook2audiobook`.

The adapter uses prepared EPUBs directly, so Calibre chapter inference is bypassed.
`doctor` still reports `ebook-convert` as a useful upstream diagnostic.

The process adapter uses short temporary aliases for macOS multiprocessing and
eSpeak data paths, handles EPUBs without covers, and URL-encodes voice names such
as Tugão. Downloads are staged and serialized per voice to prevent interrupted
transfers from becoming apparently complete models. These adjustments happen
inside the conversion process; they do not edit the upstream checkout.

Package installation and unrelated cloning-voice downloads are disabled during
conversion. Install the runtime once; missing imports remain explicit errors.

## Native default voices

| Language | Piper model |
|---|---|
| English | en_GB-alan-medium |
| French | fr_FR-tom-medium |
| German | de_DE-thorsten_emotional-medium |
| Spanish | es_ES-davefx-medium |
| Portuguese | pt_PT-tugão-medium |
| Italian | it_IT-paola-medium |
| Romanian | ro_RO-mihai-medium |
| Polish | pl_PL-darkman-medium |

Models come from [Piper voices](https://huggingface.co/rhasspy/piper-voices).
Code and voice-model licenses are separate; consult the chosen model's own card
for redistribution/use terms. The Romanian model card identifies a single speaker,
22,050 Hz training output and a CC0 dataset. This is not a guarantee of pronunciation
quality for every book.

## Failures and diagnostics

- Missing checkout/interpreter: `doctor` reports `missing_dependencies`.
- Missing import or native dependency: inspect the chapter attempt's `engine.log`.
- Missing model/network failure: retain completed cache entries and retry after
  connectivity/setup is restored.
- Unsupported adapter API: install a compatible upstream runtime or update the
  adapter with contract tests; do not silently bypass its text audit.
- Conversion interruption: rerun; completed chapters are reused and the unfinished
  chapter starts a fresh attempt.

The first run may download models and dependencies. Local synthesis does not by
itself establish that all subsequent runs avoid network requests; verify offline
operation separately before claiming it.
