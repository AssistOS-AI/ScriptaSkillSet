# humaniseHtmlSkill

`humaniseHtmlSkill` is a self-contained workflow for conservatively editing large semantic HTML documents so their prose reads naturally while the HTML structure and factual content remain intact. It works with the active LLM, without assuming a particular provider or model.

The deterministic runtime extracts every human-facing text unit, groups work by chapter into batches of approximately 32,000 characters, protects inline markup and factual tokens, supports exact-match memory, validates one audited result per paragraph, and rebuilds the document atomically.

```sh
scripts/humanisehtml doctor
scripts/humanisehtml prepare /path/to/index.html
scripts/humanisehtml status /path/to/.humanisehtml-jobs/index-.../
scripts/humanisehtml build /path/to/.humanisehtml-jobs/index-.../
scripts/humanisehtml validate /path/to/index.html --html /path/to/index.humanised.html
```

The default output is beside the source as `index.humanised.html`. Use `--in-place` only when replacement of the source is explicitly intended. Job files remain in the source workspace, so the workflow does not need approval for each batch.

The skill improves editorial quality; it does not claim to conceal provenance or defeat automated detectors.
