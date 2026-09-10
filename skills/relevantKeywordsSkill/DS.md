# Relevant keywords design

The CLI extracts visible prose from the semantic content root, removes navigation and reference sections, assigns stable unit IDs and groups text into batches of approximately 32,000 characters. Job identity combines the source path, source hash and extracted-unit hash with the requested count, language and synonym configuration.

The active LLM analyzes every batch, then consolidates concepts across the complete book. Analyses and final selection cite source unit IDs. Node checks review flags, source hashes, term shapes, citation membership and count bounds, applies explicit synonym groups and publishes the final text atomically.

Language uses the command option, then HTML lang, then agent-reviewed context. Semantic keyword equivalence remains a review responsibility. The output contract is a comma-separated UTF-8 text file and build JSON containing output, count and keywords.
