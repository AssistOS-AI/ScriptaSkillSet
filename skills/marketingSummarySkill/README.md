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

## Node.js runtime

Requires Node.js 22 or newer. Use .mjs ECMAScript modules, explicit relative
imports, node: built-ins, async/await and node --test. Keep every owned resource
inside this skill. [dependencies.md](dependencies.md) records bundled parser and
language-data exceptions. Startup checks prerequisites and never installs them.

Run tests with Node.js:
`node --test tests/equivalence.test.mjs`. Frozen reference fixtures preserve
preparation, workflow states, exact HTML output and language normalization.
See tests/fixtures/README.md for provenance. Acceptance requires zero skipped tests.

Job JSON and command arguments are preserved. Doctor retains its behavioral
metadata and reports the Node.js and htmlparser2 versions.
