# Technical conversion checks

Conversion performs technical assembly checks only: nonempty generated content, complete page containers and serialized region counts, safe local assets, image decoding, font loading and browser loading errors. Reports use scope=conversion-technical and bookValidated=false. Text fidelity, punctuation, reading order, source-image correspondence, typography, positioning, clipping and overflow are book-validation responsibilities and never determine conversion acceptance. A successful conversion must be handed to validateBook before publication. Technical failures retain diagnostic output; installation checks the final path before discarding recovery copies.

Run `scripts/pdf2html check --html /output/index.html` to check an existing generated artifact. No PDF input is accepted. Exit code 1 means a technical failure; code 0 never certifies manuscript fidelity. The former book-validation command is removed rather than kept as a compatibility alias.

The renderer may restore punctuation and ambiguous hyphenated spelling from exactly aligned source text as part of conversion. These transformations do not prove completeness. Unresolved position markers are retained for independent validation. The conversion skill does not read validateBook reports, repair audited editions or invoke a book validator.

## Source punctuation alignment

Restore source punctuation on exactly aligned text. If a damaged or cross-page opening interrupts alignment, resume only at a unique exact six-token context in both streams within 32 tokens; preserve unmatched words. Restore a dropped internal compound hyphen to its exact source spelling. A lone numeric folio uses explicit extractor page provenance rather than ambiguous neighbouring text votes. These conversion operations do not certify manuscript fidelity.
