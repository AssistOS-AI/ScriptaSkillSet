# Technical Documentation Guidelines

Use this reference when writing or revising the HTML documentation pages under `docs/*.html`.

Apply `documentation-writing-guidelines.md` first. This file adds rules that are specific to the HTML documentation set.

## Purpose

Write for human readers. Explain what exists, why it exists, and how it behaves in practice. Keep the prose technical, specific, and operational.

## Communication Standard

- Keep all persistent output in English.
- Use precise, professional language and make every claim defensible from project evidence.
- Prefer direct descriptions of verified methods and behavior.
- Explain the task each method supports and provide the verified commands, inputs, or conditions needed to reproduce it.
- Optimize the documentation for software engineers and interdisciplinary researchers.

## Technical Fidelity

- Check every substantive claim against the codebase before documenting it.
- Do not describe behaviors, automation steps, runtime flows, generated files, APIs, validation guarantees, or architectural layers unless they are confirmed in the implementation.
- Do not invent lifecycle stages, system boundaries, or guarantees because they sound plausible.
- If a statement cannot be confirmed from code, remove it or narrow it until it becomes defensible.
- Keep interpretations modest and close to the implementation.
- Reuse the project's stable vocabulary when canonical architecture texts or reports already define the topic.
- Keep code identifiers, filenames, module names, and exact technical terms unchanged.
- Do not present machine-specific absolute filesystem paths, usernames, home directories, or workstation-local folder layouts as if they were part of the project. Refer to repository-relative paths or project concepts unless an absolute path is itself a real, documented interface requirement.

## Editorial Standard

- Avoid prose that reads like prompt scaffolding, product marketing, or generated filler.
- Avoid meta text about how to read the page.
- Avoid slogan-like headings or generic heading formulas repeated across pages.
- Do not add sections, labels, navigation groups, or other page content only to preserve a preferred visual style when the implementation does not need them.
- Adapt chapter titles to the subject of the page while preserving a logical order of ideas.
- Prefer a small number of substantial chapters over many short fragments.
- Avoid shallow one-paragraph skill pages when the skill folder contains meaningful structure that can be reviewed and documented.
- Keep explanatory text in prose with complete sentences and clear argumentative flow.
- Use lists only when the content is genuinely list-shaped.
- Avoid unexplained abbreviations in general explanatory prose; provide immediate context when necessary and link them to their detailed entry on `docs/wiki.html`.
- Organize each feature explanation around its practical role and user-visible result before describing components, configuration, or runtime flow.
- Make each independently accessible HTML page provide access to the project-specific concepts needed to understand it through direct links to canonical wiki anchors and optional inline context.

## Canonical Wiki

- Create `docs/wiki.html` as the only canonical terminology page and expose it as a `Wiki` entry inside a required header submenu on every HTML page.
- Do not add page-local `Definitions` sections. Remove existing sections after migrating every supported entry to the wiki.
- Include every project-specific concept, acronym, named component, or specialized term used anywhere in the HTML documentation or DS set. Common language and standard platform terms need entries only when the project assigns them a specialized meaning.
- Give every term its own stable anchor, such as `id="definition-task-module"`, and use the exact same anchor from every referring page.
- Explain each term in detail using complete paragraphs. State what it means, its purpose, who or what uses or owns it, how it behaves or participates in workflows, its important relationships, and its confirmed constraints, boundaries, or limitations. Base every statement on implementation or authoritative project material; explicitly preserve an evidence boundary when a detail is unspecified.
- Do not use a dictionary-style fragment or one short sentence as the complete entry. Keep the explanation focused on the term, but include enough verified context for a new reader to understand and apply it without searching the source code.
- Link every eligible occurrence of a defined term in body prose, lists, captions, callouts, and diagrams to the exact wiki anchor. Keep page titles, section headings, and navigation labels unlinked, and add the first applicable link in nearby body content.
- Preserve useful inline explanations when they support the immediate narrative, but do not let them replace the detailed wiki entry or become a competing definition.

## Examples And Callouts

- Use examples when abstract explanation is insufficient.
- Keep examples minimal for starting templates or baseline usage.
- Use extended examples only when optional behavior needs to be shown in context.
- Reserve callout boxes for operationally important information.
- Do not use callouts for decorative emphasis.

## Documentation Map

