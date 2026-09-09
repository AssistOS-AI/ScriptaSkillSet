# shortDescriptionSkill

Creates a neutral 4–6 sentence thematic description from marketingSummary, comprehensiveSummary, or other semantic HTML, without revealing answers, solutions, conclusions, recommendations, or spoilers.

```sh
scripts/shortdescription doctor
scripts/shortdescription prepare /path/to/index.html
scripts/shortdescription status /path/to/.shortdescription-jobs/index-.../
scripts/shortdescription build /path/to/.shortdescription-jobs/index-.../
scripts/shortdescription validate /path/to/index.html --html /path/to/shortDescription.html
```

The output is a standalone `shortDescription.html` with one paragraph of 4–6 sentences in the source language. The source remains unchanged. Successful builds remove their intermediate job directory.

## Node.js runtime

Requires Node.js 22 or newer. Use ECMAScript modules in .mjs files, explicit
relative imports, node: built-ins, async/await and node --test. Keep all owned
resources inside this skill. Document necessary dependency exceptions in
[dependencies.md](dependencies.md). Check prerequisites before outputs are created.
Never install dependencies during startup.

Node.js runs the skill and its tests. The HTML parser is bundled.
Run `node --test tests/equivalence.test.mjs`. Frozen JSON fixtures preserve
the original outputs; see tests/fixtures/README.md for provenance.

## Equivalence checks

Run `node --test tests/equivalence.test.mjs`. Acceptance requires zero skipped
tests. Comparisons use frozen expectations.

The compared fixtures preserve prepared JSON, job states, generated HTML bytes,
validation reports and source immutability. Doctor reports Node.js and htmlparser2
versions. Parser equivalence on
every malformed HTML document is not established by this finite fixture set.
