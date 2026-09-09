# Synonym dictionary format

The dictionary is UTF-8 JSON. It may target one language or remain language-neutral:

```json
{
  "language": "en",
  "groups": [
    {
      "canonical": "artificial intelligence",
      "variants": ["AI", "machine intelligence"]
    }
  ]
}
```

`language` is optional. When present, the group is used only when the resolved document language has the same primary BCP 47 subtag. Matching is Unicode case-insensitive and occurs after whitespace normalization. A variant may occur in only one group. Invalid and overlapping groups are rejected rather than applied ambiguously.

