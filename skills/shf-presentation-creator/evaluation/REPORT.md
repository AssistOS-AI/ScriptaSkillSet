# Portability verification, 2026-09-10

The renamed `shf-presentation-creator` passes 571 Node tests and 10 copied-folder portability checks. The latter rebuilds the copied skill, installs its complete player in an unrelated project, compiles and validates a presentation from a different working directory, checks a custom vector example, measures bundled WAV narration and verifies the installed player bytes. See `portability-results.json` for the latest execution. No companion audio skill, credential file or project policy was required.

Earlier reports below retain their original names and paths as historical evidence. Browser tests were not rerun for this rename and portability update; no browser runtime logic was changed.

# SHF Director 0.4 · evaluation report

Prepared 2026-09-10. This report concerns the code and examples in this package, not future adaptations produced by another coding agent.

## Delivered scope

The skill contains the full browser runtime and distribution, a semantic scene compiler, archive reader/writer, per-line voice task/receipt contracts and measured timing tools, 502 library entries with static SVG previews and a searchable offline catalogue, 12 original procedural music cues and their scores, 12 content-specific directing plans, source-grounding guidance, and four compiled demonstration films.

The viewer notes/feedback interface has been removed. Transcript and chapter access remain in the compact film control bar. Subtitles overlay the animation. Mute changes gain and does not stop or restart voice playback. Voice preparation gates scene advancement. Light and Dark have revised palette/material/background treatments.

## Tests actually run

| Suite | Result | What this establishes |
|---|---:|---|
| Native Node tests | 571/571 passed | Includes 502 parameterized asset construction/three-theme SVG checks and 69 other compiler, archive, path, voice, music, editorial, installation and discovery checks. |
| Browser integration | 39/39 passed | Clock/pause/seek/rate, muted source continuity, volume zero, delayed scene preparation, rejected voice, exact end, transport/drawers, import, narrow layouts and isolated instances. |
| Sampled scene states | 336 | 28 scenes × 3 themes × 4 times checked for finite geometry and resolved colors. This is one parameterized browser check, not 336 audience tests. |
| JSON Schema | 14/14 passed | Authoring and playback structure for bundled directions/films. Runtime validation adds cross-reference/time constraints. |
| Cold-copy portability | 9/9 passed | Copy to an unrelated directory with spaces, rebuild, install into a new application, compile minimal/custom films, reattach native WAV voice, check editorial provenance and compare binary output. The repeated Node run is not counted as a new independent suite. |

Environment: v22.16.0, Linux; Chromium 144.0.7559.96 through Python Playwright. The runtime and Node authoring tools themselves require no npm dependency. Browser/schema test tools are optional test-only dependencies.

### Directly tested audio cases

The narrated player uses the AudioContext clock after preparing voice sources. Tests show time continues under mute and volume zero without source-count changes; pause freezes position and stops sources; a deliberately delayed next-scene preparation holds the current scene; a late preparation cannot restart a paused player; malformed required voice stops playback without timeline drift. Music is scheduled alongside voice and ducked during a spoken beat.

All 84 bundled narration lines have actual local audio files and measured duration records. Twelve lab lines are WAV; 72 longer-demo lines are segmented MP3. The included voices are eSpeak demonstrations. There was no premium neural TTS audition, transcript-matching ASR test, forced word alignment or complete production listening approval in this environment.

## Visual inspection

Representative desktop and phone-sized frames were inspected, including the Color, Light and Dark treatments and the asset catalogue. The automated browser suite sampled every demonstration scene in all three themes. Representative screenshots are retained in this directory. The 502 asset checks establish valid reusable vector data, not that every drawing is a professionally polished independent design.

Catalogue accounting is explicit: 16 core entries + 198 further object recipes + 24 character identities × 12 expressions. Human variants share a base rig. Core boundary anchors and custom node anchors must still be reviewed when a precise physical contact point matters.

## Demonstrations

| Film | Scenes | Measured spoken lines | Duration |
|---|---:|---:|---:|
| visual-lab | 4 | 12 | 1:08 |
| mars-library | 12 | 36 | 6:54 |
| freedom-practice | 6 | 18 | 3:03 |
| governable-ai | 6 | 18 | 3:19 |

These are original demonstration texts and metaphors, not validated adaptations of published books. The SF example exercises an approximately seven-minute timeline; it is not evidence of a tested 30–60-minute viewing experience.

## Portability evidence

The cold-copy test builds from only the copied skill and bundled files, with no preceding studio archive, internet request or TTS service. It copies the complete runtime into a separate application, compiles a minimal film and a custom safe-vector example, and confirms the installed runtime equals the distribution. The Mars archive rebuild is byte-identical. Ready authoring files refer only to media inside the skill root; external voice generation is deliberately a separate environment capability.

## Explicit limits and untested claims

- Direct `file://` opening in the automated browser was blocked by the environment's administrator policy. The full HTML content was exercised in a browser page offline, with zero HTTP requests. This is not a physical-phone file-opening test.
- Phone sizes were emulated at 320 and 393 pixels and a landscape size; no physical Android/iPhone, Safari, Firefox, screen-reader certification or production iframe/CSP deployment was tested.
- Factual entailment, originality in an external field, narrative engagement and comprehension are not established by a schema or by the heuristic text analyzer. The coding agent performs editorial work under the supplied guidance; reviewer/audience approval remains separate.
- Premium voice skill integration must be selected and verified in the receiving environment. Local discovery provides candidates, not proof of a working service. The demonstrations do not prove high-quality Romanian neural speech.
- Captions without external phrase alignment are approximate cards/line cues. Playback rates other than 1× change pitch. The runtime loads packages into memory rather than streaming them.
- Original music cues are restrained additive-synthesis demos, not concert-quality classical recordings. External music needs exact rights verification; no pre-cleared classical recording is included. Mastering and scene-boundary listening remain author-side tasks.
- Long-form comfort, audience retention, broad source genres and automatic high-quality book adaptation have not been empirically validated. The 12 directing plans are authored instructions, not twelve benchmark-proven adapters.

## Reproduce

```sh
node --test tests/core.test.mjs
node scripts/build.mjs
node scripts/build-catalog.mjs
node tests/portability.mjs
# Optional test environment dependencies:
python tests/browser.py
python tests/schema.py
```

Detailed machine results: `core.tap`, `browser-results.json`, `schema-results.json`, `portability-results.json`, the four audio reports, and `build.json`.
