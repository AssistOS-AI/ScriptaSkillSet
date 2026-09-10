# Coding-agent and animation integration

## Install the full skill, not just the Markdown file

For current Codex CLI, put the complete extracted `theatrical-audio` folder in:

```
YOUR_REPOSITORY/.agents/skills/theatrical-audio/
```

or the user-level `~/.agents/skills/theatrical-audio/`. The current official discovery rules and `SKILL.md` frontmatter are documented in [S4]. If a host/version does not discover it, ask the agent to read `SKILL.md` by path and run the same Node command; the CLI is not tied to Codex. An optional `agents/openai.yaml` supplies display metadata and does not add a server.

Use process environment variables for the selected cloud backend, or optionally create a TTS env file and pass its path with `--credentials-file PATH`. No sibling skill or project configuration is required. Keys must not be pasted into the agent chat. Codex must have permission to execute Node, write output/cache, and (only for cloud rendering) reach the selected HTTPS API. The skill must not disable the host's sandbox or obtain credentials from its authentication files.

Example agent request:

> Use $theatrical-audio. Read scene.txt and create an English animated-dialogue score. Use OpenAI, one take per beat, maximum ten synthesis requests. Keep the exact dialogue. Sarah uses marin; David uses cedar. Aim for restrained fear, not melodrama. Keep a 1.5-second camera pause after Sarah's warning in the timeline, not the WAV. Produce independent voice clips, timeline.json and a standalone HTML preview. Do not install other backends.

If using local Qwen, replace the explicit backend and cast with supported local speaker IDs, and prepare it once before asking for a render. The agent can create a score directly; `draft` is only a mechanical starting point. It does not infer characters, plot or subtext.

## Recommended production workflow

Read `SKILL.md`; preserve source words and cast IDs; generate `scene.score.json`; validate it; render one take per beat; verify the bundle; generate the HTML preview. Listen before increasing take count. A provider configuration error must be fixed explicitly, not bypassed with another provider. The skill must not silently send private text to a cloud service just because a local model is missing.

For a chosen line, generate additional takes using its `takes` field. Listen to `dry/` and select the zero-based `selectedTake` in the score. Rerendering reuses existing candidates and recomputes the scene timeline/mix. Changes in pace or words invalidate the appropriate synthesis cache; changes in scene pause/visual placement do not.

## Animation clock

Treat `timeline.sampleRate` as the unit basis. Convert only at the boundary:

```js
const startSeconds = event.startFrame / timeline.sampleRate;
const dryEndSeconds = event.endFrame / timeline.sampleRate;
const audibleEndSeconds = (event.audibleEndFrame ?? event.endFrame) / timeline.sampleRate;
```

Use a shared Web Audio clock for scene playback and derive visual progress from that clock. Predecode assets before playback. At seek/pause, stop old source nodes and schedule new ones with offsets. Restore visual state for the destination time; do not rely solely on “event fired once” callbacks. Full executable reference: `web/player.js`.

Example: a 2.37-second line followed by a 1.5-second pause starts the next sequential beat at 3.87 seconds. If the line regenerates to 2.62 seconds, the next beat becomes 4.12 seconds automatically. An animation anchored to the first line's end also shifts. Nothing stores 1.5 seconds of silence inside the voice clip.

## Lips and words

The included envelope gives speech activity and approximate mouth openness; it cannot distinguish visemes. For precise lip-sync, run a separate aligner after choosing the take, bind its timings to the dry audio SHA-256 and use those in your character system. The current package neither installs nor claims such an aligner. A marker's `basis:"forced-alignment"` records externally obtained provenance; it is not a command to perform alignment.

## Extending backend support

Implement the contract described in `SPECIFICATION.md`, add exact capability disclosure and pure request-shape tests, then register the name/voice field/CLI configuration. Do not add a capability flag such as “emotion” unless the adapter actually translates it into supported model inputs. Tests must keep network disabled and inject mock responses; separate optional live tests need explicit credentials and user authorization. Chatterbox, browser `speechSynthesis`, voice cloning, streaming, neural SFX/music and automatic emotion ranking are not implemented here.

## Test locally

```bash
node --test tests/*.test.mjs
python tests/test_backends.py
node bin/audio.mjs say "The light is still on." --engine openai --voice marin --direction "Warm relief, quiet and natural." --out first-listen.wav
node bin/audio.mjs render examples/emotion-study.score.json --engine openai --takes 1 --out output/emotion-study
```

The first two commands are provider-free unit/contract tests. The last two use real API requests. The emotion study is designed for OpenAI/Qwen natural-language instructions: it is not automatically equivalent on ElevenLabs/Azure unless you author matching supported controls. The score has five speech conditions; `--takes 1` makes five requests on a cold cache.


## Free-tier agent workflow

Inspect `providers --free-only`, select a provider with user authorization, validate an explicit cast using `plan`, then synthesize one short audition. Follow CONFIGURATION.md for all 13 providers. Do not treat account credit as infinite or blindly compare many takes. The agent supplies semantic direction; Gemini/Hume 1 can receive it, Groq/Cartesia need their explicit tags/enums, and other adapters may only support voice/rate. Keep secret keys in the local environment and never embed them in scene HTML.
