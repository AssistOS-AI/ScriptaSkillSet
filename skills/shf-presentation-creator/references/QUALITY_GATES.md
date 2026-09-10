# Quality gates and honest claims

## G1 — Source fidelity

Verify the canonical text/hash and selected source spans. Every central claim must be supported or explicitly marked as interpretation/metaphor. Keep essential qualifiers, counterarguments and negative results. Do not call an author's proposal a verified breakthrough. The editorial checker verifies structure and exact span matching, not entailment.

Pass evidence: claim ledger, checked text spans and a reviewer decision. Failure: unsupported or misattributed claim, unacknowledged partial source, false novelty, fake quantitative evidence.

## G2 — Narrative interest

For a book introduction, first apply the seven script-review questions in
[BOOK_INTRODUCTION.md](BOOK_INTRODUCTION.md). Verify book/content/reader lens
transitions, specific reader gains, substantive samples and a concrete reading
invitation. Fail a feature tour or technical demonstration that never establishes
why to read this particular book. Numeric word or scene counts do not prove fit.


The opening identifies a source-supported distinctive insight within one or two sentences and establishes the value of the audience’s time within 20–30 seconds. Its hook is paid off without invented novelty. The narrative develops a source-grounded why, how and what, foregrounding the document’s distinctive ideas and preserving its terminology without generic filler. The film has one central question, a concrete opening hook, intermediate answers, a genuinely informative example and a final synthesis. Every hook is resolved or explicitly open by design. The closing invitation is specific to what the source offers. Avoid summaries that are merely topical lists.

Pass evidence: a human/agent editorial review using the chosen playbook, not a numeric “engagement score” invented by a model. User retention, comprehension and long-form fatigue need audience tests; none are established by the supplied software tests.

## G3 — Visual causality and continuity

Require a clean, flat background with no decorative panels, border lines or frames in Color, Light and Dark. Verify one short title and no collisions throughout motion. Inspect every scene at first/mid/last time in each theme, and inspect one phone-sized view. Verify named connections, legible objects, stable cast identity, plausible pivots, overlapping actions and caption safe areas. When a prop follows a person and then transfers, inspect the compiled movement times as well as the endpoint images. Finish the following motion before starting the transfer; overlapping move cues can insert an unintended hold or jump. Check intermediate frames so a badge, paper or token never passes over a face or label. No synthetic data chart without explicit labels and provenance. Custom assets receive the same review as built-ins. For large custom shapes, place named connection ports at the visible boundary rather than retaining a generic small-object anchor that sends lines through the artwork. Reveal and remove a high-contrast label with the shape that supplies its background; inspect transition frames so white text never arrives alone on a light stage. Numeric chapter markers must reflect the source’s actual range; a few selected landmarks must not imply a different chapter count.

Keep already hidden objects hidden until an intentional new reveal. Do not add a
second `disappear` cue merely to clean up the scene: this action authors an
opacity-1 start key, which can make an earlier hidden object gradually reappear
between cues. Remove duplicate hides from closing action lists and inspect the
interval after the first disappearance, not only the final frame. A faint ghost
can be an authored opacity track rather than a theme or screenshot defect.

Automated support: all catalogue entries instantiate and validate; state sampling is deterministic; reference checks catch missing endpoints; browser tests check finite transforms and unresolved tokens. These checks do not certify beauty or anatomical realism.

## G4 — Voice and music

Require exactly one sentence per spoken beat, audio clip and caption card. Prefer 8–16 words and one idea per sentence; review every sentence above 20 words and split dense clauses without losing technical meaning. Verify edited text hashes against voice receipts. Read line by line; listening review is user-initiated, never unsolicited background audio. Check pronunciation, numbers, negation, omissions, joins, clipping and prosody. Record the actual voice provider, identity and rights. Measure durations from files and retime. A real provider returning a file is not proof of intelligibility or performance quality.

Music is optional, clearly below narration and ducked. Verify exact recording rights before external packaging. Check audible transitions at scene boundaries. The bundled procedural cues and eSpeak narration are demonstrations, not claims of studio-quality production.

## G5 — Temporal and player correctness

Test play/pause, seeking A→B→A, speed change, end-of-film, delayed voice decoding, voice failure, mute during playback and volume zero. A delayed or rejected required voice must not allow the film to drift onward. Mute must not reinitialize audio sources. Validate all clips fit measured scene lengths.

Also test direct `.shf` import, offline HTML, two independent player instances, transcript/chapter controls, narrow embedding and complete icon visibility. On deployment, test actual target browsers/devices; desktop emulation is not physical-phone testing.

