# Frozen migration reference

Captured on 2026-09-09 from the original Python implementation before its removal.
The three document fixtures contain source HTML, preparation JSON, all workflow
states, authored job inputs, exact rendered HTML, and independent validation
reports. Only temporary absolute paths are replaced with __FIXTURE_ROOT__.
Draft bytes and their review hashes are preserved. The fiction case exercises
the fiction mode contract using the same synthetic source as nonfiction.

Original source SHA256 values:

- src/marketingsummary_skill/core.py: 45fe4b8af5cbcd618e7ea2532164b4475843084f0f0799538c8b2a553048da86
- src/marketingsummary_skill/validation.py: f3e07ef627105e37093bf32e959be11cf3da5d1b3dfaf00e9926e29259702b43
- tests/test_core.py: 2b911cf3fa5b297c1e4c8cf1f071415fa7973a11f547a68734c254219e4ab365

Run node --test tests/*.test.mjs from the skill folder. These are
frozen regression expectations, not live cross-language comparisons. Do not
regenerate expected results from the implementation under test. Review intended
contract changes explicitly before updating a fixture.
