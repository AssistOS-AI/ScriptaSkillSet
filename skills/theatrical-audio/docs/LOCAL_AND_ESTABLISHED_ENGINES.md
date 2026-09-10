# OpenAI, ElevenLabs, Azure and local engines

Detailed setup for these five adapters. For current free/trial eligibility, use `FREE_PROVIDERS.md`; for common configuration and budgets, use `CONFIGURATION.md`. Sources [S1]–[S10] are in `SOURCES.md`.

## 1. OpenAI: one secret, no additional installation

Set these values in the process environment. Alternatively create a TTS env file using your editor and add `--credentials-file PATH` to the commands below:

```dotenv
OPENAI_API_KEY=your_actual_platform_api_key
```

Do not paste the key into an agent conversation. The value above is a placeholder, not a working credential. `.env` is excluded by `.gitignore`.

```bash
node bin/audio.mjs say "David... don't turn around." --engine openai --voice marin --direction "Very quiet, restrained fear. Hesitate after David. Almost whisper the last words. No melodrama." --out demo.wav
```

This calls `gpt-4o-mini-tts` and writes `demo.wav`, plus an inspectable `demo.scene/` bundle. `say` selects a dry performance; it does not add scene silence, music or room effects. Generated speech must be disclosed as AI-generated to listeners [S3].

Optional defaults, not required:

```dotenv
AUDIO_ENGINE=openai
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=marin
```

Alternatively `node bin/audio.mjs setup openai` saves only the default engine to `audio.config.json`. It installs nothing and sends no request. Then `--engine openai` can be omitted unless an `AUDIO_ENGINE` environment variable overrides it.

```bash
node bin/audio.mjs voices --engine openai
node bin/audio.mjs doctor --engine openai
```

`voices` lists documented built-ins; it does not prove account access. `doctor` checks configuration and key presence, **not** whether the provider accepts the key. Only a real render validates that. Start with one short line and one take.

### Codex is not an API credential broker

Codex can run this CLI with its shell tool. ChatGPT-based Codex sign-in and Platform API-key access are different authentication modes [S1]. The skill does not read Codex's `auth.json`, reuse session tokens, or acquire a key from the subscription. ChatGPT and API billing are separate [S2]. Set a Platform key locally or inherit an existing permitted `OPENAI_API_KEY` from the agent's environment. API model permissions, quota and network access must also permit the request. This is not a claim that every future or host-specific Codex installation has identical built-in media tools; this skill explicitly uses the public Speech API.

The shown one-line commands also work in PowerShell. An optional `.env` is loaded only with `--credentials-file PATH` on either platform; Bash line-continuation `\` is not PowerShell syntax.

## 2. ElevenLabs: key and a voice ID

```dotenv
ELEVENLABS_API_KEY=your_actual_key
ELEVENLABS_VOICE_ID=your_actual_voice_id
```

Get IDs available to your account:

```bash
node bin/audio.mjs voices --engine elevenlabs
```

For a paginated result with `hasMore`, repeat with `--page-token` and the returned `nextPageToken`. The voice listing is an authenticated metadata request, not speech generation.

```bash
node bin/audio.mjs say "David... don't turn around." --engine elevenlabs --tags "whispers" --stability 0.5 --out eleven-demo.wav
```

Default model: `eleven_v3`. Optional `.env`: `ELEVENLABS_MODEL_ID=eleven_v3`. Choose a different voice for a line with `--voice ID`.

ElevenLabs does **not** receive the common natural-language direction as a separate instruction field. The skill uses explicit `direction.elevenlabs.tags`, voice settings and rate. It warns when common emotion/delivery fields are not translated. Tags are added to the synthesis request, not to the canonical subtitle text [S5–S6]. Supported expression depends on the model and voice; a tag is not an exact performance guarantee.

```json
"direction": {
  "emotion": "restrained fear",
  "elevenlabs": {"tags": ["whispers"], "stability": 0.5, "speed": 0.9}
}
```

For v3, this adapter accepts stability `0`, `0.5`, or `1`. Speed is `0.7`–`1.2`. It rejects v3-style tags on other models instead of pretending they work. Numeric `intensity` is not silently mapped to stability: these are different concepts. Only segment-prefix audio tags are implemented, not arbitrary inline tag placement inside a line. No SSML break support is claimed.

## 3. Azure: resource key and its region

```dotenv
AZURE_SPEECH_KEY=your_actual_speech_resource_key
AZURE_SPEECH_REGION=westeurope
```

Use **your resource's actual region**, not necessarily the example above. Default voice: `en-US-JennyNeural`; optionally set `AZURE_TTS_VOICE`.

```bash
node bin/audio.mjs voices --engine azure
node bin/audio.mjs say "David... don't turn around." --engine azure --voice en-US-JennyNeural --style fearful --style-degree 1.2 --pace 0.9 --out azure-demo.wav
```

Choose a style listed for the selected voice and resource. Availability and style support are provider-dependent [S7–S8]. This adapter uses resource-key authentication and SSML `express-as`/`prosody`; managed identity and arbitrary user-authored SSML are not implemented. The common free-form `delivery` field is not executed as an instruction. XML text is escaped before synthesis.

## 4. Qwen local: explicit one-time preparation

Install Node and Python 3.12 with `venv` support first. The setup creates a private Python environment, installs the neural stack there, and downloads the selected model. It does not install global Python packages.

```bash
node bin/audio.mjs setup qwen --python python3.12 --device cpu --download
node bin/audio.mjs say "David... don't turn around." --engine qwen --voice Ryan --direction "Quiet, restrained fear. Almost whisper." --offline --out qwen-demo.wav
```

On Windows, use `--python python` when that executable is Python 3.12; Node launches it without shell syntax. If using NVIDIA, replace `--device cpu` during preparation with `--device cuda:0`. Compatible system drivers are still required. No universal VRAM or latency promise is made. Qwen 1.7B on CPU can be slow and requires considerably more memory than the source ZIP.

Default mode is **1.7B CustomVoice**, with a stable predefined speaker ID plus acting instructions [S9]. English examples use Ryan and Aiden. To use **1.7B VoiceDesign** instead:

```bash
node bin/audio.mjs setup qwen --python python3.12 --device cuda:0 --mode design --download
```

Add `description` to each score voice. Design may drift between clips. `qwenSpeaker` is used by CustomVoice, not VoiceDesign. This package does not implement Qwen Base cloning or interchangeable clone-plus-instruction control. Setup rewrites `runtime/qwen.json` for the selected mode; it does not install two simultaneous Qwen workers. Retain a separate runtime config and pass `--config PATH` when maintaining both modes.

## 5. Kokoro local: cheaper preview, reduced control

```bash
node bin/audio.mjs setup kokoro --python python3.12 --download
node bin/audio.mjs say "There is still time." --engine kokoro --voice af_heart --allow-degraded --offline --out kokoro-demo.wav
```

Kokoro supports voice choice and speed in this adapter, **not** natural-language emotion control. The explicit flag acknowledges that limitation. It is neural speech, not an eSpeak-generated voice. Its phonemization dependency is part of the private environment. Platform wheel compatibility still needs local verification. The skill does not install or invoke a global `espeak` executable.

