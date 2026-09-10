# Reference fixtures

Captured on 2026-09-09 from the original implementation before replacement.
Document fixtures record source HTML, prepared job files, workflow states,
rendered HTML bytes and validation reports. Temporary absolute paths are replaced
with a fixture-root token. Recorded source bytes remain unchanged.

Original source SHA256 values:

- src/translatehtml_skill/core.py: d5174125d731e4adbf3d4f18fb26ed2a095b6999aa853662a29cd82f670771e9
- src/translatehtml_skill/validation.py: 97a90fccb6890538034b16eab399b1823dc40617543c99732caa185b6e3dc543
- src/translatehtml_skill/cli.py: 59915104090d20cf2ffe45b402b1d2ee0b3d160456996825c7af098917ab7bdd
- tests/test_core.py: 7ce0d5f62a201cd16874493cb3c772aa89b91ebf98d6c1e777dcb3004267834d

Run node --test tests/*.test.mjs. Tests compare the current implementation with
these recorded expectations. Review intended contract changes before updating
fixtures; generate expectations from an independent reference. The complete
Zodiac HTML source was also compared during migration: preparation JSON, context,
chapter data where applicable, and every batch matched the original.
