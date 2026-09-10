# Syntax and Flow Check

This reference defines the read-only checks for file validity, cross-file references, documentation structure, and navigation. Complete these checks before semantic review.

## 1. Inventory and review graph

Locate `README.md`, `AGENTS.md`, `docs/`, all files under `docs/`, and every target reached through documentation links. Classify each file as a home page, primary page, secondary page, specification, matrix, loader, partial, diagram, stylesheet, script, or asset.

Build a simple reachability map from the home page and primary navigation. Record links that are valid, broken, external, conditional, or unreachable. A page can be secondary and intentionally absent from the home menu, but it must be reachable from the primary page that introduces its subject.

Inventory mentions of documentation-generation and documentation-review skills across all reviewed files, including metadata, comments, captions, footers, credits, badges, navigation, matrices, and dependency lists. Treat those skills as internal authoring tools unless the repository itself implements, distributes, or exposes them as product functionality. A statement that documentation was generated, reviewed, validated, or repaired by such a skill is always prohibited authoring provenance, including when the skill is also a product subject.

Example of a coherent flow:

```text
Home → Architecture → Components → Component details
Home → Usage → Configuration
Home → Specifications → Matrix → DS files
```

Example of a confusing flow to report:

```text
Home links directly to 18 detail pages, but no page explains the reading order.
The “Architecture” page links to “Configuration”, while “Configuration” links back
to Architecture without explaining the dependency.
```

Do not require every site to use exactly this shape. Report a problem when a new user cannot tell which page is the starting point, which pages are foundational, or where a secondary topic belongs.

## 2. HTML syntax and assets

Inspect each HTML document for a valid document skeleton, balanced tags, valid nesting, meaningful `lang`, charset and viewport metadata, and consistent title/navigation structure. Check local `href`, `src`, stylesheet, script, image, partial, and loader targets. Confirm that shared fragments are loaded using the mechanism the page actually includes.

Inspect the header navigation as a mandatory submenu system. Every top-level control must be a button that owns a non-empty submenu, and every documentation destination must appear inside exactly one subject-based submenu. Report direct top-level header links, buttons without child panels, links outside submenus, empty submenus, duplicate destinations, and submenu labels that do not describe their contents as errors. Permit a one-item submenu only when that subject has one valid destination. Verify the same menu order, groups, controls, and destinations on every HTML page.

Inspect source and rendered text flow for both HTML documentation and specifications. Prose blocks must not be hard-wrapped at an arbitrary source column or split with manual `<br>` elements. Text must use the full available width of its own containing box and wrap naturally only at that boundary. Report newline-preserving styles, narrow fixed widths, centered `max-width` constraints, oversized padding, fixed label widths, or equivalent rules that force documentation or rendered DS text to wrap early. Inspect the specs loader and shared stylesheet as part of the DS check because they determine the rendered width of `docs/specs/*.md`.

Confirm that `docs/wiki.html` exists as the single canonical terminology page and that ordinary documentation pages contain no local `Definitions` section. Verify that every wiki entry has a unique, stable `definition-...` anchor and that all HTML and DS term links resolve to the intended wiki entry. Treat missing or duplicate wiki anchors, broken wiki links, local definition sections, and competing definition pages as structural defects.

Examples:

- Report an `error` when `<main>` is opened but never closed, or when a link points to `docs/specsLoader.html?spec=DS009.md` and `DS009.md` does not exist.
- Report a `warning` when one primary page has a different navigation model from all others and no reason is given.
- Report a `recommendation` when a long secondary page has no breadcrumb or link back to its parent, even though the reader can technically reach it.

