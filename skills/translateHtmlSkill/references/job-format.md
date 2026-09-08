# Translation job format

`prepare` creates a deterministic local directory under `.translatehtml-jobs/` and prints
its path. The directory remains inside the document workspace so batch writes do not
trigger external-path permission prompts. It contains:

- `job.json`: immutable paths, languages, source hash, output policy, ordered batch names,
  32,000-character batching policy, translation-memory metrics, parallel limit, and
  structural baseline;
- `template.html`: a source snapshot with temporary unit locators;
- `bootstrap.json`: the document outline, representative source samples, and IDs from the first two narrative pages;
- `context.json`: a template the active LLM must complete before translating non-bootstrap batches;
- `batches/batch-NNNN.json`: ordered translation units with protected markup tokens;
- `translations/batch-NNNN.json`: files written by the active LLM workflow with the exact batch and unit IDs.

Every model-translated unit has this form:

```json
{"id": "u000001", "translation": "Text with unchanged ⟦OPEN:T0001⟧markup⟦CLOSE:T0001⟧."}
```

The translation must contain the exact placeholder multiset from `source`. `build` rejects missing, duplicated, unknown, or improperly nested placeholders.

Units carrying `reuseOf` or `reuseTemplateOf` are omitted from translation output. The
former reuses an exact, markup-aware canonical translation. The latter reuses a canonical
human-facing numeric label and replaces its preserved number deterministically. `build`
resolves both forms before validation.

The bootstrap batch is the only ready batch initially. Once it is translated and
`context.json` is reviewed, `status` exposes all incomplete batches in `readyBatches` and
caps simultaneous work with `recommendedParallelBatches`. Parallel workers read the same
frozen context and each writes only its assigned `translations/batch-NNNN.json`.

`context.json` must set `bootstrapReviewed` to `true` and contain a concise `documentProfile` plus a `glossary` array before `build` can publish.
