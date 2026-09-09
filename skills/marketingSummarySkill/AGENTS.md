# Repository guidance

This skill is provider-, host-, and model-independent. The active LLM performs genre judgment, hook selection, marketing synthesis, drafting, and semantic spoiler review. Deterministic code extracts evidence, controls the workflow, enforces exact schemas, renders HTML, and validates traceability, factual tokens, word budgets, and spoiler guards.

Accept `.html` and `.htm` inputs only. Preserve the source byte-for-byte. Never invent claims, promises, testimonials, prices, author details, purchase links, or reader outcomes. Never expose answers, conclusions, solutions, prescriptions, twists, resolutions, or outcomes merely because they occur in the source.

Keep persistent documentation, schemas, code, tests, and comments in English. The job contract is exact and unversioned; do not add legacy branches or schema-version fields. Use `scripts/marketingsummary` as the normal entrypoint and keep jobs beside the source by default.

The workflow runs end to end without per-batch questions. If permissions are required, request one combined approval before starting. Analyze up to four batches concurrently when workers are available, then synthesize, draft, review, build, and independently validate.

When changing behavior, update `SKILL.md`, `README.md`, `DS.md`, `references/job-format.md`, `skill.json`, tests, and the lockfile where relevant. Run tests, compilation, `doctor`, and end-to-end nonfiction and fiction fixtures.

## Node.js runtime

Requires Node.js 22 or newer. Use .mjs ECMAScript modules, explicit relative
imports, node: built-ins, async/await and node --test. Keep every owned resource
inside this skill. [dependencies.md](dependencies.md) records bundled parser and
language-data exceptions. Startup checks prerequisites and never installs them.

Run tests with Node.js:
`node --test tests/equivalence.test.mjs`. Frozen reference fixtures preserve
preparation, workflow states, exact HTML output and language normalization.
See tests/fixtures/README.md for provenance. Acceptance requires zero skipped tests.

Job JSON and command arguments are preserved. Doctor retains its behavioral
metadata and reports the Node.js and htmlparser2 versions.
