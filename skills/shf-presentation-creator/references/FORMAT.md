# SHF 0.4 · implemented format and compiler contract

Status: experimental local interchange format, not a registered web standard. Extension `.shf`; the container is a ZIP. The extension deliberately does not expose the ZIP implementation detail. The implemented profile is `svg-scene-v1`.

## 1. Two representations, one deliverable

**Authoring:** `SHF-Direction` JSON describes reusable objects, semantic actions, source-backed beats and audio. **Playback:** `SHF` JSON contains safe vector node trees and sampled scalar tracks. The compiler expands asset recipes and actions. The player does not need the library or run user-supplied JavaScript.

A `.shf` archive has `film.json` at its root and embedded referenced audio under `assets/`. The packer writes ZIP STORE for reliable dependency-free import. Import additionally accepts DEFLATE when the browser provides `DecompressionStream('deflate-raw')`. It rejects unsupported compression and unsafe paths. There is no `package.fshz` wrapper or nested ZIP requirement.

```text
example.shf
  film.json
  assets/voice-s1-line-01.mp3
  assets/voice-s1-line-02.mp3
  assets/music-curiosity.wav
```

An autonomous HTML includes player code, compiled film JSON and audio bytes as base64. It does not fetch fonts, images, scripts, music or narration from a server. Base64 makes HTML larger than a binary archive. Loaded `.shf` media also reside in memory; this profile is not streamed.

## 2. Film fields

Required: `format`, `version`, `id`, `title`, `stage`, non-empty `scenes`. Playback `format` is `SHF`; `version` is `0.4`; `profile` is `svg-scene-v1`. The reader retains 0.3 compatibility; new compiler output is 0.4. IDs used as output filenames contain only letters, digits, hyphens and underscores, start with a letter or digit and have at most 80 characters.

`stage` has positive `width` and `height`; examples use 1200 × 760. The player preserves that coordinate system in its SVG viewBox; its current presentation box uses the same 1200:760 ratio. Other canvas proportions require an explicit player layout change and testing; do not claim automatic re-layout.

`language`, `description`, `editorial`, `sources`, `visualIdentity`, `voice`, `audioDisclosure` and other provenance fields are descriptive metadata. `durationMs`, when present, must equal the sum of scene durations. Unknown metadata does not execute code.

`assets` maps stable IDs (1–160 filename-safe characters) to audio entries:

```json
{
  "voice-intro-01": {
    "mime": "audio/wav",
    "data": "BASE64_WHEN_LOADED_OR_EMBEDDED",
    "sha256": "measured-source-hash",
    "quality": "listening-reviewed",
    "rights": "actual rights evidence"
  }
}
```

On disk, `path` replaces `data` inside the ZIP. Allowed MIME types are `audio/wav`, `audio/mpeg`, `audio/ogg`. The build tool can resolve contained local `path` values in authoring JSON. The package does not support arbitrary raster/video assets or external SVG execution in this profile; those are future extensions, not hidden features.

## 3. Scene authoring

A scene has `id`, `title`, positive `durationMs`, `setting`, `objects`, `actions`, `beats`; `connections`, `captions`, `audioClips`, `music` and explanatory metadata are optional. `setting` selects the local background treatment (the supplied examples use `studio` or `mars`). It is not a procedural world generator.

Objects:

```json
{
  "id": "mira",
  "asset": "person-02-curious",
  "x": 320,
  "y": 635,
  "scale": 1.15,
  "options": {"color": "$teal"},
  "meaning": "the recurring archivist"
}
```

Coordinates usually refer to floor contact, not the top-left corner. Asset-specific anchor positions are local to the root. Object order is draw order; place back objects first, actors and handled objects afterward. Semantic actions use exact object IDs, not display names.

One source-supported line is one beat:

```json
{
  "id": "scene-02-line-01",
  "startMs": 700,
  "endMs": 6500,
  "spokenEndMs": 5900,
  "text": "The archive links fragments that were never placed together.",
  "sourceRefs": ["chapter-3"],
  "speakerId": "narrator",
  "performance": {"emotion": "curiosity", "intensity": 0.3}
}
```

Beats are ordered and non-overlapping. `spokenEndMs` lies within the beat. Its end can include a reflection gap; the player does not keep a subtitle visible throughout an unrelated silence.

## 4. Semantic action vocabulary

The supported 22 names are:

`appear`, `disappear`, `moveTo`, `lookAt`, `react`, `character.express`, `character.gesture`, `walkTo`, `reach`, `book.open`, `book.turnPage`, `city.grow`, `stack.grow`, `stack.wobble`, `door.open`, `door.close`, `machine.think`, `machine.approve`, `paper.verify`, `balance.weigh`, `stamp.press`, `tree.sway`, `light.warm`, `connection.draw`.

Generic actions operate on any object. The named rig actions require the corresponding core asset; character actions also accept the person-expression IDs. Not every one of the 502 entries has a bespoke action. New objects can appear, move and serve as endpoints; sophisticated rig behavior must be implemented and tested rather than merely named in JSON.

```json
{
  "actor": "mira",
  "action": "lookAt",
  "target": "archive",
  "up": true,
  "cue": {"beatId": "scene-02-line-01", "edge": "start", "offsetMs": 400},
  "durationMs": 850
}
```

