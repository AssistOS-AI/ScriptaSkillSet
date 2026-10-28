# Frozen migration reference

Captured on 2026-09-09 from the original Python implementation before removal.
Six document fixtures preserve source HTML, preparation and ready states, job
JSON, exact rendered HTML and validation reports. Temporary absolute paths alone
are replaced with __FIXTURE_ROOT__. Draft bytes and review hashes are preserved.
Cases cover nonfiction, fiction, summary markers, Unicode and chapter batching.
Similarity results were captured from Python 3.12 difflib.SequenceMatcher.

Original source SHA256 values:

- src/shortdescription_skill/core.py: 9b6dd7543f70cf7e98d10be296461abec633d75fca1a2fc0ca71a3376e53f8c3
- src/shortdescription_skill/validation.py: a0890e1a9b635e0b0f6edd1f185e1247399df20d12a6ebea886ecb1642170997
- tests/test_core.py: 08c5b2a73403d6f8401f353044a1008c32721c513465f69832b6c6681524683d

Run node --test tests/equivalence.test.mjs. These are frozen regression
expectations, not live cross-language comparisons. Do not regenerate expected
results from the implementation under test. Review contract changes explicitly
before updating fixtures.
