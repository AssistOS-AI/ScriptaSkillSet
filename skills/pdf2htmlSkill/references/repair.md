# Existing-book repair

## Default acceptance and publication

Treat correction as repair of the existing reader-consumed HTML. Do not run conversion into another filename or publish a duplicate edition unless explicitly requested. The source PDF controls fonts and variants, proportional sizes, line height, paragraph boundaries/indentation/alignment, headings, margins, intentional blank space, images and contents. Record paired PDF/HTML evidence for these properties. Restore a borderless contents list with aligned page labels and source leaders, not an invented table header or grid. Preserve approved editorial exceptions and report source inconsistencies without inventing missing entries.

Check loaded fonts rather than declarations. Preserve required font licenses; report unavailable faces instead of silently accepting substitutions. Reflow may change wrapping, not the source hierarchy. Test the actual trusted host reader in HTTP and supported iframe modes, at desktop/tablet/mobile and maximum A−/A+ size, including contents clicks and style retention after sanitization. Use isolated profiles and block external traffic. If unavailable, reader acceptance stays pending.

The exclusive-write output below is a temporary safety candidate, not the final edition. After fresh content, visual and reader acceptance, the host retains a recovery snapshot outside the published edition, verifies the original hash has not changed, and replaces the exact authorized canonical HTML plus reviewed book-owned assets. Recheck that canonical path and record hashes, backup and evidence. Preserve PDF, unrelated languages, links and anchors. Archive only owned temporary candidates. Shared reader/assets need separately scoped repairs. The CLI does not automatically promote candidates. Audit-only requests never authorize promotion.

This command consumes validateBook report.json without creating a new translation or rewriting an entire book.

```sh
scripts/pdf2html repair --report /audit/report.json
scripts/pdf2html repair --report /audit/report.json --patches /audit/patches.json --output /book/lang/full_content.corrected.html
```

The first command returns this skill's findings and the exact reportHash. The active LLM reviews source context and proposes:

```json
{"reportHash":"returned hash","file":"/book/lang/full_content.html","patches":[{"findingId":"id","before":"unique exact old HTML substring","after":"localized corrected substring"}]}
```

Use only reported locations and preserve unaffected structure, facts, markup and asset references. One exact-match patch per finding. Do not insert whole missing chapters or create absent languages. Source-edition and missing-chapter blockers stop repair. Input hashes and report hash must still match.

Output is exclusively a new .html file in the source directory. The command never overwrites originals, assets or previous candidates. It returns needs_revalidation, not a publication pass. Run a fresh validateBook audit before accepting the candidate. This host-reviewed exact replacement mechanism does not itself prove meaning preservation or DOM correctness.

Use the normal skill workflow for its ordinary operations. Repair is a separate, localized candidate path, not an alias for whole-document prepare/build.
