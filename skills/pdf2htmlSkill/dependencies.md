# Dependencies

Node.js 22 or later runs the skill's ECMAScript modules and built-in test runner. Verified hosts use Node.js 24.9.0 on macOS arm64 and 24.19.0 on Linux arm64. Setup and startup checks are documented in [references/dependencies.md](references/dependencies.md).

## Conversion and validation packages

| Dependency | Version | Purpose | License | Local location |
| --- | --- | --- | --- | --- |
| PDF.js | 5.4.624 | Source glyphs, typography, drawings and annotations | Apache-2.0 | `external/runtime/node_modules/pdfjs-dist/` |
| Cheerio | 1.0.0-rc.12 | Parse and edit semantic HTML | MIT | `external/runtime/node_modules/cheerio/` |
| Playwright Core | 1.62.0 | Chromium layout, image decoding and reader tests | Apache-2.0 | `external/runtime/node_modules/playwright-core/` |
| pngjs | 7.0.0 | PNG crops and diagnostic renders | MIT | `external/runtime/node_modules/pngjs/` |
| @napi-rs/canvas | 0.1.100 | PDF.js DOMMatrix and path primitives | MIT; bundled Skia components retain their notices | `external/runtime/node_modules/@napi-rs/` |

The exact npm closure, platform variants, source archives, integrity values and declared licenses are listed in [external/runtime/dependencies.json](external/runtime/dependencies.json) and pinned by its adjacent package lock. DOM parsing includes htmlparser2, domhandler, domutils, domelementtype, dom-serializer, entities, css-select, css-what, boolbase, nth-check, cheerio-select and parse5 components. Other optional PDF.js packages are recorded in the same inventory. Installed packages retain their LICENSE and NOTICE files.

These dependencies implement specialized PDF parsing, DOM manipulation, raster decoding and browser rendering required by the approved conversion behavior. Node built-ins cannot provide these operations; regular-expression replacements cannot preserve an HTML tree or PDF graphics state safely. The accepted scope is this skill. Conversion imports are relative to its directory.

