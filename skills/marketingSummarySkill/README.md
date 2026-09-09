# marketingSummarySkill

`marketingSummarySkill` converts a comprehensive summary or another semantic HTML document into a concise editorial sales page. It explains the book's questions and stakes while explicitly withholding nonfiction answers and fiction spoilers.

```sh
scripts/marketingsummary doctor
scripts/marketingsummary prepare /path/to/book.html
scripts/marketingsummary status /path/to/.marketingsummary-jobs/book-.../
scripts/marketingsummary build /path/to/.marketingsummary-jobs/book-.../
scripts/marketingsummary validate /path/to/book.html --html /path/to/book.marketing.html
```

The active LLM performs chapter analysis, safe-hook selection, drafting, and a separate semantic spoiler review. Deterministic code enforces exact schemas, evidence links, adaptive length, factual tokens, immutable input, and output safety. The generated page never displays technical metrics, source maps, source-unit IDs, or spoiler-review data.
