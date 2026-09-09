---
name: relevantKeywords
description: Analyze a semantic HTML document or book, remove stopwords and low-information terms, consolidate inflections, aliases, and semantically similar phrases, and write a configurable set of fundamental multilingual keywords to relevantKeywords.txt. Use when keywords, keyphrases, word statistics, or topic terms are requested.
---

# Relevant Keywords

Use this skill to derive document-level fundamental keywords from an HTML book. It supports Unicode input in any language on a best-effort basis. Language-specific stopwords and lemmatization improve supported languages; multilingual embeddings provide the fallback and semantic consolidation.

## Required workflow

1. Run `scripts/relevantkeywords doctor`.
2. If the doctor reports a missing model, run `scripts/relevantkeywords install`. This is the only workflow step allowed to download model files.
3. Run `scripts/relevantkeywords analyze INPUT`. The default is 20 keywords.
4. Confirm that `relevantKeywords.txt` was written beside the source HTML as one comma-separated line.

Useful options:

- `--count N` changes the requested keyword count.
- `--language BCP47` overrides document language metadata; `auto` is the default.
- `--synonyms PATH` adds or overrides synonym groups using the format in `references/synonyms-format.md`.

## Interpretation rules

- Treat the JSON score as a ranking aid, not as a linguistic probability.
- Report fewer than the requested keywords when the document lacks enough defensible candidates.
- Do not describe `und` or low-confidence detection as full linguistic support.
- The only generated file is `relevantKeywords.txt`, beside the source HTML, containing only comma-separated keywords.
- The source HTML is never modified.
- The skill computes one global result for the document, not per-chapter results.

## Completion standard

Deliver only after `relevantKeywords.txt` is valid and the source HTML is unchanged. Never claim equal quality across languages. Semantic similarity can merge related rather than strictly synonymous concepts.
