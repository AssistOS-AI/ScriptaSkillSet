# Relevant keywords

Extract fundamental concepts from an HTML book through complete batch analysis by the active LLM. The skill publishes relevantKeywords.txt beside the source.

Requires Node.js >=22. Copy the complete skill directory, including external/html. See [SKILL.md](SKILL.md) for the analysis and consolidation JSON schemas.

```bash
scripts/relevantkeywords doctor
scripts/relevantkeywords analyze book.html --count 20
scripts/relevantkeywords status /path/to/job
scripts/relevantkeywords build /path/to/job
node --test tests/*.test.mjs
```

Language comes from HTML or --language. When neither is available, the agent sets context.json after reading the content. Optional --synonyms accepts the [synonym dictionary](references/synonyms-format.md). [Dependencies](dependencies.md) are bundled locally.
