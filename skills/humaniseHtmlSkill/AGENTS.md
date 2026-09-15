# Repository guidance

This skill is provider-, host-, and model-independent. The active LLM performs editorial judgment; deterministic code only extracts, protects, batches, restores, and validates content.

Preserve source files by default. Preserve DOM topology, inline markup, scripts, styles, identifiers, classes, data attributes, links, resource references, citations, numbers, dates, and factual claims. Only `--in-place` authorizes replacing the source, and the job snapshot remains the validation and recovery source.

Keep persistent documentation, schemas, code, tests, and comments in English. Do not add compatibility branches or schema version fields. There is one current job contract.

Use `scripts/humanisehtml` as the normal runtime. Keep jobs beside the source in `.humanisehtml-jobs/` unless the caller explicitly selects another workspace path. Reuse parent-workflow authorization and preflight on resume. Do not create stage, batch, retry or local-installation confirmation steps. Use the default sandbox for allowed work and only observed platform grants for native commands; a proposed prefix is not a granted rule. Do not immediately repeat interrupted requests. Genuinely required missing platform grants remain mandatory.

During complete ScriptaHub maintenance, retain same-language baselines and record English changes for whole-chapter propagation to every existing translation. Follow references/repair.md. Reviewed candidates replace existing canonical readers through the host's backup, hash-check and revalidation workflow; do not publish duplicate humanised editions.

When changing behavior, update `SKILL.md`, `README.md`, `DS.md`, `references/job-format.md`, descriptors, tests, and the dependency lock where relevant. Run tests, compilation, `doctor`, and an end-to-end prepare/build/validate fixture.

## Implementation rules

Follow the coding style and runtime section in [DS.md](DS.md). Use .mjs modules
and Node.js built-ins; document bundled dependency exceptions in dependencies.md.
Run `node --test tests/*.test.mjs`, syntax checks and `scripts/humanisehtml doctor`.
