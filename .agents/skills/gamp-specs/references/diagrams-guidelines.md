# Diagram Guidelines

Use this reference when creating or revising diagrams in HTML documentation. Apply `documentation-writing-guidelines.md` first so diagram labels, captions, and concepts follow the same terminology and evidence rules as the surrounding prose.

## When To Use A Diagram

- Add a diagram only when it makes a runtime flow, generation pipeline, architecture, data flow, component relationship, sequence, state transition, or directory structure easier to understand than prose.
- Keep every diagram technically exact, visually restrained, and readable on mobile.
- Prefer a vertical, top-to-bottom layout and center the rendered diagram within its available container. Use another direction only when the relationships are materially clearer that way.
- If a diagram becomes crowded, reduce the number of actors. Split secondary detail into prose or a separate focused diagram instead of shrinking labels, adding more crossings, or compressing actors until the result is difficult to scan.
- In a straightforward multi-step flow, combine consecutive boxes that only form a simple unidirectional chain into one meaningful composite box. Describe the combined steps in prose below the diagram when the reader still needs that detail; do not preserve a separate box for every step merely to restate the sequence visually.
- Do not use ASCII box-drawing characters (`─`, `│`, `┌`, `└`, and similar characters) for diagrams. Browser monospace fonts do not render them at consistent widths.

## Captions

- Place each diagram inside a `<figure>` with a `<figcaption>`.
- Put the `<figcaption>` after the diagram markup so the visible caption is always below the diagram. Never place the caption above or beside the diagram.
- Use one concise, centered, italic caption as the diagram title. The title must state what the diagram represents as a short noun phrase; it must not explain the diagram, add commentary, or append an interpretive observation. Do not add a separate diagram title above the visual.
- Keep the `<figure>` and the diagram rendering surface visually open. Do not draw a border, card, panel, background box, shadow, or decorative container around the whole diagram. Meaningful actor nodes and real subsystem boundaries inside the diagram may retain their own borders.
- Use markup in this order:

```html
<figure class="diagram">
  <pre class="mermaid">flowchart TB
    API[Public API] --> Worker[Runtime worker]</pre>
  <figcaption><em>Validated request flow</em></figcaption>
</figure>
```

Center both the rendered diagram and its caption with CSS, while leaving the figure without an enclosing frame. For example, use `.diagram .mermaid { display: flex; justify-content: center; }` and `.diagram figcaption { text-align: center; font-style: italic; }`.

## Actor Hierarchy And Density

- Treat an actor as a system, component, process, role, data store, or other participating entity represented by a node or container.
- When a diagram contains several related actors, group them inside larger named entities instead of spreading every actor across one flat canvas. In Mermaid flowcharts, use labeled `subgraph` containers to express these ownership, subsystem, deployment, or category boundaries.
- Nest only where the containment relationship is real and useful to the reader. Do not create visual containers merely to decorate the diagram.
- Prefer fewer, larger conceptual groups with a small number of child actors. If grouping still leaves the diagram crowded, remove less important actors or create multiple diagrams, each with one clear purpose.
- Use short node and container labels. Let the layout engine position actors unless its default result is unreadable.
- Consolidate consecutive actors when their only relationship is a straightforward one-way sequence and their separation does not communicate a meaningful boundary, branch, state, responsibility, or decision. Give the composite actor a label that describes the combined operation, and move any useful step-by-step detail into prose below the diagram.
- Do not insert manual line breaks to wrap node, container, caption, heading, callout, or prose text early. Let text use the full available width of its container and wrap naturally only when it reaches the container boundary.

## Visual Differentiation

- Use distinct, accessible fill and border colors for actors from different categories. Actors in the same category may and normally should reuse the same color treatment.
- Use typography such as font weight, font style, or a project-compatible font family to reinforce meaningful differences between actor categories. Actors in the same category may reuse the same typography.
- Keep each category's color and typography consistent within the diagram and across related diagrams.
- Do not rely on color alone. Preserve explicit labels and visible group boundaries so the categories remain understandable in grayscale and for readers with color-vision differences.
- Keep text-to-background contrast readable and avoid using so many visual variants that the category system becomes harder to understand than the relationships it explains.

## Mermaid Requirements

Every generated HTML page must include the Mermaid ESM module in `<head>` so inline Mermaid diagrams render:

```html
<script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: true, theme: 'neutral' });
</script>
```

- Use `<pre class="mermaid">` for Mermaid definitions. Do not wrap them in `<code>` tags.
- Prefer Mermaid over static SVG for architecture diagrams, data-flow diagrams, component relationships, sequences, and state machines because the definition remains maintainable alongside the code.
- Prefer `flowchart TB` for flow diagrams so their principal direction is vertical. Use a horizontal or alternate direction only when it materially improves comprehension.
- Use Mermaid `subgraph` containers when related child actors belong inside a larger entity.
- Use Mermaid classes, `classDef`, or theme variables to apply the category colors and typography required by this reference.
- The Mermaid theme may be adjusted to match the documentation stylesheet. Use `neutral` as the default.

## Static Visuals And Directory Trees

- Reserve static SVG files under `docs/assets/` for diagrams that need precise custom layout, branding elements, or visual detail that Mermaid cannot express.
- Keep all static SVG and other diagram assets outside the HTML files under `docs/assets/`.
- In static SVG diagrams, shorten labels or size their containers so text can use the full available width. Do not force early wrapping; allow a natural line break only when the label reaches its container boundary.
- When showing a representative directory layout, prefer a visual tree component over a raw ASCII directory dump when the tree is easier to scan. Preserve the real file and folder names.

## Review Checklist

- Confirm the diagram has exactly one concise, centered, italic caption below it and no separate title above it. Confirm the caption is a title naming what the diagram represents, not an explanation, addition, or observation.
- Confirm no border, background box, card, panel, or shadow frames the whole diagram.
- Confirm its actors, relationships, and containment boundaries match the implementation.
- Confirm related actors are grouped inside meaningful larger entities rather than spread across a flat canvas.
- Confirm a straightforward unidirectional sequence is consolidated into a meaningful composite box unless separate nodes communicate a real boundary, branch, state, responsibility, or decision; put any useful expanded sequence in prose below the diagram.
- Confirm the diagram contains only the actors required for its stated purpose and remains readable at desktop and mobile widths.
- Confirm the diagram uses a vertical layout by default and is centered within its available container.
- Confirm distinct actor categories use consistent, accessible colors and typography, while actors in the same category share the same visual treatment.
- Confirm text uses the full width of its container and has no manual or artificially early line wrapping.
- Confirm Mermaid and static assets follow the placement and markup rules in this reference.
