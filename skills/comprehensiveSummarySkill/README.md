# comprehensiveSummarySkill

`comprehensiveSummarySkill` turns a book-length semantic HTML document into a source-traceable, unified summary essay sized by reading time. It analyzes every content chapter, ranks ideas by centrality, recurrence, and originality, and uses the active LLM for language-sensitive judgment without depending on a particular provider or model.

```sh
scripts/comprehensivesummary doctor
scripts/comprehensivesummary prepare /path/to/index.html --minutes 15
scripts/comprehensivesummary status /path/to/.comprehensivesummary-jobs/index-15min-.../
scripts/comprehensivesummary build /path/to/.comprehensivesummary-jobs/index-15min-.../
scripts/comprehensivesummary validate /path/to/index.html --html /path/to/index.summary-15min.html
```

The default reading rate is 200 words per minute and the accepted final range is ±10%. The main essay alone is measured; the collapsible source map is excluded. Word-count and reading-time metrics remain in the technical report and hidden metadata rather than appearing in the reader-facing page. Output stays in the source language, and the original HTML is never modified.

## Node.js runtime

Requires Node.js 22 or newer. The POSIX launcher runs on macOS and Linux:

```sh
scripts/comprehensivesummary doctor
node --test tests/*.test.mjs
```

The skill includes its HTML parser.
[dependencies.md](dependencies.md) records versions, licenses and update steps.
Startup checks the runtime and bundled resources before creating job files.

Language tags use hyphenated BCP 47 syntax and are normalized by Node.js
`Intl.Locale`. The source language comes from HTML unless explicitly overridden.
