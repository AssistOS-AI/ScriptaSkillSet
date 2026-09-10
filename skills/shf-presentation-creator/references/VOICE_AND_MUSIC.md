# Voice direction, synchronization and restrained musical support

## A. Discover a real voice capability

This skill intentionally does not prescribe a fictional universal TTS command. A coding agent must inspect the **actual environment**. First query the host's skills/tools registry; inspect explicitly authorized skill roots where relevant. `scripts/discover-skills.mjs ROOT...` provides a bounded local catalogue of likely matches and their instruction hashes. It does not install, authenticate, invoke or certify any candidate.

Read the candidate's exact contract. Record its language and accent support, expressive/prosody controls, voice consistency, permitted output formats, timestamps/alignment support, privacy, usage rights, estimated cost and actual availability. A model name mentioned in a README is not proof of an installed capability. A disconnected plugin is not usable.

Choose using a small audition rather than brand preference: one warm narrative line, one difficult technical sentence with a negation, and one emotionally restrained question. Suggested editorial rubric: intelligibility/pronunciation 35%, expressive appropriateness 25%, speaker consistency 20%, privacy/rights 10%, timing/control 10%. Reject tools that cannot satisfy mandatory language or permission requirements regardless of score. Costs and user authorization remain hard constraints.

Save `voice-capability.json` based on `assets/templates/voice-capability.example.json`. When features are absent, say so. Do not invent word timestamps, SSML support, emotional tags or a cloned voice. Do not send an entire confidential manuscript when a line and minimal context suffice.

## B. Direct each line, not only the whole film

`voice-tasks` emits separate tasks with stable beat IDs. Each includes the spoken text, speaker identity, preceding/following line, scene intent, performance direction, target speed, emphasis, pronunciations and output request. Only `text` is spoken. The surrounding directions are production metadata.

A good task is concrete:

```json
{
  "id": "mechanism-line-02",
  "text": "A trace does not prove that the answer is true.",
  "speakerId": "narrator",
  "performance": {
    "delivery": "calm, precise, helpful; correct a plausible misunderstanding",
    "emotion": "clarity",
    "intensity": 0.25,
    "targetWpm": 132,
    "pauseBeforeMs": 150,
    "pauseAfterMs": 1200,
    "emphasize": ["does not prove"],
    "pronunciations": {},
    "avoid": ["sarcasm", "sales delivery", "reading the directions"]
  }
}
```

Adapt this task to the chosen tool's real fields. If it accepts a style instruction string, compose it from the metadata. If it supports only plain text, do not add unsupported tags to the spoken text; choose a better capability when available. If SSML is supported, validate the provider's subset. Explicit pause metadata is a request, not a guarantee; measure the resulting sound.

Voice continuity includes voice ID, language/accent, microphone perspective, approximate loudness and emotional baseline. Dialogue uses stable speaker IDs, not a random narrator voice per line. Use distinct people respectfully; demographic appearance does not determine accent, competence or moral role. Do not clone a real person's voice without appropriate authorization.

Listen to each line for omitted words, changed numbers, missing negation, mispronunciation, clipped syllables, noise, unexpected language switches and inappropriate delivery. Listen to joins between adjacent lines. Regenerate failed lines only; preserve IDs and successful audio hashes.

## C. Receipts and measured timing

Put receipts in the same production directory as a contained `audio/` directory. Paths must remain inside that directory; absolute paths and `..` escapes are rejected. A receipt records what exists, not what should exist:

```json
{
  "format": "SHF-VoiceReceipts",
  "version": "1",
  "provider": "the actual selected provider",
  "lines": [{
    "id": "mechanism-line-02",
    "file": "audio/mechanism-line-02.wav",
    "sha256": "actual lowercase SHA-256, or omit until measured",
    "voiceId": "actual stable voice ID",
    "quality": "listening-reviewed",
    "alignmentQuality": "line-only",
    "rights": "actual authorized usage and evidence locator"
  }]
}
```

