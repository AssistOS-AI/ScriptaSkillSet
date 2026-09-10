---
name: theatrical-audio
description: Generate character speech as cached WAV clips, separate ambience and sound effects, and measured animation timelines. Use a selected cloud provider or a local Piper, Qwen or Kokoro model. Works independently of any film player or project framework.
---

# Theatrical Audio

## Execution contract

Use Node.js 22+ and this skill's `bin/audio.mjs`. Resolve `SKILL_ROOT` to the absolute directory containing this file. Invoke scripts and bundled examples through that path from the target project's working directory. User input, output, cache and explicit configuration paths are relative to that working directory. The variable is only shell shorthand; an absolute path works without setting it. Do not run npm install. The cloud adapters have no SDK or external codec dependency. Local models require explicit preparation in a private Python environment. See [dependencies.md](dependencies.md). Do not install anything globally. A user or workspace may authorize private model downloads as the standing default; honor that authorization without asking again.

You, the coding agent, provide the semantic direction. `draft` only segments text: there is no hidden LLM call. Preserve the spoken text unless the user requested adaptation. Do not promise perfect acting, exact word timing, phonetic lip-sync, or automatic artistic take selection.

No JSON configuration, `.env`, `.apikeys`, project policy, sibling skill or workspace script is required. Read [docs/FORMAT.md](docs/FORMAT.md) when authoring a score and the selected provider's section in [docs/CONFIGURATION.md](docs/CONFIGURATION.md) when generating speech. Read [docs/WORKSPACE_INTEGRATION.md](docs/WORKSPACE_INTEGRATION.md) only for optional shared configuration. `providers --free-only` inspects a dated offer registry, not account balances; verify current offers before promising free synthesis.

## Default setup and provider selection

For a narrated presentation, use English unless another language is explicitly requested. If no engine is configured, say so, create `audio.config.json` and an ignored `.env.audio` with a tracked `.env.audio.example`, then use a small local neural model. The default engine is Piper; use `en_US-ljspeech-medium` for English. Run `setup piper --voice en_US-ljspeech-medium --download` when task/workspace authorization covers private package and model downloads. See [LOCAL_PIPER.md](docs/LOCAL_PIPER.md). Do not ask again about audio or setup already authorized. Rendering never downloads. If an explicitly configured provider fails, preserve completed clips and report the failure; do not switch providers silently.

## Select one provider, never silently switch

Use the user-selected engine or explicit local configuration. Check language, voice and required controls before rendering. Project preferences apply only when actually present and relevant. Do not send text to a provider just because a key exists. A named cloud request covers the requested content, not unrelated files. Prepared Piper, Qwen and Kokoro are local options. None downloads on render. Use the authorized default setup workflow when no engine was selected; do not treat a cloud API error as missing configuration.

Read secrets via the CLI/environment mechanism. The default uses only process environment variables. Optional `--credentials-file PATH` loads a TTS environment file; `--workspace-root PATH` opts into that directory's `.apikeys`. Neither searches parent directories. Process values win, followed by the explicit environment file, then supported workspace variables. Never print or copy API keys into source, scores, logs or messages. Never reuse agent session tokens or bypass provider quotas.

`doctor --engine NAME` checks presence/configuration, not key validity, account balance or real model inference. `voices --engine NAME` may make one metadata request (Hume, Mistral, Google, Polly, ElevenLabs, Azure); built-in/curated catalogues do not establish account access. `plan` requires no synthesis or credentials and performs no network request.

## Smallest useful first run

Without keys, settings, Python or downloads, validate and plan a bundled scene:

```bash
node "$SKILL_ROOT/bin/audio.mjs" validate "$SKILL_ROOT/examples/minimal.score.json"
node "$SKILL_ROOT/bin/audio.mjs" plan "$SKILL_ROOT/examples/the-last-light.score.json" --engine gemini
```

Actual speech requires credentials for the selected cloud service or a prepared local model. Neither prerequisite applies to validation, drafting, planning or playback of an existing bundle. For a one-line cloud render:

```bash
node "$SKILL_ROOT/bin/audio.mjs" say "David... don't turn around." --engine gemini --voice Kore --direction "Quiet, restrained fear. Almost whisper. Do not overact." --free-tier-only --max-requests 1 --out audition.wav
```

The user sets GEMINI_API_KEY locally beforehand. `--free-tier-only` filters documented recurring-free model profiles; it DOES NOT read the user's subscription or prevent paid-account overage. Check the actual provider dashboard/resource tier. One take is the default. Do not generate comparison takes until the user approves that additional usage.

