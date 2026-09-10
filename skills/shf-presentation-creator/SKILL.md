---
name: shf-presentation-creator
description: Create and edit illustrated presentations in SHF format in any project or workspace, and install or integrate the complete HTML player into other projects. Includes the compiler, standalone HTML export, browser runtime, visual assets and authoring references. English narration is the default; silent presentations remain available when requested.
license: MIT; see LICENSE. Source books and externally generated media retain their own rights.
metadata:
  version: "0.4.0"
  format: "SHF 0.4 / svg-scene-v1"
---

# SHF Presentation Creator

Create illustrated SHF presentations and provide everything the receiving project needs to play them. The skill works in any project or workspace; it does not require a Scripta application, repository layout or build system.

Choose the workflow that matches the request. For player integration, read [PLAYER_API.md](references/PLAYER_API.md) and use `install-player`; no source adaptation, editorial plan or voice generation is required. For a new or edited presentation, use the bundled format, compiler and assets. Follow the source-adaptation steps below when adapting a book, article or other supplied text. For a topic brief, use its audience and purpose, and support factual claims with supplied or verified sources. A short slide sequence or silent presentation is valid.

This folder is the entire skill. The browser runtime, compiler, asset construction code, library catalogue, voice contracts, music renderer and examples are local. **Copy the supplied player; do not regenerate its synchronization or security code from memory.** This skill does not contain a hidden LLM, a premium TTS engine, or an automatic claim of high-quality adaptation.

## Read the appropriate references

| Task | Read |
|---|---|
| Adapt any source | [WORKFLOW.md](references/WORKFLOW.md), [CONTENT_PLAYBOOKS.md](references/CONTENT_PLAYBOOKS.md) |
| Write scenes and animation | [FORMAT.md](references/FORMAT.md), [ART_DIRECTION.md](references/ART_DIRECTION.md) |
| Generate speech and music | [VOICE_AND_MUSIC.md](references/VOICE_AND_MUSIC.md) |
| Copy or integrate player | [PLAYER_API.md](references/PLAYER_API.md) |
| Decide whether it is ready | [QUALITY_GATES.md](references/QUALITY_GATES.md) |
| Bound untrusted input | [SECURITY.md](references/SECURITY.md) |
| Check outside specifications | [SOURCES.md](references/SOURCES.md) |

## Execution contract

Resolve `SKILL_ROOT` to the absolute directory containing this file. Invoke bundled scripts through that path, and run commands from the receiving project's working directory. Relative input and output arguments refer to that working directory; bundled examples require a `SKILL_ROOT` prefix. Keep project outputs outside the skill folder. Do not overwrite an existing player or application without reconciling differences.

No project configuration, sibling skill, credential file or root orchestrator is required. With Node.js 22+, this command compiles a silent example using only the copied folder:

```sh
node "$SKILL_ROOT/scripts/shf.mjs" compile "$SKILL_ROOT/examples/minimal.direction.json" output
node "$SKILL_ROOT/scripts/shf.mjs" validate output/first-scene.shf
```

`SKILL_ROOT` is a shell example, not a required environment setting. An absolute script path works equally well. See [dependencies.md](dependencies.md) for optional audio and developer tools.

Follow the requested language, audience, duration and presentation style. Otherwise use English for the script, on-screen text and narration, a general audience, Color theme and music off. Include narration by default; do not ask whether audio is wanted when the request is for a presentation. Respect an explicit language or silent-mode request. Choose a length that fits the material; do not stretch it with unsupported filler. For book adaptations, preserve essential claims and use few spoilers unless requested. Record assumptions and ask only about consequential ambiguities.

### 1. Inspect source and environment

Choose the **communication purpose before the subject genre**. For book-page
presentations and reading invitations, default to `book-introduction`: explain
why this book exists, what it contains and what readers can gain, using selected
ideas to earn curiosity about reading. Follow [BOOK_INTRODUCTION.md](references/BOOK_INTRODUCTION.md)
before any genre playbook. Explicit summaries, lessons, demos and tutorials keep
their requested purpose. Do not turn a technical book introduction into a product
demo or exhaustive workflow explanation merely because its subject is technical.


