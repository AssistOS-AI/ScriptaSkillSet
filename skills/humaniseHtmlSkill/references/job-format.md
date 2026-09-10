# Job format

The job contract is intentionally unversioned. Consumers must follow this current schema exactly; no legacy variants are accepted.

## Layout

```text
.humanisehtml-jobs/<source>-<hash>/
  job.json
  source-original.html
  template.html
  bootstrap.json
  context.json
  context.sha256
  batches/batch-0001.json
  rewrites/batch-0001.json
  candidate.html
  report.json
```

`source-original.html` is the immutable validation and recovery snapshot. `template.html` contains temporary deterministic markers. All paths are inside the selected workspace by default.

## Context gate

Before processing batches, the active LLM fills in and freezes:

```json
{
  "profileReviewed": true,
  "documentProfile": "A compact description of voice, register, and editorial limits.",
  "preserveTerms": [],
  "avoidPatterns": [],
  "notes": ""
}
```

No batch becomes ready until `profileReviewed` is true and `documentProfile` is non-empty. The first subsequent `status` or `build` call writes `context.sha256`; later profile changes are rejected so every parallel batch uses the same frozen profile. Once ready, independent batches may be completed in any order, with at most four recommended concurrently.

## Batch input

Each batch provides `language`, chapter metadata, the frozen editorial rubric, and `units`. Each unit contains its `id`, `kind`, `chapterId`, `chapterTitle`, `policy` (`editable` or `verify-only`), tokenized `source`, plain text, placeholders, protections, and optional exact-memory `reuseOf`.

Inline elements use balanced `⟦OPEN:T000001⟧`, `⟦CLOSE:T000001⟧`, and `⟦VOID:T000001⟧` tokens. URLs, email addresses, DOI values, citations, numbers, and dates use `⟦PROTECT:P000001⟧` tokens. Preserve every token exactly once and preserve nesting.

## Rewrite output

Write the result for `batches/batch-0001.json` to `rewrites/batch-0001.json`:

```json
{
  "units": [
    {
      "id": "u000001",
      "action": "keep",
      "text": "Tokenized source or conservative rewrite",
      "audit": {
        "meaningPreserved": true,
        "factsPreserved": true,
        "natural": true,
        "noSlop": true,
        "notes": ""
      }
    }
  ]
}
```

Return every unit that does not declare `reuseOf`, exactly once. All four booleans are mandatory and true. `keep` requires text identical to the tokenized source. A `verify-only` unit only permits `keep`. Exact-memory units are expanded deterministically from their canonical result.

Targeted retry is appropriate only for a rejected batch or unit: missing/duplicate IDs, malformed JSON, empty text, invalid action/audit, lost protections, changed placeholders, or broken structure. Do not request user confirmation between batches.

## Runtime

The Node.js implementation uses the command arguments and JSON shapes documented
here. Reference fixtures in tests/fixtures verify preparation, state transitions
and generated artifacts.

Language is read from `<html lang>` unless `--language` is supplied. Tags use
hyphenated BCP 47 syntax and are normalized by Node.js `Intl.Locale`.