Check Mermaid blocks separately. A Mermaid diagram must use the expected `<pre class="mermaid">` form (or the repository's documented equivalent), begin with a supported diagram declaration such as `flowchart`, `sequenceDiagram`, or `stateDiagram-v2`, and contain syntactically valid statements. Verify that unfamiliar labels have detailed entries on `docs/wiki.html` and usable canonical links from the surrounding content or supported diagram interaction, and that the diagram agrees with the surrounding prose.

Example diagram defect:

```html
<pre class="mermaid">
flowchart LR
  Caller -->
</pre>
```

The dangling arrow is a syntax error. A semantic diagram defect is different: a diagram may parse successfully while showing `LLM → Database` even though the prose says the LLM only returns text and never writes the database.

Check SVG/XML assets for well-formed markup and verify that referenced assets are stored in the documented asset directory. Do not treat an external CDN as a local asset; report it as an external dependency if availability matters.

## 3. Markdown syntax and heading structure

Inspect `README.md`, `AGENTS.md`, every Markdown file under `docs/`, and every DS file. Check front matter delimiters and fields where used, closed code fences, valid links, table delimiters, list indentation, and heading hierarchy. A heading level may occasionally be skipped for a deliberate structural reason, but unexplained jumps should be reported.

Check every prose paragraph, list item, caption, and other text block for source-level hard wrapping. A logical prose block must remain on one source line unless Markdown syntax requires a boundary. Report arbitrary column wrapping and manual line breaks as errors, and direct remediation to join the affected prose without changing its wording.

Check whether headings make sense for the content that follows. A heading called `Runtime` followed by only repository history is misleading even if the Markdown parses.

Examples:

```markdown
# Project
### Installation
```

Report a warning for the unexplained jump from `#` to `###`; suggest `## Installation` unless the missing level is structurally intentional.

```markdown
## Configuration

- API key
- Model
- Timeout

## Examples

- The system reads the API key from the environment.
- The model tag selects a configured executor.
```

The syntax is valid, but the second list likely replaces explanatory prose. Report that under language/information design, not as a Markdown syntax error.

Validate DS naming, required numbering, front matter, `Introduction`, `Core Content`, `Conclusion`, and matrix links when the repository uses the GAMP specification structure. Require exactly `title` and `summary` in ordinary DS frontmatter. Require `title` to equal the exact filename stem, including the DS number and name, and derive the identifier from the filename. Report a missing or mismatched `title`, a missing `summary`, every separate `id`, `status`, or `owner` field, every other unsupported field, and every `Status` or `Owner` heading, section, label, badge, metadata block, or standalone value as an error. The remediation must correct `title` and delete unsupported metadata without renaming, relocating, or reproducing it elsewhere. Confirm that substantive requirements, rationale, limitations, alternatives, and contract boundaries are declarative content under `Core Content`; remediation must normalize any additional DS content structure into these standard sections. Verify that `DS003-main-behavior.md` exists exactly once with `title: DS003-main-behavior` and that `specsLoader.html?spec=...` targets resolve to the intended DS files.

## 4. Other documentation-support files

Parse JSON manifests and configuration examples. Run JavaScript syntax checks for documentation loaders or helpers when the command is read-only. Inspect CSS for malformed blocks when a parser is available. Check code snippets only to the extent needed to identify syntax that the documentation presents as executable; do not turn this skill into a source-code review.

If a checker cannot run because a dependency or local server is unavailable, state the limitation and continue with static inspection. Never edit a file to make a checker pass.

## 5. Navigation and documentation map

The home page must explain the project at a high level and provide a primary menu to the main pages. Unless the target has an explicitly documented small-scope exception, it must also contain a `Documentation Map` after the project overview. The map is one responsive, column-oriented semantic table whose presentation remains visually open rather than drawing a rigid spreadsheet grid. Every `<th scope="col">` must use the exact text of one top-level primary-header submenu button, preserving the header's order. The non-empty cells under that heading must reproduce the submenu's links in order, using the same labels and targets. Each link must be followed immediately by a short description that explains what the page represents. Menus with fewer entries use visually empty, non-interactive cells for the remaining rows.

The map is a projection of the header, not a separately inferred hierarchy. It must contain every header submenu destination exactly once and no other destination. A Specifications submenu entry remains one map entry unless individual specification files are also explicit header destinations.

Check:

- one obvious home page and a visible path back to it;
- primary menu labels that match page titles;
- parent-to-child links for secondary pages;
- no orphan pages or dead-end required flows;
- a coherent specification entry point and matrix;
- a required Documentation Map whose column headings exactly match the primary header's top-level submenu buttons in text and order;
- every submenu destination reproduced exactly once beneath its owning heading, with matching label, target, and order;
- one valid link and one useful short page description per non-empty body cell, with only empty non-interactive cells used to align shorter menus;
- no extra destinations, expanded specification files, generic metadata columns, or placeholder labels;
- no borders or separate background boxes that rigidly delineate every semantic table cell;
- concise purpose and reading-flow prose below the table that uses actual page names and introduces concepts before dependent material;
- agreement between the map, header submenu grouping, breadcrumbs, parent-to-child links, and specification entry point;
- no duplicated primary navigation systems competing with one another;
- `Wiki` and `Specifications` entries inside header submenus on every HTML page;
- no direct top-level header links and no top-level header button without a submenu;
- stable breadcrumbs or equivalent orientation on deep pages.

Example finding:

> `docs/index.html`, “Documentation map”: the text lists “API”, “Architecture”, and “Operations”, but only “Architecture” is linked. Add valid links or remove the claim from the map. `gamp-specs` should repair the map and then re-run link verification.

Treat a missing map, a card grid used instead of the required table, a rigid border around every semantic table cell, a column heading that differs from its header submenu button, an omitted, extra, duplicated, reordered, relabeled, retargeted, or broken submenu destination, a page entry without a useful description directly below its link, multiple links in one body cell, a generic metadata column, placeholder content, or a reading order that contradicts the header navigation as an `error`. Empty non-interactive cells are valid only when needed to align menus of different lengths and must remain visually empty. The map is an onboarding shortcut surface and must not be reported as a competing primary navigation system when it agrees exactly with the header.

## 6. Finding format

For each finding, record:

`[severity] path — location — observed evidence — consequence — remediation direction`

Example:

`[error] docs/specsLoader.html — specification loader: target DS007-runtime.md is missing — readers cannot open the linked contract — regenerate the matrix after restoring or removing the target through gamp-specs.`

Report an internal documentation-skill mention as an `error` when it exposes authoring provenance or presents an authoring-only tool as part of the product. The remediation must remove the mention and preserve the surrounding product information; it must not replace one tool name with another.
