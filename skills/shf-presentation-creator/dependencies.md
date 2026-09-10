# Dependencies

## Required runtime

Node.js 22+ runs the bundled authoring, validation, installation and build scripts. No npm packages, Python runtime, project configuration, sibling skill or external service is required for those commands. All JavaScript imports and visual/player assets belong to this folder. The host agent supplies editorial reasoning.

The exported player requires a browser with Custom Elements, SVG and Web Audio. Its runtime is bundled in `runtime/` and `assets/player/shf-player.js`. Playback needs neither Node.js nor the skill installation. A compiled presentation embeds its visual and audio assets. URL loading follows browser origin rules; local file loading and standalone HTML avoid a runtime server requirement.

## Optional capabilities

| Capability | Dependency and resolution | When absent |
|---|---|---|
| New narration | A user-selected, available TTS tool or existing audio files. No engine is bundled or installed by this skill. | Compile a silent presentation and retain pending voice tasks. |
| Compressed narration measurement | `ffprobe` from FFmpeg on PATH, probed only for MP3/OGG by `scripts/lib/voice.mjs`. No fixed version is pinned; the required capability is JSON duration output. | Use PCM WAV with the built-in RIFF reader, or install a compatible FFmpeg distribution under the host's permissions. |
| Browser development checks | Python, Playwright and Chromium for `tests/browser.py`; `CHROMIUM_BIN` can select an installed binary. | Skip this optional developer check and report that browser QA remains unverified. |
| Independent schema development check | Python and `jsonschema` with Draft 2020-12 support for `tests/schema.py`. | The Node structural validator still works; do not claim the optional schema check passed. |

These developer dependencies are inherited from the supplied package, are not installed here, and have no exact environment lock in this skill. They are unnecessary for ordinary creation and player integration. Replacing their checks with available browser tooling is possible without changing the presentation format.

## Provenance and maintenance

The source license is in [LICENSE](LICENSE). External provider audio, voices and supplied source material retain their own terms. See [references/SOURCES.md](references/SOURCES.md) for technical sources and the bundled source/media ledgers for examples.

Optional upstream tools: [Node.js](https://nodejs.org/), [FFmpeg](https://ffmpeg.org/), [Python](https://www.python.org/), [Playwright](https://github.com/microsoft/playwright), [jsonschema](https://github.com/python-jsonschema/jsonschema). No copies of these tools are redistributed here. Their exact installed revisions, transitive requirements and license notices must be recorded if a downstream project packages them. The supplied skill does not pin or certify such an installation. Do not infer FFmpeg distribution terms without inspecting its build options and included notices.

After changing local runtime code, run `npm test`, `npm run build` and `npm run test:portability` from this folder. The portability check copies the skill and installs its complete player into a separate temporary project without needing a sibling skill.
