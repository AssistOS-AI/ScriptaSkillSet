# ScriptaSkillSet

Portable document skills for an active LLM environment:

`short-description`, `marketing-summary`, `comprehensive-summary`,
`translate-html`, `humanise-html`, `relevant-keywords`,
`html2doc` and `doc2pdf` run on Node.js 22 or newer with bundled
local dependencies.

- `pdf2html` converts born-digital PDFs to semantic responsive HTML.
- `validate-book` uses local code to check and correct PDF/HTML layout, fonts and structure, propagate English presentation to existing languages, and produce text-only correction reports. See [workflow](skills/validate-book/SKILL.md).
- `translate-html` translates semantic HTML with the active LLM while preserving structure and shared assets.
- `humanise-html` conservatively improves same-language book prose chapter by chapter while preserving HTML, facts, links, and shared assets.
- `comprehensive-summary` analyzes every content chapter and produces a source-traceable HTML summary for a requested reading time.
- `marketing-summary` turns a summary or another semantic HTML book into concise editorial sales copy while withholding answers and spoilers.
- `short-description` creates a neutral 4–6-sentence HTML description of a document's theme without revealing solutions, conclusions, or spoilers.
- `html2doc` converts Scripta semantic HTML books to editable, professionally structured DOCX documents.
- `html2AudiobookSkill` narrates HTML books locally through ebook2audiobook and Piper, producing chaptered M4B and per-chapter MP3 files with automatic defaults.
- `doc2pdf` converts DOC and DOCX documents to optimized, deterministically validated PDFs using LibreOffice.
- `relevant-keywords` extracts and consolidates multilingual fundamental keywords from semantic HTML books into `relevantKeywords.txt`.
