# Design Specification Guidelines

Use this reference when writing or revising the specification files under `docs/specs/*.md`.

Apply `documentation-writing-guidelines.md` first. This file adds the contract structure and normative wording required for design specification (DS) files.

## Purpose

Write DS files as contracts that coding agents can follow when they change the project. Focus on rules, constraints, invariants, and required outcomes. Include implementation history only when it explains a current requirement.

## Normative Vocabulary

- Interpret `must` as a mandatory requirement.
- Interpret `should` as a strong recommendation.
- Interpret `may` as permitted but optional behavior.

## Scope And Framing

- Treat `docs/specs/*.md` as specification documents, not as explanatory HTML documentation rewritten in Markdown.
- Keep the same architectural story as the HTML documentation when the project defines one, but express it as obligations, boundaries, and guarantees.
- Use architecture as context only; translate it into responsibilities, boundaries, invariants, and observable guarantees.
- Describe what the system, agent, or interface must do, what it must preserve, and what it must not assume.
- Document only requirements that the repository guidance, implementation, or confirmed project behavior supports.

## Structure Rules

- Follow the `DS0xx-description.md` naming convention.
- Keep the numbering contiguous with no missing intermediate files.
- Always include `DS000-vision.md` and `DS001-coding-style.md`.
- Use `DS002` for a substantive foundational contract selected from the project's real scope.
- Always include exactly one `DS003-main-behavior.md` with `title: DS003-main-behavior`. Reserve `DS003` for this specification.
- Use exactly two frontmatter fields in every ordinary DS file: `title` and `summary`.
- Set `title` to the exact filename stem, including the DS number and name. For `DS003-main-behavior.md`, use `title: DS003-main-behavior`. Derive the identifier from the filename and never add a separate `id` field.
- Remove `id`, `status`, `owner`, and every other unsupported DS frontmatter field. When normalizing an existing `DSxxx-*.md` file, also remove any `Status` or `Owner` heading, section, label, badge, metadata block, or standalone value from the body. Do not relocate or restate that metadata elsewhere.
- Use `Introduction` and `Core Content` as the standard content structure in every DS file. Do not create a `Conclusion` section; preserve any substantive conclusion material as declarative content in `Core Content` when normalizing an existing DS.
- Normalize existing DS material into declarative requirements, constraints, invariants, rationale, limitations, and explicitly unspecified boundaries in `Core Content`.
- Do not implement behavior whose required contract remains unspecified. State that implementation boundary declaratively until authoritative evidence updates the specification.
- Treat `matrix.md` as a generated exception: it does not need the ordinary DS content structure. Give its table exactly two columns: `Name` and `Description`.
- In `Name`, link the exact DS filename stem, such as `DS003-main-behavior`, to that specification through the specs loader. In `Description`, use the DS `summary` value or a concise description derived from its opening prose.
- Do not add `Title`, `Status`, `Owner`, or any other matrix columns.
- Add one DS file for each active skill in the repository.
- Create additional DS files only when a distinct boundary, contract surface, or invariant set cannot be expressed cleanly inside an existing DS file.
- Keep the set of specifications proportionate to the real scope of the repository.
- Ensure the overall DS set covers scope and boundaries, obligations, invariants, dependencies, and failure or edge behavior.
- Do not restate the same contract in multiple DS files unless one file is explicitly the source of truth and the other references it.
- Make `DS001-coding-style.md` the canonical location for coding style, source layout, and modular test-organization rules.
- Make `DS001-coding-style.md` the canonical location for file-size limits, line-length guidance, and `fileSizesCheck.sh` usage.
- Derive the Main Behavior DS from the accepted handoff produced by `detect-main-behaviors` after it analyzes the project's purpose, source, documentation, tests, essential interfaces, architecture, and relevant development evidence.
- Limit the Main Behavior DS to the project's central outcome and the accepted behaviors that realize or materially determine it: user-impacting business behaviors, major hidden functional behaviors, project-special behaviors, primary end-to-end paths, broad project-spanning behaviors or components, essential APIs or commands, active contractual consequences of direction-changing decisions, and the architectural skeleton.
- Exclude secondary features, utilities, optional integrations, narrow configuration, and implementation detail. Reference specialized DS files for deeper contracts instead of copying their content.
- Express each main behavior as a declarative contract that identifies its affected user or consuming actor, business or functional outcome, role in the project purpose, initiating actor or trigger, principal path, observable result, major hidden functional consequence when applicable, distinctive project behavior when applicable, and system-wide boundary or invariant.
- In downstream projects that only consume imported skills, keep DS files focused on the host project. Do not add DS files whose subject is the imported skill catalog; those instructions stay inside the local skill folders.

