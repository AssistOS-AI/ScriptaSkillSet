# Job format

The schema is exact and unversioned.

## Layout

```text
.shortdescription-jobs/<source>-<hash>/
  job.json
  context.json
  chapters.json
  source-original.html
  batches/batch-0001.json
  analyses/batch-0001.json
  draft.json
  review.json
  candidate.html
```

The whole directory is removed after a successful build.

## Batch analysis

Write one matching file under `analyses/` for every batch:

```json
{
  "batch": "batch-0001.json",
  "chapterId": "chapter-0001",
  "segment": 1,
  "modeSignals": ["nonfiction"],
  "themes": [
    {
      "id": "batch-0001-theme-001",
      "type": "subject",
      "statement": "The document examines ...",
      "sourceUnitIds": ["u000001"]
    }
  ],
  "protectedRevelations": [
    {
      "id": "batch-0001-revelation-001",
      "type": "solution",
      "statement": "The solution supplied by the source.",
      "guardTerms": ["distinctive solution phrase"],
      "sourceUnitIds": ["u000002"]
    }
  ],
  "audit": {
    "chapterCovered": true,
    "themeIdentified": true,
    "revelationsSeparated": true,
    "factsPreserved": true,
    "notes": ""
  }
}
```

`modeSignals` contains one or both of `fiction` and `nonfiction`. Theme types are `subject`, `scope`, `context`, `question`, `tension`, `premise`, `setting`, `character`, and `starting-conflict`. Revelation types are `answer`, `solution`, `conclusion`, `recommendation`, `verdict`, `twist`, `identity`, `resolution`, `outcome`, `fate`, and `ending`. Every guard phrase has at least three words. A batch needs at least one theme; its revelation list may be empty.

## Draft

After all analyses pass, write:

```json
{
  "mode": "nonfiction",
  "sentences": [
    {
      "index": 1,
      "text": "One complete thematic sentence.",
      "themeIds": ["batch-0001-theme-001"],
      "sourceUnitIds": ["u000001"]
    }
  ],
  "protectedRevelationIds": ["batch-0001-revelation-001"],
  "chapterCoverage": [
    {"chapterId": "chapter-0001", "themeIds": ["batch-0001-theme-001"]}
  ],
  "audit": {
    "sameLanguage": true,
    "themeOnly": true,
    "noSolutions": true,
    "noSpoilers": true,
    "neutralTone": true,
    "notes": ""
  }
}
```

Provide 4–6 sentences. Each `text` is exactly one grammatical sentence ending in `.`, `?`, or `!`. Every sentence cites valid themes and source units supported by those themes. Register every protected revelation exactly once. Every content chapter appears exactly once in `chapterCoverage`; an empty theme list records deliberate omission from the compact output.

## Independent semantic review

Read the complete draft and every protected revelation, then write:

```json
{
  "draftSha256": "<sha256 of draft.json bytes>",
  "sentences": [
    {
      "index": 1,
      "solutionRisk": false,
      "spoilerRisk": false,
      "matchedRevelationIds": [],
      "notes": ""
    }
  ],
  "passed": true,
  "solutionsWithheld": true,
  "conclusionsWithheld": true,
  "spoilersWithheld": true,
  "notes": ""
}
```

Review every draft sentence exactly once and in order. Any possible disclosure sets the applicable risk to true, lists matching revelation IDs, and makes `passed` false. Revise the draft and replace the stale review before building.

## Runtime compatibility

The Node.js implementation preserves this job contract. Frozen JSON fixtures preserve
the expected reference outputs.
