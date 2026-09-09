# Design specification

## Purpose

Extract a compact, auditable set of fundamental keywords from a semantic HTML book without changing its visible content. The implementation combines deterministic document statistics with multilingual semantic embeddings and optional language-specific synonym dictionaries.

## Pipeline

1. Parse the HTML and select `main[data-reader-content]`, `main`, `article`, or `body`, in that order.
2. Remove non-prose navigation, scripts, styles, tables of contents, bibliographies, references, and hidden content from the analysis copy.
3. Resolve the language from an explicit BCP 47 value, the document `lang` attribute, lightweight script/stopword evidence, or `und`. Lingua is not a dependency.
4. Tokenize Unicode text, filter stopwords, apply Simplemma when its language data is available, and create one-to-three-token candidates. For unsegmented CJK text, create short character candidates.
5. Rank candidates by frequency, document dispersion, heading evidence, and similarity to representative content chunks encoded by the quantized ONNX model.
6. Merge inflections, configured aliases, and high-similarity candidates. Select diverse representatives until the requested count is reached.
7. Atomically write only `relevantKeywords.txt` beside the source HTML as one comma-separated line.

## Safety properties

- The model is fixed by default and must already exist in the skill-owned model directory.
- Installation downloads only a pinned INT8 ONNX graph and SentencePiece vocabulary. It does not install PyTorch or create an external model cache.
- Analysis performs no network access.
- The source HTML is never modified.
- No backup or technical report files are created.
- Unsupported language resources degrade to Unicode normalization and semantic analysis, with an explicit warning.
