# ScriptaSkillSet

Portable document skills for an active LLM environment:

`shortDescriptionSkill`, `marketingSummarySkill`, `comprehensiveSummarySkill`,
`translateHtmlSkill`, `humaniseHtmlSkill`, `relevantKeywordsSkill`,
`html2DocSkill` and `doc2PdfSkill` run on Node.js 22 or newer with bundled
local dependencies.

- `pdf2htmlSkill` converts born-digital PDFs to semantic responsive HTML.
- `translateHtmlSkill` translates semantic HTML with the active LLM while preserving structure and shared assets.
- `humaniseHtmlSkill` conservatively improves same-language book prose chapter by chapter while preserving HTML, facts, links, and shared assets.
- `comprehensiveSummarySkill` analyzes every content chapter and produces a source-traceable HTML summary for a requested reading time.
- `marketingSummarySkill` turns a summary or another semantic HTML book into concise editorial sales copy while withholding answers and spoilers.
- `shortDescriptionSkill` creates a neutral 4–6-sentence HTML description of a document's theme without revealing solutions, conclusions, or spoilers.
- `html2DocSkill` converts Scripta semantic HTML books to editable, professionally structured DOCX documents.
- `html2AudiobookSkill` narrates HTML books locally through ebook2audiobook and Piper, producing chaptered M4B and per-chapter MP3 files with automatic defaults.
- `doc2PdfSkill` converts DOC and DOCX documents to optimized, deterministically validated PDFs using LibreOffice.
- `relevantKeywordsSkill` extracts and consolidates multilingual fundamental keywords from semantic HTML books into `relevantKeywords.txt`.