Use **why → how → what** as the default narrative logic for every supplied
book or document, integrating it naturally rather than labelling generic slides.
Open with a concrete **novelty hook in the first one or two sentences**: a
source-supported distinction, unexpected mechanism, unresolved tension or
underexplained idea that gives this document a reason to exist. Within the first
20–30 seconds, make clear what the audience will understand and why that
understanding deserves their time. Tease the specific insight, then pay it off
through the explanation; do not begin with a generic overview, a list of topics,
empty suspense or motivational boilerplate. “Novel” can mean distinctive in this
document, not unprecedented in the field: never assert “never said before” or
“first ever” without evidence. Review the opening again after drafting the whole
script and verify that its promised insight is actually delivered.

For an explanatory summary, first discover the source-specific problem and stakes (why), then its distinctive
mechanism or argument (how), then its concrete proposal, findings or result
(what). Preserve the author's order when changing it would distort an argument.
Explain what distinguishes this source: retain its technical vocabulary and
relationships, define terms on first use, and distinguish the author's meaning
from common uses of the same word. Do not claim field-wide novelty without
external evidence. Remove filler, banal observations, generic motivation and
repeated slogans; every sentence must advance understanding of the source or the source-grounded reading invitation.
Do not invent a why/how/what component absent from the source; record that limit.

**Exactly one sentence per narration beat and audio clip is mandatory.** Never
put two sentences into a single spoken task or display more than one sentence
in a subtitle card. Show the complete current sentence, synchronized to its
measured clip, instead of displaying a paragraph or joining adjacent sentences.
Write concise sentences that fit the caption safe area, normally 8–16 words, with a soft ceiling of 20;
do not create long clause chains simply to evade this rule. Check abbreviations,
acronyms, technical names and their pronunciation without replacing them with
inaccurate everyday terms. The `voice-tasks` command rejects multi-sentence beats.
After changing a sentence, regenerate its audio and validate the text hash.

Read the source, including conclusion and limitations. For a book, build a chapter map before choosing highlights. Use a document-extraction skill actually available for PDFs, EPUBs or DOCX; do not pretend the text-only CLI parses those formats. Preserve canonical UTF-8 text and source offsets.

Inspect the target project before integration. Use a voice tool actually available in the host when narration is requested. `theatrical-audio` is one optional candidate; discover its real location instead of assuming a sibling directory. A project's provider policy or orchestrator applies only if it exists and the requested workflow uses it. Never invent a tool, model, voice, API key or connection.

```sh
node "$SKILL_ROOT/scripts/shf.mjs" analyze source.txt work/analysis.json --language=ro --minutes=7 --genre=philosophy
node "$SKILL_ROOT/scripts/discover-skills.mjs" /actual/allowed/skills/root
```

The analyzer proposes **extractive candidates**, not a finished film. Its genre and rankings require editorial review.

### 2. Plan the presentation before drawing

For source adaptations, create `editorial.json` following `assets/templates/editorial.example.json` and the matching content playbook. Include the main question, indispensable claims, source spans, disagreements/limitations, curiosity hooks and their payoffs, novelty scope, spoiler budget, and what is deliberately omitted.

Select the essential insights that fit the requested scope. Distinguish source-supported surprise, the author's claim to originality, an original visual metaphor, and independently verified field novelty. Only the last warrants an unqualified novelty claim. Reject an attractive hook that distorts the source.

Run `node "$SKILL_ROOT/scripts/check-editorial.mjs" editorial.json source.txt`. This checks provenance structure, not the truth or artistry of the plan.

### 3. Write the presentation as directed beats

Use a content-specific plan, not the same six scenes for every genre. For every scene write: dramatic/explanatory purpose; what the viewer knows before and after; source-backed spoken lines; visible action; emotional direction; open question and eventual payoff.

Use short speakable lines, normally 8–16 words, carrying one idea each. Split dense clauses into separate beats instead of chaining qualifications. Vary rhythm naturally; preserve technical qualifiers and referents. Maintain an entity bible with stable character IDs and visual meanings. Prefer one visual mechanism over five labels. Attach actions to beat cues whenever possible. Open with a concrete tension; reward attention throughout; pay off the film’s promise before the closing invitation; a book introduction answers why to read while leaving the book’s fuller development for reading.

**Give the audience time.** Use calm narration and real silent gaps between
sentences, normally 1.0–1.5 seconds, with 1.8–2.5 seconds at scene changes or
after a demanding idea. Author pauses in the measured timeline; punctuation and
provider instructions alone are insufficient. Never speed up speech to meet a
length target: remove repetition and secondary points instead.

