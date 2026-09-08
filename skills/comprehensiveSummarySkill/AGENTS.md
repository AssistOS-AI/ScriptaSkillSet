# Repository guidance

This skill is provider-, host-, and model-independent. The active LLM performs chapter analysis, semantic clustering, selection, and prose synthesis. Deterministic code extracts source evidence, controls budgets and workflow state, renders HTML, and validates traceability and factual tokens.

Accept complete semantic HTML only. Never translate, mutate the source, invent claims, or silently omit a source chapter from analysis. Copyright, contents pages, navigation, page labels, and unannotated bibliographies are classified as non-content and recorded rather than summarized.

Keep persistent documentation, schemas, code, tests, and comments in English. The job contract is unversioned and exact; do not add legacy schema branches. Use `scripts/comprehensivesummary` as the normal runtime and keep job artifacts in the source workspace by default.

The workflow runs end to end without per-batch questions. If the host requires permission, request one combined approval before work begins. After preparation, process up to four chapter batches in parallel, then complete synthesis, drafting, build, and independent validation.

When changing behavior, update `SKILL.md`, `README.md`, `DS.md`, `references/job-format.md`, `skill.json`, tests, and the lockfile where relevant. Run tests, compilation, `doctor`, and an end-to-end prepare/build/validate fixture.
