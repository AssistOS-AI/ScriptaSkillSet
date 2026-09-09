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
