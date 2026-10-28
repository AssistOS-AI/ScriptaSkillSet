# Dependencies

## Runtime and packaging

Node.js >=22 is required. Its standard library provides files, paths, subprocesses, hashing, CLI parsing and tests. The skill owns its complete JavaScript bundle under external/runtime. Copy this directory with the skill. Resource resolution uses import.meta.url.

fflate reads Word ZIP containers; @xmldom/xmldom validates OOXML and reads Poppler text inventories.

These specialized parsers and document components are accepted by the approved conversion plan. Regular expressions cannot reliably parse HTML, CSS, XML or ZIP. A custom complete document package implementation would increase maintenance and compatibility risk. Direct packages and all transitives are pinned by package-lock.json; inventory.json records exact locations, versions, licenses and dependency relationships. The bundled footprint is approximately 1.3 MiB. Package source is unmodified.

The table below includes every bundled direct and transitive package. MIT and BSD notices must accompany redistributed copies. Preserve each listed license or README license section. Dual-licensed packages retain both notices and use the permissive option for this bundle.

| Package | Version | License | Upstream and update source | Bundled notices |
| --- | --- | --- | --- | --- |
| @xmldom/xmldom | 0.9.12 | MIT | git://github.com/xmldom/xmldom.git | `external/runtime/node_modules/@xmldom/xmldom/LICENSE` |
| fflate | 0.8.3 | MIT | https://github.com/101arrowz/fflate | `external/runtime/node_modules/fflate/LICENSE` |

## Maintenance

npm is a maintainer tool used to assemble the bundle. Update exact versions in external/runtime/package.json, run npm install --ignore-scripts there, inspect the lockfile and licenses, refresh inventory.json and run the skill tests. npm ci --ignore-scripts restores that exact bundle from its lockfile. Retain package-lock.json and node_modules in the portable distribution. Ordinary commands use the included files directly.

Each CLI checks Node before loading its bundle and reports a restoration diagnostic if a required package is missing. Run doctor after copying or updating the folder. Removal of the parsers requires an equivalent implementation passing all source, formatting and corruption fixtures.

## Native tools

Native tools run as separate executables. They are installed in the environment and are not redistributed by the skill. Their libraries, fonts and system dependencies are managed by the platform package manager. The approved plan retains a document renderer and compressor and uses QPDF and Poppler for PDF processing and QA. A JavaScript Word renderer or handwritten PDF parser does not meet this fidelity requirement.

| Tool | Required capability | License | Upstream and updates | Replacement boundary |
| --- | --- | --- | --- | --- |
| LibreOffice Writer | Headless DOC/DOCX export, isolated profile, tested 7.3.7.2 on macOS | MPL-2.0, project code also offered under LGPL-3.0-or-later | https://www.libreoffice.org/download/ | A replacement must preserve Word pagination and embedded resources. |
| QPDF | >=11.4, JSON v2 inspection and updates, compression, linearization; tested 12.4.1 on macOS | Apache-2.0 | https://github.com/qpdf/qpdf | Requires complete PDF object and stream preservation. |
| Poppler | pdftotext -bbox-layout, pdffonts, pdftoppm -singlefile RGB rendering | GPL-2.0-or-later, additional notices vary by distribution | https://poppler.freedesktop.org/ | Requires independent page text, font and raster validation. |
| Ghostscript | pdfwrite, image downsampling, font embedding; tested 10.03.1 on macOS; required for balanced and compact | AGPL-3.0-or-later or commercial license | https://ghostscript.com/releases/ | Optional until image recompression is selected. |

These tools are independent system dependencies with their own licenses. Keep distributor notices and corresponding source obligations when redistributing an environment image. Consult the exact installed package licenses for included libraries and fonts. The skill does not bundle or modify their source.

Discovery checks PATH and common installation directories. SCRIPTA_SOFFICE, SCRIPTA_QPDF, SCRIPTA_PDFTOTEXT, SCRIPTA_PDFFONTS, SCRIPTA_PDFTOPPM and SCRIPTA_GS override individual executable paths. A missing override fails explicitly. doctor reports paths and capability probes; required tools are checked before creating conversion output. Missing Ghostscript prevents selecting a compression profile.

On macOS install LibreOffice with brew install --cask libreoffice and the PDF tools with brew install qpdf poppler ghostscript. On Debian or Ubuntu use apt-get install libreoffice-writer qpdf poppler-utils ghostscript. On Fedora use dnf install libreoffice-writer qpdf poppler-utils ghostscript. Use a distribution providing QPDF >=11.4. On Windows place the equivalent tools on PATH or set the executable overrides; automated installation is available for macOS and Linux.

install-deps displays the missing-tool installation commands. install-deps --yes executes them after user authorization. Conversion and startup never install tools. Update through the same package manager and run the complete conversion suite, including all profiles, fidelity fallback and DOC input.