**Standardize delivery, not the artistic identity.** Reuse SHF, the player,
font quality, sentence timing, source checks and book-introduction structure.
Create an original visual direction for each book: its palette, cast, motifs,
composition and rhythm must arise from that source. A previous film is a quality
reference, not a scene template. For nonhuman fiction, use source-faithful forms
and relational metaphors rather than inserting human presenters by default.

**Direct the visual meaning and variety before rendering.** Record what each
major asset represents and why that metaphor fits. A virtual library is a
collection, catalogue or shelf, never one book bearing the site's name. A book
represents a particular volume. Write a composition sequence with changes of
scale and focus: interface close-up, comparison, document detail, collection,
or character-led invitation as appropriate. Do not repeatedly arrange a person
beside three labelled props. The mascot need not appear on every slide.

**Make each scene heading intentional.** A short title is a visual anchor: use
confident bold typography, adequate size, deliberate tracking and strong contrast.
Use the bundled Red Hat Display (600/700) for headings and short visual labels,
and Red Hat Text (400) for sentence captions. The installed player and standalone
export embed these fonts and load them before displaying the film. Preserve this
default across new presentations; use an alternative only as a deliberate design
choice with equivalent projection readability and a clear size/weight hierarchy. Prefer natural
sentence case; uppercase is an authored choice, not a universal effect. Reserve space for it and check
mobile wrapping; never leave it as a tiny ordinary label in the corner. Use one
heading only, with no duplicate title in the art or unrelated decorative frame.

Author `film.direction.json` using the actual grammar in `references/FORMAT.md`. `examples/minimal.direction.json` is a starting syntax example, **not** the mandatory narrative structure. Unsupported actions must be replaced with supported choreography or implemented/tested explicitly.

### 4. Cast and stage the visuals

Inspect diagrams, photographs and illustrations in the source, together with
their captions and surrounding argument. Reuse only images that explain a
selected point. Adapt their palette, typography, framing and level of detail to
the film; preserve evidence, labels, scale and relationships. Redraw a relevant
diagram as simple animated vectors when that improves clarity. Do not force an
image into the film if it is irrelevant, visually incompatible or unsupported
by the player. See the source-image guidance in [ART_DIRECTION.md](references/ART_DIRECTION.md).

Search `assets/library/catalog.json` or `SHF_Asset_Catalog.html`. There are **502 catalogue entries**, not 502 unrelated silhouettes: 16 core entries + 198 further object recipes + 24 fictional human identities × 12 expressions. Use stable IDs across scenes. Use named anchors for connections; a line must stand for a relationship, route, boundary or transfer.

Compose assets rather than asking an image model to invent the same character repeatedly. Use custom safe node trees or library overrides for truly specific objects. Keep the same scale, lighting, line weight, palette roles and rig conventions. Generated SVGs in `assets/library/svg/` are previews; the editable source is the node recipe or `assets/library/overrides.json`.

Treat the presentation as **illustrated theatre with an emotional arc**, not a
flat sequence of explanations. During scriptwriting, author an `emotionalPlan`
for every scene and spoken beat: intended audience feeling, source-grounded
trigger, intensity, character expression, posture/gesture, focal object and
resolution. Shape rises and falls across the film: curiosity, discovery, tension,
doubt, intervention, relief and earned confidence where the source supports them.
Let wording and sentence rhythm carry those changes without melodrama, invented
stakes or technical distortion. A calm passage should be a deliberate contrast,
not the unexamined default for the entire film.

Human characters must act expressively: change face and gaze, use articulated
hands/arms, shift posture and occasionally step toward an important object.
Use anticipation → gesture → settlement, tied to the sentence's meaning; increase
expressiveness when a reveal, obstacle or resolution warrants it. Keep identity
and costume stable, avoid competing joint tracks, and leave stillness around
complex definitions. Use `options.dynamicExpressions:true` with
`character.express` for facial transitions and `character.gesture` for invite,
explain, question, recoil, reflect, resolve and release gestures. Body movement
must communicate the planned emotional change, not loop decoratively. Reduced
motion should preserve meaningful facial states while suppressing gesture motion.
Record voice-provider limitations honestly; Piper's pace control is not proof
of acted emotional delivery, even when the authored direction is theatrical.

