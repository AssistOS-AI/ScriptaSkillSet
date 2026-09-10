---
name: relevantKeywords
description: Read every content batch of an HTML book with the active LLM, consolidate fundamental multilingual keywords and publish a comma-separated relevantKeywords.txt with deterministic source and JSON validation.
---

# Relevant keywords

Use this skill to identify the fundamental concepts of an HTML book. Keep keywords in the document language and preserve the input file. Node.js >=22 and the bundled HTML parser run the commands.

## Workflow

1. Run `<skill-directory>/scripts/relevantkeywords analyze INPUT.html --count 20`. Optional flags are `--language TAG`, `--synonyms FILE` and `--job-dir DIR`. The returned JSON identifies the job directory and output.
2. Read job.json and context.json. Language comes from the explicit option or the HTML lang attribute. If absent, identify it from the content and set context.json language to a BCP 47 tag. Use context notes for book-wide terminology decisions.
3. Read every file under batches/. Each contains units with stable id and text fields. Analyze the complete batch using the active LLM. Identify essential concepts, merge equivalent expressions, omit incidental names and generic terms, and cite the units that support each keyword. Read neighboring batches when an inline fragment needs context.
4. Write each result to analyses/ using the same batch filename. The exact shape is `{"reviewed":true,"keywords":[{"keyword":"concept","unitIds":["u000001"]}]}`. An individual batch may have no useful keywords. Mark reviewed only after reading it completely.
5. Run `<skill-directory>/scripts/relevantkeywords status JOB` and finish all remaining batches. Read all analyses together, rank concepts by importance to the whole book and consolidate semantic duplicates.
6. Write selection.json with the same result shape. Select between one and the requested number of keywords. Preserve priority order, use the document language, and cite supporting source IDs. Review every selected term for relevance and synonym overlap. Do not add unsupported concepts to fill the count.
7. Run `<skill-directory>/scripts/relevantkeywords build JOB`. Deliver the returned output only after successful validation.

## Contracts

The output is UTF-8 relevantKeywords.txt beside the source, containing keywords separated by comma and space, followed by a newline. Build returns output, count and keywords. The default count is 20, with a supported range of 1 to 1000. Terms cannot contain commas or line breaks. Configured synonyms are applied and duplicate canonical forms are removed.

Jobs live in .relevantkeywords-jobs/ beside the source unless overridden. They hold a source snapshot, source hash, context, batches, analyses and selection. Repeating analyze with the same source and settings resumes its job. Source changes invalidate it. Keep progress files intact while working.

Node checks completion, source identity, cited IDs, language configuration and output shape. Semantic relevance, language quality and conceptual equivalence require LLM review. Results may vary between LLM runs. See references/synonyms-format.md and dependencies.md.
