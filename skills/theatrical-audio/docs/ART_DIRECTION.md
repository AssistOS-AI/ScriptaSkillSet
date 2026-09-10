# Acting, casting and listening

The coding agent is the director. It must turn the user's prose into a score without presenting a mechanical sentence splitter as understanding the story. Preserve the spoken text; put performance instructions in direction fields, never in subtitles.

## Write playable directions

Prefer a situation and an intention over a pile of emotional adjectives:

> She sees a threat behind David but does not want him to turn. Speak very quietly, suppress panic, hesitate after his name. Do not add words or overact.

In OpenAI/Qwen this becomes a separate instruction. A short instruction still cannot guarantee every nuance. On ElevenLabs, author explicit supported audio tags/settings; on Azure, choose a voice-supported style and rate. `intensity:0.7` is not a physical unit shared by all engines. Amplification is `gainDb` in the mix; it is distinct from emotional intensity.

For a stable cast, use predefined voice IDs. Voice descriptions do not override the fundamental identity of an OpenAI built-in or Qwen CustomVoice speaker. Qwen VoiceDesign interprets the description but can drift across short clips. This skill does not clone arbitrary reference voices. Casting requires listening, not merely matching a gender/age label in JSON.

## Boundaries and pauses

Keep a coherent phrase, natural breath and meaningful hesitation in the same clip. Split when the actor, intention or scene beat changes. Put camera holds, entrances and delayed replies on the timeline. Do not fill a voice WAV with idle scene time. Very short isolated words can lose continuity; very long clips reduce editability and make errors harder to repair.

A practical first scene uses one take per beat, dry speech, and no ambience. Verify the words and identity first. Add room processing, effects and beds afterward. Quiet dialogue should remain intelligible without needing to raise the entire environment.

## Take evaluation

The CLI's `technicallyUsable` flag means only that a take is not almost silent and has a minimum duration. It is not an artistic recommendation. Listen for exact words, unwanted added speech, pronunciation, natural phrase boundaries, voice identity, emotional appropriateness and continuity with adjacent clips. Select the take explicitly. More takes are more computation or API charges, not a guarantee of improvement.

The supplied `emotion-study.score.json` holds the same words and speaker across five directions: neutral, relieved joy, restrained fear, hurt anger and tender sadness. It targets instruction-following OpenAI/Qwen backends. For a meaningful evaluation, randomize the files for listeners; ask them to identify intent and rate naturalness/identity separately. Add a neutral baseline, retain failures, and report the number of listeners/takes. No measurements from that listening experiment are claimed in this release.

## Falsifiable checks before deployment

Reject a scene when it changes key words, turns a character into a different voice, makes emotional direction indistinguishable from the neutral baseline, or creates distracting clipping/joins. A regenerated line must recompute its measured duration and invalidate old word markers. A pause-only edit must keep the dry audio hash unchanged. The latter properties are automated; artistic quality remains a listening question.

The Last Light score is an original short staging example with separate voices, procedural beds and effects. The package does not include a “finished cinematic” neural render. Procedural hum/rain/metal are simple editing fixtures, not realistic recordings. Use your own licensed WAV assets when realism matters. Disclose AI-generated speech, and only use voices/assets you have rights to use.


## Same dramatic intention, different provider controls

For “quiet restrained fear”, Gemini or Hume model 1 can receive concise prose. Groq can receive an explicit whisper tag; Cartesia can receive the scared enum plus a pace. These are not equivalent expressive instructions. Providers without acting fields must emit a warning and, where required, obtain explicit degraded-control acceptance. Do not select a take automatically as “best acting” from RMS/peak scores. Listen for exact words, stable character identity, meaningful contrast and unnatural vocalizations.
