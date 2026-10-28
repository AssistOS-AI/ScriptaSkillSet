# Dependencies

## Runtime prerequisite

Node.js >=22 runs the skill and its tests. Node provides filesystem access,
hashing, Unicode expressions and the test runner. The shell launcher checks for Node; the .mjs entrypoint checks its
major version before loading code or creating outputs. A missing or incompatible
runtime exits nonzero and points here. Install Node separately from
https://nodejs.org/en/download for the host platform; startup never installs it.

## Bundled HTML parser

HTML parsing uses the bundled htmlparser2 dependency to preserve the document
extraction contract. A homemade regular-expression parser cannot cover entities, comments,
raw script/style text and nested markup. Cheerio adds an unused selector layer;
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

## Verification

Run node --test tests/equivalence.test.mjs. Eleven Node tests cover six frozen
reference document cases, refusal states and ownership, similarity results,
sentence-count validation, helpers and copied-folder startup. They preserve
prepared JSON, ready states, exact HTML bytes and validation reports for
nonfiction, fiction, both summary markers, Unicode/entities and chapter batching.
They also verify source immutability and removal of successful jobs.

The copied runtime works from another directory with an empty PATH using an
explicit Node executable. Missing parser files fail before job creation. Node.js runs the suite against recorded reference outputs. Original source
hashes and fixture provenance are in tests/fixtures/README.md. These finite
fixtures do not establish equivalence for every malformed HTML input.
