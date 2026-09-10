# Reference fixtures

Captured on 2026-09-09 from the original implementation before replacement.
Document fixtures record source HTML, prepared job files, workflow states,
rendered HTML bytes and validation reports. Temporary absolute paths are replaced
with a fixture-root token. Recorded source bytes remain unchanged.

Original source SHA256 values:

- src/comprehensivesummary_skill/core.py: 42ac10444d945c521230d91e7b10eea69a21d17db1954ceb6e455df12c7903b9
- src/comprehensivesummary_skill/validation.py: 3d56d026a292eada078abeab20cf42094d4fb5bac88172375cf09dfc70159280
- src/comprehensivesummary_skill/cli.py: a22b7e11253fe12d952afb182f23c00a08acf998e3d9030ffe02906589fbbc8c
- tests/test_core.py: e4e202be204067c5d4f422e791aeda3f0c6e4c3b297d280042c34c8dad9acff4

Run node --test tests/*.test.mjs. Tests compare the current implementation with
these recorded expectations. Review intended contract changes before updating
fixtures; generate expectations from an independent reference. The complete
Zodiac HTML source was also compared during migration: preparation JSON, context,
chapter data where applicable, and every batch matched the original.
