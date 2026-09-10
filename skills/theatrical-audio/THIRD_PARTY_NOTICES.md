# Third-party notices

The original glue code, score format, procedural sound presets and examples in this package are offered under the included MIT license. Third-party models, runtimes, voices and API services retain their own licenses/terms. No external model weights, Python packages, paid credentials, stock sound recordings or real-person voice clones are distributed in this source ZIP.

Optional local dependencies include Qwen3-TTS, PyTorch/Transformers and their dependencies, or the community kokoro-onnx wrapper/ONNX Runtime/Kokoro weights. Review the actual downloaded packages' notices and model cards before redistribution. Top-level package pins are in `runtime/`; setup saves the resolved environment. The fact that the wrapper code has a permissive license does not determine rights to a particular voice or imported asset.

OpenAI, ElevenLabs and Azure are optional cloud services with separate account, usage, privacy and voice terms. Their SDK code is not bundled: adapters use Node's native HTTPS fetch interface. Disclose AI-generated speech and use appropriate rights/consent for any voices or imported audio.

`tests/browser_smoke.py` uses Playwright only when a developer runs that optional test. It is not required for generating audio or the standalone HTML. No eSpeak speech synthesizer is bundled; a Kokoro private dependency can use phonemization internally without making the output eSpeak-synthesized speech. Primary-source links are in `docs/SOURCES.md`.


## Additional cloud providers

Gemini, Groq, Hume, Cartesia, Cloudflare, Google Cloud, VoiceRSS, Deepgram, Amazon Polly and Mistral adapters call their official APIs. No provider SDK, key, proprietary model, trained weight, cloned voice, or provider audio is bundled. Service terms, free-plan restrictions, voice rights and commercial-use permissions remain provider-specific and are not granted by this package's MIT source license. AWS signing golden data uses fabricated test credentials; botocore was used only to derive an independent development fixture and is not a dependency. The browser audition uses the host's Web Speech API and does not distribute voices.
