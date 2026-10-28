# Dependencies

## Runtime prerequisite

Node.js >=22 runs the skill and its tests. Node provides filesystem access,
hashing, Unicode expressions and the test runner. The shell launcher checks for Node; the .mjs entrypoint checks its
major version before loading code or creating outputs. A missing or incompatible
runtime exits nonzero and points here. Install Node separately from
https://nodejs.org/en/download for the host platform; startup checks the installed version.

## Bundled HTML parser

HTML parsing uses the bundled htmlparser2 dependency to preserve the document
extraction contract. The parser handles entities, comments, raw script/style text and nested markup. Cheerio adds an unused selector layer;
a browser adds a separate executable. htmlparser2 10.0.0 provides the required DOM.

All seven resolved packages below are required runtime dependencies under
external/html. Together the bundle and its inventory occupy 1,734,597 bytes.
The bundle is ready to run and contains upstream distributed JavaScript, source files where supplied, package
metadata and license notices. The upstream files are preserved unchanged.

| Package | Exact version | License | Bundled notice | Upstream |
|---|---|---|---|---|
| dom-serializer | 2.0.0 | MIT | [license](external/html/node_modules/dom-serializer/LICENSE) | [source](https://github.com/cheeriojs/dom-serializer) |
| entities | 4.5.0 | BSD-2-Clause | [license](external/html/node_modules/dom-serializer/node_modules/entities/LICENSE) | [source](https://github.com/fb55/entities) |
| domelementtype | 2.3.0 | BSD-2-Clause | [license](external/html/node_modules/domelementtype/LICENSE) | [source](https://github.com/fb55/domelementtype) |
| domhandler | 5.0.3 | BSD-2-Clause | [license](external/html/node_modules/domhandler/LICENSE) | [source](https://github.com/fb55/domhandler) |
| domutils | 3.2.2 | BSD-2-Clause | [license](external/html/node_modules/domutils/LICENSE) | [source](https://github.com/fb55/domutils) |
| entities | 6.0.1 | BSD-2-Clause | [license](external/html/node_modules/entities/LICENSE) | [source](https://github.com/fb55/entities) |
| htmlparser2 | 10.0.0 | MIT | [license](external/html/node_modules/htmlparser2/LICENSE) | [source](https://github.com/fb55/htmlparser2) |

[Inventory](external/html/inventory.json) records each package's exact local
location, source distribution and direct requirements. The
[lockfile](external/html/package-lock.json) pins all transitive resolutions and
archive integrity values. htmlparser2 uses domhandler for DOM construction,
domelementtype for node types, entities for HTML entities and domutils for tree
operations. domutils retains dom-serializer, which uses entities 4.5.0. These are
inherited requirements of the selected parser distribution. A narrower parser API
could remove domutils and serialization dependencies in a later change.

Retain each MIT or BSD-2-Clause license and copyright notice when redistributing
the copied skill. BSD notices also retain their disclaimer. The bundle uses permissive licenses, with texts included at the paths above.

The entrypoint catches a missing or unloadable bundle, reports the affected HTML
runtime and restoration instructions, and exits before preparing a job. Restore
external/html from this skill release. Maintainers can reconstruct the bundle
with npm ci --prefix external/html --ignore-scripts using its checked-in lockfile.
The npm CLI is an optional maintainer tool, not a runtime dependency; this snapshot
was prepared with npm 11.6.0, Artistic-2.0, https://github.com/npm/cli. npm itself is
not bundled or redistributed. A source update requires an explicitly pinned
release, review of licenses and transitive dependencies, refresh of inventory,
and a complete regression run. Never run npm from the normal entrypoint.

## Language normalization

Node.js Intl.Locale validates language-tag syntax and returns canonical casing
and subtag ordering. Use hyphenated tags such as ro-RO, en-US and zh-Hant-TW.
ICU data ships with Node.js; canonicalization follows the runtime's ICU version.
This checks locale syntax, not whether prose matches the declared language.

## Maintainer formatting tool

The migration used the already installed Prettier 1.18.2 CLI to format .mjs files.
It is an optional maintainer tool, MIT, https://github.com/prettier/prettier; its
installed distribution includes LICENSE. It is not part of the skill runtime or
test suite. Formatting can also be maintained manually. Any formatter update is a
separate maintainer choice and must preserve the behavioral fixtures.

## Verification

Run node --test tests/*.test.mjs from this folder. Tests compare prepared JSON,
workflow states, generated HTML and validation reports with recorded reference
fixtures. They exercise failure paths and run a copied skill from a different
working directory with an explicit Node executable. Startup tests cover missing
bundled resources and an incompatible Node version. Fixture provenance is in
[tests/fixtures/README.md](tests/fixtures/README.md).

These finite fixtures cover the supported examples; malformed HTML and additional
Unicode edge cases require their own regression fixtures when encountered.
