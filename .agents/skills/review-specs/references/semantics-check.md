# Semantics Check

This reference defines the content and language review performed after syntax and flow checks. The goal is to determine whether a new reader can understand the product and move through its documentation without relying on source-code knowledge.

All examples in this reference use fictional, project-neutral terminology. Examples must demonstrate documentation principles without importing names, components, or architecture from a project previously reviewed with this skill.

## Preservation baseline

Treat correct, understandable, and compliant documentation as protected content. Do
not propose alternate wording, formatting, section organization, diagrams, or prose
style when the existing material already communicates its contract clearly. A
different formulation is not evidence of a defect.

Create a finding only when evidence identifies a negative effect on accuracy,
new-user comprehension, coherence, navigation, consistency, accessibility, or an
applicable repository rule. Make the remediation as narrow as possible and preserve
the surrounding content that already works.

## Internal authoring tools

Documentation-generation and documentation-review skills are internal authoring tools, not product concepts, dependencies, architecture components, or user-facing capabilities. Project documentation must not name them, credit them, link to them, define them, diagram them, or describe their role in producing or reviewing the documentation.

Create an error finding for any statement that exposes documentation-skill provenance, including “generated with,” “reviewed by,” “validated using,” or equivalent wording. Create the same finding when an authoring-only documentation skill appears in a product skill catalog, dependency list, specification, definitions section, architecture diagram, navigation item, badge, credit, comment, caption, or footer.

Do not flag a skill that the target repository itself implements, distributes, or exposes as product functionality merely because it is documentation-related. Review it as a product subject, but still flag any claim that it generated or reviewed the documentation. Recommend removing only the internal-tool reference while preserving valid product content.

## 1. Read in user order

Start at the home page, follow the primary navigation, open secondary pages from their parent pages, and then read the specifications reached through the documented matrix or loader. Read each page from its first sentence to its conclusion. Do not judge isolated paragraphs without checking the transitions around them.

Use the required Documentation Map on the home page as the explicit onboarding shortcut surface. Confirm that its column headings and entries mirror the primary header menus exactly. Read the short description below every page link and verify that it explains the page's actual role with supported, distinguishing information rather than restating the title or inventing behavior. Follow every shortcut and compare the stated reading flow with the prose transitions, header grouping, breadcrumbs, and page content. Report a structurally complete map as semantically misleading when an entry description misstates the linked page or when the recommended sequence introduces dependent workflows before their concepts.

For every principal page, ask:

- **Why:** Why does this project, subsystem, or page exist? What user problem does it address?
- **What:** What are the actors, components, inputs, outputs, responsibilities, and boundaries?
- **How:** How does the described workflow operate, and what observable result does it produce?

The page does not need literal `Why`, `What`, and `How` headings. The order and content of the prose must make all three aspects clear.

Example of a weak home page:

> “TaskRunner provides an extensible execution layer.”

This names no user, task, input, output, or reason. Report that the home page should say who uses TaskRunner, which problem it solves, what input it accepts, and what result it returns.

Example of a stronger version:

> “TaskRunner is a command-line application that lets analysts run reusable data-processing tasks. An analyst supplies an input file and selects a task; TaskRunner validates the input, runs the selected operation, and writes the result to an output file.”

## 2. Wiki and terminology

Require one canonical terminology page at `docs/wiki.html`. Ordinary HTML pages must not contain local `Definitions` sections, and the repository must not split canonical definitions across multiple feature pages. Common language and standard platform terms need wiki entries only when the project assigns them a specialized meaning.

For every project-specific term, acronym, named component, or architectural concept used in HTML documentation or DS content, verify all of the following:

- `docs/wiki.html` contains exactly one corresponding entry with a unique, stable `definition-...` anchor;
- the entry is evidence-backed and detailed enough to explain the term's meaning, purpose, users or owners, behavior or workflow role, important relationships, and confirmed constraints, boundaries, or limitations;
- the entry uses complete explanatory paragraphs rather than a dictionary-style fragment or one short sentence;
- every eligible occurrence links directly to the exact canonical wiki anchor, including occurrences in body prose, lists, captions, callouts, and supported diagram interactions;
- page titles, section headings, and navigation labels remain unlinked, while nearby body content provides the canonical wiki link;
- inline explanations support immediate comprehension without replacing, shortening, or contradicting the wiki entry.

Report a local `Definitions` section as an error even when its content is accurate. Direct remediation to migrate supported content into the canonical wiki entry, update incoming links, and remove the local section without losing verified information.

Examples:

- Good contextual explanation: “A <a href="wiki.html#definition-task-module">task module</a> packages the instructions and optional code required for one reusable operation.” The wiki entry separately explains its ownership, lifecycle, inputs, relationships, execution role, and boundaries in detail.
- Good canonical link: “The router invokes the <a href="wiki.html#definition-task-module">task module</a>.” Every eligible occurrence targets the same wiki anchor.
- Weak wiki entry: “Task module — A reusable task.” This does not explain who uses it, what it contains, how it participates in execution, or where its responsibility ends.
- Weak page structure: a feature page contains its own `Definitions` section even though `docs/wiki.html` exists. This creates competing canonical sources and must be consolidated.

