# Existing-book repair

In complete-maintenance mode, preserve the accepted same-language baseline and
record chapter-level before/after evidence, including unchanged units. English
humanisation changes require whole-chapter review in every existing translation;
target humanisation uses its own corrected baseline and never creates a new
translation. Revalidate meaning, protected facts, typography and actual reader
layout. The authorized host promotes the accepted candidate to the existing
canonical file with backup and original-hash checks after the entire workflow
passes. Exclusive-write candidates below are temporary, not duplicate editions.

This command consumes validateBook report.json without creating a new translation or rewriting an entire book.

```sh
scripts/humanisehtml repair --report /audit/report.json
scripts/humanisehtml repair --report /audit/report.json --patches /audit/patches.json --output /book/lang/full_content.corrected.html
```

The first command returns this skill's findings and the exact reportHash. The active LLM reviews source context and proposes:

```json
{"reportHash":"returned hash","file":"/book/lang/full_content.html","patches":[{"findingId":"id","before":"unique exact old HTML substring","after":"localized corrected substring"}]}
```

Use only reported locations and preserve unaffected structure, facts, markup and asset references. One exact-match patch per finding. Do not insert whole missing chapters or create absent languages. Source-edition and missing-chapter blockers stop repair. Input hashes and report hash must still match.

Output is exclusively a new .html file in the source directory. The command never overwrites originals, assets or previous candidates. It returns needs_revalidation, not a publication pass. Run a fresh validateBook audit before accepting the candidate. This host-reviewed exact replacement mechanism does not itself prove meaning preservation or DOM correctness.

Use the normal skill workflow for its ordinary operations. Repair is a separate, localized candidate path, not an alias for whole-document prepare/build.
