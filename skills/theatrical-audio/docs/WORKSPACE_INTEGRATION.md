# Optional workspace integration

The skill works with Node.js 22+ and its own folder. No SHF workspace, root script, project policy or sibling skill is required. Run the CLI through its absolute path from the receiving project. Input/output arguments and defaults belong to that working directory.

## Configuration choices

All configuration files are optional. Actual cloud speech requires the selected service's credentials; local speech requires a prepared model.

- Process environment variables work without any file.
- `--credentials-file PATH` explicitly loads a TTS environment file. The supplied path must exist. Copy selected fields from the bundled `.env.example` if useful.
- `--workspace-root PATH` opts into `PATH/.apikeys`. A missing file is harmless. Unknown variable names in a shared file are ignored; no values are expanded or executed.
- `THEATRICAL_AUDIO_WORKSPACE_ROOT` supplies the same optional root. `SHF_WORKSPACE_ROOT` remains a compatibility alias. The CLI flag wins, then the generic variable, then the alias.
- `--settings PATH` selects public JSON defaults. Without it, the CLI reads `audio.config.json` in the current working directory when present. Missing explicit settings are an error; missing default settings are normal.
- `--config PATH` selects a prepared local model runtime. It is relevant to Piper/Qwen/Kokoro.

Credential precedence is process environment, explicit environment file, then shared workspace file. Engine precedence is `--engine`, loaded `AUDIO_ENGINE`, public settings, then Piper (`en_US-ljspeech-medium`). No provider is selected merely because a key exists. There is no parent-directory search and no automatic loading of a skill-local `.env` or settings file. To reuse one, pass its absolute path explicitly.

Keep secret files out of source control. The parser accepts simple KEY=value assignments, optional quotes and comments. It performs no variable expansion or command substitution. Unsupported entries in an explicit TTS env file are errors; values are never included in diagnostics.

## Project-owned state

`setup gemini` is optional. It writes the engine preference to `audio.config.json` in the current working directory without contacting the service. `setup gemini --settings PATH` writes a chosen public settings file. Explicit local setup still creates skill-owned private runtimes and requires a writable installation directory, suitable Python and authorized downloads. Cloud rendering does not need that setup.

Render defaults are `output/<score-id>/` and `.theatrical-audio/cache/speech/` under the current working directory. Override them with `--out` and `--cache`. Add generated/private paths to the receiving project's ignore rules when appropriate. With authorized local setup, `setup piper` creates project audio settings and missing environment templates and appends private-file ignore rules without overwriting existing secrets.

## Optional SHF presentation workflow

When `shf-presentation-creator` is actually available, use its `voice-tasks` command and receipt contract. The two skills need not be installed together or next to each other.

The agent maps each SHF task's spoken text, speaker and supported performance directions into a `theatrical-audio/1` score using this skill's [format](FORMAT.md). Render with the selected provider, then use the selected dry clip paths and SHA-256 hashes from `timeline.json` and `takes.json` to write SHF voice receipts. Copy those clips into an audio directory contained beside the receipts, retain the original SHF beat IDs, and record actual provider/voice identity and review status. Use the presentation skill's `attach-voice` to measure and retime the presentation.

The score, timeline and SHF receipts are different formats; do not pass one directly as another. This skill does not provide a root-level orchestrator or silently switch an explicitly configured provider. A project's own wrapper is optional and must use the documented interfaces and existing authorization.
