# Repository guidance

This skill is provider-, host-, and model-independent. The active LLM performs editorial judgment; deterministic code only extracts, protects, batches, restores, and validates content.

Preserve source files by default. Preserve DOM topology, inline markup, scripts, styles, identifiers, classes, data attributes, links, resource references, citations, numbers, dates, and factual claims. Only `--in-place` authorizes replacing the source, and the job snapshot remains the validation and recovery source.

Keep persistent documentation, schemas, code, tests, and comments in English. Do not add compatibility branches or schema version fields. There is one current job contract.

Use `scripts/humanisehtml` as the normal runtime. Keep jobs beside the source in `.humanisehtml-jobs/` unless the caller explicitly selects another workspace path. Do not create per-batch approval steps or ask the user intermediate questions. If the host requires permission, obtain one combined approval before the end-to-end run.

When changing behavior, update `SKILL.md`, `README.md`, `DS.md`, `references/job-format.md`, descriptors, tests, and the dependency lock where relevant. Run tests, compilation, `doctor`, and an end-to-end prepare/build/validate fixture.
