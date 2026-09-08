---
name: translateHtml
description: Translate complete semantic HTML documents from one language to another with the active LLM while preserving DOM structure, inline formatting, scripts, styles, links, reader integration, and shared assets. Use page-aware bootstrap context, approximately 32,000-character parallel batches, translation memory, and deterministic structural and language heuristics.
---

# Translate HTML

Use this skill when the user asks to translate an HTML document while preserving its formatting and behavior.

The active host-provided LLM performs the translation. Never select, name, configure, or call another LLM or translation API. The Python runtime only extracts protected units, applies translations, rewrites local resource paths, validates the result, and publishes it atomically.

## Required boundaries

- Treat the source HTML and all source assets as immutable.
- Translate meaning faithfully without summaries, additions, omissions, factual corrections, or stylistic rewriting.
- Preserve DOM topology, inline formatting, scripts, styles, IDs, classes, `data-*`, URLs, DOI values, email addresses, numbers, and protected placeholders.
- Translate visible prose plus `<title>`, meta description, `alt`, `title`, and `aria-label`.
- Never translate `script`, `style`, `code`, `pre`, `kbd`, `samp`, `math`, `svg`, or content under `translate="no"`.
- Never OCR or translate text inside images.
- Preserve each unit ID and its placeholder multiset exactly. Inline placeholders may move only as required by target-language word order, while remaining correctly nested.
- Preserve names and bibliography metadata unless ordinary descriptive wording requires translation. Never modify citations, URLs, journal coordinates, or identifiers.
- Do not claim that structural heuristics prove semantic correctness. They detect incomplete translation and structural damage; the bootstrap review supplies the limited semantic check.

## Portable launcher

Resolve this skill directory from `SKILL.md` and use only its launcher:

```bash
<skill-directory>/scripts/translatehtml <command>
```

The POSIX launcher supports macOS and Linux. It verifies `uv`, installs managed Python 3.12, and synchronizes the locked environment inside the skill directory. It does not install or select a translation model.

## Translation workflow

### Completion invariant

Once translation has started, continue through every batch and run `build`; document size or the number of batches is never a reason to stop. Progress messages are informational and must not end the task. If execution is interrupted or context is compacted, resume the existing deterministic job, inspect its status, and continue from `nextBatch`. Return control to the user before publication only for a genuine external blocker or invalid source—not because the work spans many batches.

### Approval policy

Treat the user's request to translate the document as authorization for the complete prepare–translate–build–validate workflow. Never request confirmation between batches, before `build`, or before validation. Run all operations that already fit the active filesystem and command permissions without an approval prompt.

Before `prepare`, preflight the permissions needed to read the source, create the local
job, write the target directory, run the launcher, and install a missing managed runtime.
If the execution environment requires elevated permission for any of them, request one
combined approval at that point, scoped to the whole translation run. After work starts,
never request a second approval. If an unforeseeable new privileged capability later
becomes indispensable, exhaust safe alternatives and report it as a blocker rather than
asking the user to approve another batch or continuation.

Progress updates must be declarative status messages, never questions or calls to action.
Do not use wording such as “continue?”, “approve”, “confirm”, or “shall I process the next
batch?”. A progress update must not end or pause the workflow.

### 1. Prepare

```bash
<skill-directory>/scripts/translatehtml prepare input/index.html --to ro
```

Use `--from` only to override a missing or incorrect `<html lang>`. Use `--output` when the input does not live in a language-named directory. The default maps `.../en/index.html` to `.../ro/index.html`.

Read the returned job path, then read `job.json`, `bootstrap.json`, `context.json`, and the first source batch completely.

Without `--job-dir`, `prepare` uses a deterministic resumable job under
`.translatehtml-jobs/` beside the language directories. Keeping job files inside the
document workspace prevents per-batch external-path permission prompts. Re-running the
same command resumes it instead of discarding completed batches. Check progress at any
time with:

```bash
<skill-directory>/scripts/translatehtml status <job-path>
```

### 2. Build and review the bootstrap

The first batch contains units from the first two qualifying narrative pages. Translate all of its units together using the outline and representative samples from `bootstrap.json`.