The hash, when present, must match. The attacher measures PCM WAV using the RIFF data size and byte rate, or MP3/OGG using optional `ffprobe`. Final output contains `scene.audioClips[]` with one measured clip per line, plus `beats[].spokenEndMs`. It does not guess final duration from character count. It inserts/preserves small gaps, recomputes the scene end, and retimes numeric choreography using a monotonic map. Actions anchored to beat cues are resolved by the compiler afterward.

The attacher does not perform speech recognition or forced alignment. External word/phrase alignment may be converted into explicit `scene.captions[]` after attachment. Do not present approximate card splitting as aligned word timing. Check the returned audio report and watch the retimed visual sequence.

## D. Runtime synchronization contract

The player uses one Web Audio context per player instance. Voice and optional music feed separate gain nodes, then a master gain. Before a scene can advance, the player unlocks the audio context and decodes its voice clips. After scheduling the sources, visual time is derived from the audio context's clock. Scene loading freezes progress. Failed required narration puts the player in an error state rather than silently showing subsequent scenes without it.

Mute changes only master gain to zero. Volume zero has the same effect; voice sources still run and the visual clock still follows the audio clock. Pause stops sources and retains the visual position; resume re-schedules from that position. Seeking or changing speed cancels the old schedule and re-schedules. Hidden tabs pause deliberately. This is not a background audiobook service.

An intentionally silent scene uses a visual clock when it has no audio at all. If a soundtrack exists, the audio context remains the clock even when the user has music turned off. This avoids a change of timing model when music is toggled.

This prototype changes the buffer playback rate; **voice pitch is not preserved at non-1× speeds**. Normal 1× playback is the reference for voice quality. Decoding is bounded by an approximately 32 MiB cache, but the current scene's prepared buffers and the loaded archive still consume memory. It is not a streaming format.

## E. Optional music policy

The objective is to support pacing without reducing speech intelligibility or manipulating the apparent certainty of an argument. Default music off. The viewer has a music icon, separate music level in settings, and master volume/mute. Do not combine a busy musical foreground with a dense technical explanation.

Implemented controls: one active background cue; manifest `gain` 0–0.3 with default 0.12; user music multiplier 0–1; automatic 0.25× ducking during spoken beats; smoothed gain changes. At the default user multiplier 0.7, a speaking beat uses `0.12 × 0.7 × 0.25 = 0.021` music gain before master gain. This arithmetic is not a LUFS guarantee: the actual recording levels matter.

For production listening, target a clearly subordinate musical bed, often roughly 18–26 dB below narration as a starting design choice. Measure and listen; do not claim an automatic mastering standard. Avoid clipping, large transient peaks, vocals under narration, abrupt loud entrances or very bright persistent arpeggios. Leave some scenes entirely without music. Change cue at a chapter or emotional transition, not every sentence.

The current player does not provide an adaptive orchestration engine, beat-matched transitions, a final mix limiter or continuous streaming crossfades. Bundled cues have gentle internal fades. Scene-boundary restarts and seeking require listening review; full mastering remains author-side.

## F. Twelve included original cues

`assets/music/` contains `curiosity`, `wonder`, `calm`, `tension`, `melancholy`, `hope`, `discovery`, `resolve`, `warmth`, `intrigue`, `clarity`, `playful`. Every cue has a WAV, editable score and measured sample metrics. They are original sparse additive-synthesis underscores, **not recordings of classical works or concert-quality performances**.

Use curiosity/intrigue for an open question, clarity for a mechanism, warmth for care or collaboration, melancholy for loss without sentimentality, and hope for a qualified constructive ending. These associations are directing suggestions, not universal psychological facts. Music must not turn “possible” into “certain” or exaggerate a source's emotional stakes.

```sh
node scripts/shf.mjs music curiosity my-cue.wav
```

