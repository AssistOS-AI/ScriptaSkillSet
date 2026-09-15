# Dependencies

Node.js 22+ supplies all JavaScript functionality, including WebSocket, subprocesses and the test runner. There is no Python code or Python runtime dependency, and agents executing this skill must not invoke Python or create ad-hoc analysis scripts. PDF extraction uses the explicitly configured pdf2html skill; no PDF runtime is duplicated here. No sibling skill imports are used. JavaScript files and tests travel with this folder. No LLM, model API, external repair plan or reviewed-difference input participates in book verification or correction.

The layout coordinator uses only Node built-ins. Planning and reporting need no native tools. The skill has no editorial workflow dependencies. Existing repository integration commands remain external host operations, not imported runtime dependencies.

## Explicit environment rendering tools

Paginated layout uses CSS registered custom properties and typed division in calc() to resolve an inherited numeric page scale before entering nested containers. Native regression tests verify this capability, the mobile floor and repeated CSS consolidation in the configured Chromium. No new dependency is installed.

Chromium, pdftotext, pdffonts, pdfimages and pdftohtml are required for prepare and doctor, but not for reporting existing jobs or pure tests. Configure absolute executable paths with command options or the VALIDATEBOOK environment variables documented in README.md. Startup checks run before evidence output. Missing paths, failed Poppler probes, missing CDP capabilities or browser startup failure produce a named error and nonzero exit. No downloads or global changes occur.

This is an environment-tool exception to folder-only portability. Copying the skill retains its controller, not native runtimes. The recipient must supply these tools. Existing approved local PDF/browser tools can be reused through executable paths without importing their owner skill. A standalone deployment can place its own runtime under `external/tools/` and configure those paths. Preserve the full distribution and notices, not a single executable stripped of libraries.

| Tool | Accepted capability | Verified local runtime | License/source |
| --- | --- | --- | --- |
| Chromium headless | CDP Page, Runtime, Network, Emulation, Browser, DOM and CSS; geometry and actual platform-font inspection, without screenshots | 151.0.7922.34, CDP 1.3 | BSD-style Chromium license plus distribution third-party notices; https://chromium.googlesource.com/chromium/src/ |
| Poppler pdftotext/pdffonts/pdfimages | per-page text and bounding-box extraction; font and image inventories without rasterization | 25.01.0 (doctor, 2026-09-14) | Existing conda package declares GPL-2.0-only; https://poppler.freedesktop.org/ |

These tools are inherited from the already accepted local PDF workflow. The pdf2html dependency owns the PDF graphics runtime. Their installed package retains licenses and transitive libraries. Static HTML checks cannot replace browser layout; Node built-ins cannot decode arbitrary PDF content. Reimplementing either would make fidelity worse. Poppler's existing GPL tool is invoked as an independent process, not linked or redistributed in this skill.

Installation: point to existing working distributions first. If unavailable, request authorization before installing an OS-level package. Use the deployment's approved local Chromium/Poppler distribution and configure its executable paths; there is no hidden sibling lookup or unverified auto-installer. Source/update locations are the upstream URLs above. Before an update, retain distribution licenses, rerun doctor and full integration tests, and record actual runtime output. Updates are operator controlled, not performed at startup.

Native distributions retain their own platform/system-library dependencies. macOS and Linux require matching executable architecture and runtime libraries. This skill does not promise binary portability across platforms. No upstream source is modified. If redistributing a native runtime later, first inventory the exact dependency closure and satisfy its license/source obligations. Replacing Poppler with another PDF engine remains possible if it preserves page extraction, bounds, font and image inventories; replacing Chromium requires equivalent real-browser layout and actual-font measurements.

The skill does not invoke pdftoppm. No new native package was installed for this refactor: pdffonts and pdfimages belong to the existing Poppler distribution. Tool versions are probed on every new run and stored in job.json. Optional native tests are enabled explicitly with VALIDATEBOOK_INTEGRATION and the four tool variables.

The same Poppler distribution also supplies pdftohtml. The skill invokes its XML text/font extraction at zoom 1 with -i and -stdout, without extracting images or writing converted pages. Configure --pdftohtml / VALIDATEBOOK_PDFTOHTML; otherwise use pdftohtml beside the explicitly configured pdftotext. It receives the same bounded startup version probe. No new package is installed.

## PDF extraction skill dependency

The provider must export a `tables` array with closed-grid cell text, spans, widths, fills, per-edge borders and uniform typography. Missing or malformed table evidence fails before correction. Responses larger than the stdout pipe buffer must be fully flushed. No additional PDF runtime or native dependency is introduced.

pdf2html is a required workflow dependency. Supply its absolute scripts/pdf2html launcher via --pdf2html or VALIDATEBOOK_PDF2HTML. validateBook calls its read-only decorations command with argument arrays, a timeout and bounded output. Source hashes, borders and list evidence are checked before use. Provider stderr is retained with its returned warnings. No conversion or automatic installation is triggered by this command.

The pdf2html skill owns PDF.js, canvas, QPDF, their prerequisite checks, licenses and update inventory. Keep that skill deployed with its documented runtime. Copying validateBook retains the orchestration implementation; its declared dependency must be configured on the destination machine. There are no direct sibling imports, copied extractors, hidden lookup paths or model services. Existing native Chromium and Poppler configuration remains unchanged.
