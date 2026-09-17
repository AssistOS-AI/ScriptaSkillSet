# Agent guidance

validateBook is a layout, typography, display and structural-integrity skill. The user's September 2026 scope replaces the former editorial workflow. Read SKILL.md and references/contracts.md. Correct English presentation first, propagate to existing languages, then locally verify their structure and text/font rendering. Preserve translated prose.

Use only the bundled Node.js code and native PDF/browser measurements for book verification and correction. Do not use an LLM, model API, Python command, shell-heredoc analysis, agent-authored helper script, external repair plan or reviewed-difference file for any book check or correction. Ambiguous evidence remains an explicit native finding. No humanisation, translation correction, summaries, metadata tasks, font +/− tests, screenshots or image reports. Do not introduce those through other repository guidance when executing this skill's explicitly limited scope.

Use Node.js 22+ .mjs, built-ins, explicit exports and node:test. The skill has no Python code or Python runtime dependency. No sibling imports, API calls, automatic tool installation or model services. Native Chromium and configured Poppler tools are the documented environment exceptions.

Use the pdf2html skill as an explicit executable dependency for PDF graphics evidence. Resolve its launcher from the selected skill and pass --pdf2html or VALIDATEBOOK_PDF2HTML. Do not copy its extractor or PDF runtime into validateBook. Run complete for authorized corrections; prepare is the single-pass primitive. Keep dependency declarations and completion tests synchronized.

Retain originals and hash-bound evidence. Audit-only is read-only outside its job. Authorized corrections preserve prose, keep recovery copies and recheck installed files. Do not create missing-language editions or invent missing translated paragraphs. Reuse task authorization across resume and stages; platform grants remain distinct. No intermediate task confirmations.

Update executable behavior, SKILL.md, README.md, DS.md, skill.json, references and tests together. Documentation is English. Maintain one unversioned implementation and one layout contract. Do not retain retired workflows or compatibility dispatch. Preserve unrelated user edits. Run local tests, syntax checks and doctor; report unavailable native validation honestly.

Always validate short dialogue and the default imported-article CSS cascade. Preserve source-supported emphasis and type hierarchy. Consolidate inline declarations into the managed stylesheet with computed-style checks; retain the root presentation when body content is imported into an article, and account for different root rem units.

## Cleanup after successful completion

After successful correction, verify the installed canonical files and durably save RAPORT-CORECTII.md at the book root. Then the native complete command must automatically remove book-owned .validatebook-jobs, .validatebook-layout and .validatebook-layout-jobs, including obsolete jobs, staged copies, recovery copies and temporary evidence. Preserve the PDF, canonical HTML/CSS/assets, manifest and final reports. Runtime failures retain diagnostics until the next fresh invocation; unresolved validation errors permit verified installation and cleanup. Never remove another running job: unresolved lock files defer cleanup and must be reported explicitly. Audit-only prepare retains its report/status job. No agent-authored cleanup script or intermediate user confirmation is required. The final report records cleanup completion or failure; deleted job paths are historical, not available evidence.

## Fresh execution and partial completion

Every complete invocation (including prepare --auto-correct) deletes previous book-owned .validatebook-jobs, .validatebook-layout and .validatebook-layout-jobs results and final reports before creating a fresh transaction. Preserve canonical PDF/HTML/CSS/assets: starting from zero means fresh evidence, not undoing installed corrections. Never delete another job with an unresolved lock. Custom job directories receive a new transaction; unrelated files are preserved. Audit-only prepare retains its read-only report/status job.

Apply source-supported repairs until no further file changes occur. Unresolved validation findings remain errors in RAPORT-CORECTII.md; completed_with_errors means verified corrections were installed, not that the book passed all checks. Exit code 3 signals remaining errors without disabling HTML or reader access. Unsafe candidate batches are rejected and recorded while other documents continue. Runtime/tool failures and concurrent edits preserve originals. After verified installation and durable reporting, remove temporary results even for completed_with_errors.
