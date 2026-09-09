# Repository guidance

This skill is provider-, host-, and model-independent. The active LLM performs thematic analysis, drafting, and semantic revelation review. Deterministic code extracts source evidence, controls exact job schemas, validates sentence count and traceability, renders the HTML, and protects source immutability.

Accept `.html` and `.htm` only. Preserve the source byte-for-byte. Output must describe theme without disclosing nonfiction answers, solutions, conclusions, recommendations, or fiction twists and outcomes. Never add marketing claims or unsupported facts.

Use `scripts/shortdescription` as the normal entrypoint. Keep successful output limited to `shortDescription.html`; remove the hidden job after successful publication. Retain a failed job for repair. Persistent documentation, schemas, code, tests, and comments remain in English.

When behavior changes, update `SKILL.md`, `README.md`, `DS.md`, `references/job-format.md`, `skill.json`, tests, and the lockfile where relevant. Run tests, compilation, `doctor`, and end-to-end nonfiction and fiction fixtures.
