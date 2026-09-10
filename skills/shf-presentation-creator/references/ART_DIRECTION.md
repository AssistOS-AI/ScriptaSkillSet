# A recognizable visual language

## Visual contract

SHF is illustrated theatre, not a generic icon slideshow and not simulated cinematic realism. Use readable silhouettes, deliberate composition, named object actions and changes that carry meaning. A viewer should identify the important object before it starts moving. An elegant still frame must work before animation is added.

The default stage is 1200 × 760. Keep important content away from the top heading and the bottom transport/subtitle region. As a starting rule, put important faces and mechanism labels within x=80…1120 and y=120…540; floor-contact objects may extend lower. Test at 320–393 CSS-pixel width, not only at 1200 pixels. Captions can cover hands or bases: move the critical interaction upward rather than shrinking the subtitle font until it becomes unreadable.

One scene should normally have 2–6 salient objects and one focal action. Keep the default background flat; add source-justified scenery only when it helps the explanation. Use short labels only where needed. A scene is not a slide containing the full spoken paragraph.

## Three art directions

**Color.** A flat warm background and simple, distinct foreground colors.
**Light / Paper.** A plain light background; readable object edges without stage
frames, inset panels, border lines or ornamental geometry.
**Dark / Night.** A plain dark background and contrasting foreground colors;
no layered boxes, glowing frames, reflected lines or automatic theatre scenery.

Use one short scene title in the player header, with no duplicate SVG title,
chapter banner or folio. Keep silhouettes and labels separated throughout every
movement, including extended hands. Meaningful relationship lines must terminate
on their objects and avoid unrelated labels or people.

The runtime uses the same narrative identity and geometry across themes, plus theme-dependent material/structural variants. They are not three independently drawn art collections. For a custom prop, specify its actual material roles rather than hardcoding pale fills that disappear in Light or dark fills that disappear in Night.

## Library accounting

The catalogue contains 502 stable IDs:

- 16 core entries, including the original generic character and rigged book/city/door/machine/tableau objects.
- 198 additional object recipes across science, technology, learning, places, nature, space, transport, home, tools, economy and story symbols.
- 288 character-expression entries: 24 fictional identities × 12 expressions.

The 12 expressions are neutral, happy, curious, worried, sad, angry, surprised, determined, tired, skeptical, relieved and inspired. Identity variations include hair shape/color, skin tone, age details, glasses/beards, body width and clothing detail. They are stylized, not portraits, and share a coherent base rig. They are **not** 288 entirely new body designs. All asset families have not received independent audience or professional art review.

Search `assets/library/catalog.json` or the offline catalogue. Each catalogue card can export an SVG in the selected theme. The SVG files are generated views. Edit `scripts/lib/repertory.mjs`, the core library, or `assets/library/overrides.json` and rebuild; do not expect edits to a generated preview SVG to modify playback.

## Cast continuity

Create a visual bible before scenes. Record stable actor ID, catalogue identity, typical clothing, scale, recurring props, range of emotional states and visual meaning. “Mira” may switch from `person-02-curious` to `person-02-worried`; switching to person-19 halfway through a scene is an identity error unless the story explains it.

Do not encode stereotypes: skin tone, gender presentation, age, glasses or body shape must not stand for honesty, intelligence, villainy or disability. The library is a starting repertoire, not a complete representation of humanity. Use custom rigged variants when the story requires a capability or identity not actually represented.

## Meaningful motion

Use anticipation → action → settlement. A book opens at the spine, a building grows from its base, papers land one by one, the character looks toward the actual target, and a verification mark appears only after the relevant check. When a reaction is humorous, it should follow the situation, not fire repeatedly like a notification.

All semantic actions compile to deterministic tracks. A unique asset has no automatic bespoke action merely because its name exists. Generic `appear`, `moveTo` and `disappear` are supported; add specialized behavior only by extending the compiler and tests.

Keep repeated movement sequential and inspect joins. Do not command competing rotations on the same arm or position tracks on the same actor simultaneously. Use longer action windows for `stack.grow` so individual landings remain legible. Stop decorative motion during difficult narration or reflection.

## Connections and technical diagrams

Every animated connection has named endpoints and a `meaning`. Distinguish evidence support, causal influence, temporal succession, communication and physical transport. An arrow direction must match the narrated claim. The player keeps anchors attached while objects move; it cannot decide whether the relationship itself is true.

