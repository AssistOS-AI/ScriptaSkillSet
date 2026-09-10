# Analysis of the Bad Documentation Example

## Review scope and method

This analysis reviews `bad-documentation.html` as a new user would read it. It focuses on the order in which concepts are introduced, the clarity of the language, the navigation structure, and the difference between introducing a system and justifying an architecture.

The analysis compares the bad example with `good-documentation.html`, which documents the same library through concrete actors, actions, and outcomes.

## Executive assessment

The bad example is not bad because its HTML structure is unusable or because every statement is technically incorrect. Its main problem is pedagogical and semantic: it assumes that the reader already understands the library's vocabulary and architecture. The page explains why the existing architecture is divided into layers before it has explained what the library does, who calls it, or what a skill and a subsystem are.

As a result, the page reads like an internal architectural justification for people who already know AchillesAgentLib. It does not read like an introduction for a new user encountering the library for the first time.

## Semantic and ordering findings

### 1. The page introduces the reading order before introducing the concepts

> “The documentation is organized so that the shared runtime surfaces can be read first and the more local skill-family contracts can be approached afterwards.”

This is the second paragraph of the page. It tells the reader how to approach the documentation before explaining what a “shared runtime surface” or a “skill-family contract” is. The phrase “skill-family” is especially problematic because it assumes the reader already knows that the library has skills and that skills are grouped into families.

The sentence is also meta-information about the documentation rather than an explanation of the product. A new user needs to learn what the library does before being told how the pages are organized.

The good example replaces this with product information:

> “Applications use the shared runtime to discover skills, choose an executor, run tasks, and keep the context needed for multi-step work.”

That sentence identifies the user of the library, the operations it performs, and the reason the runtime matters. It introduces the skill-family sections only after explaining what the runtime does.

### 2. “Common execution layer” is too abstract

> “The most natural starting point is the common execution layer.”

“Execution layer” does not identify an actor, an operation, an input, or a result. A new reader cannot tell whether it means a JavaScript module, a service, a model call, a process, or a documentation category. “Common” also assumes the reader already knows which components are shared.

The good example uses the concrete heading:

> “How MainAgent runs a task”

It then defines `MainAgent` as the main point of interaction and describes the request flow. The heading tells the reader what happens, not merely where an architectural boundary exists.

### 3. `MainAgent` is introduced too late in the explanation

The bad page begins by describing “the common execution layer” and lists `LLMAgent`, “Agentic Sessions”, and “Subsystems and Skills” as if these were already familiar entry points. It does not first explain which object an application actually calls.

The good example establishes this boundary immediately:

> “`MainAgent` is the main point of interaction with AchillesAgentLib. An application sends a task instruction to MainAgent...”

That gives the reader a concrete starting point before discussing discovery, subsystems, or model execution.

### 4. The `LLMAgent` sentence uses unexplained technical enumeration

> “`LLMAgent` is the mediation layer for completions, interpretation helpers, output coercion, and session creation.”

This sentence contains several unexplained abstractions:

- “mediation layer” does not say what `LLMAgent` does for the caller;
- “completions” does not say whether it means model requests, generated text, or a response type;
- “interpretation helpers” does not identify which input is interpreted or what result is produced;
- “output coercion” does not explain which output is converted from which shape to which shape;
- “session creation” is listed without explaining who uses the session or why it exists.

The enumeration creates the impression of precision while leaving the behavior unclear. The good example states the operations directly:

> “`LLMAgent` is the shared interface used by subsystems to call configured language models. It handles provider invocation, response shaping, intent interpretation, and the memory associated with a task, user, or session.”

This is still technical, but it identifies the caller (`subsystems`), the external operation (`call configured language models`), and the kinds of state involved.

### 5. The page justifies the architecture before defining its components

> “`Subsystems and Skills` explains why the library does not collapse all descriptor types into one misleading abstraction and how execution is divided across specialized subsystems.”

This is an architectural defense, not a usable introduction or definition path. It introduces “descriptor types”, “abstraction”, and “specialized subsystems” without saying what a skill is or what a subsystem does, and the page provides no link to a detailed entry on the canonical wiki. The phrase “misleading abstraction” also asks the reader to agree with a design decision before the underlying objects have been explained.

The good example introduces the concepts in operational terms:

> “A skill defines a reusable operation through task instructions and, when required, task-specific code. A subsystem is the runtime component that loads and executes one family of skill descriptors.”

Only after those definitions can a reader understand why different descriptor families may need different subsystems.

### 6. The page assumes system knowledge instead of building it

Across the opening sections, the bad example assumes that the reader already understands:

