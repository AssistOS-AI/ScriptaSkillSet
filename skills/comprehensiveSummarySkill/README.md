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