Catalogue boundary anchors are schematic. For a real device port, add a custom named anchor at the exact visible port. When endpoints are hidden, connections should also be hidden. Avoid drawing a line through a face or using arbitrary sweeping paths where a short connection is clearer.

## Improve one asset without breaking every film

1. Inspect the existing node tree and named rig parts.
2. Define a replacement rooted at `$asset`, with `$asset.part` child IDs.
3. Preserve the anchors and parts used by existing animations, or use generic actions only.
4. Store under its stable asset ID in `assets/library/overrides.json`.
5. Rebuild catalogue and films; inspect Color/Light/Dark at small and large size.
6. Test named actions and connections at initial/mid/final time.
7. Record the changed library version in production metadata.

A special object may instead be `asset:"custom"` with an embedded `visual` node tree. See the working custom example. No external image-generation service is required for safe vector node authoring, but one may be used for design exploration where actually available. A raster image cannot be silently substituted into this SVG-only playback profile.

## Review checklist

Can the object be named without a label? Is its action visually causal? Does the still frame have a clear hierarchy? Are faces/critical ports unobscured by captions? Is the emotion appropriate, not excessive? Are repeated identities stable? Does the scene still make sense without audio? Does the narration add meaning rather than repeat labels? Do all three themes preserve legibility? A structural validator cannot answer these questions.

## Emotional score and performance

Before animating, map every scene's emotional entry, turning point, peak and exit,
then assign expression and gesture to each sentence. Use the document's actual
stakes: uncertainty can produce concern, a resolved obstacle can release tension,
and an unexpected mechanism can produce surprise. Do not invent peril or hype.
Alternate intensity and rest; the final confidence must be earned by what the
viewer has seen. Review the text and human performance together for a flat arc.

For a stable person identity, enable `options.dynamicExpressions:true` and use
`character.express` with a supported expression. `character.gesture` accepts
invite, explain, question, recoil, reflect, resolve and release. It animates arms
at shoulder pivots, head and a small whole-body lean with anticipation, a held
accent, and settlement. Expression transitions and gesture tracks are separate.
Do not overlap gestures on the same joint; schedule gazes after a gesture settles.

## Select and adapt source images

Inspect the source's actual diagrams and photographs before inventing substitutes.
Choose each image for a specific explanatory beat, not to decorate or fill space.
Record its source location, caption, meaning, rights and reuse/redraw/omit decision
in the working visual plan. Omission is valid when no image adds useful meaning.

For diagrams, preserve node identities, arrow directions, grouping, data, units
and qualifications. Simplify styling and reveal relevant relationships gradually;
never turn association into causation or silently erase a material condition.
If only part is shown, record the selection and explain any essential omitted
relationship in the narration. Recreate it with safe native vector nodes when
appropriate, using the film's palette and typography rather than importing a
screenshot of crowded boxes.

For photographs, preserve what the image establishes. Subtle cropping, tonal
harmonization and placement may improve coherence; do not fabricate details or
alter evidence. Use an available image-editing tool when needed. The current
svg-scene-v1 player does not accept raster image nodes: choose a faithful vector
adaptation where suitable, omit the photo, or explicitly implement and validate
secure embedded-image support before promising photographic playback.

Check any adaptation at phone size in Color, Light and Dark. Reject an image
that requires dense captions, dominates the emotional scene or creates overlaps.

After shortening narration, refit gesture durations to measured sentence windows.
A gesture must settle before the next sentence takes over the same joints;
recheck cue offsets as well as the total scene duration.

## Recurring site mascots

For a site introduction, use the established mascot as the guide and retain the
same editable vector identity in the homepage and film. Define its geometry once
in a shared asset module; embed compiled visuals in SHF rather than copying
separate hand-maintained drawings. Preserve recognizable materials, proportions
and expressions across themes. A mascot can guide source-grounded explanations
of purpose, discovery, reading and contribution without inventing live features.

Custom assets can opt into `options.rig: "character"` for character actions. They
need named `head`, `armL`, `armR`, `legL`, and `legR` groups in the standard rig
coordinate system; expression changes additionally require all 12
`expression.<emotion>` groups. Author and check pivots against the intended
gestures. An unmarked or incomplete custom rig cannot use character actions.