- what a skill is;
- what a skill family is;
- what a descriptor is;
- what a subsystem is;
- what an execution layer is;
- what an agentic session is;
- what `LLMAgent` mediates;
- why different descriptor types need different execution paths.

The page therefore treats documentation as a justification of an architecture that the reader is expected to know already. It should instead introduce the library in this order:

1. who uses the library and what problem it solves;
2. what `MainAgent` receives and returns;
3. what a skill packages for reuse;
4. what a subsystem does with that skill;
5. how `LLMAgent` and agentic sessions support execution;
6. why separate skill families exist;
7. where the detailed contracts are specified.

### 7. The project has no canonical terminology wiki

The page introduces project-specific terms including `MainAgent`, `LLMAgent`, skill, subsystem, descriptor type, and agentic session, but the project provides no canonical `wiki.html` with detailed, anchored entries. The reader must interrupt the workflow and infer those meanings from dense paragraphs or follow broad page links that do not target an exact definition.

The good example keeps central context in the prose and links every eligible occurrence of a defined term directly to the same canonical wiki entry.

## Navigation and flow findings

### 8. The sidebar is dense before the reader knows the hierarchy

The sidebar exposes runtime pages, skill-family pages, and supporting components immediately. The groups are visually organized, but their labels still depend on terms that the page has not defined. A new user cannot tell which links are foundational and which are specialized.

The good example moves the hierarchy into mandatory header submenus and makes the parent-child relationship explicit: Runtime contains `LLMAgent`, agentic sessions, and skills/subsystems; Skill families contains orchestration, DBTable, and code execution; Reference contains specifications and the wiki. Every top-level header control opens a submenu, and the page prose explains what each group means before asking the reader to use the detail links.

### 9. The opening paragraphs are documentation meta-information

The first paragraph about how the documentation is organized and the sentence “The most natural starting point...” describe the author's presentation choices. They do not help the reader perform a task with AchillesAgentLib. Documentation may include a short reading guide when it is necessary, but it must not replace the product introduction or introduce undefined architecture terms.

## Language and information-design findings

### 10. Abstract nouns hide the actor and action

Examples include “runtime surfaces”, “execution layer”, “mediation layer”, “interpretation helpers”, “output coercion”, “descriptor types”, “misleading abstraction”, and “specialized subsystems”. These phrases could be retained only after concrete definitions, and several should be replaced entirely with direct descriptions.

For each abstract sentence, the review should ask:

- Who performs the operation?
- What input does the component receive?
- What does it do with that input?
- What result does it return or make available?
- Why does the next component need that result?

### 11. The text sounds precise without being explanatory

The bad example uses dense technical vocabulary and long sentences to signal architectural sophistication. That style is not automatically professional. When terms such as “coercion” or “mediation” are not defined, the reader has to infer their meaning from source code or from prior experience with the library.

The repair is not to remove all technical terms. The repair is to introduce each necessary term with a concrete action and to prefer simpler wording when the technical term adds no contractual precision.

## Remediation guidance for gamp-specs

1. Rewrite the opening so it states what AchillesAgentLib is, who uses it, what input it accepts, and what result it provides.
2. Remove or postpone the sentence describing the documentation's reading order. If a reading guide is useful, place it after the product overview and use already-defined terms.
3. Replace “common execution layer” with a heading that names the main actor and operation, such as “How MainAgent runs a task”.
4. Explain `MainAgent` inline before describing skill discovery, subsystem routing, or model execution because it is central to the immediate narrative; also add a detailed entry to the canonical wiki and link the prose to its exact anchor.
5. Define “skill” as a reusable package of task instructions and task-specific code where needed.
6. Define “subsystem” as the runtime component that loads and executes one family of skill descriptors.
7. Rewrite the `LLMAgent` paragraph using concrete callers, inputs, actions, and outputs. Remove unsupported enumerations such as “completions” and “output coercion”, and link the term to a detailed, evidence-backed wiki entry.
8. Introduce agentic sessions through their relationship with `MainAgent`: explain that MainAgent uses them for tasks requiring multiple model or tool actions.
9. Explain skill families after the reader understands skills and subsystems; describe them as groups of reusable operations that share task data and execution needs.
10. Replace architectural justifications such as “does not collapse all descriptor types into one misleading abstraction” with direct explanations of what each component does and why the distinction affects the user.
11. Create one canonical `wiki.html`, give every project-specific term a detailed entry with a stable anchor, and link every eligible occurrence in documentation and DS content to that exact anchor. Do not add a local `Definitions` section to the page.
12. Keep the navigation hierarchy, but make the page prose or exact definition links explain the meaning of each navigation group before relying on it.
13. Read the complete page again as a new user and remove any phrase whose meaning depends on undocumented source-code knowledge.