For a scene:

```bash
node "$SKILL_ROOT/bin/audio.mjs" plan "$SKILL_ROOT/examples/the-last-light.score.json" --engine gemini --free-tier-only
node "$SKILL_ROOT/bin/audio.mjs" render "$SKILL_ROOT/examples/the-last-light.score.json" --engine gemini --free-tier-only --max-requests 7 --max-chars 2000 --request-interval-ms 7000 --out output/scene
node "$SKILL_ROOT/bin/audio.mjs" preview output/scene --out output/scene.html
node "$SKILL_ROOT/bin/audio.mjs" verify output/scene
```

Pacing delays apply between network requests, NOT in the audio. They do not guarantee compliance with every account's limits. HTTP errors stop the job, without retry or provider fallback. Valid earlier clips remain cached. `--refresh` deliberately spends new requests. Never use it automatically to fix a pause or animation edit.

## Cast and controls

Read the provider table in CONFIGURATION.md. A character label is not a real voice ID. All multi-character scenes need explicit selected-provider voice mappings; new adapters enforce this. `--voice` is for one speaker only. Do not change a character's voice to express an emotion. Different providers' similarly labelled voices are NOT the same identity.

Gemini and Hume **model 1** support natural-language direction. Hume 2 is not equivalent: description-based acting is unavailable in the documented contract. OpenAI/Qwen 1.7B support instructions. Groq uses explicit `direction.groq.tags`; ElevenLabs v3 uses `direction.elevenlabs.tags`; Cartesia uses an enumerated `direction.cartesia.emotion`; Azure uses supported `direction.azure.style`/styleDegree. Do not silently translate arbitrary emotional prose into unsupported provider settings.

Cloudflare, Google Neural2, VoiceRSS, Deepgram, Polly, Mistral and Kokoro have reduced acting control in these adapters. Use `--allow-degraded` only when the user accepts that limitation. Read warnings. Mistral's TTS-specific free entitlement is unconfirmed, so `--free-tier-only` rejects it. Trial-only Deepgram/Polly and paid OpenAI are also excluded by that flag.

The shipped scene has explicit example casts for Gemini, Groq, Cartesia, Cloudflare, Google, VoiceRSS, Deepgram, Polly, OpenAI and Azure. Hume, Mistral and ElevenLabs require user-selected cast IDs/names; do not invent them. Curated examples still need real account validation.

## Clip and timeline rules

Write a `theatrical-audio/1` score. Group a complete performance beat into each speech clip, usually a few seconds. The schema caps one clip at 600 characters, but Groq has a stricter 200-character limit INCLUDING tags. Do not truncate user text; split at semantic boundaries and preserve every word.

Put camera/action pauses in `type: pause` beats, not padded voice files. Keep hesitations that belong to acting within the speech performance. The compiler derives absolute frame positions from measured audio. Anchor gestures to clip starts/ends or explicit verified markers, never guessed phonemes. Word markers must be tied to the source clip hash.

For narrated presentations, leave real listening space: normally 1.0–1.5 seconds
between sentences and 1.8–2.5 seconds across scene changes. Use pause beats or the
host's measured timeline, not provider request throttling or punctuation alone.
Avoid tempo acceleration by default; shorten repeated content to meet a duration
brief. Pauses are meaningful direction, and changing them should reuse voice clips.

Keep voice, SFX and ambience separate. Use local procedural beds or user-provided authorized WAV assets; do not invent an AI environment-generation capability. The player schedules buffers against the audio clock. Mouth movement is amplitude-based, not phoneme animation.

`audition.wav` is a convenient scene mix, not the authoritative asset for an animation. Export the bundle's timeline and separate files. `--no-audition` omits writing the mixed WAV; mix statistics and peak attenuation are still computed. Preview uses a standalone HTML file and no API keys. Do not embed credentials in web pages.

## Finish with evidence

Report generated/cache-hit counts, warnings, selected engine/model/voices, and actual output files. Successful technical checks do not establish correct words or emotions: the user must listen. Cloud output is reproducible only by cache reuse, not by replaying a seed. Cloud adapters are contract-tested with mock audio; this does not establish real account access. Report local inference checks against the actual prepared model and keep their receipts; do not generalize one successful voice to all models.

`web/browser-audition.html` provides optional no-key Web Speech listening on the user's browser. It is not a file-export backend, cannot promise neural quality, and is unsuitable as the master clock for synchronized exported scenes. Do not claim it produced a WAV.
