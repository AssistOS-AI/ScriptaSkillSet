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

## Node.js runtime

Requires Node.js 22 or newer. The POSIX launcher runs on macOS and Linux:

```sh
scripts/humanisehtml doctor
node --test tests/*.test.mjs
```

The skill includes its HTML parser. Language tags are normalized with Node.js Intl.Locale.
[dependencies.md](dependencies.md) records versions, licenses and update steps.
Startup checks the runtime and bundled resources before creating job files.

Language is read from `<html lang>` unless `--language` is supplied. Tags use
hyphenated BCP 47 syntax and are normalized by Node.js `Intl.Locale`.