Render early at phone size in all three themes. Refine light/dark silhouettes and material accents, not merely background colors. Remove decorative movement that competes with meaning.

### 5. Produce narration by default

```sh
node "$SKILL_ROOT/scripts/shf.mjs" voice-tasks film.direction.json work/voice-tasks.json
```

Use the generated `work/voice-tasks.direction.json`, which has stable beat IDs. Follow the selected voice tool's own interface and the user's provider choice. Check language compatibility and configured access. Audition representative lines within the authorized usage budget and record the provider, voice and limitations. No project provider-selection script is required.

Send each task's spoken `text` and separate `performance` directions through that skill's real interface. Preserve speaker identity. Give pronunciation, emphasis, preceding/following context, emotional intensity and pauses. Never read stage directions aloud. Do not regenerate accepted lines unnecessarily.

Write receipts beside the generated audio, with relative in-directory paths, file hashes, provider/voice identity, rights, alignment quality and listening-review status. Then measure and retime:

```sh
node "$SKILL_ROOT/scripts/shf.mjs" attach-voice work/voice-tasks.direction.json work/voice-receipts.json work/voiced.direction.json
```

This command reads every actual file. PCM WAV needs only Node; MP3/OGG measurement needs `ffprobe`. It adjusts beat windows, scene lengths and numeric action timing. Cue-anchored actions resolve against the new beats. Review the visual pacing again after retiming. Do not use an estimated word count as the final audio clock.

If no voice service is configured, report that fact and create project-local configuration templates. Prefer a small local neural English voice such as Piper en_US-ljspeech-medium through theatrical-audio. When the task or workspace authorizes local setup, download the model into an ignored private runtime and continue without asking again. Existing explicit provider choices remain authoritative; a failed configured service is not permission to switch. If setup is unavailable or unauthorized, retain pending voice tasks and label the output as a silent draft. Compilation supports silence, but a silent draft does not complete an audio presentation request. Do not pass eSpeak or browser speech as production-quality narration. Bundled demonstration voice is explicitly labelled.

### 6. Add restrained optional music

Prefer silence for dense argument, code, equations or important qualifications. Choose a bundled original cue by purpose or author a bounded `SHF-Score`. Classical works are a **selection guide**, not a license to copy any recording. Verify composition/arrangement and recording rights independently before packaging external audio.

Use one optional background channel, modest gain (default 0.12, hard manifest cap 0.3), automatic 0.25× ducking under speech, and smooth entrances. Music must never be evidence for a factual claim or emotionally exaggerate it. See `VOICE_AND_MUSIC.md` for limits, sample score and the curated classical shortlist.

### 7. Compile, inspect and repair

```sh
node "$SKILL_ROOT/scripts/shf.mjs" compile work/voiced.direction.json output
node "$SKILL_ROOT/scripts/shf.mjs" validate output/my-film.shf
node --test "$SKILL_ROOT/tests/core.test.mjs"
```

The compile command produces a real `.shf`, standalone `.html`, `.vtt` and structural validation report. Watch the film, not only the JSON. Inspect the first/middle/last frame of each scene, all anchor-based connections, subtitle occupancy, phone layout, one slow and one fast playback rate, and mute/resume/seek. Test full voice playback once before claiming publication readiness.

If changing runtime or assets, run the bundled `scripts/build.mjs` and `scripts/build-catalog.mjs` using their absolute paths. The browser checks in `tests/browser.py` are optional developer checks with separate dependencies. Ordinary film authoring does not require rebuilding the skill or running its development suite. Distinguish passed automation from human quality approval.

### 8. Install or integrate the HTML player

```sh
node "$SKILL_ROOT/scripts/shf.mjs" install-player /target/project/public/shf
```

The command copies the **complete self-contained player**, license and minimal embed page. It refuses to overwrite different existing files. The same distribution is already at `assets/player/shf-player.js`. Copying that file plus its license is sufficient for playback; no skill folder or asset catalogue is required at runtime because each film embeds its own compiled visuals and media.

```html
<script src="/shf/shf-player.js"></script>
<shf-player id="film"></shf-player>
<script>
  document.getElementById('film').load('/films/my-film.shf');
</script>
```

For local-phone review use the generated standalone HTML. File opening depends on the phone's HTML handler; the file needs JavaScript execution, not a document-only previewer.

## Required handoff

