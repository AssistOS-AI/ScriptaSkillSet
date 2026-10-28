# Third-party notices

Dependency versions, licenses and sources are recorded in [dependencies.md](dependencies.md), [native dependencies](external/native/dependencies.json), [npm dependencies](external/runtime/dependencies.json). Each component retains its own license.

The skill distribution includes its source, native engine, PDFium, dependency manifests. Other runtime packages, tools, models and the managed browser are installed on the recipient machine.

## License and source locations

- Docling source and license: `external/docling-source/`. Local changes: `external/docling-source/MODIFICATIONS.md`.
- Native dependency notices, including ONNX Runtime, Rust and Zig/LLVM runtimes: `external/native/licenses/`.
- PDFium license and component notices: `external/native/<platform>/LICENSE` and `licenses/`.
- Eigen source corresponding to ONNX Runtime: `external/native/sources/eigen-1d8b82b.zip`, revision `1d8b82b0740839c0de7f1242a3585e3390ff5f33`. Preserve this source and its MPL notices with the native engine.
- npm dependencies are downloaded from the registry on the recipient machine, with the files provided by their upstream packages.
- Micromamba includes its license and component notices in the downloaded installer package. Installation extracts them to `.cache/tool-packages/<platform>/bootstrap/info/licenses/`, alongside `bin/micromamba`.

This software uses the FreeType Project, https://freetype.org/. Its license and attribution are retained with the relevant components.

Retain license texts, copyright notices and applicable attribution when redistributing components. Supply corresponding source and modifications where their GPL, LGPL or MPL terms require it. Preserve LGPL library replacement or relinking rights. Font licenses retain their naming and attribution conditions.
