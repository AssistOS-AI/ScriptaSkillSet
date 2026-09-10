# Configuration: choose one backend

Version 3.2.0 • documentation checked 2026-09-10. The skill requires Node.js 22+. **No npm install, provider SDK, FFmpeg, global library, browser or server is needed for the cloud paths.** Only local inference adds Python and private model dependencies.

Use process environment variables, or opt into a file with `--credentials-file PATH`. No configuration file or project wrapper is required. Optional `--workspace-root PATH` loads supported TTS variables from `PATH/.apikeys`. Process values win, followed by the explicit env file, then the shared workspace file. Secret files must be ignored by Git. Do not paste secrets into chat. Commands in this provider reference assume the skill directory; from a project, use the absolute CLI path and keep outputs in that project. Public signup/key and pricing links are in [FREE_PROVIDERS.md](FREE_PROVIDERS.md); the bundled offer registry is dated and is not an account entitlement check.

## One-line audition: recommended first test

```dotenv
GEMINI_API_KEY=your_actual_key
```

```bash
node bin/audio.mjs say "David... don't turn around." --engine gemini --voice Kore --direction "Quiet, restrained fear. Almost whisper. Do not overact." --free-tier-only --max-requests 1 --out demo.wav
```

The result is `demo.wav` and an inspectable `demo.scene/` bundle. The flags do not read remaining quota or guarantee a zero bill. Start on a free account, confirm eligibility in its dashboard, and make one request before a scene. Bash multiline examples use `\`; PowerShell users can run the same command on one line.

## Minimal settings and defaults

| CLI engine | Required environment | Default model / voice | Per-character score field |
|---|---|---|---|
| gemini | GEMINI_API_KEY | gemini-2.5-flash-preview-tts / Kore | geminiVoice |
| groq | GROQ_API_KEY | canopylabs/orpheus-v1-english / troy | groqVoice |
| hume | HUME_API_KEY | 1 / Ava Song | humeVoice |
| cartesia | CARTESIA_API_KEY | sonic-3.6 / Skylar UUID | cartesiaVoice |
| elevenlabs | ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID | eleven_v3 / your selected voice | elevenlabsVoice |
| azure | AZURE_SPEECH_KEY, AZURE_SPEECH_REGION | Neural / en-US-JennyNeural | azureVoice |
| cloudflare | CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID | @cf/deepgram/aura-1 / asteria | cloudflareVoice |
| google | GOOGLE_TTS_API_KEY (or GOOGLE_ACCESS_TOKEN) | Neural2 / en-US-Neural2-F | googleVoice |
| voicerss | VOICERSS_API_KEY | named voice / Linda (en-us) | voicerssVoice |
| deepgram | DEEPGRAM_API_KEY | aura-2-thalia-en | deepgramVoice |
| polly | AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION | neural / Joanna | pollyVoice |
| mistral | MISTRAL_API_KEY, MISTRAL_VOICE_ID | voxtral-mini-tts-2603 / your selected voice | mistralVoice |
| openai | OPENAI_API_KEY | gpt-4o-mini-tts / marin | openaiVoice |
| piper | prepared private Python environment + model | en_US-ljspeech-medium / local neural | piperVoice |
| qwen | prepared private Python environment + model | 1.7B CustomVoice / explicit speaker | qwenSpeaker |
| kokoro | prepared private Python environment + model | Kokoro / explicit voice | kokoroVoice |

A UUID or voice name must be real and accessible. Defaults above are documented examples, **not live-account-tested voices**. The following commands never return key values:

```bash
node bin/audio.mjs providers --free-only
node bin/audio.mjs setup gemini
node bin/audio.mjs doctor --engine gemini
node bin/audio.mjs voices --engine gemini
```

`setup` for cloud saves the default engine only; it does not create an account or key. `doctor` checks local configuration, not credential validity. `voices` can query a provider catalogue (see below). `--page-token VALUE` continues from a returned nextPageToken; no automatic catalogue pagination or synthesis occurs.

## Gemini Developer API

One key from Google AI Studio. Optional `GEMINI_TTS_MODEL`, `GEMINI_TTS_VOICE`. The adapter uses standard `generateContent` with AUDIO output, a prebuilt voice, and a prompt separating acting instructions from exact spoken text. Raw little-endian PCM16 at 24 kHz is wrapped as WAV. This is NOT Gemini Live/WebSocket or Google Cloud TTS.

Default Flash 2.5 TTS has a published free profile. `--model gemini-3.1-flash-tts-preview` is an explicit alternative profile; no model fallback occurs if access is denied. Pro is excluded by `--free-tier-only`. Review account/region/data-use terms before sending sensitive work. Thirty documented prebuilt voice names are available in `voices` without a synthesis request.

## Hume: deliberate use of Octave 1 for acting

Set HUME_API_KEY. The default is **HUME_TTS_MODEL=1**, voice `Ava Song` (documented HUME_AI name). Optional HUME_VOICE_ID is either a UUID or an exact voice name. Catalogue:

```bash
node bin/audio.mjs voices --engine hume
node bin/audio.mjs say "I kept the lights on." --engine hume --voice "Ava Song" --direction "Tender, intimate reassurance, barely above a whisper." --free-tier-only --out hume.wav
```

Descriptions are concise and sent separately from text. Common `pace` maps to speed (0.5–2); numeric emotional intensity is not a provider parameter and produces a warning. To select a saved custom voice by name, set `voices.CHARACTER.humeProvider` to `CUSTOM_VOICE`; defaults use `HUME_AI`. UUIDs do not need the provider field.

**Octave 2 is not the default:** the documented API does not yet offer description-based acting there. Explicit `--model 2` with directions requires `--allow-degraded`. This is a capability distinction, not a claim that one model sounds better. The API returns base64 WAV in JSON. `voices` reads page 0 of HUME_AI voices, not every custom voice in the account.

## Groq Orpheus: short clips and tags

Set GROQ_API_KEY. Six supported English voices: autumn, diana, hannah, austin, daniel, troy.

```bash
node bin/audio.mjs say "David... don't turn around." --engine groq --voice diana --tags "whisper" --free-tier-only --max-requests 1 --out groq.wav
```

The input cap is **200 characters including prefixed tags**. All scene requests are preflighted before generation; invalid later beats fail without sending earlier ones. The common schema's 600-character cap is not a promise of Groq support. Free-form prose direction and numeric pace are not automatically translated. Use `direction.groq.tags` explicitly; short cues are guidance, not guaranteed acting. The free plan publishes 10 RPM /100 requests per day plus token quotas. `--request-interval-ms 7000` spaces requests but cannot override account limits.

## Cartesia Sonic

Set CARTESIA_API_KEY. Optional CARTESIA_TTS_MODEL, CARTESIA_VOICE_ID. Default model sonic-3.6 and Skylar `db6b0ed5-d5d3-463d-ae85-518a07d3c2b4`. Other curated IDs are shown by `voices --engine cartesia`; this list is intentionally not exhaustive or account-validated.

```bash
node bin/audio.mjs say "David... don't turn around." --engine cartesia --emotion scared --pace 0.9 --free-tier-only --out cartesia.wav
```

The adapter pins **Cartesia-Version: 2026-08-14** and uses that version's plain string `voice` field. Do not substitute an older object-shaped voice payload. Supported numeric speed is 0.6–1.5; use `direction.cartesia.emotion` for the provider enum. Common emotion maps only if it is an exact enum value. Other prose/intensity/emphasis remain warnings, not silently implemented features. No arbitrary SSML or exact-duration command is claimed. The full enum is exported as CARTESIA_EMOTIONS in `src/extra-cloud.mjs`. Free plan credits are not a grant of commercial-use rights; consult the current plan terms.

## Cloudflare Workers AI

Create a scoped API token authorized to run Workers AI on your account. Set CLOUDFLARE_API_TOKEN and the 32-hex-character CLOUDFLARE_ACCOUNT_ID. **No Worker deployment is required**: the CLI calls the account's REST run endpoint directly.

```bash
node bin/audio.mjs say "There is still time." --engine cloudflare --voice asteria --allow-degraded --free-tier-only --out cf.wav
```

Only Aura-1 is implemented, requesting explicit WAV output. It has speaker selection, not general acting or pace control. The 10,000 daily Neurons are shared with other Workers AI use, not reserved TTS characters. Free-plan exhaustion stops generation; a paid plan can incur charges. No hidden fallback to a different model.

## Google Cloud Text-to-Speech (distinct from Gemini)

Enable the Cloud Text-to-Speech API in a billing-enabled Google Cloud project. Restrict a GOOGLE_TTS_API_KEY appropriately. Alternatively supply a valid short-lived GOOGLE_ACCESS_TOKEN and, where required, GOOGLE_CLOUD_PROJECT for quota attribution. The CLI does not refresh OAuth tokens or run gcloud/ADC. A key has no inherent spending cap.

```bash
node bin/audio.mjs say "There is still time." --engine google --voice en-US-Neural2-F --allow-degraded --free-tier-only --out google.wav
```

The adapter supports English Neural2, Standard and Wavenet names and returns LINEAR16 WAV, with speaking rate. It does NOT support Chirp, Studio, or Google Cloud Gemini voices. Set `googleLocale` only for an appropriate English locale. `voices --engine google` makes one authenticated metadata request. The documented 1M Neural2 monthly allowance does not remove the billing-account requirement or prevent overage.

## VoiceRSS

Set VOICERSS_API_KEY. Default en-us/Linda; documented US voices include Linda, Amy, Mary, John and Mike. Optional VOICERSS_TTS_VOICE. For an English regional voice set the matching `voicerssLocale` and actual voice name in the score.

```bash
node bin/audio.mjs say "There is still time." --engine voicerss --voice Linda --allow-degraded --free-tier-only --out voicerss.wav
```

POST form submission keeps the key out of the URL/cache identity. The output is 24 kHz, 16-bit mono WAV. The adapter maps numeric pace approximately to VoiceRSS rate; it cannot promise theatrical direction. No free-plan SSML feature is assumed. HTTP-200 error text is rejected, never saved as a fake WAV.

## Deepgram: one-time trial, not recurring free

Set DEEPGRAM_API_KEY. Optional DEEPGRAM_TTS_MODEL selects an English Aura-2 voice-model ID. In this API the voice IS the model.

```bash
node bin/audio.mjs say "There is still time." --engine deepgram --voice aura-2-thalia-en --allow-degraded --max-requests 1 --out deepgram.wav
```

The adapter requests WAV/linear16/24 kHz. No general acting prompt or rate parameter is implemented. `--free-tier-only` rejects this trial-only profile even when a new account still has credits. Check the trial balance manually; the command above can be billable after credits expire.

## Amazon Polly: account-specific trial/credit eligibility

Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_REGION. Use narrowly scoped IAM credentials permitting Polly synthesis/voice discovery, not root keys. Temporary credentials also require AWS_SESSION_TOKEN. No SDK, AWS CLI, profile discovery or credential refresh is used; signing is implemented with Node crypto. Region defaults to us-east-1 when omitted, but explicitly configure your account's region.

```bash
node bin/audio.mjs say "There is still time." --engine polly --voice Joanna --allow-degraded --max-requests 1 --out polly.wav
```

POLLY_TTS_ENGINE supports `neural`/`standard` only. Polly PCM is 16-bit little-endian mono at **16 kHz**, wrapped at that actual rate. Common pace is escaped SSML prosody, not emotion. Voice/engine availability is region-dependent; use voice discovery. No universal indefinite free tier is claimed; the current AWS new-account programme differs from legacy Polly quotas. `--free-tier-only` rejects this profile.

## Mistral Voxtral TTS

Set MISTRAL_API_KEY, then select a voice from the real catalogue:

```bash
node bin/audio.mjs voices --engine mistral
```

Put the returned ID in MISTRAL_VOICE_ID, or in `mistralVoice` per character. Optional MISTRAL_TTS_MODEL, default voxtral-mini-tts-2603.

```bash
node bin/audio.mjs say "There is still time." --engine mistral --allow-degraded --max-requests 1 --out mistral.wav
```

This uses `/v1/audio/speech` with model/input/voice_id, response_format wav, stream false. The documented JSON field `audio_data` is base64-decoded and WAV-validated. There is no arbitrary instruction field in this adapter; it is reference/voice-conditioned, not the same control as Gemini. Voice creation/cloning/upload is deliberately not automated. A free API/account plan exists, but **a guaranteed free Voxtral TTS quota could not be verified**. Check the specific workspace model entitlement. `--free-tier-only` rejects Mistral rather than presenting uncertainty as free service.

## OpenAI, ElevenLabs, Azure and local Qwen/Kokoro

Complete instructions, voice/style controls and Python preparation are in [LOCAL_AND_ESTABLISHED_ENGINES.md](LOCAL_AND_ESTABLISHED_ENGINES.md). These are maintained adapters, not deprecated ones. ElevenLabs needs an actual selected voice ID; Azure's recurring quota requires an **F0** Speech resource. OpenAI has no universal free tier assumed. Local Qwen/Kokoro need no cloud API key after explicit preparation.

## A cast needs real provider voice mappings

```json
"voices": {
  "sarah": {
    "label": "Sarah",
    "geminiVoice": "Kore",
    "groqVoice": "diana",
    "humeVoice": "Ava Song",
    "humeProvider": "HUME_AI",
    "cartesiaVoice": "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4",
    "description": "English-speaking adult woman, controlled and restrained."
  }
}
```

These are separate castings, **not the same vocal identity across engines**. New adapters require explicit per-character mappings for multi-character scores. A global `--voice` is allowed only for one speaker. The Last Light example includes distinct mappings for eight new public-voice adapters plus OpenAI/Azure; Hume/Mistral/ElevenLabs require your selected cast. Some default voices may sound inappropriate or be unavailable on a particular plan: audition each one.

## Public settings, precedence and budgets

No JSON settings file is required. Optional `setup gemini` saves engine preference in the current directory without a request; `setup gemini --settings PATH` writes elsewhere. For advanced defaults, copy the bundled `audio.config.example.json` into the receiving project and pass `--settings` if its name is not `audio.config.json`.

Engine: CLI > loaded AUDIO_ENGINE > JSON engine > piper. A model override is CLI > environment > JSON > documented default. Per-character voice overrides a global configured voice. The CLI never searches parent projects or implicitly loads skill-root secrets/settings. `--settings PATH` selects public JSON settings; the optional default is `audio.config.json` in the current directory. `--config PATH` selects a local Python runtime config; its relative `python` and `modelDir` fields resolve against the skill folder, as in generated runtime configs. Use absolute fields for a separately provisioned runtime. See [WORKSPACE_INTEGRATION.md](WORKSPACE_INTEGRATION.md).

Allowed provider JSON fields: model, voice, baseUrl, region, timeoutMs, cacheSalt, accountId, project, apiVersion. Credentials in JSON are rejected. A custom baseUrl must be HTTPS without credentials/query/fragment; changing it sends text and the selected key to that endpoint. Configure only a trusted, explicitly authorized endpoint implementing the exact selected protocol.

```bash
node bin/audio.mjs plan examples/the-last-light.score.json --engine gemini --free-tier-only
node bin/audio.mjs render examples/the-last-light.score.json --engine gemini --free-tier-only --max-requests 7 --max-chars 2000 --request-interval-ms 7000 --out output/scene
```

`plan` makes zero network requests, does not need a key, does not inspect the cache, and returns all-cache-miss upper bounds. Account IDs/voice/region settings can still be needed to construct a valid request. Reported characters are JavaScript string length (UTF-16 units), not a billing quote; prompts, tokens, SSML and tags have provider-specific accounting.

`--max-requests` caps new synthesis requests per render (default 100); `--max-chars` caps source-text units for uncached takes (default 1,000,000). A limit can stop a scene after earlier takes are cached. Neither is an account-wide money cap. `--request-interval-ms` delays request starts, not scene time. `--free-tier-only` is a dated allowlist filter, not a subscription check. Even an allowed profile can charge on a paid account. Trial/uncertain profiles are rejected.

No automatic HTTP retries, key rotation, alternate provider/model fallback or quota scraping. Errors stop; reuse completed cached clips on an intentional rerun. A timeout may occur after provider billing. `--refresh` intentionally requests fresh takes. `--offline` rejects cloud engines, even if an entire scene may already be cached; existing bundle playback is offline and needs no key.

Cached speech, directions and output JSON are sensitive local files, not encrypted storage. Secrets are excluded from cache metadata and provider error bodies are not printed. Request IDs may be recorded for troubleshooting. Fresh cloud output is not deterministic; only cached bytes are reproducible.

## Browser listening, not an export backend

Open `web/browser-audition.html` in your own browser and press Speak. No account/key/server required. It uses installed/browser-exposed Web Speech voices, shows whether the voice advertises itself as local, and supports rate/pitch. Voice availability and quality depend on the machine. A remote voice may transmit the text to its provider.

This page **cannot export a WAV**, certify emotional control, or produce word-aligned animation assets. Cloud keys must never be embedded in a public browser file. The CLI uses HTTP requests with complete short-clip results, not a bidirectional streaming/WebSocket transport. Scene preview plays already-rendered assets against a measured audio clock.

## Troubleshooting

401/403: verify key, project/resource, region, model entitlement. 429: inspect account rate/credit limits and wait before an intentional rerun; no auto-retry. Invalid audio: the API may have returned an error or an unsupported encoding; do not rename it WAV. Unsupported voice/control: use the catalogue and documented engine-specific field. Missing model: run explicit local setup. Network denied: permit only the chosen provider endpoint or use prepared local inference. Missing per-character mapping: set that provider's voice for each character; do not silently flatten the cast.

All real account/model/voice combinations still need local validation. Mock contract tests do not prove acceptance by a live provider. See VALIDATION.md and SOURCES.md.

Local default and configuration templates: see [LOCAL_PIPER.md](LOCAL_PIPER.md).
