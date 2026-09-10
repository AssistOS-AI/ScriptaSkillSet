# Player integration and behavior

## Copy the complete implementation

`assets/player/shf-player.js` is a distributable concatenation of the four files in `runtime/`: core, themes, fonts, player. The skill includes both source and distribution. No framework, npm package, CDN, external font or service is required by playback.

```sh
node /path/to/shf-presentation-creator/scripts/shf.mjs install-player /project/public/shf
```

Creates `shf-player.js`, `LICENSE`, `FONT-LICENSE.txt` and `embed.html` in the destination. Identical files may be installed again; a differing existing file causes an error. Choose a dedicated directory. Do not use this to overwrite a customized application silently. After changing runtime source, rebuild the distribution or run the installer, which concatenates current source directly.

## Bundled presentation typography

The portable runtime embeds Red Hat Display (600/700) for headings and short SVG
labels and Red Hat Text (400) for captions. `setFilm()` awaits font loading before
rendering. Keep the fonts module and its SIL Open Font License in installed and
standalone players; no network font request is needed. Headings use natural case,
bold display type and reserved space; captions retain a calmer reading face.

## Loading

```html
<script src="./shf/shf-player.js"></script>
<shf-player id="film"></shf-player>
<input id="open" type="file" accept=".shf">
<script>
  const player = document.getElementById('film');
  document.getElementById('open').addEventListener('change', async event => {
    try { await player.loadFile(event.target.files[0]); }
    catch (error) { console.error('Cannot open film:', error.message); }
  });
</script>
```

`await player.load(url)` fetches a film explicitly from a URL (normal origin/CORS rules apply). `await player.loadFile(fileOrBlob)` reads a local SHF/JSON object; its offline audio must be contained. `await player.setFilm(compiledFilmObject)` validates, clones and loads an in-memory film, initially paused. Do not feed `SHF-Direction` directly to the player; compile it first.

The generated standalone HTML is the easiest local-phone review artifact. It requires a browser HTML context with JavaScript. A phone's attachment/document viewer may not provide that context. No assertion of support on every phone is made.

## Control methods

| Method/property | Behavior |
|---|---|
| `await play()` | Unlock/decode/schedule audio then start; may enter error state with `shf-error`. |
| `pause()` | Retain position, stop scheduled audio and animation frames. |
| `seek(milliseconds, resume?)` | Clamp to duration, reconstruct state, optionally resume; default preserves playing/loading intent. |
| `jump(sceneIndex)` | Seek to that scene; index is zero-based. |
| `setRate(number)` | Playback speed 0.5–2.0; UI offers common values; pitch changes with rate. |
| `setVolume(number)` | Master gain 0–1; zero sets mute; positive volume unmutes. |
| `setMuted(boolean)` | Toggle mute without changing stored volume or restarting audio. |
| `setMusic(boolean)` | Enable/disable the existing soundtrack mix, not voice. |
| `setCaptions(boolean)` | Overlay captions on/off. |
| `setTheme('color'|'paper'|'night')` | Apply art palette/variants without restarting narration. |
| `setPalette({token:'#RRGGBB'})` | Override known color roles; values must be hexadecimal colors. |
| `setReducedMotion(boolean)` | Freeze decorative tracks, keep explanatory states. |
| `fullscreen()` | Native fullscreen when permitted; CSS cinema fallback otherwise. |
| `snapshot()` | Film, scene, time, state, rate, volume, mute, theme; no saved user feedback. |
| `captureSVG()` | Current art-stage SVG string; does not include HTML controls/subtitles. |
| `currentTimeMs`, `durationMs` | Current global position and total duration. |

`SHF.core` exposes validation, sampled timeline and archive utilities; `SHF.themes` exposes default palettes. Independent players use separate SVG DOM trees, clocks and audio graphs. Hosts should normally pause one when another starts; automatic site-wide media arbitration is not implemented.

## Events

`shf-loaded`, `shf-play`, `shf-pause`, `shf-scene`, `shf-seek`, `shf-volume`, `shf-error`, `shf-ended` are composed, bubbling CustomEvents. Typical detail is a snapshot; scene/error events provide scene identity or an error message. Do not infer that `shf-play` means a premium voice passed listening review; it means the schedule started.

```js
player.addEventListener('shf-error', event => {
  status.textContent = event.detail.message;
});
player.addEventListener('shf-ended', () => {
  // Optional host action: show the source book's page.
});
```

