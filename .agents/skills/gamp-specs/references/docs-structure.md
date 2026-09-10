# Documentation Structure Requirements

This reference defines the files and navigation required for a consistent project documentation set. `README.md` onboards a new user, `AGENTS.md` instructs coding agents, HTML pages explain the system, and design specification (DS) files record project requirements and constraints.

## Required Layout

- `README.md`
- `AGENTS.md`
- `fileSizesCheck.sh`
- `docs/index.html`
- `docs/*.html` technical pages derived from existing documentation and code, including one page per skill when the repository itself is a skill catalog
- `docs/styles.css`
- `docs/assets/` for SVG files and any other documentation assets
- `docs/partials/` with shared fragments
- `docs/partials-loader.js`
- `docs/specs/` with `DS0xx-description.md` specifications
- `docs/specs/matrix.md` generated from DS filenames and descriptions
- `docs/.nojekyll` copied from the skill asset so GitHub Pages serves specification Markdown files unchanged
- `docs/specsLoader.html` copied from the skill asset

`AGENTS.md` is the single root guidance file. Its standard section layout is: `Scope`, `Mandatory Reading Order`, `Current Skill Catalog`, `Repository Rules`, `Runtime Defaults`, and `Key Paths`.

When an available `node-coding-style` skill supplies the default, preserve explicit user or project overrides and record the effective Node.js `.mjs` and dependency rules in `DS001-coding-style.md` and `AGENTS.md`. Maintain the host's `dependencies.md` at its root; each skill owns its own dependency record and accepted source under its local `external/`. These records include acceptance rationale, alternatives, authorization, licenses, source and update URLs, startup checks, and removal opportunities. Coding-style skill availability does not require imported-skill HTML pages or DS files in the host documentation.

## README Requirements

- Write `README.md` for a reader who has not used the project before.
- Start with a short introduction that names the project, the problem it addresses, and the people or systems that use it.
- Follow the introduction with a high-level overview of the project. Explain the main parts and expected result without beginning with internal implementation details.
- Include each onboarding section supported by the project: prerequisites, installation, configuration, startup, integration, and basic usage.
- Omit sections that do not apply. A library without a standalone process needs integration instructions, not a startup section.
- Derive every command, path, environment variable, configuration key, and example from the repository. Do not infer a setting's purpose, accepted format, or runtime effect from its name.
- When the repository proves that a value is required but does not explain how to obtain or format it, state only the confirmed requirement. Record the missing acquisition or format detail as a declarative limitation in the affected DS file. Do not turn missing documentation into speculative implementation options.
- Keep advanced architecture and detailed behavior in the HTML documentation or DS files, and link to those documents when the reader needs more detail.
- Recheck README instructions after changes to dependencies, manifests, configuration, executable entry points, public interfaces, or user workflows.

## HTML Pages

- Page names must follow the actual content of the codebase and the current skill set.
- `docs/index.html` must explain repository structure, runtime defaults, the canonical source for coding-style rules, test organization, the active skill catalog, and the portability model that keeps example code inside skill folders.
- In a skill-catalog repository, each skill implemented or distributed by the repository as a product artifact must have a corresponding HTML page under `docs/`. A documentation skill used only as an internal authoring tool must not receive a page.
- In a downstream project that only consumes imported skills, `docs/` must describe the host project rather than the imported skill catalog. Do not add `/docs` pages whose subject is the copied skills themselves.
- Each skill page must review the actual contents of that skill folder, including local artifacts, dependencies, outputs, and conventions.
- Each page must be written in English, use a technical writing style, and keep code samples minimal.
- Always create `docs/wiki.html` as the single canonical terminology page. Ordinary HTML pages must not contain local `Definitions` sections. Give every project-specific term one detailed wiki entry with a stable anchor, and link eligible term occurrences from HTML documentation and DS content to that anchor. Follow `documentation-writing-guidelines.md` and `technical-docs-guidelines.md`.
- The shared stylesheet must let the main page and text panel span the available width without a fixed `max-width`, using compact responsive padding as defined in `technical-docs-guidelines.md`.
- The shared navigation partial and script must make every top-level header control a submenu button and place every destination inside a subject-based submenu, as defined in `technical-docs-guidelines.md`. Direct top-level header links are prohibited.
- Expose `Specifications` as an entry inside a required header submenu and link it to `specsLoader.html?spec=matrix.md`.
- Expose `Wiki` as an entry inside a required header submenu and link it to `wiki.html`.
- Follow `technical-docs-guidelines.md` for HTML writing, editorial, and presentation rules.

## Documentation Map

- `docs/index.html` must contain a visible `Documentation Map` section after the project overview and before detailed technical chapters.
- The map must be one responsive, column-oriented semantic HTML table that mirrors the primary header. Create one `<th scope="col">` for each top-level submenu button, using the exact text and left-to-right order from the header. The headings are navigation-group labels, not links.
- Beneath each heading, reproduce every link from that header submenu in the same order. Every non-empty body cell contains exactly one real `<a>` with the same label and target, followed immediately by a concise description of the linked page's role. Descriptions must add useful meaning rather than restating the title.
- Align submenu positions across rows. When menus contain different numbers of links, leave surplus cells empty and non-interactive without placeholder text or visible boxes.
- Include every header submenu destination exactly once and no destination that is absent from the header. Keep individual DS and specification files behind the single specification entry unless the header explicitly links them.
- Preserve meaningful link text, keyboard focus visibility, and normal link behavior without requiring JavaScript. Keep the semantic table visually open through spacing and restrained entry surfaces instead of rigid borders around every cell.
- Follow the table with short reading-flow prose that uses actual header-group and page names. Do not add generic metadata columns such as `Order`, `Page`, `Purpose`, or `Subpages`.
- The map supplements the header navigation and parent-child page links. It must not become a second primary navigation system or contradict header submenu grouping, breadcrumbs, the specification matrix, or page hierarchy.

