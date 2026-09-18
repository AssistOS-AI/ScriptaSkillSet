# Validation

## Automated checks

- HTML language/default resolution and supported native voice identity.
- DOM text order without nested duplication, explicit chapter targets, heading
  fallback, editorial-section inclusion and known UI exclusion.
- EPUB spine paragraphs exactly match the prepared narration manifest.
- Segment splitting does not remove or duplicate text, and upstream synthesis
  blocks match the prepared chapter before model invocation.
- Sentence-first splitting, decimal/initial/abbreviation protection, HTML heading
  roles and non-stacking 0.5/1.0/1.5-second pause commands. Exact audible gaps also
  include model punctuation timing; decoding alone does not measure those gaps.
- Cached chapter integrity, independent invalidation, interruption recovery and
  output ownership protections.
- M4B and MP3 audio streams, positive duration, titles, chapter intervals, source
  duration agreement, stored checksums, and full FFmpeg decoding.

Run `validate <delivery-directory>` independently after delivery. Validation failure
must not be described as success; preserve attempts and logs for diagnosis.

## Real speech acceptance

Start with two short Romanian chapters containing ș/ț/ă/â/î, dialogue, numbers,
subheadings and lists. Listen for missing words, mispronunciation, clipping and
unintended voice changes. Record processing time, device and generated duration.
Repeat with a short sample in each supported language before making multilingual
quality claims, then generate a complete book. Test a run with networking disabled
after initial setup before claiming fully offline operation.

Synthetic-tone packaging tests and simulated upstream responses verify mechanics,
not speech quality. The generated report therefore records `listening_review` as
`not_performed`; a separate human listening review should state what was heard.

Run the real-model integration suite after installing the runtime:

```bash
RUN_HTML2AUDIOBOOK_TTS=1 uv run --extra dev pytest tests/test_speech_integration.py
```

This generates one spoken sample in each language and the complete two-chapter
Romanian test book. It downloads missing voices and validates every resulting
M4B and MP3. The default test suite skips these nine tests so routine development
does not silently download speech models.

## Recorded implementation verification

On 2026-09-09, the implementation passed 28 preparation, adapter, cache and FFmpeg
tests, plus all 9 real ebook2audiobook/Piper integration tests on Apple Silicon.
The integration suite generated all eight language samples and the complete short
Romanian fixture. A separate Romanian CLI run also verified that changing speed
reuses both synthesized chapters and preserves the previous delivery.

Preparation was additionally exercised on ScriptaHub's legacy HTML edition of
*Life Without an Audience*. A full-length production book, a network-disabled
generation and a human listening review were not part of this verification.

The sentence-first pause update on 2026-09-09 passed 31 preparation/adapter/cache/
FFmpeg tests and all 9 real-model integration tests. The Romanian marketing HTML
was regenerated into six chapters (199.462 seconds) and independently validated.
FFmpeg silence detection on its second MP3 measured approximately 1.55 seconds
after the heading, 0.62–0.69 seconds at sentence gaps and 1.09 seconds at the end
of the paragraph, including natural model silence. This is a technical spot check,
not a human listening review or a guarantee for every sentence boundary.
