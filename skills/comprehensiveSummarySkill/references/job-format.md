# Job format

The schema is exact and deliberately unversioned. No legacy shapes are accepted.

## Layout

```text
.comprehensivesummary-jobs/<source>-<minutes>min-<hash>/
  job.json
  context.json
  source-original.html
  chapters.json
  batches/batch-0001.json
  analyses/batch-0001.json
  synthesis.json
  draft.json
  candidate.html
  report.json
```

## Chapter analysis

For each `batches/<name>.json`, write `analyses/<name>.json`:

```json
{
  "batch": "batch-0001.json",
  "chapterId": "chapter-0001",
  "segment": 1,
  "thesis": "...",
  "role": "...",
  "ideas": [
    {
      "id": "batch-0001-idea-001",
      "statement": "...",
      "centrality": 0.8,
      "originality": 0.6,
      "recurrenceCandidate": "short semantic key",
      "sourceUnitIds": ["u000001"]
    }
  ],
  "evidenceAndExamples": [
    {"statement": "...", "sourceUnitIds": ["u000002"]}
  ],
  "objectionsAndQualifications": [
    {"statement": "...", "sourceUnitIds": ["u000003"]}
  ],
  "audit": {
    "chapterCovered": true,
    "meaningPreserved": true,
    "factsPreserved": true,
    "notes": ""
  }
}
```

IDs must belong to the assigned batch, scores are between 0 and 1, and all audit booleans are true. A split chapter produces one analysis per segment and is unified during synthesis.

## Cross-book synthesis

After all analyses are valid, write `synthesis.json`:

```json
{
  "centralMessage": "...",
  "clusters": [
    {
      "id": "cluster-001",
      "label": "...",
      "synthesis": "...",
      "centrality": 0.9,
      "recurrence": 0.7,
      "originality": 0.6,
      "score": 0.8,
      "selected": true,
      "chapterIds": ["chapter-0001"],
      "sourceUnitIds": ["u000001"],
      "ideaIds": ["batch-0001-idea-001"]
    }
  ],
  "outline": [
    {
      "id": "section-01",
      "title": "...",
      "purpose": "...",
      "budgetWords": 350,
      "clusterIds": ["cluster-001"]
    }
  ],
  "chapterCoverage": [
    {"chapterId": "chapter-0001", "clusterIds": ["cluster-001"]}
  ],
  "audit": {
    "allAnalysesUsed": true,
    "centralMessageCovered": true,
    "redundancyMerged": true,
    "notes": ""
  }
}
```

`score` equals `0.50 × centrality + 0.25 × recurrence + 0.25 × originality`, within rounding tolerance. Every content chapter appears once in `chapterCoverage`; an empty `clusterIds` list explicitly records an analyzed chapter omitted from a short final summary.

## Draft

Write `draft.json` only after synthesis passes:

```json
{
  "title": "...",
  "dek": "...",
  "sections": [
    {
      "id": "section-01",
      "heading": "...",
      "paragraphs": [
        {
          "text": "...",
          "clusterIds": ["cluster-001"],
          "sourceUnitIds": ["u000001"],
          "audit": {
            "meaningPreserved": true,
            "factsPreserved": true,
            "noUnsupportedClaim": true
          }
        }
      ]
    }
  ],
  "conclusion": [
    {
      "text": "...",
      "clusterIds": ["cluster-001"],
      "sourceUnitIds": ["u000001"],
      "audit": {
        "meaningPreserved": true,
        "factsPreserved": true,
        "noUnsupportedClaim": true
      }
    }
  ],
  "audit": {
    "sameLanguage": true,
    "centralMessagePreserved": true,
    "coherentEssay": true,
    "notes": ""
  }
}
```

Section IDs must match the synthesis outline. Every paragraph needs selected cluster IDs and valid source-unit IDs. All booleans are mandatory and true. Adjust the draft until its counted words fall within the range recorded in `job.json`.

The built HTML keeps word-budget and estimated-duration values in the validation report and hidden metadata only. It must not render those internal metrics as reader-facing content.

## Runtime

The Node.js implementation uses the command arguments and JSON shapes documented
here. Reference fixtures in tests/fixtures verify preparation, state transitions
and generated artifacts.

Language tags use hyphenated BCP 47 syntax and are normalized by Node.js
`Intl.Locale`. The source language comes from HTML unless explicitly overridden.
