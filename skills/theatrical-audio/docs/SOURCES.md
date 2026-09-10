# Primary sources and version notes

Checked 9 September 2026. These links justify external API/library contracts, not a claim that live inference was performed. Provider offers are separately recorded as a dated snapshot in FREE_PROVIDERS.md; no hardware benchmark is claimed. Provider capabilities, account access and model aliases can change.

- **S1 — OpenAI, Codex authentication:** https://developers.openai.com/codex/auth (redirects to https://learn.chatgpt.com/docs/auth). Distinguishes ChatGPT sign-in from API-key access; general API calls use appropriate Platform credentials.
- **S2 — OpenAI, ChatGPT/API billing:** https://help.openai.com/en/articles/9039756-billing-settings-in-chatgpt-vs-platform . Separate billing systems; no assumption that a subscription funds this CLI's Speech API calls.
- **S3 — OpenAI, text-to-speech guide:** https://developers.openai.com/api/docs/guides/text-to-speech . Input/instructions, voices, PCM output and AI-voice disclosure. The default implemented model is `gpt-4o-mini-tts`.
- **S4 — OpenAI, Codex skills:** https://developers.openai.com/codex/skills (redirects to https://learn.chatgpt.com/docs/build-skills). `SKILL.md`, agent discovery paths and optional metadata.
- **S5 — ElevenLabs, synthesis API:** https://elevenlabs.io/docs/api-reference/text-to-speech/convert . Voice IDs, model, voice settings and best-effort seed. Raw PCM format enum also checked in the official SDK: https://github.com/elevenlabs/elevenlabs-python/blob/main/src/elevenlabs/types/tts_output_format.py .
- **S6 — ElevenLabs, TTS best practices:** https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices . v3 audio tags, stability, pacing and voice-specific behavior; tags are not universally portable to other models.
- **S7 — Microsoft, Speech REST TTS:** https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech . Regional endpoints, resource authentication, output formats and voice list.
- **S8 — Microsoft, voice/prosody SSML:** https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice . Voice-supported styles, style degree and prosody.
- **S9 — Qwen official repository:** https://github.com/QwenLM/Qwen3-TTS . CustomVoice/VoiceDesign model families and public Python API. Source inspected: https://github.com/QwenLM/Qwen3-TTS/blob/main/qwen_tts/inference/qwen3_tts_model.py . Top-level package version checked: https://pypi.org/project/qwen-tts/0.1.1/ .
- **S10 — Kokoro and local ONNX wrapper:** https://github.com/hexgrad/kokoro and https://github.com/thewh1teagle/kokoro-onnx . The second is a community wrapper, not an OpenAI/Qwen component. Package version checked: https://pypi.org/project/kokoro-onnx/0.6.1/ .

Source pinning: top-level Python packages are pinned in `runtime/*.requirements.txt`. Transitive packages resolve during installation and are frozen then. Qwen snapshots resolve a specific Hub commit during preparation; an immutable commit can be supplied explicitly. Cloud model aliases are not immutable snapshots. Use saved rendered audio or a verified model/version policy when exact production reproducibility is required.


## Additional provider contracts (checked 2026-09-10)

These are official provider/API pages. Published offers are not live-account tests; links and dates are also stored in providers.json and FREE_PROVIDERS.md.

- Gemini generateContent request and audio schema: https://ai.google.dev/api/generate-content
- Gemini speech generation and PCM encoding: https://ai.google.dev/gemini-api/docs/speech-generation
- Hume JSON synthesis: https://dev.hume.ai/reference/text-to-speech-tts/synthesize-json
- Hume acting instructions: model 1 versus 2: https://dev.hume.ai/docs/text-to-speech-tts/acting-instructions
- Hume voice names and provider selection: https://dev.hume.ai/docs/text-to-speech-tts/voice
- Cartesia versioned byte API: https://docs.cartesia.ai/api-reference/tts/bytes
- Cartesia speed and emotion: https://docs.cartesia.ai/build-with-cartesia/capability-guides/volume-speed-emotion
- Groq Orpheus API and 200-character cap: https://console.groq.com/docs/text-to-speech/orpheus
- Cloudflare Aura-1 REST model: https://developers.cloudflare.com/workers-ai/models/aura-1/
- Google REST speech synthesis: https://cloud.google.com/text-to-speech/docs/reference/rest/v1/text/synthesize
- Google discovery: key/OAuth and response encoding: https://texttospeech.googleapis.com/$discovery/rest?version=v1
- VoiceRSS request fields and available voices: https://www.voicerss.org/api/
- Deepgram voice models: https://developers.deepgram.com/docs/tts-models
- Deepgram REST synthesis: https://developers.deepgram.com/reference/text-to-speech/speak-request
- Polly SynthesizeSpeech: https://docs.aws.amazon.com/polly/latest/APIReference/API_SynthesizeSpeech.html
- AWS SigV4: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html
- Mistral speech endpoint: https://docs.mistral.ai/api/endpoint/audio/speech
- Mistral audio capabilities: https://docs.mistral.ai/capabilities/audio/speech
- Mistral subscription entitlement: https://docs.mistral.ai/admin/billing-usage/subscriptions
- Web Speech available device voices: https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/getVoices
- Web Speech speaking interface: https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/speak
- Gemini Developer API offer: https://ai.google.dev/gemini-api/docs/pricing
- Groq Orpheus offer: https://console.groq.com/docs/rate-limits
- Hume Octave offer: https://www.hume.ai/pricing
- Cartesia Sonic offer: https://www.cartesia.ai/pricing
- ElevenLabs offer: https://elevenlabs.io/pricing/api
- Azure Speech offer: https://azure.microsoft.com/en-us/pricing/details/speech/
- Cloudflare Workers AI offer: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Google Cloud Text-to-Speech offer: https://cloud.google.com/text-to-speech/pricing
- Voice RSS offer: https://www.voicerss.org/pricing/
- Deepgram Aura offer: https://deepgram.com/pricing
- Amazon Polly offer: https://aws.amazon.com/polly/pricing/
- Mistral Voxtral TTS offer: https://docs.mistral.ai/admin
- OpenAI offer: https://openai.com/api/pricing/