Write `translations/batch-0001.json` with this exact shape:

```json
{
  "units": [
    {"id": "u000001", "translation": "..."}
  ]
}
```

Review the bootstrap once against its source for meaning, omissions, terminology, pronouns, tone, casing, and placeholder integrity. Correct the translated batch before continuing.

Fill `context.json`:

- set `bootstrapReviewed` to `true`;
- write a compact `documentProfile` of at most about 800 tokens;
- record stable source-to-target terminology in `glossary`;
- keep `previousBatchSummary` within about 150 tokens;
- retain at most the final three useful source/translation pairs in `previousPairs`.

This bootstrap review is mandatory. Do not translate later batches before it is complete.

### 3. Translate remaining batches in parallel

After the bootstrap review, run `status` and use `readyBatches`. Dispatch up to
`recommendedParallelBatches` at once, bounded by the worker slots actually available.
The root agent may translate one ready batch itself while workers translate distinct
batches. Never assign the same batch twice.

Each batch targets approximately 32,000 model-input characters and remains page-aligned
when practical. Every translator must:

1. Read the complete assigned source batch and the frozen `context.json`.
2. Translate every unit that does not contain `reuseOf` or `reuseTemplateOf`, returning
   exactly one translation for every remaining ID. `build` expands those memory-backed
   units automatically.
3. Use the complete current batch for local paragraph context. Do not concatenate units or repeat previous output in a translation.
4. Apply the fixed bootstrap profile, glossary, summary, and example pairs consistently.
5. Preserve all `⟦OPEN:T...⟧`, `⟦CLOSE:T...⟧`, `⟦VOID:T...⟧`, and `⟦PROTECT:P...⟧` tokens exactly once.
6. Write only its matching file under `translations/`; parallel workers must not modify
   `context.json` or any other batch.

Wait for the active group, run `status`, then dispatch the next `readyBatches` until none
remain. Batch completion may be out of order. Do not ask the user to prompt continuation.

Exact repeated units are translated once. Repetitive human-facing numeric labels such as
`PDF page 1`, `PDF page 2`, and so on are translated from one canonical template while
their numbers are restored deterministically. These automatic units do not consume the
32,000-character model budget.

Translate a paragraph as one unit. Split conceptually at sentence boundaries only if one prepared unit is exceptionally long; still return one combined translation for its ID.

### 4. Build and validate

```bash
<skill-directory>/scripts/translatehtml build <job-path>
```

Add `--overwrite` only when replacing an output already owned by `translatehtml-skill`. Fix the job and retry if build reports missing units, changed placeholders, structural errors, broken resources, excessive retained source text, or duplicated translations.

The target HTML references source assets through rewritten relative paths. Assets are never copied. For example, `en/assets/styles.css` becomes `../en/assets/styles.css` from `ro/index.html`.

Validate an existing translation independently with:

```bash
<skill-directory>/scripts/translatehtml validate source/index.html --html target/index.html --to ro
```

## Validation contract

Validation checks:

- exact paragraph and semantic-block counts;
- element topology and protected attributes;
- unchanged scripts, styles, code, and reader bridge;
- exact unit and placeholder coverage during build;
- resolvable local stylesheets, images, and other resources;
- a lightweight Unicode-script check when the target language has a distinctive script;
- substantial unchanged-unit ratio;
- retained source five-word sequences and duplicated translations;
- broad source-to-target length ratio.

Structural damage, missing resources, strong source-text overlap, an incompatible distinctive script, excessive duplicate translations, or more than 10% unchanged substantial units with at least five occurrences fails publication. Smaller untranslated signals and unusual length produce warnings. The validator deliberately performs no statistical language detection.

## Output contract

A successful run publishes only the target `index.html`. It does not copy assets or write
a manifest inside the target language directory. Job data and the validation report
remain in the local hidden job directory returned by `prepare`.

## Final response

Send a final response only after `remainingBatches` is zero and `build` has published the validated document. Link the translated `index.html`. Report source and target languages, validation status, warnings, paragraph counts, and the most important limitation. Never claim that heuristic validation proves a perfect translation.
