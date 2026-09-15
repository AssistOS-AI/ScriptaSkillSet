# Local modifications

Source: https://github.com/docling-project/docling.rs/tree/v1.32.0
License: MIT, retained in LICENSE.

The workspace contains docling-core, docling-onnx, docling-pdf and a private docling-node binding. The binding exposes PDF conversion to DoclingDocument JSON and calls the standard PDF pipeline with skip_ocr and no_text_panels enabled and heading_hierarchy disabled. The skill invokes it asynchronously. The PDF pipeline and its serializers are unchanged. The image dependency disables default standalone-image codecs and enables PNG and JPEG. PDFium continues to decode images embedded in PDF pages.

Build with the root skill's scripts/build-native.mjs and Cargo.lock. The private binding is specific to pdf2htmlSkill; it does not implement the upstream npm package interface.