- Place a `Documentation Map` on the home page after the project overview, where a new reader has enough context to understand the page names.
- Use one column-oriented semantic table rather than a card grid or conventional metadata table. Each `<th scope="col">` is the exact label of one top-level header submenu button, in the same order as the header.
- Put that submenu's links beneath its heading in their original order. Each non-empty cell contains one linked page label and a short description immediately below it that explains the page's practical role.
- The map must be a complete projection of the header: include every submenu destination once, preserve labels and targets, and add no page that the header does not expose. Do not expand a Specifications entry into individual DS files unless those files are separately present in the header.
- Preserve visible link semantics, keyboard focus, descriptive text, and responsive wrapping. Use empty non-interactive cells only to align columns whose menus contain fewer entries.
- Do not make the map look like a spreadsheet. Establish grouping through restrained column headings, whitespace, a quiet shared surface, and lightly elevated page entries instead of strong cell borders.
- Add short reading-flow prose below the table using actual header-group and page names. Do not create separate `Purpose` or reading-order columns because each page's purpose already appears directly below its link.
- Do not use the map as a replacement for the header, breadcrumbs, or parent-to-child links. Its purpose is onboarding and fast orientation.

## Visual And Responsive Rules

- Let the main documentation panel occupy the full available desktop width so the surrounding frame does not consume excessive horizontal space.
- Do not apply a fixed or centered `max-width` to the main page or article panel. Use `width: 100%`, no outer auto margins, and compact outer and inner padding. Use `1rem` as the default desktop padding for both the page wrapper and its text panel unless the existing project shell requires an equivalent compact value.
- Reduce that padding further on narrow screens; `0.5rem` for the page wrapper and `0.75rem` for the text panel are the default mobile values.
- Set the HTML page title and the visible site/page title to `[project name] Documentation`.
- Use one primary navigation system in the header. Do not present a sidebar and header navigation as parallel primary systems.
- Make every top-level header control a button that owns and opens a submenu. Direct top-level header links are prohibited, including links to home, specifications, the wiki, and other primary pages.
- Place every navigation destination inside exactly one subject-based submenu. Use clear submenu-button labels that describe their grouped destinations.
- Require a submenu for every header button. A submenu may contain one real destination when that subject has no other valid page; never leave a submenu empty or invent placeholder destinations.
- Put `Specifications` inside a header submenu and link its entry to `specsLoader.html?spec=matrix.md`.
- Put `Wiki` inside a header submenu and link its entry to `wiki.html`.
- Keep menu order, submenu groups, interaction behavior, and available links uniform across the HTML pages so moving between files does not change the navigation model unexpectedly.
- Opening a submenu must expose only that menu's child navigation panel. When the user clicks or taps anywhere outside the open menu and its child panel, close that submenu.
- Implement outside-click behavior in the shared navigation script so every HTML page receives the same behavior. The handler must check whether the event target is outside each open menu before removing its open state; clicking inside the submenu must not close it before its control or link can respond.
- Support keyboard navigation: submenu triggers must be focusable, communicate their expanded state, close on `Escape`, and return focus to the trigger when closed with `Escape`.
- Do not repeat navigation links redundantly inside the page body or page header when the same destination is already clearly available in the sidebar or primary navigation shell.
- Do not insert `<br>` elements, newline-preserving styles, fixed label widths, or other forced wrapping merely to break text early. Let headings, paragraphs, lists, captions, callouts, and labels use the full width of their containing box and wrap naturally at its boundary.
- Prefer full-page documents with substantial sections that read like chapters in a book.
- Do not break the documentation into fragmented card grids or small disconnected components when a continuous reading flow is more appropriate.
- Make pages readable as long-form technical documents, with well-defined sections.
- Ensure navigation supports orientation without competing visually with the main text.
- Include breadcrumbs that let the reader return to `index.html`.
- Keep links visibly identifiable in prose without relying on hover state.
- Avoid dashboard-like UI patterns unless they solve a real documentation problem.
- Collapse layouts on tablet and mobile before text becomes cramped.
- Do not surface workstation-local absolute paths in page chrome, footers, breadcrumbs, captions, or explanatory prose.
- Ensure the HTML navigation exposes the specs entry point as a `Specifications` entry inside a header submenu.
- Ensure the HTML navigation exposes a stable path to the skill catalog.
- If a page links to the specs area, route that navigation to `matrix.md` through `docs/specsLoader.html?spec=matrix.md` or an equivalent valid specs entry flow.
- Ensure readers can reach each DS file from `matrix.md`.
- When documentation discusses coding style or test organization, point readers explicitly to `DS001-coding-style.md`.
- When documenting a downstream project that merely consumes imported skills, keep `docs/` focused on the host project and avoid standalone pages about those imported skills. Keep skill-specific agent guidance inside the copied skill folders instead.
- Follow `diagrams-guidelines.md` whenever a page uses a diagram or visual directory tree.

## Default Outcome

The resulting HTML page should help a technical reader understand the real system faster, without decorative prose, speculative claims, or UI patterns that distract from the text.