Either numeric `atMs` or a `cue` determines the start; a cue takes precedence. Edge is `start` or `end` of the beat, not a word. Cue offsets are milliseconds. All resolved action intervals must be within the scene. Voice attachment retimes numeric actions and leaves cue resolution to compilation.

`moveTo`/`walkTo` use `x` and optional `y`; `lookAt` uses a target object; `react` may use `emotion`; `character.express` requires `options.dynamicExpressions:true` and a supported `emotion`; `character.gesture` takes `gesture` (`invite`, `explain`, `question`, `recoil`, `reflect`, `resolve`, `release`); `reach` may use `untilMs`. See a real example and the compiler for exact rig parameters. Avoid overlapping actions on the same rig channel. Complex repeated gestures should be split into clear, sequential actions and checked at each boundary. There is no arbitrary morph, particle script, physics engine or script interpreter hidden behind these names.

## 5. Anchored connections

```json
{
  "id": "evidence-link",
  "from": {"node": "document", "anchor": "right"},
  "to": {"node": "claim", "anchor": "left"},
  "color": "$teal",
  "width": 3,
  "bend": -25,
  "meaning": "this source supports this specific claim"
}
```

Both endpoints must name existing nodes and anchors. The player recomputes connection geometry from SVG transforms, including parent movement and camera transforms. It hides the connection when an endpoint is hidden. `connection.draw` progressively reveals the actual anchored path. A generic catalogue object's left/right ports are schematic boundary ports, not guaranteed electrical/mechanical contact points; adjust a custom node's anchors when a real port matters.

A direction must not invent a line solely because there is empty space. Decorative background strokes are not animated causal links.

## 6. Compiled node and track model

Nodes are data with `id`, `type`, `attrs`, optional `children`, `text`, `transform`, `origin`, `opacity`, `anchors`, `themeAttrs`, `visibleThemes`. Allowed SVG node types: `g`, `path`, `rect`, `circle`, `ellipse`, `line`, `text`, `polygon`. Attribute allowlist is in `runtime/shf-core.js`; executable SVG, HTML, event handlers, external URLs and `url(...)` attributes are rejected.

Theme tokens such as `$paper`, `$ink`, `$blue`, `$teal`, `$gold`, `$skin` are resolved by the player. `themeAttrs.paper` / `.night` can override allowed scalar attributes; `visibleThemes` selects variants. This is static declarative styling, not arbitrary CSS.

Tracks address `x`, `y`, `scale`, `scaleX`, `scaleY`, `rotate`, `opacity`, `draw`. Each target/property pair has one ordered key sequence. A key has `t`, numeric `v` and optional easing `linear`, `inOut`, `out` or `hold`. Times are local milliseconds; opacity/draw are 0–1; scales are positive. `origin` controls rotation/scaling pivot. `$camera` is a reserved transform target.

State is sampled from absolute local time on every frame. Seeking to A, B and back to A produces the same vector state. Pausing stops time rather than leaving CSS animations running. Reduced motion freezes tracks marked `essential:false` while retaining explanatory ordering.

## 7. Audio, captions and music

```json
{
  "audioClips": [
    {"assetId":"voice-intro-01", "beatId":"intro-line-01", "startMs":700, "durationMs":5200, "speakerId":"narrator"}
  ],
  "captions": [
    {"startMs":700,"endMs":3200,"text":"A source is not the same thing as a proof."}
  ]
}
```

Voice clips are ordered, non-overlapping and contained in the scene. They share the measured scene clock. Legacy single-clip `scene.audio` remains accepted with offset zero; do not combine it with `audioClips`. Captions are optional ordered non-overlapping cues; if absent, the player uses short approximate cards from spoken beats. `captionsVTT` exports explicit cues or line-level beats, not synthesized word timestamps.

Film `soundtrack` or scene `music` identifies one asset, optional `gain`, `loop` and `offsetMs`. `scene.music:null` disables the film soundtrack for that scene. Default user music is off. Audio production and exact mixing behavior are specified in `VOICE_AND_MUSIC.md`.

## 8. Custom assets and overrides

A custom object has `asset:"custom"`, `visual` containing one safe node tree rooted at `$asset`, and normal position/scale. Its child IDs use the `$asset.` prefix, remapped to the instance ID. Give it stable names, meanings and anchors. `examples/custom-asset.direction.json` is executable.

For a project-wide improved drawing of a named library item, put its root node tree under that ID in `assets/library/overrides.json`. The compiler instantiates the override before the built-in recipe. Preserve named rig parts required by actions, or generic actions only. Rebuild the SVG catalogue after changes. Editing a generated SVG preview does not change the canonical recipe.

## 9. Limits and validation

At most 600 scenes, 600,000 ms per scene, four hours total, 1,500 visual nodes per scene, node nesting 20 levels, 1,000 keys per track. Import caps archive size and expanded total at 128 MiB, individual files at 64 MiB and entries at 2,000. These are prototype bounds, not comfort/performance guarantees for every device. Use compressed narration for long films and validate size; one hour of PCM WAV may exceed the container limit.

JSON schemas under `assets/schema/` provide structural tooling. The runtime validator is additionally normative for references, timing, path safety and finite numbers. Passing either does not establish factuality, artistic quality, accessibility certification, malicious-input completeness or audio licensing. Run both structural and browser tests after code changes.