## G6 — Portable handoff

Copy the skill to a clean directory with spaces in its path. Rebuild using Node and local files. Install the player into an unrelated empty project. Refuse overwrites of changed files. Open a film with only the copied player. No absolute build-machine path, prior archive, CDN or secret is required. Include license, source/editable direction, voice tasks, receipts, generated movie and QA report.

## Publication state

A QA report must separate:

1. Automated tests actually executed and their outputs.
2. Visual/listening inspection actually performed and its scope.
3. Manual gates still requiring review.
4. Untested devices, long-form behavior and provider integrations.

Use “draft” until the applicable gates are satisfied. Do not equate hundreds of sampled frames with hundreds of successful independent user evaluations. Do not count 24×12 character expressions as 288 distinct object concepts.

Review selected source images against their captions and argument; verify faithful relationships, appropriate restyling and readability in all themes. Check that single-film pages contain no automatic production-note blocks or duplicate duration/language badges.

Before accepting a revision, audit each major metaphor against its literal
referent, and review the storyboard as a sequence. Reject repetitive
person-plus-three-prop compositions, weak utility-style scene titles and crude
book silhouettes. Sample captions during the silent tail as well as speech;
measure actual sentence gaps. A short visitor tour must explain a few useful
choices clearly rather than pad its length with aspirations and generic claims.


### Book-introduction regression checks

Before voice, independently read the actual spoken script: the first scene must
identify the book, why it deserves the reader's time, and its essential message
and direction before detailed examples. Check the full why → how → what spine
and transitions without hidden editorial annotations. An attractive isolated
idea is not a coherent book introduction. Inspect source support and preserve
fictional endings for reading.

Verify loaded bundled fonts at runtime, not only font-family declarations.
Check all scene headings at phone and embed sizes for strong display weight,
readable size, containment and wrapping. Inspect artwork for competing secondary
slogan headings; labels must identify actual objects or relationships. Treat
screenshot review as required in addition to automated geometry checks.

In the real loaded host, measure visible artwork text against the active
caption rectangle at sampled first, middle and final frames. Transport clearance
alone does not establish subtitle clearance. Ignore fully hidden appearance
states, but reject readable labels intersecting captions; move or remove
redundant labels and recheck the exact final archive.

### Review staging without corrupting provenance

Compile revised candidates to a separate output directory while preserving the
canonical source-book route and edition in production metadata. A staging path
is an output location, never a substitute source identity. Keep the published
archive intact until candidate review passes; record which script and receipts
belong to the candidate so a temporary mismatch is not mistaken for a broken
published film. Verify the installed bytes match the reviewed candidate.

For labels, distinguish ink on a fixed pale object from ink directly on the
stage. The former can remain dark; the latter must use a theme-aware color.
Inspect both in Night, including captions that appear only early in a scene.

Select connection ports from the visible spatial relationship, not a fixed
right-to-left default. After actors move, verify that a relationship line does
not cross its own participant merely to reach an object on the opposite side.
Correct endpoint arithmetic alone does not establish a readable connection.

### Rebuild and screenshot fidelity after revisions

Run the documented canonical artwork command after a revision and confirm it
reproduces the accepted scene count and imagery. A separate review module does
not complete integration if the old entry point still regenerates obsolete
scenes. Keep one authoritative entry and archive the superseded version.

When checking several themes, use a fresh paused, muted player for each theme
and allow the compositor to settle after deterministic seeking. Inspect actual
captured pixels: valid DOM text and correct colors do not prove that a screenshot
contains the completed render. If text disappears only in captures, compare a
fresh settled capture before changing correct artwork or accepting missing text.
For intermittent missing raster glyphs, increasing a delay or disabling GPU
rendering is a diagnostic, not a guaranteed repair. Compare a fresh player per
problem frame and an unscaled full-viewport capture; inspect the resulting
pixels and retain the exact workaround and its scope in the review record.
Use unique filenames for successive review images, and compare the raw files
when a preview appears to lose content. A cached image preview, capture artifact
and player-rendering defect are different hypotheses; do not change the runtime
until evidence identifies that layer.
Check screenshot completeness before accepting a contact sheet: title, transport
controls and expected foreground artwork must all be present in the raw raster.
A blank stage can pass every DOM and geometry assertion. Retain failed captures,
then compare sequential captures from a fresh muted player; do not call missing
pixels a preview artifact until the original file itself has been inspected.
