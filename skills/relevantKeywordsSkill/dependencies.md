# Dependencies

## Runtime and packaging

Node.js >=22 is required. Its standard library provides files, paths, subprocesses, hashing, CLI parsing and tests. The skill owns its complete JavaScript bundle under external/html. Copy this directory with the skill. Resource resolution uses import.meta.url.

htmlparser2 parses semantic HTML and decodes entities; its DOM helpers extract visible content.

These specialized parsers and document components are accepted by the approved conversion plan. Regular expressions cannot reliably parse HTML, CSS, XML or ZIP. A custom complete document package implementation would increase maintenance and compatibility risk. Direct packages and all transitives are pinned by package-lock.json; inventory.json records exact locations, versions, licenses and dependency relationships. The bundled footprint is approximately 2 MiB. Package source is unmodified.

The table below includes every bundled direct and transitive package. MIT and BSD notices must accompany redistributed copies. Preserve each listed license or README license section. Dual-licensed packages retain both notices and use the permissive option for this bundle.

| Package | Version | License | Upstream and update source | Bundled notices |
| --- | --- | --- | --- | --- |
| dom-serializer | 2.0.0 | MIT | git://github.com/cheeriojs/dom-serializer.git | `external/html/node_modules/dom-serializer/LICENSE` |
| entities | 4.5.0 | BSD-2-Clause | git://github.com/fb55/entities.git | `external/html/node_modules/dom-serializer/node_modules/entities/LICENSE` |
| domelementtype | 2.3.0 | BSD-2-Clause | git://github.com/fb55/domelementtype.git | `external/html/node_modules/domelementtype/LICENSE` |
| domhandler | 5.0.3 | BSD-2-Clause | git://github.com/fb55/domhandler.git | `external/html/node_modules/domhandler/LICENSE` |
| domutils | 3.2.2 | BSD-2-Clause | git://github.com/fb55/domutils.git | `external/html/node_modules/domutils/LICENSE` |
| entities | 6.0.1 | BSD-2-Clause | git://github.com/fb55/entities.git | `external/html/node_modules/entities/LICENSE` |
| htmlparser2 | 10.0.0 | MIT | git://github.com/fb55/htmlparser2.git | `external/html/node_modules/htmlparser2/LICENSE` |

## Maintenance

npm is a maintainer tool used to assemble the bundle. Update exact versions in external/html/package.json, run npm install --ignore-scripts there, inspect the lockfile and licenses, refresh inventory.json and run the skill tests. npm ci --ignore-scripts restores that exact bundle from its lockfile. Retain package-lock.json and node_modules in the portable distribution. Ordinary commands use the included files directly.

Each CLI checks Node before loading its bundle and reports a restoration diagnostic if a required package is missing. Run doctor after copying or updating the folder. Removal of the parsers requires an equivalent implementation passing all source, formatting and corruption fixtures.