No analytics requests, localStorage persistence or viewer notes subsystem are included. An embedding site controls its own data collection policies separately.

## Transport design

The bar overlays the film with icons for play/pause, previous/next scene, mute, volume, captions, music, transcript, chapters, settings and fullscreen, plus three directly accessible Color/Light/Dark theme buttons. The scrubber shows total position. The transcript and chapters are drawers opened from the bar, not permanent panels beside the film. On narrow embeds, captions and transport use a reserved rail below the artwork, with controls wrapping into two rows. Theme buttons expose the selected state with aria-pressed and do not restart audio. Single-film standalone exports display only the player. Each caption card shows one complete sentence; authored narration uses one measured clip per sentence. Older multi-sentence clips are split into sentence cards with approximate timing rather than displayed together.

Tooltips and accessible labels describe icons. Keyboard: Space play/pause, left/right five-second seek, M mute, C captions, F fullscreen, when focus is not in an interactive input/button. Controls stay visible while focused. Very narrow layouts may omit the previous-scene shortcut; the chapter list still provides all scenes. No hidden essential action requires text-only guessing.

The component is isolated using Shadow DOM; container-size rules adapt transport density. Host CSS custom properties include `--shf-accent`, `--shf-radius`, `--shf-caption-size`. Set `--shf-control-bg`, `--shf-control-ink`, `--shf-control-muted`, `--shf-control-line` and `--shf-control-hover` from the embedding site’s current theme. They colour the transport, sliders, active controls and drawers in inline, narrow and fullscreen modes. Do not freeze an embed to a green accent or leave chapter highlights in another fixed colour. Site control colours are independent of the film’s Color/Light/Dark artwork palette; standalone players retain self-contained defaults. The full subtitle/accessibility experience still requires human testing at the target device size; an icon having an ARIA label is not a formal accessibility certification.

## Audio state machine

`empty → paused → loading → playing → paused/ended/error`. Loading never advances media time. Required voice decoding failure stops the film. A silent film is intentionally allowed. Mute modifies only master gain; music and voice keep their schedule, even at volume zero. Scene changes are gated by preparation of the next scene, rather than a `setTimeout` that ignores sound.

At 1×, animation samples follow the AudioContext clock. Pause, seek and rate changes cancel/recreate sources with the right offset; late async completions cannot start an obsolete film because load tokens are checked. Hiding the document pauses playback. Audio resumption may require a fresh user gesture on some browsers.

## Deployment limits

The archive is loaded into memory; audio is decoded per scene with an approximate cache bound. There is no video export, streaming protocol, DRM, live network audio, multi-track mixing desk or general SVG scripting. The prototype supports local and hosted playback, not every browser codec combination. Fullscreen and autoplay are browser-controlled. Test your CSP, iframe permissions, mobile browser and intended media encodings before deployment.

For a mascot-led landing page, initialise its lightweight visual and actions
before a large catalogue or content index. Loading indicators belong to the
region awaiting data, not to the whole page. An inline question mode can replace
the entry choices in the same footprint; provide a labelled close control and
restore focus to the originating choice. Preserve typed text while other site
components initialise or the interface language changes.

## Host close control

When a presentation host provides dismissal, use a clearly visible X just above
the player at its right edge, without a coloured background or visible label.
Keep a localised accessible name, keyboard focus outline and at least a 44px
hit target. Closing must pause playback; preserve Escape for modal hosts and
prevent pending loads from restarting dismissed playback. Keep host navigation
outside the reusable player stage.

A player inside a centred flex/grid host needs an explicit usable width on its
wrapper (`width:100%; min-width:0` with the intended max-width). The player’s
inline-size containment cannot supply intrinsic width; an icon-only close
control must never determine the width of the whole film. Test a loaded film
in the actual host at desktop and phone widths, asserting stage width as well
as close-control placement. Testing an empty player or standalone export alone
does not validate the integrating page.

## Subtitle presentation

Default captions retain one whole sentence, centred within a narrower reading
measure (52ch maximum) with balanced wrapping. Long captions should form two
roughly even lines where space permits; narrow screens may need more lines,
without clipping or shrinking below the selected size. White glyphs use a dark
outline instead of an opaque caption panel. Settings expose Subtitle size
(75–150%, locally remembered) and Music level. Speed and Reduced motion are not
shown as visitor controls; existing APIs and system reduced-motion preference
remain available. Verify both themes with pale and dark backgrounds, enlarged
captions, and mobile wrapping when changing typography.
