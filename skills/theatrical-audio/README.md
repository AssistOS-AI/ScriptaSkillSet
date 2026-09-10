# Theatrical Audio

Directed speech clips, independent ambience/effects and a measured animation timeline. Language support is provider/voice dependent. **13 cloud adapters + 2 local neural backends.** Native Node.js 22+, no npm packages, SDK, FFmpeg or server for cloud rendering. Local Qwen/Kokoro use optional private Python environments and explicitly downloaded models.

## Start in any project

Copy the whole skill folder to a location supported by your agent. No SHF project, sibling skill, JSON settings or credential file is required. Set `SKILL_ROOT` in the shell examples to the absolute copied folder and run from your project directory. Use process environment credentials for cloud speech, or explicitly pass `--credentials-file PATH`. Check the selected account and model before synthesis.

A first check needs no keys, Python, configuration or downloads:

```bash
node "$SKILL_ROOT/bin/audio.mjs" validate "$SKILL_ROOT/examples/minimal.score.json"
node "$SKILL_ROOT/bin/audio.mjs" plan "$SKILL_ROOT/examples/the-last-light.score.json" --engine gemini
```

With the selected provider's credentials in the process environment:

```bash
node "$SKILL_ROOT/bin/audio.mjs" say "David... don't turn around." --engine gemini --voice Kore --direction "Quiet, restrained fear. Almost whisper." --free-tier-only --max-requests 1 --out demo.wav
```

This writes a dry WAV and a `demo.scene/` bundle. No credential is included in the package. Do not put secrets into agent messages, scores, HTML, logs or source control. Romanian guide: **START_HERE_RO.md**.

```bash
node "$SKILL_ROOT/bin/audio.mjs" providers --free-only
node "$SKILL_ROOT/bin/audio.mjs" voices --engine gemini
node "$SKILL_ROOT/bin/audio.mjs" setup gemini
```

`setup` is optional and saves a default in the current project's `audio.config.json`, or the file selected by `--settings`. Without a selected engine the default is local Qwen, which must already be prepared to render speech. Output and cache defaults live in the current project, not the installed skill. Shared `.apikeys` loading is opt-in through `--workspace-root PATH`; see [optional integration](docs/WORKSPACE_INTEGRATION.md).

## Supported backends

Recurring free offer profiles: **Gemini, Groq, Hume, Cartesia, ElevenLabs, Azure F0, Cloudflare, Google Cloud, VoiceRSS**. Google Cloud requires a billing-enabled project. **Deepgram and Polly** have one-time/eligibility-dependent trial credit paths. **Mistral** has an implemented Voxtral speech adapter, but its TTS-specific free allowance has not been established here. **OpenAI** remains available without an assumed universal free allowance. **Qwen/Kokoro** remain local options.

Each profile records API/limits links and caveats in `providers.json` and `docs/FREE_PROVIDERS.md`, checked 2026-09-10. A free key is not a promise of free synthesis or commercial rights. `--free-tier-only` filters published profiles; it does NOT inspect your balance or enforce a monetary cap.

## Scene workflow

```bash
node "$SKILL_ROOT/bin/audio.mjs" plan "$SKILL_ROOT/examples/the-last-light.score.json" --engine gemini --free-tier-only
node "$SKILL_ROOT/bin/audio.mjs" render "$SKILL_ROOT/examples/the-last-light.score.json" --engine gemini --free-tier-only --max-requests 7 --request-interval-ms 6500 --out output/scene
node "$SKILL_ROOT/bin/audio.mjs" verify output/scene
node "$SKILL_ROOT/bin/audio.mjs" preview output/scene --out output/scene.html
```

`plan` performs no network calls or synthesis. It reports an upper bound assuming cache misses. A render preflights all clips, synthesizes only cache misses, measures audio duration, and compiles relative visual anchors. A pause-only edit reuses the same speech takes. The HTML embeds the assets and requires no server. Browser audition without an API key is separately available in `web/browser-audition.html`; it cannot export WAV.

The agent writes the performance plan. There is no hidden LLM call inside the CLI. Voices/acting capabilities differ across engines: Gemini and Hume Octave 1 accept natural-language directions; Groq/ElevenLabs use explicit tags; Cartesia uses enumerated emotions and pace; Azure uses supported SSML styles; other adapters expose more limited controls. All new multi-character cloud scenes require per-character voice assignments to avoid silently giving every character the same default voice.

## Agent installation

Place this entire directory at `PROJECT/.agents/skills/theatrical-audio/` (or an appropriate skill directory supported by your coding agent). Read `SKILL.md`. The CLI uses public provider APIs and locally configured keys, never Codex/ChatGPT session tokens. The running agent must be permitted to invoke Node and reach the selected endpoint.

## Output contract

`score.json`, `timeline.json`, `takes.json`, `report.json`, hash-named `dry/`, `clips/`, `beds/`, and optional `audition.wav`. Speech remains editable per beat. Scene pauses occupy timeline frames, not padded speech files. Exact frame counts are authoritative; neither a TTS pace setting nor an emotional cue promises an exact duration. Lip movement in the preview is amplitude-based, not phonetic alignment.

## Documentation and evidence

`docs/CONFIGURATION.md`: all provider keys, minimal commands, voices and local installation. `docs/FREE_PROVIDERS.md`: offers and account caveats. `docs/SPECIFICATION.md`: executable design. `docs/FORMAT.md`: scene format. `docs/VALIDATION.md`: executed tests versus unverified real inference.

Development checks, run from the skill folder:

```bash
node --test tests/*.test.mjs
python tests/test_backends.py
node tools/acceptance.mjs test-tone
```

The test suites use mocked cloud responses and diagnostic non-speech waveforms. No live provider key has been used in the build sandbox; successful contract tests do not certify account compatibility or acting quality. Models and neural audio demos are not bundled. Source license: MIT; provider/model/voice/assets terms apply separately.