A librarian mascot should communicate its role through restrained, recognizable
cues such as spectacles, a carried book and an academic jacket. Refine silhouette,
materials and posture before adding ornaments. Avoid ground ellipses or soft cast
shadows when the host design calls for a flat, clean composition. In a compact
entrance, size the mascot in relation to its actions rather than filling a tall
hero area; preserve breathing room without pushing useful content off screen.

## Semantic metaphors and composition variety

List the literal referent of every major asset in the scene specification.
Collections use multiple distinct books, shelves, catalogues or actual discovery
interfaces; a single labelled book means a volume, not a website or institution.
Choose visuals by meaning before stylistic consistency. Reject a pleasing but
incorrect metaphor. A site tour should show useful visitor actions, not repeat
an abstract mission through interchangeable icons.

Storyboard a varied sequence. Alternate character-led scenes with interface
close-ups, side-by-side reading choices, annotated document details and focused
collections when the message requires them. Vary spatial structure, scale and
reveal order; changing three prop labels is not a new composition. Remove the
mascot when it takes space away from a useful explanation. Keep one clear focal
point, coherent colours and no decorative background clutter.

Use the reusable `scripts/lib/book-art.mjs` book shapes (also exposed as `book`
and `closed-book`) for volumes. Show a coherent binding, restrained spine,
proportional cover, a thin page block and optional bookmark. Avoid thick outlines,
warped pages, random stacked rectangles, giant cover labels and ground shadows.
Inspect the silhouette and typography at the displayed size in all themes.

## Confident scene headings

Specify the heading's visual treatment when drafting each slide. Use a brief
phrase, generous readable size, bold weight (around 700), controlled letter
spacing and high contrast. Prefer natural sentence case for a confident display
face; avoid imposing widely tracked uppercase on every heading. Use uppercase
only where the authored visual hierarchy benefits from it;
preserve semantic casing in the data. Give the heading dedicated space above
artwork, with no overlap or duplicated title. It must feel designed, not like
small utility metadata. Check long headings at mobile widths and keep the title
visible while the controls fade. The player provides the shared styling.

When a material stays light in Dark theme (paper, a page block or a document),
use ink appropriate to that material, not the global light foreground. Check
text on every filled object in every theme; a correct page colour alone does
not establish contrast for its labels. Structural boundaries should describe
the object and must not become decorative background linework.

## Presentation typography

Use a deliberate display family for short scene headings, labels and key ideas,
not an incidental operating-system UI font. The portable player bundles original
Red Hat Display SemiBold/Bold and Red Hat Text Regular under the SIL OFL.
Headings use Display Bold with generous scale and slightly tight tracking;
short labels use SemiBold, with a consistent weight/size hierarchy. Narration
captions use Text Regular for comfortable sentence reading. Avoid thin utility
labels, excessive letter spacing, arbitrary mixtures of font sizes and universal
all-caps formatting. Fit a label to its actual role and available width.

Preserve the approved wording during a typography-only revision. Keep fonts
self-contained, retain the font license and rebuild the player plus standalone
exports. `scripts/build-fonts.mjs` packages the vendored original font files.
Check actual loaded fonts, long headings, short labels and captions in all themes
at desktop and phone sizes; font presence alone does not prove good composition.

## Visual meaning before asset reuse

For each scene, explain why its image makes this particular message intuitive.
An asset related to a keyword is insufficient. Show a cause, choice, consequence,
comparison or transformation that a viewer can understand while listening.
Reject interchangeable cards, nodes, gates, lenses or a presenter with three
props when they merely repeat an established pattern. A continuous motif may
support the story, but cannot replace new scene-specific visual thinking.

Vary scale, staging and visual verbs within each film and across a batch: a
material close-up, a changing environment, a consequential encounter, an exposed
mechanism, a before/after with an actual difference, or a source diagram adapted
faithfully. Choose only those warranted by the source. Emotional motion should
carry meaning rather than make generic assets busier. Review representative early
and middle frames before mass rendering; require a rewrite of the composition
when its relationship to the narration needs an additional verbal explanation.

A quiet background must not reduce a substantive scene to floating clipart.
A decision, institution or relationship needs a visible situation: who acts,
what changes, and who experiences the consequence. A collection of chairs,
a bell and labelled rectangles does not by itself explain political correction.
Review a complete early scene in actual rendered form before expanding a batch.
For silent art inspection, temporarily hide the paused central Play overlay
in the test capture, then restore it for normal interaction checks. Record
this capture adjustment; never start audible playback to remove the overlay.
