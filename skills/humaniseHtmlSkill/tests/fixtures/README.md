# Reference fixtures

Captured on 2026-09-09 from the original implementation before replacement.
Document fixtures record source HTML, prepared job files, workflow states,
rendered HTML bytes and validation reports. Temporary absolute paths are replaced
with a fixture-root token. Recorded source bytes remain unchanged.

Original source SHA256 values:

- src/humanisehtml_skill/core.py: 3cd1cbd96ef0a2ea13ef93fc961f9a67ed99c4d473dc71baec364925d9c4aa80
- src/humanisehtml_skill/validation.py: 3ef1b5578068a27411227f9d459446f4d6e75a381e07ed8998dcdc9d498c62b4
- src/humanisehtml_skill/cli.py: 2eb2b0ec99a735dfd1238a36d3797162a13bb5f0bea94bc47f2c8464d7691062
- tests/test_core.py: 71d23289151d6ba71fea28ed9e9b3b8b8fdbd93036bec088c4198a8a93eb16f8

Run node --test tests/*.test.mjs. Tests compare the current implementation with
these recorded expectations. Review intended contract changes before updating
fixtures; generate expectations from an independent reference. The complete
Zodiac HTML source was also compared during migration: preparation JSON, context,
chapter data where applicable, and every batch matched the original.
