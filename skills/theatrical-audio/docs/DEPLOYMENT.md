# Deployment and offline operation

## Standard deployment

Extract the folder. Cloud rendering needs Node >=22 and one provider's credentials. There are no npm dependencies, SDK install, daemon, port, container or FFmpeg requirement. `setup openai` merely selects a default backend. Cloud **rendering** still uses the provider's HTTPS API; serverless locally does not mean offline remotely.

For local neural rendering, install Python 3.12 and run the explicit setup in `CONFIGURATION.md`. Dependencies and weights live under `runtime/` and `models/`. Render never invokes the installer. Qwen has one model instance per job, so a scene with seven small clips does not reload weights seven times. Separate `say` invocations do reload the local process/model; prefer a multi-beat score for many lines.

The ZIP contains source and tests only, not model weights, a portable Python executable, PyTorch, a browser, credentials or a generated neural audio example. Creating a zero-install binary bundle would require a separate build for each OS/CPU/GPU target. A Python venv is not universally relocatable. The advertised artifact does not claim otherwise.

## Local package structure

```
runtime/qwen/              private Python venv, created by setup
runtime/qwen.json          local path/device/mode configuration
runtime/qwen.resolved.txt  pip freeze from actual installation
models/qwen-custom/        model snapshot, when downloaded here
models/qwen-design/        optional separate design snapshot
runtime/kokoro/            alternative private venv
models/kokoro/             ONNX model and voice data
.theatrical-audio/cache/speech/  dry WAVs and metadata in the receiving project
```

The setup pins top-level `qwen-tts==0.1.1` / `kokoro-onnx==0.6.1`, resolves transitive dependencies on the target, and saves a full freeze. Qwen download resolves and records a Hub revision. For repeatable initial preparation, pass an immutable `--revision`. No known-good cross-platform transitive dependency lock is claimed before a real target installation. Model trees are hashed during backend initialization for cache identity.

## Explicit GPU configuration

```bash
python3.12 tools/bootstrap.py --engine qwen --device cuda:0 --download
```

Use `--torch-index` to select an official PyTorch wheel channel compatible with the actual driver/runtime. No universal CUDA build is guessed. CPU preparation uses the CPU wheel index on Linux/Windows and normal wheels on macOS. `mps` is an experimental configuration path, not a measured/tested target. A driver remains a system prerequisite; a small model's parameter count is not its complete VRAM requirement. This sandbox did not benchmark CPU/GPU inference.

## Reconstructing an air-gapped environment

Prepare **on a connected machine matching target OS, architecture and Python version**:

```bash
python3.12 tools/bootstrap.py --engine qwen --device cpu --download --prepare-wheelhouse /path/to/wheelhouse
```

Preserve the skill sources, `models/qwen-custom`, `runtime/qwen.resolved.txt`, the model revision information and the complete wheelhouse. On the offline target, with Node/Python already available:

```bash
python3.12 tools/bootstrap.py --engine qwen --device cpu --wheelhouse /path/to/wheelhouse --lock /path/to/qwen.resolved.txt --models-dir /path/to/qwen-custom
node bin/audio.mjs render examples/minimal.score.json --engine qwen --offline --out output/offline-scene
```

Wheelhouse reconstruction uses `--no-index`; do not combine it with `--download`. Preparing a wheelhouse can fail if a dependency lacks an appropriate wheel. Resolve that on the connected target-compatible builder, not by pretending the archive is universally portable. This workflow is implemented but was not exercised against real dependency downloads in the sandbox.

The worker sets offline model-loader flags and blocks ordinary Python socket connection calls to catch accidental downloads. This is a defensive development guard, **not** a network-isolation security boundary; use OS/container egress controls for a genuine air gap. The skill's local renderer itself does not request services.

## Sharing and operations

Use one output directory per active render; a lock prevents conflicting writes to that output. There is no process-wide provider quota coordinator and no shared GPU worker. Concurrent renders may duplicate the same cache miss; the application does not promise distributed cache locking. Use a single job queue externally when needed. Cache writes and outputs are local; never embed API keys in distributable HTML or scores.

Cached provider audio can be distributed independently of credentials subject to the provider's terms and voice rights. Source-code MIT licensing does not override model, voice or third-party asset licenses. The skill does not download an external ambience/SFX library. See `THIRD_PARTY_NOTICES.md`.


## Expanded cloud deployment

All 13 cloud adapters use built-in Node fetch/crypto and local WAV code. No SDK, server, worker deployment, ffmpeg or browser installation is needed. Configure only the selected provider's keys; unused backends remain inert. Hume/Gemini are the minimal one-key instruction-based free-tier candidates. Free versus trial eligibility and costs are in FREE_PROVIDERS.md. `web/browser-audition.html` is an optional local listening page, not a synthesis/export dependency.
