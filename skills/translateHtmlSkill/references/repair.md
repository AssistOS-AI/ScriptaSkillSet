# Existing-book repair

## Whole-chapter scope during complete maintenance

When English changes, inspect the entire corresponding chapter in each existing
translation, including all batches and adjacent boundary context. Review meaning,
omissions, additions, negation, terminology, voice, links, paragraph structure and
source-derived presentation. Apply all necessary corrections throughout the chapter,
then revalidate the complete chapter. Preserve faithful passages; this is not an
instruction to retranslate the whole chapter or book indiscriminately. Record every
reviewed source/target unit, stable chapter mapping, input/output hashes and evidence.
Include English humanisation changes in impact detection. Global font/CSS changes
require every chapter's presentation review without forcing prose changes.

The low-level helper below still accepts localized finding-bound patches, not a
whole-book replacement. Use multiple such patches within the fully reviewed chapter.
If topology must change to fix a known conversion defect, the host stages and reviews
that structural repair separately; ordinary translation-build invariants stay intact.
After complete acceptance the authorized host retains a backup, verifies the unchanged
original hash, promotes to the existing canonical HTML, and rechecks reader integration.
Temporary candidates are not duplicate published editions. No absent language or
missing whole chapter is generated. A complete ScriptaHub run also rechecks same-language
humanisation, short readers and affected metadata through its host coordinator.

This command consumes validateBook report.json without creating a new translation or rewriting an entire book.

```sh
scripts/translatehtml repair --report /audit/report.json
scripts/translatehtml repair --report /audit/report.json --patches /audit/patches.json --output /book/lang/full_content.corrected.html
```

The first command returns this skill's findings and the exact reportHash. The active LLM reviews source context and proposes:

```json
{"reportHash":"returned hash","file":"/book/lang/full_content.html","patches":[{"findingId":"id","before":"unique exact old HTML substring","after":"localized corrected substring"}]}
```

Use only reported locations and preserve unaffected structure, facts, markup and asset references. One exact-match patch per finding. Do not insert whole missing chapters or create absent languages. Source-edition and missing-chapter blockers stop repair. Input hashes and report hash must still match.

Output is exclusively a new .html file in the source directory. The command never overwrites originals, assets or previous candidates. It returns needs_revalidation, not a publication pass. Run a fresh validateBook audit before accepting the candidate. This host-reviewed exact replacement mechanism does not itself prove meaning preservation or DOM correctness.

Use the normal skill workflow for its ordinary operations. Repair is a separate, localized candidate path, not an alias for whole-document prepare/build.
