# Free and trial TTS provider matrix

**Published documentation checked: 2026-09-10. No live account or quota verification.** An API key can be free to create while synthesis is billable. This table describes public offer categories, not a guarantee of eligibility, remaining allowance, commercial rights, or indefinite availability.

The skill implements 13 cloud adapters. Nine have a documented recurring free-usage profile (including Google Cloud, which requires billing); two use trial/eligibility-dependent credits; Mistral's TTS-specific free entitlement remains unconfirmed; OpenAI is retained as an explicitly selected paid option. Local Qwen/Kokoro are separate and consume no cloud API credits.

| Engine | Offer category and allowance | Minimum configuration | Control exposed |
|---|---|---|---|
| `gemini` | Free input/output for Gemini Flash TTS; account/model rate limits apply. Pro TTS is not free. | `GEMINI_API_KEY` | natural-language-instructions |
| `groq` | Free Plan: Orpheus 10 requests/minute, 100/day, plus token limits; 200 input characters/request. | `GROQ_API_KEY` | short-audio-tags |
| `hume` | Free: 10,000 TTS characters/month and 15 requests/minute. | `HUME_API_KEY` | natural-language-instructions |
| `cartesia` | Free: 20,000 credits/month; consumption depends on the model. | `CARTESIA_API_KEY` | enumerated-emotion-and-speed |
| `elevenlabs` | Free API allowance: 10,000 characters for v3; model-specific allowances and restrictions apply. | `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` | explicit-audio-tags-and-settings |
| `azure` | F0 resource: 500,000 Neural TTS characters/month. | `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` | ssml-style-and-prosody |
| `cloudflare` | 10,000 Neurons/day shared across Workers AI models; resets at 00:00 UTC. | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` | voice-only |
| `google` | Monthly free usage: Neural2 1M characters; Standard/WaveNet pricing lists 4M. Default here is Neural2. | `GOOGLE_TTS_API_KEY` | voice-and-speed-only |
| `voicerss` | Free: 350 requests/day; text limit 100 KB/request; this skill uses much shorter clips. | `VOICERSS_API_KEY` | voice-and-rate-only |
| `deepgram` | One-time $200 credit for new accounts; not a recurring free allowance. | `DEEPGRAM_API_KEY` | voice-only |
| `polly` | New AWS accounts since 2025-07-15: up to $200 credits, free plan up to six months. Legacy Polly quotas are eligibility-dependent. | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `AWS_REGION` | ssml-pace-only |
| `mistral` | Speech API is documented; a guaranteed free TTS quota could not be verified. Check model access and price in your workspace. | `MISTRAL_API_KEY` + `MISTRAL_VOICE_ID` | voice-reference-conditioned |
| `openai` | No universal recurring free TTS API tier is assumed. | `OPENAI_API_KEY` | natural-language-instructions |

## Provider conditions and primary sources

### Gemini Developer API (`gemini`)

Account/region eligibility applies. Review applicable data-use terms; do not submit sensitive material to a demo account.

Default: `gemini-2.5-flash-preview-tts`, voice `Kore`.

Pricing/limits: https://ai.google.dev/gemini-api/docs/pricing

API/control: https://ai.google.dev/gemini-api/docs/speech-generation

Account/key: https://aistudio.google.com/apikey

### Groq Orpheus (`groq`)

Only six English voices. Tags count towards the 200-character cap. Quotas can differ by account.

Default: `canopylabs/orpheus-v1-english`, voice `troy`.

Pricing/limits: https://console.groq.com/docs/rate-limits

API/control: https://console.groq.com/docs/text-to-speech/orpheus

Account/key: https://console.groq.com/keys

### Hume Octave (`hume`)

Octave 1 is selected for acting instructions. Octave 2 description support is not yet documented as available. Use an Octave-1-compatible voice; check plan licensing.

Default: `1`, voice `Ava Song`.

Pricing/limits: https://www.hume.ai/pricing

API/control: https://dev.hume.ai/docs/text-to-speech-tts/acting-instructions

Account/key: https://app.hume.ai/

### Cartesia Sonic (`cartesia`)

Free is for non-commercial testing; pricing places commercial use on paid plans. Emotion control is guidance, not exact acting.

Default: `sonic-3.6`, voice `db6b0ed5-d5d3-463d-ae85-518a07d3c2b4`.

Pricing/limits: https://www.cartesia.ai/pricing

API/control: https://docs.cartesia.ai/api-reference/tts/bytes

Account/key: https://play.cartesia.ai/keys

### ElevenLabs (`elevenlabs`)

Review free-plan attribution and commercial-use restrictions. Some voices/models/formats are plan restricted.

Default: `eleven_v3`; select a real voice ID before synthesis.

Pricing/limits: https://elevenlabs.io/pricing/api

API/control: https://elevenlabs.io/docs/api-reference/text-to-speech/convert

Account/key: https://elevenlabs.io/app/settings/api-keys

### Azure Speech (`azure`)

Select F0 explicitly; S0 is a different billing tier. Styles depend on voice and region. Resource/account eligibility applies.

Default: `azure-neural`, voice `en-US-JennyNeural`.

Pricing/limits: https://azure.microsoft.com/en-us/pricing/details/speech/

API/control: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech

Account/key: https://portal.azure.com/

### Cloudflare Workers AI (`cloudflare`)

Direct REST; no Worker deployment required. Free plan stops at quota, while paid plans can charge overage. No free-form acting control.

Default: `@cf/deepgram/aura-1`, voice `asteria`.

Pricing/limits: https://developers.cloudflare.com/workers-ai/platform/pricing/

API/control: https://developers.cloudflare.com/workers-ai/models/aura-1/

Account/key: https://dash.cloudflare.com/

### Google Cloud Text-to-Speech (`google`)

Billing and API enablement required; overages may auto-charge. Distinct from Gemini Developer API. OAuth access token is supported as an alternative; Chirp/Gemini Cloud voices are not selected by this adapter.

Default: `neural2`, voice `en-US-Neural2-F`.

Pricing/limits: https://cloud.google.com/text-to-speech/pricing

API/control: https://docs.cloud.google.com/text-to-speech/docs/reference/rest/v1/text/synthesize

Account/key: https://console.cloud.google.com/apis/credentials

### Voice RSS (`voicerss`)

Basic narration/preview, not theatrical emotional control. SSML is not part of the free plan; adapter sends plain text.

Default: `voicerss`, voice `Linda`.

Pricing/limits: https://www.voicerss.org/pricing/

API/control: https://www.voicerss.org/api/

Account/key: https://www.voicerss.org/registration.aspx

### Deepgram Aura (`deepgram`)

Pricing advertises no credit card for trial. Verify your credit balance/expiry before use. Voice is selected through the model ID; no free-form acting control.

Default: `aura-2-thalia-en`, voice `aura-2-thalia-en`.

Pricing/limits: https://deepgram.com/pricing

API/control: https://developers.deepgram.com/reference/text-to-speech/speak-request

Account/key: https://console.deepgram.com/

### Amazon Polly (`polly`)

Not permanent free TTS. Use least-privilege credentials; temporary credentials also need AWS_SESSION_TOKEN. No AWS SDK/CLI is required by this skill.

Default: `neural`, voice `Joanna`.

Pricing/limits: https://aws.amazon.com/polly/pricing/

API/control: https://docs.aws.amazon.com/polly/latest/APIReference/API_SynthesizeSpeech.html

Account/key: https://aws.amazon.com/free/

### Mistral Voxtral TTS (`mistral`)

Not advertised by this package as verified free. Preset/saved voice identity is supported; no unsupported instruction field is fabricated. No automatic reference-audio upload/cloning.

Default: `voxtral-mini-tts-2603`; select a real voice ID before synthesis.

Pricing/limits: https://docs.mistral.ai/admin/billing-usage/subscriptions

API/control: https://docs.mistral.ai/api/endpoint/audio/speech

Account/key: https://console.mistral.ai/

### OpenAI (`openai`)

ChatGPT/Codex subscription does not supply TTS API credits. Kept as an optional explicitly selected paid backend.

Default: `gpt-4o-mini-tts`, voice `marin`.

Pricing/limits: https://openai.com/api/pricing/

API/control: https://developers.openai.com/api/docs/guides/text-to-speech

Account/key: https://platform.openai.com/api-keys

## Operational safeguards

`providers --free-only` lists recurring offers without contacting any account. `--free-tier-only` accepts only the package's dated provider/model/voice offer profiles; it does not fetch account balances. It refuses OpenAI, Deepgram, Polly and Mistral in this release, and refuses Gemini Pro TTS. It cannot prevent paid overage on a billing-enabled account: that requires provider-side settings and monitoring.

Use one take and a short phrase first. `--max-requests` stops before the next uncached synthesis request; `--max-chars` caps plain input text code units sent during that render (not billable tokens/credits); `--request-interval-ms` spaces request starts. No automatic retries are made after 429, transport failure or timeout, because a failed local request might still have been billed remotely. Cache hits do not consume a new synthesis request.

The skill does not create accounts, obtain promotional credits, upgrade subscriptions, attach billing methods, rotate accounts/keys to evade quotas, scrape web studio interfaces or access undocumented Edge consumer TTS endpoints. Free web playback alone is not evidence of a supported export API.

## Minimal selection for this use case

For controllable English acting, begin with Gemini Flash TTS or Hume Octave 1, then compare Cartesia's emotion controls and Groq's short audio tags. Use Azure for supported SSML styles and ElevenLabs for its explicit v3 tags. Cloudflare, Google Neural2, VoiceRSS, Deepgram and Polly are additional voices/preview choices, not identical emotional-control backends. Mistral is implemented to let an eligible account test Voxtral TTS, not to claim a verified free allowance.

## Web and realtime are different from clip export

Several providers have web playgrounds and HTTP/WebSocket streaming products. This package deliberately uses documented HTTP endpoints to finish each independent clip before compiling its frame-accurate timeline. Some HTTP bodies arrive in chunks; those are buffered and validated before being saved. **There is no bidirectional WebSocket voice-agent implementation or live playback-before-completion in this package.** This keeps synchronization and export reproducible at the asset level.

`web/browser-audition.html` uses standard `speechSynthesis` for a no-key listening test. It is not a WAV export adapter; availability, local/remote execution and voice quality depend on the device. Official API reference: https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis .
