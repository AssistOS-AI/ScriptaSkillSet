# Score and output reference

The authoritative input schema is `schemas/score.schema.json`; `src/schema.mjs` validates the bounded vocabulary used here. Unknown fields are errors. The following is a complete, valid minimal scene:

```json
{
  "format": "theatrical-audio/1",
  "id": "door",
  "title": "At the door",
  "language": "en",
  "voices": {"sarah": {"label": "Sarah", "openaiVoice": "marin", "qwenSpeaker": "Aiden"}},
  "beats": [
    {"id": "warning", "type": "speech", "speaker": "sarah", "text": "David... don't turn around.",
     "direction": {"emotion": "restrained fear", "intensity": 0.6, "pace": 0.9,
       "delivery": "Very quiet, without melodrama."}},
    {"id": "hold", "type": "pause", "seconds": 1.5}
  ],
  "visuals": [{"id": "look", "at": {"beat": "warning", "edge": "end"},
    "target": "sarah", "action": "look_at_door", "durationSeconds": 1.5}]
}
```

## Field map

IDs start with an ASCII letter, followed by up to 63 letters, numbers, underscores or hyphens. Beat/effect/bed/visual IDs must be unique across the scene. Voice IDs form their own namespace.

| Scope | Fields and semantics |
|---|---|
| Root | Required `format`, `id`, `title`, `language` (language tag), `voices`, `beats`; optional `notes`, `sourceText`, `settings`, `effects`, `beds`, `visuals` |
| Voice | Required `label`; optional `piperVoice`, `qwenSpeaker`, `kokoroVoice`, `openaiVoice`, `elevenlabsVoice`, `azureVoice`, `azureLocale`, `description` |
| Speech | Required `id`, `type:"speech"`, `speaker`, `text` (1–600 code units); optional `direction`, `at`, `takes`, `selectedTake`, `seed`, `gainDb`, `pan`, `sourceSpan`, `markers` |
| Pause | `id`, `type:"pause"`, `seconds` (0–60), optional `at`; no WAV |
| Direction | `emotion` (text), `intensity` (0–1), `pace` (0.5–2), `delivery` (text), `emphasis` (string array), `elevenlabs` and `azure` provider objects |
| Effect | `id`, exactly one of `preset` or `file`, optional `at`, `seed`, `gainDb`, `pan`; preset requires `seconds` |
| Bed | `id`, exactly one of `preset` or `file`, optional `seed`, `gainDb`, `duckDb`, `fadeSeconds`; preset requires `seconds`; loops through scene |
| Visual | `id`, `at`, `target`, `action`, `durationSeconds`, optional JSON `params` |

`at` is either absolute seconds or `{"beat":"ID","edge":"start|end|marker","offsetSeconds":0}`. A marker anchor also requires `marker:"ID"`. Negative offsets are allowed when the resolved start stays nonnegative. Omitted `at` on a beat follows the previous beat's dry end. Omitted `at` on an effect means scene zero. No dependency cycles are permitted.

`sourceSpan` has zero-based `start` inclusive / `end` exclusive indexes in JavaScript UTF-16 code units. `sourceText.slice(start,end)` must equal speech `text` exactly. This preserves the supplied words; it is not speech recognition. Model output can still omit or add words and requires listening.

`selectedTake` is **zero-based**. Take count precedence is beat `takes` > scene `settings.takes`; CLI `--takes` overrides only the scene setting. Selecting another already-cached take does not require generation.

## Settings and defaults

| Field | Default | Bounds |
|---|---|---|
| `sampleRate` | 24000 | 24000 or 48000 Hz |
| `takes` | 1 | 1–5 |
| `seed` | 7331 | 0–2147483647 |
| `tailSeconds` | 0.5 | 0–10; `say` sets zero |
| `ceilingDbFS` | -1 | -20 to -0.1; sample peak, not dBTP/LUFS |
| `maxSceneSeconds` | 300 | 1–600 |
| `maxNewTokens` | 1024 | 64–2048; local Qwen hint, not cloud length control |
| `room` | Dry unless configured | `wet` 0–0.3, `delayMs` 15–200 |

Effects/beds accept deterministic presets `space-hum`, `wind`, `rain`, `drone`, `metal`, `chime`, `airlock`, `pulse`. Preset lengths: 0.05–120 seconds. WAV file duration is measured: omit `seconds` for a file. Paths resolve relative to the score. Imported WAV support is PCM16 or 32-bit IEEE float; other codecs need conversion before use.

Gain/pan remain timeline parameters (`gainDb` -60..12, `pan` -1..1). A scene change in those values does not regenerate TTS. The reflection-processed stem is separate from the dry take; audible tail length may exceed the spoken duration.

## Provider-specific direction

```json
{"elevenlabs":{"tags":["whispers"],"stability":0.5,"speed":0.9}}
```

Optional ElevenLabs `similarityBoost` is 0–1. For the default v3 model, stability is limited to 0/0.5/1. Prefix tags apply to that beat; arbitrary inline markup is not a general supported score feature. Do not put direction tags in canonical `text` expecting other engines to understand them.

```json
{"azure":{"style":"fearful","styleDegree":1.2}}
```

Azure style degree is 0.01–2 and requires a style. Check `voices --engine azure` for available styles. Global `pace` becomes SSML rate. Natural-language `delivery` is not executed by this adapter. For OpenAI and Qwen, common fields become a separate generated acting instruction; exact timing and emotional fidelity are probabilistic.

## Measured markers

```json
"markers": [{
  "id": "door_word",
  "seconds": 1.24,
  "basis": "manual",
  "audioSha256": "REPLACE_WITH_THE_64_CHARACTER_DRY_WAV_SHA256",
  "label": "The onset of the chosen word"
}]
```

Replace the placeholder with an actual hash from `takes.json`. The example is explanatory and intentionally not directly schema-valid until replaced. Inspect/listen to that dry file or run an external aligner, then set the local timestamp. Valid bases are `manual` and `forced-alignment`; neither causes alignment computation. An audio change makes the marker fail validation at compile time.

## Output contract

```
scene/
  score.json         resolved input/cast, no secrets
  timeline.json      time in audio frames, current asset map
  takes.json         every candidate, checks and selected-take provenance
  report.json        warnings, counts, measurements and limitations
  dry/               all dry take WAVs
  clips/             selected playback speech and effects
  beds/              looping ambience WAVs
  audition.wav       optional full stereo mix
```

`timeline.json` declares `format:"theatrical-timeline/1"`, `sampleRate`, `durationFrames`, `events`, `visuals`, `assets`, beds and mix metadata. An asset has a relative `file`, `sha256`, frame count, channels, rate and measured statistics. A speech event holds `startFrame`, dry `endFrame`, `audibleEndFrame`, playback and dry asset IDs, canonical `text`, speaker, amplitude `envelope`, selected take and markers. The file itself is the exact output contract; check actual emitted keys before extending an integration.

`--no-audition` keeps this bundle without writing the full scene WAV. Speech remains individually addressable. Preview HTML embeds only selected playback assets, not every discarded take. The `verify` command checks asset bytes and frame relationships. Do not ship outdated unreferenced assets left in a reused output directory.


## Additional cloud mappings (package 3.0; score format remains /1)

Voice objects additionally accept `geminiVoice`, `groqVoice`, `humeVoice`, `cartesiaVoice`, `cloudflareVoice`, `googleVoice`, `voicerssVoice`, `deepgramVoice`, `pollyVoice`, and `mistralVoice`. Optional `humeProvider` is HUME_AI or CUSTOM_VOICE. Optional `googleLocale` and `voicerssLocale` select compatible English locales. Multiple characters require explicit mappings for the selected new engine.

```json
"direction": {
  "emotion": "restrained fear",
  "delivery": "Quiet and intimate; do not overact.",
  "pace": 0.9,
  "groq": {"tags": ["whisper"]},
  "cartesia": {"emotion": "scared"}
}
```

Provider-specific fields are routing instructions, not extra words in the canonical transcript. Groq prefixes its tags to API input (200-character combined maximum), while Cartesia passes an enum in generation_config. A provider ignores other providers' fields. Common direction has different executable scope by engine; see CONFIGURATION.md. Never claim all providers implement equivalent emotion semantics.

New CLI quota/planning flags do not change the score schema or timeline timebase. Request pacing is not an audio pause. Measured WAV frames remain the source of timeline truth across every provider.
