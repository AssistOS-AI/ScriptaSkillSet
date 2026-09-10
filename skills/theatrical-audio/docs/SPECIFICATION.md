# Theatrical Audio Skill — executable design specification

Version 3.2.0 · Provider-dependent multilingual scenes · implementation contract, not a quality guarantee.

## Purpose and boundary

The skill converts a short performance score into independent voiced clips, a measured timeline and optional locally mixed preview audio. Its intended consumer is a coding agent making animated scenes: dialogue must remain editable without regenerating an entire film. The agent supplies semantic interpretation; the executable validates, synthesizes, caches and composes. There is no hidden planning LLM, browser automation, persistent service, MCP server or cloud fallback.

The source package requires Node >=22. Cloud adapters use native `fetch`. Local adapters use one private Python worker and explicitly installed model dependencies. The source ZIP is self-contained **as application source**, not as a bundle of every model/runtime. See `CONFIGURATION.md` for minimal setup and `DEPLOYMENT.md` for offline reconstruction.

## Public operations

| Operation | Result | External work |
|---|---|---|
| `say TEXT --out line.wav` | One selected dry WAV plus `line.scene/` bundle | Only chosen TTS backend |
| `draft TEXT.txt --out scene.json` | Mechanical single-narrator draft with source spans | None; not a semantic director |
| `validate SCORE` | Schema, names, source-span and timing-dependency checks | None |
| `render SCORE --out DIR` | Independent takes, stems, measured timeline, reports, optional audition WAV | Chosen backend on cache misses |
| `verify DIR` | Re-read asset bytes, hashes, durations and timeline | None |
| `preview DIR --out scene.html` | Self-contained HTML embedding audio | None |
| `voices` | Score cast, documented/curated voice list, or provider catalogue | Selected provider metadata only, never synthesis |
| `providers [--free-only]` | Dated offer profiles | None |
| `plan SCORE --engine NAME` | Validated requests and all-cache-miss usage upper bounds | None; no credential check |
| `doctor` | Configuration/key/package/model-path preflight | No synthesis or credential validation |
| `setup ENGINE` | Default engine; for local, explicit private installation | Local preparation only when invoked |

CLI success is JSON on stdout; progress goes to stderr. Errors are JSON on stderr with nonzero exit status. Keys are supplied locally, never as positional command arguments. Commands run in the extracted skill folder, or use an absolute path to `bin/audio.mjs`.

## Authoring model

A score names a cast and a sequence of semantic beats. A speech beat has exact spoken text, a speaker ID and optional direction. A pause beat holds scene time without an audio file. Useful initial clip targets are single coherent performances, often a few seconds; the schema caps text at 600 JavaScript string code units per beat. It does not enforce a fixed spoken duration. Long sentences may need editorial splitting; splitting every word undermines natural phrasing.

Common direction fields are `emotion`, `intensity`, `pace`, `delivery`, and `emphasis`. They are an authoring vocabulary, not universal knobs with identical perceptual meaning. Gemini/Hume model 1/OpenAI/Qwen receive generated natural-language directions; Groq uses tags and Cartesia an emotion enum; ElevenLabs receives explicit audio tags/settings; Azure receives supported SSML styles/rate; Kokoro receives voice and rate only. Unsupported behavior is disclosed, never claimed equivalent. All speech retains its canonical text separately from direction.

