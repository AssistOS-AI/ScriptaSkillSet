# Runtime installation

Use Node.js 22+ with npm. Run the skill's `scripts/pdf2html convert` or `validate` command directly. Before loading conversion modules, the launcher checks the runtime and automatically prepares missing components in the skill directory. `doctor` is a read-only diagnostic command.

## Local preparation

Automatic installation supports macOS arm64 and Linux arm64 with glibc. The skill contains the native engine and PDFium binaries for those platforms. Setup restores JavaScript packages from `external/runtime/package-lock.json`, verifies and downloads pinned model assets, and installs Chromium when needed. Downloads require internet and write access to the skill directory. Completed installations are reused offline.

Poppler and QPDF are probed before conversion. Working system installations can be reused. If either is missing, setup installs pinned Poppler 25.07.0 and QPDF 12.3.2 packages and their library closure into `external/tools/<platform>/`. Local tools take precedence over PATH. No OS package manager or administrator privileges are used. Native engine binaries are shipped with the skill; startup does not compile Rust.

The tool package manifests in `external/tool-packages/` contain exact URLs, SHA-256 hashes and package metadata. Setup verifies each downloaded archive before passing an explicit local package list to Micromamba 2.3.3. The installer and archives remain under `.cache/tool-packages/`; macOS binaries receive ad-hoc signatures after relocation. `tar` is required to unpack the installer and macOS uses `/usr/bin/codesign`.

On Linux, an available `/usr/bin/chromium-browser` or `/usr/bin/chromium` can be reused. `PDF2HTML_CHROMIUM_EXECUTABLE` selects an explicit browser. `PLAYWRIGHT_BROWSERS_PATH` selects a managed browser directory; otherwise it is `external/browser/`. The runtime selects the browser and configures the managed directory before importing Playwright, including during package checks. Explicit browser settings take precedence. Chromium still needs the platform's operating-system libraries. The image owner supplies those libraries; setup reports launch failures rather than invoking privileged OS installation.

## Advance preparation and diagnostics

```sh
node /path/to/pdf2htmlSkill/scripts/setup.mjs
/path/to/pdf2htmlSkill/scripts/pdf2html doctor
```

Use advance preparation when building a container image or preparing offline use. Setup diagnostics go to stderr; conversion stdout retains its JSON contract. Explicit setup returns the final doctor JSON. Help and doctor do not install dependencies.

Concurrent installers serialize through `.cache/setup.lock` and recheck readiness after acquiring it. The lock is removed after success or a handled failure. If a process is forcibly killed, inspect `owner.json` and remove the stale lock only after confirming no installer is running. A lock timeout reports its path. A checksum or download failure stops the command before book publication. Valid downloaded files are reused on retry.

Models occupy approximately 516 MB. Downloaded tool archives are approximately 43 MB on macOS and 57 MB on Linux, plus the installer; installed files and Chromium need additional space. Models, browser, tools and caches are ignored by Git. Distribute the skill checkout with its bundled components and installation manifests. The first conversion prepares downloaded dependencies on the recipient machine. For offline execution, run setup on that machine in advance.

## Native engine builds

The engine is Docling.rs 1.32.0, with source and Cargo lock in `external/docling-source/`. The bundled macOS arm64 binary was built with Rust 1.90.0. The Linux arm64 binary is built with Rust 1.98.0, cargo-zigbuild 0.23.4 and Zig 0.15.2 for glibc 2.28.

Adding another platform is a development operation: build with Rust 1.88+, Cargo and a C/C++ linker; on Linux also provide cargo-zigbuild and Zig using `node scripts/build-native.mjs`, supply PDFium 155.0.8044.0 with its licenses, update native integrity and local tool manifests, then verify setup, doctor and integration tests. Unsupported platforms fail before downloads.

## Container integration

Adding the skill to a manifest requires no separate installation hook: its first conversion triggers preparation. The container must provide Node.js/npm, tar, a writable skill directory and Chromium's OS libraries or an operational browser. It can pre-run setup during provisioning to avoid first-request download time. This workflow does not change the application's manifest editor.

See [dependencies and licenses](../dependencies.md).