Agents may edit `SHF-Score` event lists or create new ones and call `renderWav` from `scripts/lib/music.mjs`. Enforced bounds include 4–120 seconds for composer-generated cues, at most 300 events in rendering, sample rate 8–48 kHz, MIDI 28–100, velocity 0–0.6, positive event duration within the score and the supported `felt`/`pad` timbres. The renderer normalizes non-silent output to a 0.25 sample peak and applies internal entrance/exit fades. These bounds are not a substitute for listening or checking polyphony and phrase repetition.

Use 2–6 simultaneous notes as an authoring guideline, sparse motifs and no copied recognizable modern tune. Store authorship, procedure, score, seed and rights. A generation tool's success is not proof that music is musically good or legally clear. For better timbres, use an actually available music-generation/rendering skill and document its output rights.

## G. Classical selection guide — no recordings are bundled

These are starting points for a music supervisor's listening and rights search, not pre-cleared assets:

| Work to consider | Directing use | Caution |
|---|---|---|
| J. S. Bach, Prelude in C major, BWV 846 | Order, unfolding structure, patient explanation | Continuous figuration may compete with technical speech. |
| Erik Satie, Gymnopédie No. 1 | Reflective space, philosophical ambiguity | Avoid making every serious topic sound sad. |
| Claude Debussy, Rêverie | Possibility, memory, gentle speculative wonder | Use an unobtrusive excerpt/arrangement only when authorized. |
| Ludwig van Beethoven, Piano Sonata No. 14, first movement | Quiet tension, introspection | Familiarity can overpower a small story. |
| Camille Saint-Saëns, Aquarium from The Carnival of the Animals | Strange worlds, delicacy, mystery | Its distinctive motion can become the focus. |
| Edvard Grieg, Morning Mood | Opening a world, gradual revelation | Avoid an automatic triumphant reading of uncertain claims. |
| Robert Schumann, Träumerei | Memory, intimacy, human consequence | Not a generic emotional shortcut. |
| W. A. Mozart, Piano Concerto No. 21, Andante | Measured movement, contemplative transition | Full orchestral recordings can be too dynamically broad. |

The composition, a particular arrangement/edition, and a particular recording may have different rights. “Classical” and “available online” are not permission. Verify jurisdiction, commercial redistribution, adaptation/synchronization, attribution and any other conditions for the exact material. Save the exact rights evidence and access date in the project. Use a licensed/cleared recording, create an authorized rendition of an eligible score, or choose a supplied original cue. Musopen's FAQ is a starting point for checking its materials, not a blanket clearance. The US Copyright Office's Circular 56A explains the distinction between compositions and sound recordings; it is not worldwide legal clearance.

## H. Honest failure handling

No available voice skill: report it, save pending line tasks and a silent draft. Provider cannot honor emotional instructions: document the limitation and choose a compatible alternative if one exists. Missing clip: fail attachment. Duration exceeds scene: retime before playback. Music rights uncertain: omit music. Pronunciation not reviewed: mark output as a draft. Never label a demonstration voice “high quality” only because it played successfully.

## Unhurried narration

Use real 1.0–1.5 second sentence gaps as the normal starting point. Leave roughly
1.8–2.5 seconds across scene changes, with longer thinking pauses when a diagram
or question needs inspection. Vary pauses by meaning; do not make every interval
mechanically identical. `performance.pauseAfterMs` is implemented by attach-voice
as silence after the measured spoken clip. Without an explicit value, the
attacher preserves at least 1000 ms of caption tail plus the next beat's gap.
Keep the complete current sentence readable through its pause. Pauses are
separate from voice assets, so timing-only revisions reuse accepted recordings.

Use an ordinary conversational pace; do not add tempo acceleration by default.
If the film is long, shorten its scope and script. Confirm measured clip-to-clip
gaps and scene transitions, not just total duration or a TTS speed setting.

When an audio backend limits score identifiers, reserve space for generated
batch suffixes before rendering. Derive a bounded stable identifier with a short
hash when necessary; retain the full public book title and preserve existing
valid cache keys. Test long titles before starting a catalogue batch.
