# Dependencies

## Required runtime

Node.js 22+ runs the CLI and Node tests. All modules, schema handling, WAV processing and cloud adapters are local. There are no npm dependencies, provider SDKs, external codecs, host-project imports or sibling-skill dependencies. CLI startup rejects older Node versions. A browser is needed only for listening to the generated standalone preview, not for creating it.

Drafting, validation and planning require no provider account, configuration file, Python installation or network. Speech generation requires either a selected cloud account with its credential variables or a prepared local model. Unused providers have no installation requirements.

## Optional cloud services

The adapters use Node fetch and crypto. Supported services, required variable names, model defaults and dated source links are recorded in the bundled `providers.json`, [docs/CONFIGURATION.md](docs/CONFIGURATION.md) and [docs/SOURCES.md](docs/SOURCES.md). No service SDK or model weight is redistributed. Service, voice and output terms are separate from this package's [LICENSE](LICENSE); see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Credentials may come from process environment variables. `--credentials-file`, `--workspace-root` and `--settings` are optional. Missing required credentials fail locally before synthesis. `doctor` checks configuration, not live entitlement. Updating a provider contract requires checking its official API documentation and exercising the adapter's mock tests; those tests do not establish live account compatibility.

## Optional local neural speech

Python is retained because the supplied Qwen and Kokoro adapters use Python inference libraries. A dependency-free Node replacement would require a different inference implementation and model qualification; this portability update does not attempt that migration.

| Component | Version and location | Preparation and limits |
|---|---|---|
| Python | Bootstrap accepts 3.10 through 3.13; 3.12 is recommended by the existing runtime guide. | The host provides Python. Explicit `setup` creates a private venv in `runtime/<engine>/`. |
| Qwen adapter | `qwen-tts==0.1.1` in `runtime/qwen.requirements.txt`. | Uses PyTorch, Transformers and resolved transitive packages. Explicit setup records `runtime/qwen.resolved.txt`. |
| Kokoro adapter | `kokoro-onnx==0.6.1` in `runtime/kokoro.requirements.txt`. | Uses ONNX Runtime and its resolved dependencies, including private phonemization support. Setup records `runtime/kokoro.resolved.txt`. |
| Models | Qwen CustomVoice/VoiceDesign snapshot, or Kokoro ONNX and voice files selected by `tools/bootstrap.py`. | Download only through explicit setup, or use existing local files. Qwen's resolved revision is recorded. Model content is hashed before inference. |
| GPU support | Optional platform-specific PyTorch/driver combination. | CPU is supported by the setup path. No universal GPU version or driver installation is implied. |

Run the explicit local setup described in [docs/LOCAL_AND_ESTABLISHED_ENGINES.md](docs/LOCAL_AND_ESTABLISHED_ENGINES.md). Missing runtime configuration or interpreter produces a diagnostic. Rendering never installs packages or downloads models. A venv is platform and path dependent; recreate it on a new machine using the recorded lock and matching wheelhouse instead of copying it as a portable executable. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

The supplied source has top-level pins but no pre-resolved transitive lock or bundled package/model notices. Exact licenses, transitive versions and redistribution obligations for a future downloaded environment are therefore not established by this source snapshot. Retain the actual package notices and model cards when preparing or packaging it. Do not describe model installation as dependency-free. Upstream locations used by bootstrap are [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS), [Qwen models](https://huggingface.co/Qwen), [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) and [PyTorch](https://pytorch.org/). Updating pins requires rebuilding the private environment, recording its resolved versions and testing real inference.

## Optional development tools

Node tests use built-ins and mocked responses only. Python standard-library backend tests exercise local adapter logic without installing neural models. Browser smoke scripts additionally require Playwright and Chromium; they accept `CHROMIUM_PATH`. Those optional browser dependencies are not pinned or installed by this skill. Their absence does not prevent audio generation or preview export.

Run `npm test` from this folder. The suite includes a copied-folder check from a different working directory, with no settings, credentials or sibling skill, and verifies that outputs and cache do not modify the installed skill.
