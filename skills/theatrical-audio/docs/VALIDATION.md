# Portability verification, 2026-09-10

The revised Node suite passes 196 tests, including configuration precedence and a copied skill running from an unrelated project with spaces in its path. The copied-folder test validates and plans without credentials, renders diagnostic WAVs, reuses cache, verifies assets, exports an HTML preview and saves project settings. It checks that the installed skill remains byte-for-byte unchanged. Missing optional configuration and missing required local runtime paths are exercised. Cloud tests use mocked responses; no live TTS call or neural-model installation was performed.

The earlier package evidence below is retained for context. Its browser results were not rerun for this configuration and documentation update.

# Validation and evidence

Package 3.0.0; executed in this sandbox. **No real cloud API keys were used, no billable/free-account synthesis was performed, and no neural weights were loaded.** Provider contract tests use diagnostic audio fixtures. They are not listening demonstrations or proof of real account access.

## Executed checks

| Check | Actual result | Evidence |
|---|---|---|
| Node unit and integration suites | 193 tests passed, 0 failed | `validation/node-tests.tap` |
| Python local adapter contracts | 9 passed with fake model/library objects | `validation/python-tests.txt` |
| Scene acceptance | 7 diagnostic takes generated; second render reuses all 7; identical mixed bytes | `validation/acceptance.json` |
| Existing animation player | 8 checks passed, 12 separate audio buffers, pause/seek/resume, no network | `validation/browser-report.json` |
| Browser-only audition UI | 5 checks passed, including mocked Web Speech routing; no real speech | `validation/browser-audition-report.json` |
| Provider registry / example planning | 9 recurring-free profiles, 7 planned scene requests, zero network | `validation/free-provider-registry.json`, `validation/example-plan.json` |
| Candidate archive after extraction | Unit/contract suites and CLI smoke rerun | `validation/archive-smoke.txt` |

The Node suite includes all original core/three-provider tests plus ten new adapters, request/response formats, mock synthesis, secret-free cache identity, quota guards, pacing, no-retry, cast validation and all-ten-provider cache/timeline integration. AWS SigV4 additionally matches a frozen fixture independently computed using botocore with fabricated credentials. The actual Fetch Headers normalization is checked so duplicate case-insensitive Content-Type fields cannot silently invalidate the signature. Botocore is NOT a runtime or test dependency of the package.

Chromium policy blocked direct file:// navigation to the generated scene preview. The same HTML markup was tested with set_content, without overriding policy or starting a server. Direct file opening on the user's OS remains a local check. UI screenshots are included as execution evidence, not as proof of acoustic quality. The browser audition verifies routing with a synthetic Web Speech test double, not a system voice.

## Exact scope of the mock assertions

Gemini: generateContent/audio schema, supported voice names, PCM16LE decoding, completion/moderation checks. Groq: explicit tags and the 200-character input bound. Hume: Octave-1 description versus Octave-2 rejection/degraded control, JSON/base64 WAV and named/UUID voice routing. Cartesia: versioned string-voice schema, emotion enum and speed. Cloudflare: account-scoped Aura REST payload and WAV. Google: API-key/OAuth alternatives and base64 LINEAR16 WAV. VoiceRSS: POST form, key exclusion from URL/cache, HTTP-200 error text rejection. Deepgram: model-as-voice and WAV parameters. Polly: signed request and correct 16 kHz PCM wrapping. Mistral: speech request and audio_data base64 decoding, plus paginated voice discovery.

For every new engine, a mocked scene is rendered, then only its pause is changed. Both voice clips must be reused, no new synthesis request is made, and later events move by the exact added sample frames. Tests also cover bad later-request preflight, request/character caps, rate pacing, missing secrets, offline rejection, no automatic retries and no fallback.

All live account/model/voice combinations remain **unverified**. Provider aliases, contracts, prices and access restrictions may change after the dated documentation review. `doctor` returns credential presence but not credential validity. A real render establishes only that the selected request worked; a listener must assess exact words, character consistency and emotion. No automatic credit/billing balance check is implemented.

## Reproduce without accounts or network

```bash
node --test tests/*.test.mjs
python tests/test_backends.py
node bin/audio.mjs providers --free-only
node bin/audio.mjs plan examples/the-last-light.score.json --engine gemini --free-tier-only
node tools/acceptance.mjs test-tone
```

`test-tone` generates tones, NOT speech. It is never an automatic fallback and has no artistic value. No eSpeak demo is bundled. Repeating acceptance in a directory with an existing cache can show zero new initial takes; the cache-reuse property is still checked.

Browser tests are development-only; they require Playwright/Chromium, which are NOT required for normal CLI or page use:

```bash
python tests/browser_smoke.py output/acceptance-test-tone/preview.html
python tests/browser_audition_smoke.py
```

## Minimum real acceptance on your machine

Configure one authorized provider and verify its actual free/account tier. Run one short `say` with one take and max-requests 1. Listen for all supplied words, without added speech. Compare neutral and directed versions with the same voice only after approving the extra request. Render the example scene with one take per line, audit it and open the HTML. Change a pause by one second: unchanged speech should remain cached while later events move by one second's frames. Regenerate one line: stale hash-bound markers must no longer be accepted.

For cloud, inspect the real provider usage dashboard and confirm only the intended service was contacted. For local inference, prepare explicitly then render with OS-level network disabled. Record platform/runtime/model revision, RAM/VRAM, elapsed time and generated duration before making hardware-speed claims.

## Explicitly not implemented / not established

No real provider qualification matrix; no guarantee of free account eligibility/remaining credits; no automatic money cap; no account/key rotation; no reader-site scraping; no WebSocket/bidirectional real-time TTS transport; no streaming audio playback while a clip is being generated. HTTP chunked responses are buffered and validated before use. No automatic phoneme alignment/lip-sync, ASR transcript verification, artistic take ranking, emotion certification, cross-engine identity matching, clone-plus-instruction preservation, professional LUFS/true-peak mastering, neural SFX/music model, universal portable Python binary, or browser Web Speech WAV capture. These boundaries are intentional and exposed rather than simulated.
