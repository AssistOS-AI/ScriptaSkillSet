# Small local neural narration

Piper is the default engine when no engine has been selected. English presentations use `en_US-ljspeech-medium`; another language needs a matching voice. It runs on CPU without an API key. It supports voice and speaking pace, not arbitrary acting instructions. Do not describe it as studio narration without listening review.

From the receiving project, invoke the absolute skill CLI path:

```
node /path/to/theatrical-audio/bin/audio.mjs setup piper --voice en_US-ljspeech-medium --download
node /path/to/theatrical-audio/bin/audio.mjs say "A report is not a decision." --engine piper --voice en_US-ljspeech-medium --language en --allow-degraded --offline --out output/audition.wav
```

Setup also creates the project credential templates and ignore entries without overwriting existing files. Setup creates a private venv, installs Piper 1.4.2, downloads the model and configuration from one pinned official repository revision, verifies catalogue size/MD5 and records SHA-256 hashes and MODEL_CARD. `runtime/piper.json` selects the prepared model. Repeated setup validates existing model files. No global installation or API request for synthesis occurs. The model/runtime are ignored and do not ship to viewers.

Create `audio.config.json` containing `{"engine":"piper"}` only when absent. Create `.env.audio.example` and `.env.audio` containing commented optional provider variables (`AUDIO_ENGINE`, `GEMINI_API_KEY`, `OPENAI_API_KEY`); ignore `.env.audio` and local caches in the receiving repository. Never overwrite existing credentials or provider choices. Load the secret file only with `--credentials-file .env.audio`. The CLI does not automatically read secret files.

Setup requires authorization for local dependencies/downloads. A standing user/workspace instruction is sufficient; do not request it again. A failed cloud request never causes an automatic provider switch. Render fails if the model is missing or its language differs from the score.

Piper voice is selected per score with `piperVoice`, and must match the prepared model. Use one matching model per score. `--allow-degraded` acknowledges voice/pace control without free-form acting; this is appropriate for a user-authorized small-model fallback. Draft direction remains available for a future expressive renderer.

Keep the model card with project QA. Engine code is GPL-3.0; voice models and datasets have their own terms. Public film packages contain generated audio, not the engine or model. Review the selected model's exact card before redistribution.

Primary references: [Piper Python API](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/API_PYTHON.md), [official voice catalogue](https://huggingface.co/rhasspy/piper-voices), [Piper licensing and voices](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/VOICES.md).
