# Repository guidance

Use Node.js >=22 ECMAScript modules, relative imports and Node's built-in test runner. Keep the HTML parser, notices and dependency records inside this skill.

The active LLM reads every source batch and consolidates the final keywords. Node validates source identity, JSON schemas, citations, counts and configured synonyms. Preserve source HTML byte-for-byte and replace relevantKeywords.txt atomically only after complete review.

Keep documentation, schemas, code, tests and comments in English. Update SKILL.md, README.md, DS.md, skill.json and tests together when behavior changes. Run node --test tests/*.test.mjs and scripts/relevantkeywords doctor before delivery.