## Diagram Requirements

Follow `diagrams-guidelines.md` for diagram selection, centered italic captions below unframed diagrams, actor hierarchy, density, visual differentiation, Mermaid setup and markup, and static asset placement.

## Specs Folder Rules

- Files must follow `DS0xx-description.md`, for example `DS000-vision.md`.
- The DS sequence must remain contiguous with no missing intermediate numbers.
- `DS000-vision.md` and `DS001-coding-style.md` are mandatory.
- `DS002` must contain the next substantive foundational contract required by the project.
- Exactly one `DS003-main-behavior.md` with `title: DS003-main-behavior` is mandatory. Reserve `DS003` for this specification.
- A model-strategy DS is mandatory when the repository defines LLM routing or model tiers. It may use `DS002` when that is the project's next foundational contract; otherwise assign it an available identifier other than `DS003`.
- In a skill-catalog repository, add one DS file for each skill implemented or distributed by the repository as a product artifact. Exclude documentation skills used only as internal authoring tools.
- In a downstream project that only consumes imported skills, keep `docs/specs/` focused on the host project. Do not add DS files whose subject is the imported skills themselves.
- DS files must carry exactly the `title` and `summary` frontmatter fields. `title` must equal the exact filename stem, such as `DS003-main-behavior` for `DS003-main-behavior.md`.
- Derive the DS identifier from the filename. Remove separate `id`, `status`, `owner`, and all other unsupported frontmatter fields, plus all `Status` or `Owner` sections, labels, badges, metadata blocks, and standalone values from every existing `DSxxx-*.md` file. Do not add replacements elsewhere in the specification set.
- Each DS file must include `Introduction` and `Core Content` and must not include a `Conclusion` section. When normalizing an existing DS, preserve substantive conclusion material as declarative content in `Core Content` and remove the redundant heading.
- DS files must express requirements, rationale, limitations, alternatives, and contract boundaries as declarative statements in `Core Content`.
- When normalizing an existing DS, move all substantive material into declarative statements under `Core Content`. Keep behavior that depends on an unspecified contract unimplemented until the specification states one supported path.
- `DS001-coding-style.md` must describe coding style, source layout, and modular test organization.
- `matrix.md` is generated by `scripts/generate_specs_matrix.mjs` and must contain exactly the `Name` and `Description` columns. `Name` is the linked `DS0xx-description` filename stem; `Description` is a short explanation of that specification. Do not add status, owner, title, or other columns.
- Keep specs focused on rules, constraints, and invariants. Prefer narrative requirement-style sections over long bullet lists.
- Generate the Main Behavior DS from the accepted output of `detect-main-behaviors`. Keep it restricted to supported user-impacting business behaviors, major hidden functional behaviors, project-special behaviors, primary paths, project-spanning behaviors, essential interfaces, active direction-changing consequences, and architectural skeleton; move secondary detail to specialized DS files.
- Give every accepted Main Behavior component its own `###` chapter inside the `Core Content` section of `DS003-main-behavior.md`. When two or more components exist, begin `Core Content` with a `### Main Behavior Components` table containing exactly `Name` and `Explanation`, with one row per component. Omit the table for a single component, and never use more than two columns in any DS003 table.
- Follow `specs-guidelines.md` for DS writing and contract rules.

## Specs Loader

- Always copy the skill asset `assets/specsLoader.html` to `docs/specsLoader.html`.
- Always copy the skill asset `assets/.nojekyll` to `docs/.nojekyll`. The marker must remain at the published documentation root so GitHub Pages does not convert the Markdown specifications to `.html`.
- The specs loader must be able to open `specs/matrix.md` via `specsLoader.html?spec=matrix.md`.

## Content Expectations

- Keep documentation-generation and documentation-review skills out of the project documentation when they serve only as internal authoring tools. Do not list them in `AGENTS.md`, the HTML skill catalog, DS files, the matrix, dependency sections, navigation, or any other persistent project content.
- The skill-catalog rules apply only to skills implemented or distributed by the target repository as product artifacts. Availability or use during documentation work does not make an internal documentation skill part of that catalog.
- The HTML docs must describe the system in operational terms: components, responsibilities, interfaces, runtime behaviors, current skills, and current conventions.
- The HTML docs must make clear when repository code is example code carried by a skill folder rather than a shared production runtime.
- When the repository is a downstream consumer rather than a skill catalog, the HTML docs must make clear that imported skills are agent tooling and are not part of the host project's direct documentation surface.
- Preserve any system narrative or agent-role requirements found in `AGENTS.md` or existing docs.
- Whenever the repository's implemented or distributed product skill catalog changes, update the agent guidance, HTML documentation, and DS matrix in the same change set. Do not expand the catalog for internal documentation skills used only during authoring.