## DS003 Special Structure

- Keep `Introduction` and `Core Content` as the only top-level content sections in `DS003-main-behavior.md`.
- Inside `Core Content`, create one `###` chapter for each accepted Main Behavior component. Use the detector's ordered component names as the chapter headings and keep each chapter's scope distinct.
- When two or more components exist, place a `### Main Behavior Components` summary at the beginning of `Core Content` with exactly this table shape:

```markdown
| Name | Explanation |
| --- | --- |
| Component name | Concise explanation of its user, business, or major functional impact. |
```

- Add exactly one summary-table row per component. Do not add classification, status, owner, evidence, or other columns.
- Omit the summary table when only one component exists; still give that component its own `###` chapter.
- Do not use a table with more than two columns anywhere in `DS003-main-behavior.md`.
- In each component chapter, explain the affected user or consuming actor and business outcome before internal execution. Then state the trigger, principal behavior, observable result, major hidden mechanism and consequence when applicable, project-specific special behavior when applicable, and governing boundary or invariant.
- Include hidden behavior only when evidence shows a major effect on essential functionality. Do not promote routine helpers or low-level implementation detail into component chapters.
- Name the actual product actor and interface in every component chapter. Commands, routes, environment variables, mounted paths, lifecycle actions, profiles, and public files belong in DS003 when their behavior affects a user, operator, agent, or integration.
- Use plain language and direct verbs. Do not substitute phrases such as “capability surface,” “execution layer,” “runtime mediation,” or “context propagation” for a concrete statement of who does what and what result follows.
- Separate interface-level facts from code internals. Preserve names, inputs, outputs, access rules, persistence rules, and functional consequences; omit private helper calls and incidental data structures unless their behavior has a major effect.

## Writing Standard

- Keep the prose in English.
- Keep each paragraph, list item, caption, and other prose block on one logical source line. Do not hard-wrap DS Markdown at an arbitrary column or insert manual line breaks to shorten a rendered line.
- Make rendered DS text use the full available width of its own containing box. Do not impose a fixed or centered `max-width`, oversized padding, fixed label width, newline-preserving style, or another constraint that causes early wrapping. Allow natural wrapping only at the containing box boundary.
- Prefer narrative requirement-style sections over long bullet-heavy formatting.
- Use complete sentences that express constraints and invariants clearly.
- Use lists only when the content is genuinely list-shaped.
- Reuse stable project terminology rather than inventing a parallel taxonomy for the specs.
- Keep identifiers, filenames, module names, and exact technical terms unchanged.
- Link repository-specific terms to their detailed canonical entries on `docs/wiki.html`. A DS may retain brief inline context for immediate readability, but it must not create a competing definition or require readers to infer specialized vocabulary from source code.
- State the role and observable effect of a feature before specifying its internal constraints.
- Use precise, professional language and make every claim defensible from project evidence.
- Describe the required method directly and include the information another agent needs to reproduce the result.
- Optimize the material for software engineers and interdisciplinary researchers.

## Technical Fidelity

- Ground each requirement in the codebase, repository guidance, or confirmed system behavior.
- Ensure each substantial requirement is defensible from code, repository guidance, or confirmed behavior.
- If code behavior, repository guidance, and documentation disagree, prefer the most authoritative and currently defensible source.
- Do not introduce speculative guarantees or contracts that the repository does not support.
- When a conflict cannot be resolved confidently, state the narrower confirmed contract and describe the evidence boundary as a declarative limitation in the affected DS file.
- The agent must not infer cross-module guarantees that are not explicitly established.
- Do not add a behavior to the Main Behavior DS when `detect-main-behaviors` rejected it or could not support it with repository evidence.

## Default Outcome

The resulting DS documents should guide future work across implementation changes without depending on short-lived code details or decorative prose.
