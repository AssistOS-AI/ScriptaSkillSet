# translateHtmlSkill

`translateHtmlSkill` lets the active LLM translate a complete semantic HTML document while deterministic Node.js tooling protects markup and validates the result. It is independent of the host and translation provider, and requires no separate API key.

## What it preserves

- element order and semantic block counts;
- headings, paragraphs, lists, tables, captions, and inline emphasis;
- scripts, CSS, reader integration, IDs, classes, styles, and data attributes;
- external links and internal anchors;
- source assets through relative references rather than copies.

Visible text, document metadata, alternative text, and accessibility labels are translated. Program text and content explicitly marked `translate="no"` are not.

## Runtime

Requires Node.js 22 or newer on macOS or Linux. The launcher checks the runtime and bundled resources:

```bash
scripts/translatehtml doctor
```

## Typical workflow

```bash
scripts/translatehtml prepare /books/example/en/index.html --to ro
```

The active LLM reads the returned job, translates and reviews the bootstrap, then translates the remaining approximately 32,000-character batches in parallel before running:

```bash
scripts/translatehtml build /tmp/translatehtml-job-...
```

The translation request authorizes this complete workflow. The skill preflights required
permissions and, only when the host requires elevated access, requests one combined
approval before starting. It never requests another approval or pauses between batches,
before build, or before validation. Progress messages are declarative and never ask the
user to continue.

Jobs use deterministic resumable paths under the document's local
`.translatehtml-jobs/` directory by default, avoiding per-batch external-path permission
prompts. Translation memory removes exact duplicate work and expands repetitive numbered
accessibility labels automatically. An interrupted run exposes every currently ready batch:

```bash
scripts/translatehtml status /books/example/.translatehtml-jobs/...
```

After the bootstrap is reviewed, `status` returns `readyBatches` and
`recommendedParallelBatches`, allowing distinct workers to write distinct translation
files safely. Workers use the reviewed shared context.

For a source under `en/`, the default output is the same filename under `ro/`. References such as `assets/styles.css` are rewritten to `../en/assets/styles.css`; no asset is duplicated.

An existing translation can be checked independently:

```bash
scripts/translatehtml validate /books/example/en/index.html \
  --html /books/example/ro/index.html --to ro
```

The validator combines exact structural invariants with fast unchanged-content, source n-gram overlap, duplicate, resource, length, and Unicode-script heuristics. It does not load a statistical language detector. These checks cannot prove semantic equivalence, so the first two narrative pages receive a separate model review before later batches are translated.

## Development

```bash
node --test tests/*.test.mjs
```

[dependencies.md](dependencies.md) records bundled parser and language-data versions,
licenses and update steps.

Language tags use hyphenated BCP 47 syntax and are normalized by Node.js
`Intl.Locale`. The source language comes from HTML unless explicitly overridden.
