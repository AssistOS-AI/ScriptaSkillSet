# Source → editorial argument → directed film

## 1. Deliverables and states

A production has explicit states: `source-read`, `plan-reviewed`, `visual-draft`, `voice-generated`, `audio-measured`, `compiled`, `screened`, `publishable`. A compiler success moves only to `compiled`. Listening, factual review, source permissions and a human viewing pass are not implied.

Keep this project structure outside the installed skill:

```text
source/source.txt             canonical extracted text; retain privately when necessary
source/extraction.json        title, author, edition, extraction limitations, hashes
work/analysis.json            extractive candidates, not the final editorial decision
work/editorial.json           source-grounded claim selection and hook/payoff ledger
work/visual-bible.json         recurring cast, places, motifs and meanings
work/film.direction.json       editable semantic choreography and spoken beats
work/voice-tasks.json          one task per spoken beat
work/voice-receipts.json       actual generated line files, measured later
work/audio/                   generated line recordings
work/voiced.direction.json     measured timings, media and retimed actions
output/                       .shf, autonomous HTML, VTT, validation report
qa/                           evidence, screenshots, listening notes, unresolved issues
```

Do not include full private source books in public output merely because the tool can embed `sources[].text`. Keep public source records to the information needed to attribute and verify the chosen claims; use private project references where appropriate. Do not include credentials or provider tokens in task receipts.

## 2. Read sufficiently before compressing

For short text, read all of it. For a long book, first record all chapters and their purpose, then read the central argument, turning points, conclusion, strongest counterargument and sections needed to establish selected claims. A partial extraction must be reported as partial. Do not call a chapter excerpt a summary of the whole book.

Preserve paragraphs and section IDs. The lightweight analyzer's offsets are JavaScript UTF-16 code units into the exact supplied string; they are **not PDF coordinates or UTF-8 byte offsets**. Do not normalize whitespace after generating spans. For independently extracted files store an extraction hash and human-meaningful page/chapter locator too.

A source ledger entry should identify: proposition, exact supporting span(s), speaker/author, whether the source asserts or reports it, qualifications, and editorial wording. Separate an author's view from an independently established fact.

## 3. Choose what earns screen time

Record the communication purpose first. For `book-introduction`, use the
[reader-invitation plan](BOOK_INTRODUCTION.md): book identity, reason to exist,
reader outcomes, selected content samples, reading depth and a concrete invitation.
Review the script against that purpose before generating speech. The explanatory
selection prompts below apply within content samples; they do not replace the
book introduction with a lesson about its subject.


Write one sentence completing each prompt:

- This source is fundamentally asking…
- Its most important answer is…
- The viewer probably expects…, but the source suggests…
- A concrete example that changes the viewer's understanding is…
- The strongest qualification or objection is…
- After watching, the viewer should be able to explain…

Select three to seven major insights, then score candidates on a transparent *editorial* 0–4 scale: relevance to the central question; genuine surprise relative to audience assumptions; explanatory power; consequence; visualizability. Weight fidelity as a gate, not something a high shock score can compensate for. A useful ranking is `3×relevance + 2×explanatoryPower + surprise + consequence + visualizability`, but record why a lower-scoring caveat was retained.

Novelty scope is one of `audience-surprise`, `author-claimed`, `within-source`, `externally-verified`, or `none`. A technical book mentioning a hybrid approach is not evidence that the approach is first in the field. A philosophical thought experiment can be interesting without being historically novel. Do not call an invented demonstration a finding.

## 4. Promise, progress and payoff

Each hook opens a specific question that the film later answers, reframes honestly, or explicitly leaves unresolved because the source does. The first 15–25 seconds should supply both a concrete tension and a promise of what the viewer will understand. Avoid prolonged branding or “today we will discuss…”.

Example, technical: **“This answer looks correct. Why might you still refuse to use it?”** Show a plausible card with no source link. The payoff is not merely a green tick: show which evidence links were checked, what a human approved, and what remains uncertain.

Example, philosophy: **“The door is open. Is the person free?”** Show an open door, then the constraints shaping the choice. Pay off by separating absence of barriers from reflective agency, not by pretending one drawing proves a theory.

Example, SF: **“The archive was built to preserve the past. Why is it inventing futures?”** Show its institutional purpose, the anomaly and the consequences for a person. Respect the chosen spoiler budget when resolving the mystery.

Between 40 and 90 seconds, give the viewer a real intermediate answer. Every subsequent segment should change knowledge or emotional stakes. Do not keep all useful information hostage until the final second. The closing invitation follows the synthesis, not replaces it.

## 5. Explain complex material in visible steps

Use a causal ladder: situation → action/mechanism → observable effect → qualification → implication. For an argument use premise → inference → counterexample → revised conclusion. Name each relationship; avoid a graph that merely decorates narration.

At every step ask: what is newly visible, and why now? Show data items moving from a source to a claim only after the source and claim have appeared. A line must connect named anchor ports. Show failure states as well as the ideal case. Do not use colored bar heights as numerical evidence unless the numbers and axis are sourced; mark qualitative diagrams explicitly.

Distinguish a visual metaphor from a physical event. A book unfolding into a city means imagination or possible worlds; it does not imply a mechanical causal mechanism. A balance is a comparison, not proof of quantitative equivalence.

## 6. Voice-first final timing, not text-speed guessing

Draft durations may use an explicit 125–155 words/minute planning assumption for general exposition, slower for unfamiliar terminology. These are adjustable editorial defaults, not universal empirical laws. Allow reading and thinking time after dense statements. Never accelerate speech merely to fit a pre-existing scene length.

Once individual lines exist, measure actual files. `attach-voice` preserves narrative gaps, sets `spokenEndMs`, retimes numeric actions through a piecewise linear map and recomputes scene duration. Actions with `cue` reference measured beat positions. Then inspect that every reveal still precedes or accompanies the right word; proportional retiming alone cannot understand semantics.

Prefer explicit subtitle cues from a capable aligner. Without them, label alignment as line-level. The player can segment long beats approximately into short caption cards; this is not word-perfect alignment.

## 7. Long-form viewing

For 5–10 minutes, use roughly 12–24 substantive scenes, not a compulsory count. A short scene can be a visual beat; a complex mechanism may need longer. For 30–60 minutes, create 5–8-minute chapters with their own question and payoff, a recap or visual bridge, stable cast and palette, and deliberate quieter intervals. Preserve the scene list for navigation.

Keep at most one focal action at a time, with secondary ambient movement only when it has a reason. Vary composition without changing style every scene. Reuse motifs so the viewer learns a visual vocabulary. A character may react once, rather than bob throughout narration. Avoid flashes, incessant zoom, scrolling paragraphs or looping motion under a difficult argument.

A 60-minute manifest is supported within prototype limits, but no supplied test establishes an hour of aesthetic comfort or learning effectiveness. Schedule actual audience review before making that claim.

## 8. Revision cycle

First evaluate source fidelity and structure; then visual causality; then voice; then integrated timing; then polish. Re-audition only failed lines. Recompile deterministically, inspect the same timestamps, and preserve successful asset identities. Save project QA as development artifacts; the public player intentionally has no note-taking or feedback subsystem.
