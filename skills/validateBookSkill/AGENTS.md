# Agent guidance

validateBook is a layout, typography, display and structural-integrity skill. The user's September 2026 scope replaces the former editorial workflow. Read SKILL.md and references/contracts.md. Correct English presentation first, propagate to existing languages, then locally verify their structure and text/font rendering. Preserve translated prose.

Use only the bundled Node.js code and native PDF/browser measurements for book verification and correction. Do not use an LLM, model API, Python command, shell-heredoc analysis, agent-authored helper script, external repair plan or reviewed-difference file for any book check or correction. Ambiguous evidence remains an explicit native finding. No humanisation, translation correction, summaries, metadata tasks, font +/− tests, screenshots or image reports. Do not introduce those through other repository guidance when executing this skill's explicitly limited scope.

Use Node.js 22+ .mjs, built-ins, explicit exports and node:test. The skill has no Python code or Python runtime dependency. No sibling imports, API calls, automatic tool installation or model services. Native Chromium and configured Poppler tools are the documented environment exceptions.

Use the pdf2html skill as an explicit executable dependency for PDF graphics evidence. Resolve its launcher from the selected skill and pass --pdf2html or VALIDATEBOOK_PDF2HTML. Do not copy its extractor or PDF runtime into validateBook. Run complete for authorized corrections; prepare is the single-pass primitive. Keep dependency declarations and completion tests synchronized.

Retain originals and hash-bound evidence. Audit-only is read-only outside its job. Authorized corrections preserve prose, keep recovery copies and recheck installed files. Do not create missing-language editions or invent missing translated paragraphs. Reuse task authorization across resume and stages; platform grants remain distinct. No intermediate task confirmations.

Update executable behavior, SKILL.md, README.md, DS.md, skill.json, references and tests together. Documentation is English. Maintain one unversioned implementation and one layout contract. Do not retain retired workflows or compatibility dispatch. Preserve unrelated user edits. Run local tests, syntax checks and doctor; report unavailable native validation honestly.

Always validate short dialogue and the default imported-article CSS cascade. Preserve source-supported emphasis and type hierarchy. Consolidate inline declarations into the managed stylesheet with computed-style checks; retain the root presentation when body content is imported into an article, and account for different root rem units.