A scene's visual events reference beat starts, dry ends or explicit audio-bound markers. Do not estimate that a phrase will take 2.37 seconds and hard-code all later events. Generate the voice first, then resolve the actual frame count. An internal hesitation such as `David... don't turn around` stays in the performance. A two-second camera hold after it is a pause beat or an anchor offset.

## Execution sequence

1. Parse strict CLI flags, load only explicitly selected credential files for provider commands, resolve optional current-project settings, and reject a cloud engine under `--offline`.
2. Parse JSON; validate the shipped bounded schema; check unique IDs, speaker references, exact source spans and acyclic timing dependencies.
3. Acquire the output directory lock. Create the selected backend only. Local workers check model files and load neural weights lazily on the first synthesis; one model instance serves the whole scene.
4. Preflight every cloud job before making the first billable request. This catches missing voice IDs and invalid payload shapes, not account-side restrictions.
5. For each speech take, derive a seed/take identity and cache key. Verify existing cache bytes by SHA-256; otherwise synthesize exactly once, read the actual audio, convert to mono and resample to the chosen scene rate.
6. Record each dry take's duration, amplitude statistics and provenance. Select an explicit `selectedTake` or the first technically usable take. There is no hidden emotional-quality classifier.
7. Build a separate playback stem, optionally adding simple room reflections. Preserve the dry performance and distinguish its end from the later acoustic tail.
8. Resolve all beat/visual anchors into integer audio frames; load local sound effects or synthesize procedural presets. Add looping ambience beds separately.
9. Mix an audition in memory, derive conservative sample-peak headroom, and write reports/assets. `--no-audition` avoids writing the long mixed WAV; it does not remove in-memory mixing used for level calculation.
10. Write timeline and manifest JSON, verify consistency, and close the worker/lock in cleanup paths.

Local inference does not launch a server. Its IPC is JSON Lines over child stdin/stdout. Model-loading messages stay on stderr. A request timeout terminates a wedged worker. The render owns the worker for the job and closes it on completion; no daemon or shared GPU pool is implemented.

## Timeline semantics

The scene sample rate is 24,000 or 48,000 Hz. All compiled event times are integer frames:

`frame = round(seconds * sampleRate)`.

For dry speech with N frames starting at S, `endFrame = S + N`. Processed reverb may produce `audibleEndFrame > endFrame`. Subsequent default dialogue follows the dry end, so a room tail need not insert an artificial conversational pause. A `pause` occupies frames but has no playback asset. A numeric `at` is an absolute second offset. A beat anchor can use `start`, `end`, or a named marker plus a positive or negative offset, provided the final start is nonnegative.

Unpositioned beats follow the previous beat's end; explicit `at` permits overlapping speech. An explicit dependency cycle is rejected. Visual duration and acoustic tails contribute to scene duration. The final tail default is 0.5 seconds; `say` uses zero. Default scene cap is 300 seconds, configurable up to the schema's 600-second maximum. This cap bounds the scene compositor, not an audiobook workflow; render longer works as separate scenes.

Markers carry local seconds, a `basis` label and the **exact dry WAV SHA-256**. Changing the selected take invalidates stale markers. The implementation validates supplied alignment; it does not generate word/phoneme timestamps. `forced-alignment` is a provenance label for externally supplied results, not a built-in aligner. The example player uses an amplitude envelope for mouth opening and full-line captions. It is not phonetic lip-sync.

## Backend contracts

A backend exposes `info`, `fingerprint`, `synthesize(job, outputPath)` and `close()`. A cloud backend also exposes pure `validateJob`, `cacheIdentity`, and an optional voice catalogue. A job contains text, voice mapping, direction, generated instruction, pace, take seed and local max-token hint. A backend must write a valid WAV; cloud adapters request WAV, raw PCM, or JSON/base64 audio, validate it and wrap/normalize as needed. The renderer measures the file instead of trusting a provider's guessed duration.

OpenAI posts exact input plus a separate instruction to `/v1/audio/speech`. Default `gpt-4o-mini-tts`; older `tts-1` variants explicitly require degraded-control permission. ElevenLabs posts v3 prefix tags and voice settings, with canonical subtitle text untouched. Azure posts escaped SSML. All three request 24 kHz signed 16-bit mono PCM. Encoded MP3/OGG, JSON/HTML, empty and odd-sized responses are rejected instead of being mislabeled as PCM. No cloud credentials are persisted to output metadata.

Qwen accepts only the configured 1.7B CustomVoice or VoiceDesign model class. It rejects a Base/0.6B substitution. CustomVoice uses a predefined speaker; design uses its description. No voice cloning is included. Kokoro's control is voice/rate only and needs `--allow-degraded`. `test-tone` is an explicitly requested deterministic diagnostic signal, never speech. There is no eSpeak speech backend and no Chatterbox implementation in this package.

Cloud limits: response byte cap, end-to-end request timeout, HTTPS endpoints and redirect refusal. A timeout may have been billed. Automatic retries and provider fallbacks are intentionally absent. Default new-request cap is 100 per render, configurable to 1–2500; it is not a money budget. Requests are sequential to avoid uncontrolled costs/concurrency. API capabilities depend on provider access and can change; adapter sources and provider documentation are listed in `SOURCES.md`.

## Caching and provenance

The cache identity includes version/source fingerprints, backend/model identity, the actual synthesis inputs and scene sample rate. Local model trees are hashed before reuse. Cloud keys include request body/endpoint/model and the take identity, with an optional cache salt for deliberate version changes. The API key itself is excluded. Voice-direction changes affecting the selected backend cause a miss. Placement, pauses, selected-take index, gain, pan, room and visual instructions do not.

Exact reuse means reusing verified cached bytes. Re-synthesizing a cloud model does not promise deterministic audio. Some backends have no seed API; metadata reports that rather than inventing determinism. Cache corruption causes regeneration. `--refresh` deliberately bypasses stored takes. Output files are content-addressed; an old unreferenced asset can remain after a rerender, so distribute only files referenced by the current timeline or a fresh output directory. Cache metadata contains source text and direction; keep it private where required.

Each take records its seed, cache key, SHA-256, sample rate, frames, duration, amplitude statistics, reuse status and synthesis metadata. Technical checks detect near-silence, near-full-scale samples and unusually long clips. They do not establish word accuracy, naturalness, voice identity or emotion. Those fields explicitly say `not-performed`. A failed render can leave already-completed cached takes for an intentional retry; it must not present partial output as a verified final bundle.

## Audio composition

Dry takes are mono PCM WAV; scene stems and the audition are kept distinct. User WAV assets are resolved relative to the score file. Procedural presets are deterministic lightweight textures: space-hum, wind, rain, drone, metal, chime, airlock and pulse. They are not neural environmental audio or licensed recordings. No text-to-music model, convolution IR collection or photorealistic sound library is bundled.

The DSP implements gain, stereo placement, limited early reflections, looping beds, fades, dialogue ducking and sample-peak-based mix attenuation. These are useful editing primitives, not professional loudness certification. It does not measure integrated LUFS, guarantee a true-peak ceiling, remove all noise or normalize perceived loudness across arbitrary voices. Import suitable clean WAV stems when production needs exceed the procedural presets. No MP3/Opus export is implemented; encode later with your chosen pipeline if needed.

## Player and animation integration

The standalone preview embeds only selected playback assets and timeline data. It uses Web Audio as the time authority, with a user gesture to start. On pause/seek, scheduled audio nodes are stopped and rebuilt with offsets. Animation frames read the audio clock rather than advancing an independent timer. The example drawing is a schematic staging aid, not a general cinematic animation renderer.

A production renderer should use the same timeline frames, preload/decode required clips, and reconstruct visual state on seek. Do not execute arbitrary code from visual `action` or `params`; map known actions to your own animation system. Do not let a background-tab animation timer become the speech timebase. Native output bundles contain no API keys; once generated, playback requires no provider authentication or model.

## Failure and acceptance criteria

The implementation must fail rather than silently change backend/voice, reuse stale alignment, produce a fake neural sample, or claim an unsupported emotion control. A score changing only a scene pause must reuse dry takes and move subsequent events by the corresponding frame offset. A hash-modified asset must fail bundle verification. A request cap must preserve completed cache entries but prevent additional requests. A voice-setting error in a later beat must be discovered before earlier cloud calls. These properties have automated fixture tests.

Human acceptance remains necessary: check exact words, actor identity across clips, emotional intent, phrase boundaries, mouth/gesture alignment and mix clarity. Regenerate only the failing beat, choose a different take, or simplify direction. There is no meaningful guarantee of a “perfect theatrical file for any text.” This package makes these decisions inspectable and locally controllable instead of concealing them.

The evidence boundary and commands to repeat validation are in `VALIDATION.md`. Installation, live providers, GPU speed and real neural acting have not been validated in this sandbox.


## Multi-provider extension: executable contracts

`providers.json` is a dated, checked-in offer catalogue, not a billing service. `src/providers.mjs` selects recurring-free profiles and validates model/voice categories. `src/extra-cloud.mjs` implements ten additional cloud engines; together with `src/cloud.mjs` these cover thirteen. Request builders are pure functions without credentials. Authentication is inserted only at send time. Each adapter preflights every job before any synthesis starts.

`planScene` in `src/plan.mjs` validates the schema, cast and provider request shapes and returns an all-cache-miss request/source-character upper bound. It performs no network request, model loading, credential validation, quota query, or cache mutation. It cannot report an exact financial estimate.

Responses can be binary WAV, raw PCM, or JSON/base64. Gemini PCM is little-endian 16-bit mono (normally 24 kHz). Polly is 16-bit mono at 16 kHz. Google, Hume and Mistral JSON audio is decoded and validated; other new adapters request WAV directly. Explicit 0xffffffff streaming WAV size sentinels can be normalized; ordinary truncation fails. Compressed audio or HTTP-200 error text is never passed off as WAV. No codec fallback is hidden. Native AWS SigV4 is tested against an independently computed botocore fixture.

All network calls are bounded, HTTPS, no redirect, with no automatic retry. Request/character caps apply only to new takes. Minimum request-start intervals do not alter scene time. A cap may stop a render after earlier clips are cached. `--free-tier-only` excludes trials, uncertain entitlements, and known paid-only profiles, but does not prevent a paid-account charge for an allowed profile.

The browser audition is separate from generation: no keys, no export and no timing promises. The exported scene player is unchanged: buffered audio assets, actual frame durations, sample-clock scheduling. Neither path is a bidirectional TTS WebSocket client. Technical request/response compatibility is tested with mocks; live providers, quota availability and performance quality remain externally validated concerns.
