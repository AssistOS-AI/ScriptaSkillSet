# Complete layout correction in ScriptaHub

A request to validate/correct a book under this skill covers structure and display only.

1. Inventory the English PDF, canonical English HTML, all existing full-language readers, local assets and prior job. Preserve recovery information and existing task authorization.
2. Run local PDF/HTML checks for every page and the entire English document. Correct source-supported structure and presentation, then remeasure.
3. Propagate accepted English typography, layout, tables, images, headings and contents/reference presentation to every existing language. Preserve translated text, language tags and relative resources. Never invent an absent reader or paragraph.
4. Run local structural-integrity and rendering checks on every translated HTML. Investigate only concrete missing-block/alignment and display defects. Do not humanise or semantically proofread translations.
5. Verify canonical files/dependencies, and run the repository's relevant integration/link checks. Refresh generated pages only when the changed integration requires it; there is no metadata-authoring or summary stage.
6. Deliver report.txt with problems, locations, before/after corrections, tests, recovery paths and unresolved cases. JSON evidence remains available. No screenshots or image reports.

`complete-plan` creates a small layout coordinator and points to its audit directory. `prepare --job-dir AUDIT_DIR --auto-correct` performs supported local checks/repairs. `complete-status` verifies the recorded audit and returns its actual status. No host-authored all-pass receipts or per-unit semantic review batches are required.

Audit-only does not alter canonical files. Authorized native repairs use unique selectors, source hashes, text-preservation checks, backups and atomic replacement. After an interruption inspect recovery.json before resuming; never treat a partial write as a completed audit. A source changed after an audit invalidates that audit.

Coordinators require the layout scope, book identity, document selection and audit directory. Unrelated records are rejected without modification.
