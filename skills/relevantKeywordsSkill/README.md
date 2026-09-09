# Relevant Keywords Skill

Extracts fundamental multilingual keywords from semantic HTML books. It combines Unicode-safe statistics, stopwords, optional lemmatization and synonym dictionaries, and a locally cached multilingual embedding model.

## Setup

Install `uv`, then run:

```sh
scripts/relevantkeywords install
scripts/relevantkeywords doctor
```

`install` downloads a pinned INT8 ONNX graph for `intfloat/multilingual-e5-small` (about 118 MB) and its SentencePiece vocabulary (about 5 MB) into `.models/`. It uses the Python standard library rather than Hugging Face Hub and creates no external model cache. Analysis never downloads a model implicitly and works offline after setup.

## Usage

```sh
scripts/relevantkeywords analyze /path/to/index.html
scripts/relevantkeywords analyze /path/to/index.html --count 10 --language ro
scripts/relevantkeywords analyze /path/to/index.html --synonyms custom-synonyms.json
```

The command creates only `relevantKeywords.txt`, beside the input HTML, with one comma-separated keyword list. The source HTML is not modified.

## Runtime footprint and systems

The minimal runtime uses Beautiful Soup, NumPy, ONNX Runtime CPU, `regex`, SentencePiece, Simplemma, and `stopwordsiso`. It does not install PyTorch, Transformers, Hugging Face Hub, SciPy, scikit-learn, `wordfreq`, CUDA, or other GPU packages.

On the tested Apple ARM environment, the isolated environment is about 132 MB, the pinned model files about 118 MB, and the managed Python about 56 MB. Linux sizes vary by wheel. Supported native Linux targets are 64-bit `x86_64` and `aarch64` distributions with glibc 2.28 or newer. Alpine/musl, 32-bit Linux, and older glibc releases are not supported by the pinned ONNX Runtime wheel.

The model revision and SHA-256 checksums are pinned. Installation requires HTTPS access to Hugging Face once; analysis is offline.
ONNX Runtime telemetry is disabled before the runtime is imported.

## Language behavior

Language precedence is `--language`, HTML `lang`, lightweight script/stopword detection, then `und`. No Lingua package is installed. Stopword filtering uses `stopwordsiso`; Simplemma supplies dictionary lemmatization where available; deterministic frequency, dispersion, and boilerplate filters suppress low-information terms. Other languages retain Unicode tokenization and semantic ranking, and the report records the fallback.
