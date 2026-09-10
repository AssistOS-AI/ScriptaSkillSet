# Dependencies

## Runtime and packaging

Node.js >=22 is required. Its standard library provides files, paths, subprocesses, hashing, CLI parsing and tests. The skill owns its complete JavaScript bundle under external/runtime. Copy this directory with the skill. Resource resolution uses import.meta.url.

docx creates the base Word package; htmlparser2 and css-select parse and select HTML; css-tree reads styles; fflate reads and writes ZIP; @xmldom/xmldom handles OOXML; image-size reads supported raster dimensions.

These specialized parsers and document components are accepted by the approved conversion plan. Regular expressions cannot reliably parse HTML, CSS, XML or ZIP. A custom complete document package implementation would increase maintenance and compatibility risk. Direct packages and all transitives are pinned by package-lock.json; inventory.json records exact locations, versions, licenses and dependency relationships. The bundled footprint is approximately 19 MiB. Package source is unmodified.

The table below includes every bundled direct and transitive package. MIT and BSD notices must accompany redistributed copies. Preserve each listed license or README license section. Dual-licensed packages retain both notices and use the permissive option for this bundle.

| Package | Version | License | Upstream and update source | Bundled notices |
| --- | --- | --- | --- | --- |
| @types/node | 25.9.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped.git | `external/runtime/node_modules/@types/node/LICENSE` |
| @xmldom/xmldom | 0.9.12 | MIT | git://github.com/xmldom/xmldom.git | `external/runtime/node_modules/@xmldom/xmldom/LICENSE` |
| boolbase | 2.0.0 | ISC | https://github.com/fb55/boolbase | `external/runtime/node_modules/boolbase/LICENSE` |
| core-util-is | 1.0.3 | MIT | git://github.com/isaacs/core-util-is | `external/runtime/node_modules/core-util-is/LICENSE` |
| css-select | 7.0.0 | BSD-2-Clause | git://github.com/fb55/css-select.git | `external/runtime/node_modules/css-select/LICENSE` |
| css-tree | 3.2.1 | MIT | csstree/csstree | `external/runtime/node_modules/css-tree/LICENSE` |
| css-what | 8.0.0 | BSD-2-Clause | https://github.com/fb55/css-what | `external/runtime/node_modules/css-what/LICENSE` |
| docx | 9.7.1 | MIT | git+https://github.com/dolanmiu/docx.git | `external/runtime/node_modules/docx/LICENSE` |
| dom-serializer | 3.1.1 | MIT | git://github.com/cheeriojs/dom-serializer.git | `external/runtime/node_modules/dom-serializer/LICENSE` |
| domelementtype | 3.0.0 | BSD-2-Clause | git://github.com/fb55/domelementtype.git | `external/runtime/node_modules/domelementtype/LICENSE` |
| domhandler | 6.0.1 | BSD-2-Clause | git://github.com/fb55/domhandler.git | `external/runtime/node_modules/domhandler/LICENSE` |
| domutils | 4.0.2 | BSD-2-Clause | git://github.com/fb55/domutils.git | `external/runtime/node_modules/domutils/LICENSE` |
| entities | 8.1.0 | BSD-2-Clause | https://github.com/fb55/entities.git | `external/runtime/node_modules/entities/LICENSE` |
| fflate | 0.8.3 | MIT | https://github.com/101arrowz/fflate | `external/runtime/node_modules/fflate/LICENSE` |
| hash.js | 1.1.7 | MIT | git@github.com:indutny/hash.js | `external/runtime/node_modules/hash.js/README.md` |
| htmlparser2 | 10.0.0 | MIT | git://github.com/fb55/htmlparser2.git | `external/runtime/node_modules/htmlparser2/LICENSE` |
| dom-serializer | 2.0.0 | MIT | git://github.com/cheeriojs/dom-serializer.git | `external/runtime/node_modules/htmlparser2/node_modules/dom-serializer/LICENSE` |
| entities | 4.5.0 | BSD-2-Clause | git://github.com/fb55/entities.git | `external/runtime/node_modules/htmlparser2/node_modules/dom-serializer/node_modules/entities/LICENSE` |
| domelementtype | 2.3.0 | BSD-2-Clause | git://github.com/fb55/domelementtype.git | `external/runtime/node_modules/htmlparser2/node_modules/domelementtype/LICENSE` |
| domhandler | 5.0.3 | BSD-2-Clause | git://github.com/fb55/domhandler.git | `external/runtime/node_modules/htmlparser2/node_modules/domhandler/LICENSE` |
| domutils | 3.2.2 | BSD-2-Clause | git://github.com/fb55/domutils.git | `external/runtime/node_modules/htmlparser2/node_modules/domutils/LICENSE` |
| entities | 6.0.1 | BSD-2-Clause | git://github.com/fb55/entities.git | `external/runtime/node_modules/htmlparser2/node_modules/entities/LICENSE` |
| image-size | 2.0.2 | MIT | git://github.com/image-size/image-size.git | `external/runtime/node_modules/image-size/LICENSE` |
| immediate | 3.0.6 | MIT | git://github.com/calvinmetcalf/immediate.git | `external/runtime/node_modules/immediate/LICENSE.txt` |
| inherits | 2.0.4 | ISC | git://github.com/isaacs/inherits | `external/runtime/node_modules/inherits/LICENSE` |
| isarray | 1.0.0 | MIT | git://github.com/juliangruber/isarray.git | `external/runtime/node_modules/isarray/README.md` |
| jszip | 3.10.2 | (MIT OR GPL-3.0-or-later) | https://github.com/Stuk/jszip.git | `external/runtime/node_modules/jszip/LICENSE.markdown` |
| lie | 3.3.0 | MIT | https://github.com/calvinmetcalf/lie.git | `external/runtime/node_modules/lie/license.md` |
| mdn-data | 2.27.1 | CC0-1.0 | https://github.com/mdn/data.git | `external/runtime/node_modules/mdn-data/LICENSE` |
| minimalistic-assert | 1.0.1 | ISC | https://github.com/calvinmetcalf/minimalistic-assert.git | `external/runtime/node_modules/minimalistic-assert/LICENSE` |
| nanoid | 5.1.16 | MIT | ai/nanoid | `external/runtime/node_modules/nanoid/LICENSE` |
| nth-check | 3.0.1 | BSD-2-Clause | https://github.com/fb55/nth-check | `external/runtime/node_modules/nth-check/LICENSE` |
| pako | 1.0.11 | (MIT AND Zlib) | nodeca/pako | `external/runtime/node_modules/pako/LICENSE` |
| process-nextick-args | 2.0.1 | MIT | https://github.com/calvinmetcalf/process-nextick-args.git | `external/runtime/node_modules/process-nextick-args/license.md` |
| readable-stream | 2.3.8 | MIT | git://github.com/nodejs/readable-stream | `external/runtime/node_modules/readable-stream/LICENSE` |
| safe-buffer | 5.1.2 | MIT | git://github.com/feross/safe-buffer.git | `external/runtime/node_modules/safe-buffer/LICENSE` |
| sax | 1.6.1 | BlueOak-1.0.0 | git+ssh://git@github.com/isaacs/sax-js.git | `external/runtime/node_modules/sax/LICENSE.md` |
| setimmediate | 1.0.5 | MIT | YuzuJS/setImmediate | `external/runtime/node_modules/setimmediate/LICENSE.txt` |
| source-map-js | 1.2.1 | BSD-3-Clause | 7rulnik/source-map-js | `external/runtime/node_modules/source-map-js/LICENSE` |
| string_decoder | 1.1.1 | MIT | git://github.com/nodejs/string_decoder.git | `external/runtime/node_modules/string_decoder/LICENSE` |
| undici-types | 7.24.6 | MIT | git+https://github.com/nodejs/undici.git | `external/runtime/node_modules/undici-types/LICENSE` |
| util-deprecate | 1.0.2 | MIT | git://github.com/TooTallNate/util-deprecate.git | `external/runtime/node_modules/util-deprecate/LICENSE` |
| xml | 1.0.1 | MIT | http://github.com/dylang/node-xml | `external/runtime/node_modules/xml/LICENSE` |
| xml-js | 1.6.11 | MIT | git+https://github.com/nashwaan/xml-js.git | `external/runtime/node_modules/xml-js/LICENSE` |

## Maintenance

npm is a maintainer tool used to assemble the bundle. Update exact versions in external/runtime/package.json, run npm install --ignore-scripts there, inspect the lockfile and licenses, refresh inventory.json and run the skill tests. npm ci --ignore-scripts restores that exact bundle from its lockfile. Retain package-lock.json and node_modules in the portable distribution. Ordinary commands use the included files directly.

Each CLI checks Node before loading its bundle and reports a restoration diagnostic if a required package is missing. Run doctor after copying or updating the folder. Removal of the parsers requires an equivalent implementation passing all source, formatting and corruption fixtures.

Raster decoding is limited to BMP, GIF, JPEG, PNG and TIFF. Other image-size handlers are disabled before reading input, including its ICNS, HEIF and JPEG XL handlers. Retain this allowlist during updates. Dimensions are structural checks; editor rendering determines final appearance.
