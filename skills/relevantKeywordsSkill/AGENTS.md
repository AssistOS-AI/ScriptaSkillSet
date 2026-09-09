# Repository guidance

Keep this skill provider-independent and deterministic for a fixed HTML document, configuration, dependency set, and embedding model. Do not call an LLM or a remote keyword service during analysis.

Use `scripts/relevantkeywords` as the normal entrypoint. The pinned INT8 ONNX model must be installed explicitly with `scripts/relevantkeywords install`; ordinary analysis must never trigger an implicit network download. Do not add PyTorch, Sentence Transformers, Transformers, tokenizers, Hugging Face Hub, SciPy, scikit-learn, or GPU runtime dependencies.

Preserve the source HTML byte-for-byte. Analysis writes only `relevantKeywords.txt` beside the source, using an atomic replacement. Do not create backups, JSON reports, Markdown reports, or HTML metadata.

Keep documentation, schemas, code, tests, and comments in English. When behavior changes, update `SKILL.md`, `README.md`, `DS.md`, `skill.json`, tests, and the dependency lock as applicable. Run tests, compilation, `doctor`, and an end-to-end fixture before delivery.