Upstream sources and update locations are [PDF.js](https://github.com/mozilla/pdf.js), [Cheerio](https://github.com/cheeriojs/cheerio), [Playwright](https://github.com/microsoft/playwright), [pngjs](https://github.com/pngjs/pngjs) and [canvas](https://github.com/Brooooooklyn/canvas). Update explicit package versions and the lock together, regenerate the inventory, retain licenses, and repeat all tests. The installer downloads the pinned upstream npm packages. Canvas is a direct dependency because PDF.js uses its geometry primitives. Its platform-specific native package is selected by npm.

## Native structural engine

Docling.rs 1.32.0 supplies semantic region classification, reading order, table recognition and picture regions. Its MIT source snapshot is in `external/docling-source/`; native addons are in `external/native/<platform>-<arch>/docling.node`. The snapshot retains workspace source, Cargo manifests and Cargo.lock. Upstream test corpora, unrelated bindings and development-only scripts are excluded. The private binding invokes only the PDF pipeline. The Rust image crate enables PNG and JPEG; PDFium handles embedded PDF image formats. Local changes are recorded in `external/docling-source/MODIFICATIONS.md`.

The macOS arm64 addon was built with Rust 1.90.0. The Linux arm64 addon is built locally with Rust 1.98.0, cargo-zigbuild 0.23.4 and Zig 0.15.2, targeting glibc 2.28. [Docling.rs](https://github.com/docling-project/docling.rs/tree/v1.32.0) and its release/npm package are the update sources. Binary byte counts and SHA-256 values are in `external/native/integrity.json`. Rebuild with `scripts/build-native.mjs`; Rust 1.88+, Cargo, registry/build dependencies and a C/C++ linker are build prerequisites. Linux builds additionally require cargo-zigbuild and Zig to retain the glibc 2.28 target. These tools are used only for development.

[external/native/dependencies.json](external/native/dependencies.json) records the 190 resolved native/build packages with versions, licenses, source URLs and local notices. Their dependency graph is pinned in Cargo.lock. This includes ONNX Runtime through `ort`/`ort-sys` 2.0.0-rc.13, image/resampling code, PDFium bindings and N-API bindings. The addon links ONNX Runtime and Rust dependencies into the binary. Operating-system libraries remain supplied by the platform.

Native crate licenses permit commercial use, modification and redistribution with their stated obligations. The active crate graph uses permissive licenses. The linked ONNX Runtime 1.28.0 additionally includes Eigen under MPL-2.0. ONNX Runtime's MIT license and complete third-party notices are in `external/native/licenses/onnxruntime-1.28.0/`; matching Eigen source is in `external/native/sources/eigen-1d8b82b.zip`. Preserve the archive and make modifications to MPL-covered files available under MPL. Rust standard-library and Zig/LLVM runtime notices are retained alongside the crate notices.

## Models and PDFium

The CPU FP32 layout model and accurate TableFormer encoder, decoder, bounding-box graph and external data files occupy approximately 516 MB. They are installed into `external/native/models/` using the exact download URLs, sizes and SHA-256 hashes in `integrity.json`. The hashes were checked against the upstream release asset digests. Setup refuses changed bytes. Startup verifies every required graph and sidecar before conversion, and the native worker checks detected table inference success.

The layout model is [docling-layout-heron](https://huggingface.co/docling-project/docling-layout-heron), Apache-2.0. TableFormer originates in [docling-models](https://huggingface.co/docling-project/docling-models), with CDLA-Permissive-2.0 model data and Apache-2.0 code. The ONNX exports are published in the [Docling.rs models-v1 release](https://github.com/docling-project/docling.rs/releases/tag/models-v1). Model license texts and attribution are provided by the linked upstream model repositories. Models are downloaded on the recipient machine. They are format conversions of upstream weights, not locally trained models.

PDFium 155.0.8044.0 renders the native engine's page inputs. Bundled macOS/Linux arm64 libraries, version files, headers, BSD license and component notices are in their respective native platform directories. Source and binary updates come from [PDFium](https://pdfium.googlesource.com/pdfium/) and [pdfium-binaries](https://github.com/bblanchon/pdfium-binaries/releases/tag/chromium/8044). Retain the distribution's `LICENSE` and `licenses/` directory. The addon dynamically loads the skill-local library.

Layout/table inference remains necessary for the approved semantic output. Plain text extraction and page screenshots cannot replace these models while preserving tables, hierarchy and reading order. Replacing the engine or models requires equivalent source, structure, asset and browser tests.

## System rendering tools and browser

Poppler supplies `pdfinfo` and `pdftoppm`; QPDF supplies JSON PDF objects and decoded embedded font streams. Working system installations can be reused. Otherwise setup installs Poppler 25.07.0 and QPDF 12.3.2 with their complete conda-forge dependency closure into `external/tools/<platform>/`. These local binaries take precedence over PATH. The platform manifests in `external/tool-packages/` pin every package URL, build, version, byte count, SHA-256, MD5, dependencies and license. The macOS archive closure is about 43 MB; Linux is about 57 MB. Installed size is larger.

Micromamba 2.3.3 installs the verified local archives using an explicit specification, without resolving new versions or changing global environments. Its archive hash and URL are pinned alongside the packages; the installer package includes license texts, extracted alongside the executable to `.cache/tool-packages/<platform>/bootstrap/info/licenses/` during installation. It is used only for setup and is cached under `.cache/tool-packages/`. This specialized installer was accepted for the user-authorized local first-run installation: raw archive extraction does not perform required binary-prefix relocation, and OS package managers would require global changes. On macOS, setup applies local ad-hoc signatures to relocated Mach-O files with the system `codesign` tool.

Sources and updates: [micromamba](https://github.com/mamba-org/mamba), [Poppler packaging](https://github.com/conda-forge/poppler-feedstock), [QPDF packaging](https://github.com/conda-forge/qpdf-feedstock). Regenerate both explicit platform manifests with the pinned installer, review all versions and licenses, and test installation and conversion on both platforms before accepting an update. Poppler packages declare GPL-2.0-only; QPDF declares Apache-2.0. The closure also contains LGPL, MPL, font and permissive licenses, recorded per package. Downloaded archives retain `info/licenses` and package recipes/source references in the local package cache. The skill distributes the two installation manifests; recipients download the tool binaries during setup.

Playwright's managed Chromium 151.0.7922.34 provides the verified macOS browser runtime under `external/browser/`. Chromium uses BSD-style licensing and third-party component licenses included in its distribution. Its notices remain in the downloaded browser package. Fedora Chromium 152.0.7977.82 also passed integration tests. A detected or explicitly configured distribution Chromium is supported and its actual version is recorded in `doctor` and validation reports. Static inspection cannot replace browser layout, image decoding or real reader-button checks.

## Installation, updates and removal

`convert` and `validate` invoke setup automatically. `scripts/setup.mjs` also supports advance provisioning. `scripts/pdf2html doctor` reports availability, versions and integrity failures. Missing components are installed locally before conversion modules load; installation failures stop before output publication. Distribute the skill checkout with its bundled components and manifests. Recipients install runtime dependencies through setup. Node.js/npm and operating-system browser libraries remain host prerequisites.

Update one dependency group at a time, record its exact version and license, rebuild the relevant inventories and integrity values, then run unit, integration and actual-reader checks. The PDF binding omits audio, remote VLM, document-format dispatch and chunking. Image codecs used only for standalone image inputs are disabled. Further reductions require checking the remaining PDF pipeline call paths and repeating equivalence tests.

## Skill distribution

See [LICENSES.md](LICENSES.md) for notices and sources accompanying components bundled with the skill. `external/tool-packages/` contains the two platform manifests used to install tools on the recipient machine.
