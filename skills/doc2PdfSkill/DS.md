# DOC/DOCX to PDF Design Summary

## Purpose and provenance

`doc2PdfSkill` specializes the public JPeetz `document-processing` recommendation that LibreOffice headless is the highest-fidelity free DOCX-to-PDF route. The upstream workflow was consulted but no source code or documentation is vendored because the current upstream repository has no machine-detectable license file. This implementation is original and provides a bounded conversion program, explicit dependency handling, optimization profiles, and deterministic QA.

## Runtime and conversion boundary

The skill accepts local Word `.doc` and `.docx` files. DOCX inputs must be valid OOXML ZIP packages; legacy DOC inputs must carry the OLE compound-file signature. LibreOffice is discovered in platform-standard locations and runs headlessly inside a fresh temporary user profile. The profile sets macro security to the highest level. Inputs are never edited and outputs are staged before atomic publication.

System installation is separate from conversion. `install-deps` shows and confirms native package-manager commands. It never downloads unverified standalone binaries and conversion never invokes it implicitly.

## Optimization profiles

LibreOffice first creates the raw reference PDF. `fidelity` uses pikepdf stream/object compression and linearization without image transcoding. `balanced` and `compact` pass the raw PDF through Ghostscript with 300-DPI/high-quality and 150-DPI/screen-oriented image settings, respectively, then apply the same final lossless packaging. A lossy candidate that fails QA is discarded and replaced by a validated fidelity candidate.

## Quality assurance

PyMuPDF inventories both PDFs and renders every page. QA gates page count and size, normalized text coverage and local order, links, outlines, blank-page pattern, page geometry, and embedded fonts. Rendered pages are compared at a fixed resolution with profile-specific normalized pixel-difference thresholds. The optimizer may reduce image fidelity only within the selected profile threshold; it may not remove document structure.

Requested DOCX fonts are inventoried from OOXML. Missing embedded fonts, changed font sets, and requested-font names absent from the rendered PDF are findings. Direct-font comparison is advisory where Word theme fonts or LibreOffice aliases prevent an exact name match; non-embedded output fonts are errors.

The result JSON is the persistent QA record unless `--keep-qa-artifacts` is requested. That flag retains raw/candidate PDFs, rendered PNG pages, and `qa.json` in a hidden sibling directory.
