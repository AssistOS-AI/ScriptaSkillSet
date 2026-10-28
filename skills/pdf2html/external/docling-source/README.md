# PDF engine source

Docling.rs 1.32.0 provides the PDF layout and table pipeline used by pdf2htmlSkill. Upstream: https://github.com/docling-project/docling.rs/tree/v1.32.0. License: MIT, see LICENSE.

This workspace contains docling-core, docling-onnx, docling-pdf and the skill's private docling-node binding. The binding exports supportedFormats and convertFileAsync for PDF-to-JSON conversion, with OCR disabled. PDFium decodes the source pages and embedded PDF images. The Rust image dependency supplies PNG output and JPEG support.

Run the owning skill's scripts/build-native.mjs to compile. Dependencies are locked in Cargo.lock; notices are in ../native/licenses. The source and binary distribution requirements are documented in ../../LICENSES.md. See MODIFICATIONS.md for local changes.