When a term reappears after several sections, check that another wiki link or brief contextual reminder prevents ambiguity. Check for inconsistent names such as `Task Router`, `TaskRouter`, and `task router` when they refer to one identifier.

## 3. New-user comprehension and coherence

Read as a person who knows nothing about the project. Report:

- a conclusion that appears before the objects or actors it depends on are introduced;
- a transition that changes from architecture to operations without explaining the relationship;
- paragraphs that use “this”, “it”, or “they” without a clear referent;
- claims that contradict another page or a DS file;
- an example that promises behavior the surrounding contract does not define;
- a page that assumes knowledge of an external library without explaining the part it uses.

Example:

> “The capability resolver escalates to deep execution after the review loop.”

If the document has not explained or linked “capability resolver”, “deep execution”, or “review loop”, report a coherence and terminology problem. Recommend adding detailed entries to `docs/wiki.html`, linking the terms to their exact anchors, and retaining only the immediate inline context needed by the sentence.

Check diagrams semantically as well as syntactically. A valid diagram that omits a required actor, reverses the data flow, or uses labels absent from the prose is a semantic defect.

## 4. Prose, bullets, and section density

Documentation should use complete sentences with a subject and predicate for explanation. Bullet points are appropriate for short enumerations, compact option sets, file lists, or quick checks. They should not replace the argument that explains how the listed items relate.

Preserve each prose block as one unwrapped logical line in HTML and Markdown source. Verify that documentation and rendered DS text can occupy the full available width of their own boxes and wrap only when they reach the box boundary. Treat manual line breaks, hard wrapping at an arbitrary column, or an artificially narrowed text container as a compliance defect rather than a stylistic preference.

Example of excessive bullets:

```markdown
- The application accepts a request.
- The application selects a task handler.
- The application processes the input.
- The application returns the result.
```

When this is the entire explanation, recommend a paragraph or sequence diagram: “The application accepts a request, selects the appropriate task handler, processes the supplied input, and returns the result.” Keep the list only if the items are being compared or enumerated for a practical reason.

Check section density. Several headings with one or two sentences each often indicate that one continuous explanation was fragmented for visual structure.

Example:

```markdown
## Input
One sentence.

## Output
One sentence.

## Result
One sentence.
```

If all three describe one request lifecycle, recommend a single “Request lifecycle” section with connected prose and, if useful, one diagram. Do not merge genuinely independent contracts merely to reduce the heading count.

## 5. Concrete language and abstraction

Flag sentences that do not identify who acts, what changes, which data moves, under what condition, or what result follows. Explain the missing actor or action and suggest a concrete direction.

Examples:

- Too abstract: “The system provides a robust capability surface.”
  - Ask: Which component exposes which operation to whom?
- Too abstract: “Context is propagated through the orchestration layer.”
  - Ask: Which context fields are copied, from which caller, to which executor, and why?
- Clearer: “The command-line handler passes the selected task name and session identifier to the task executor so that a retry can use the same request context.”

Flag “fancy” vocabulary when a simpler word carries the behavior more accurately:

- “utilize” → “use”;
- “facilitate execution” → “start the task” or “let the executor run the task”;
- “capability substrate” → name the concrete service or operation;
- “semantic mediation” → describe the transformation and its input/output.

Professional documentation can use technical terms, but technical style is not a reason to obscure the actor, action, condition, or result.

## 6. Main pages and DS pages

Give the highest attention to the home page, principal feature pages, and DS pages. Check that each DS uses `Introduction`, `Core Content`, and `Conclusion`, and that `Core Content` states requirements, boundaries, rationale, confirmed limitations, alternatives, and unspecified contract details declaratively. Direct `gamp-specs` to normalize any other DS content structure into those sections without losing supported information. Require frontmatter to contain exactly `title` and `summary`, with `title` equal to the filename stem. Treat separate `ID`, `Status`, or `Owner` metadata and every `Status` or `Owner` section, label, badge, metadata block, or standalone value as prohibited and direct its deletion without relocation. Check that the two-column matrix name and description accurately represent each DS.

Report a DS issue when the prose is explanatory but never states what must, should, or may happen; report a user-documentation issue when a contract is technically precise but never explains why the reader should care or how the behavior appears in use.

## 7. Finding format and remediation

Use this form:

`[severity] path — heading or line — observed semantic problem — why a new reader is affected — repair direction for gamp-specs`

Example:

`[warning] docs/architecture.html — “Processing components” — “execution capability” has no immediate context or detailed entry on docs/wiki.html — a new reader cannot identify whether it refers to a service, interface, or operation — add an evidence-backed wiki entry with a stable anchor, link the term to it, and retain brief inline context if the distinction is needed immediately.`

Separate confirmed comprehension failures from stylistic preferences. Omit
stylistic preferences from findings and remediation guidance. If a page is clear and
concrete, record that it passed rather than adding cosmetic rewrites or replacement
wording.
