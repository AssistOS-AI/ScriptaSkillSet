# SHF Presentation Creator

Create and edit presentations in SHF format in any project or workspace, and integrate the complete HTML player into other projects. This folder contains the compiler, browser runtime, visual library, music tools, schemas, editable examples and authoring instructions.

Copy the whole `shf-presentation-creator` directory to a skill location supported by your agent, or ask the agent to read its `SKILL.md` directly. No Scripta application, sibling skill, project configuration, npm install or online service is required. Authoring tools require Node.js 22+. Narration is optional and can use an available tool or existing audio files.

## Create a presentation

Run from the receiving project. In these shell examples, set `SKILL_ROOT` to the absolute directory containing this skill's `SKILL.md`, or replace it with that path directly.

```sh
node "$SKILL_ROOT/scripts/shf.mjs" compile "$SKILL_ROOT/examples/minimal.direction.json" output
node "$SKILL_ROOT/scripts/shf.mjs" validate output/first-scene.shf
```

The result includes `.shf`, standalone `.html`, `.vtt` captions and a validation report. Start a custom presentation from the editable direction example and use [the format reference](references/FORMAT.md). Choose scenes and length to suit the requested material. The agent handles semantic composition and source fidelity; the CLI does not call an LLM.

Example request:

> Use shf-presentation-creator to create a short SHF presentation about this project. Explain its main behavior with illustrated scenes. Export SHF and standalone HTML. Add narration only if a suitable authorized voice tool is available.

## Put the player in another project

```sh
node "$SKILL_ROOT/scripts/shf.mjs" install-player public/shf
```

This copies the complete `shf-player.js`, its license and a minimal `embed.html`. It refuses to replace different existing files. The receiving application needs only those player files and the compiled presentations; it does not need this skill, Node.js, the authoring library or an audio provider at runtime.

For a page beside the `shf/` and `presentations/` directories:

```html
<script src="./shf/shf-player.js"></script>
<shf-player id="presentation"></shf-player>
<script>
  document.getElementById('presentation').load('./presentations/first-scene.shf');
</script>
```

Adapt the paths to the application's public asset routing. In a framework with server rendering, load and access the custom element on the browser side. The component uses Shadow DOM and requires no framework adapter. See [PLAYER_API.md](references/PLAYER_API.md) for methods, events, styling and local file loading. Standalone exported HTML embeds the player and presentation for local viewing in a browser that executes JavaScript.

Player integration alone does not require an editorial plan, source adaptation or audio generation.

## Included resources

- `SKILL.md` routes presentation creation and player integration.
- `assets/player/shf-player.js` is the bundled player distribution; `runtime/` contains its source.
- `SHF_Asset_Catalog.html` and `assets/library/` provide reusable objects and character expressions, with 502 catalog entries.
- `SHF_Preview_Silent.html`, `SHF_Preview.html` and `SHF_Cinema_Demo.html` show bundled examples. Included voices are demonstrations, not evidence of newly generated production narration.
- [dependencies.md](dependencies.md) distinguishes the required runtime from optional narration, compressed-audio measurement and developer tools.

## Development checks

From the skill folder:

```sh
npm test
npm run build
npm run catalog
npm run test:portability
```

Build and catalog generation update the skill's distributions and examples. They are development operations, not prerequisites for creating a presentation. The portability check copies the skill, rebuilds it and uses the player in a temporary unrelated project. Optional Python browser and schema checks are described in `HOW_TO_TEST.md`.

The bundled `evaluation/` reports describe earlier validation runs. They are historical evidence, not proof that a new presentation has passed visual, editorial or listening review. Check the actual presentation in its receiving project before claiming it is ready.