For a completed presentation, deliver `.shf`, standalone HTML, editable direction and a truthful QA report. Keep source, analysis, editorial plan and rights evidence in the project working files. Include line tasks, receipts and measured timing reports when producing narration; identify pending narration for a silent draft. For player-only integration, deliver the player and integration changes. Supply the player when needed. Exclude provider secrets and private unpublished source material from public exports.

The completed package must answer: **What did we preserve? Why is it interesting? Which claims are supported? Which elements are metaphor? What was actually tested? What still needs editorial, vocal or rights review?**

## Simple visual composition and reusable integration

Default to a flat, quiet color field in **all three themes**, including Light and
Dark. Do not add background outlines, frames, stacked panels, ornamental lines,
recesses, glowing borders, blobs or busy scenery. `minimal` (and the legacy
`studio` alias) has no decorative backdrop nodes. Color comes from meaningful
foreground objects; retain lines only when they explain an actual relationship
or define an object. Explicit scenery must be justified by the source and request.

Use exactly **one short visible scene title**, normally two to five words, in the
player's heading. Do not duplicate it inside the SVG, add a large subtitle,
chapter banner, folio or presentation-title block above the same film. Keep the
title, actor/prop silhouettes, labels, captions and transport in separate areas.
Check moving extents as well as static positions: faces, hands, objects and text
must not collide or cover one another. Verify Color, Light and Dark separately;
passing the colorful theme cannot establish that Light or Dark is clean.

In a book website, store each film beside that book's language folders in
`Animation/`. Keep only essential book-specific content there: its SHF and a
minimal generated entry referencing shared site assets. The page shell, labels,
styles, player, interaction code and reusable authoring components belong at site
level. Use one generator/template and manifest data for every book, with no
book-specific names or IDs hardcoded in shared components. Self-contained export
HTML may be produced outside the published book folder as a requested portable
artifact; do not duplicate the player bundle into each book's delivery folder.

## Film-focused delivery

Single-film standalone exports show only the player. Integration pages may keep
site navigation, without duplicate headings or automatic production notes; do not append chapter
lists, transcript sections, download panels or unrelated content. The player
already provides scene navigation and the transcript. Keep Color, Light and
Dark theme choices directly in its bottom transport bar, keyboard accessible
and with a visible selected state. Apply runtime improvements to both the skill
distribution and any project copy, then regenerate standalone exports.

## Quiet verification

Do not start audible playback in an automation/background browser. Set mute
before creating or scheduling audio, keep automated tests muted, and pause and
close owned test players in a finally block, including after interruption.
File generation is not playback. Let the user start audible review themselves;
record listening review as pending when no listening review was performed.

## Learn from presentation revisions

When authorized to maintain this skill, incorporate reusable lessons from user
feedback and observed production failures during the same task, without waiting
for a separate reminder. Update the relevant instruction, template or implementation,
reconcile conflicting older guidance, and verify the affected behavior. Keep
book-specific content and one-off exceptions in the project; avoid accumulating
duplicate rules or expanding the task into unrelated work. Report the skill changes.

Keep single-film pages focused on the player. Do not automatically show production
notes, source-edition boilerplate, synthetic-voice disclosures or duplicate
duration/language badges above or below it. Keep provenance and production
evidence in film metadata and working QA files; retain any attribution actually
required by the source license in an appropriate accessible location.

For a site-orientation film, explain the site's reason to exist, what visitors
can find and how its actual contribution flows work. Use a recurring site mascot
when established, sharing its editable asset with the surrounding interface.
Keep claims about future features and research distinct from current actions.
When launched in a dialog, start only from a visitor action, provide an always
reachable close control and Escape handling, stop playback on close, and prevent
a delayed load from restarting a closed film. Test this lifecycle silently.

### Preserve the source's reason to exist

When revising a site or institution introduction, preserve the owner's concrete
reason for creating it before shortening the script into a tour of controls.
Explain the distinctive mechanism and reader value, then show the preferred
entry action. Do not replace an explicit discovery route with another available
widget merely because it is easy to illustrate. A concise film may still need
more time to preserve its essential argument.

Keep evergreen presentation copy focused on contribution intent and available
user actions. Omit temporary delivery plumbing when requested; do not replace it
with a claim that a planned account or automation already exists. Comparative
benefits (depth, cost, energy) must retain their actual conditions and uncertainty;
never turn a rationale into a measured universal performance claim.
