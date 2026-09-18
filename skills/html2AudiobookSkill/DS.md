# HTML audiobook design

## Ownership and interfaces

`prepare` performs HTML extraction and writes auditable text and a minimal EPUB.
`convert` includes preparation, local synthesis, packaging and validation.
`validate` checks an existing delivery. `doctor` reports runtime discovery and
voice cache locations without installing native applications.

All conversion options are optional. Defaults are defined in `book.py` and
`cli.py`; user-facing documentation must track these values. The language choices
are EN, FR, DE, ES, PT, IT, RO and PL. Voice cloning and translation are outside
the contract.

## Text and chapter boundaries

Extract block text in DOM reading order with no nested text duplication. Explicit
TOC anchor targets take precedence over repeated heading levels. Legacy inputs
use the highest repeated heading level or a single chapter. Preserve front/back
matter prose; ambiguous plain contents are retained and flagged. No source
resource is executed or fetched. External CSS and text drawn inside images are
not interpreted.

Each synthesis job contains one chapter EPUB plus the exact narration manifest.
The external adapter compares the EPUB spine text to the manifest, checks lossless
segmentation, supplies those paragraphs to ebook2audiobook, and checks the actual
upstream blocks before starting synthesis. Engine control strings originating in
the book are escaped to prevent accidental commands.

The manifest retains HTML heading indices for every chapter, including internal
subheadings. Sentence-first segmentation inserts 0.5-second sentence pauses,
1-second paragraph pauses and 1.5-second heading pauses without stacking boundary
pauses. Oversized sentences use lossless word/token splitting at 320 characters.
Punctuation detection is heuristic; decimals, initials and common abbreviations
are protected. Explicit silence supplements natural model pauses and is affected
by the final speed setting. Audit files record the pause policy and total inserted
silence. Heading roles participate in cache identity, as does the adapter code.

The adapter replaces upstream preparation hooks in its own process only. It uses
the installed engine's Piper implementation and synthesis/export machinery, with
native voices and no zero-shot voice-conversion model. The upstream checkout is
not patched. Internal API incompatibility is an error rather than silent fallback.

## Persistence and publication

An owned sibling workspace is locked for each output. Per-chapter synthesis keys
include prose, language, voice and the engine/adapter implementation identity.
Speed is excluded because it changes packaging, not synthesis. A chapter cache
entry is reusable only when its stored WAV checksum and audio probe pass.

The engine writes into a fresh attempt directory; completed chapters survive an
interruption. All cached WAVs are normalized to mono 24 kHz PCM. FFmpeg exports
MP3 tracks and one AAC/M4B with chapter metadata. Staged files undergo checksum,
metadata, duration and full decoding validation before directory publication.
Overwriting requires a skill ownership marker; the previous delivery is moved to
a unique backup and restored if publication fails.

## Validation limits

Input text equality and decodable audio do not prove speech fidelity. Real-model
pronunciation, offline operation and performance require separate integration and
listening tests. Runtime discovery alone must not be called successful synthesis.
