# Batch workflow

Use `scripts/validatebook-batch` when a caller needs to run the native
validateBook correction workflow across a set of existing book roots.

This wrapper belongs to the skill because it coordinates skill execution. The
book repository remains only an input/output location for canonical book files
and validator reports.

## Contract

The batch wrapper does not add a model, reviewer or prose-rewrite stage inside
validateBook. It runs `scripts/validatebook complete` for each book root,
captures the JSON result, copies `RAPORT-CORECTII.md` into a batch artifact
folder, and writes an `AGENT-FOLLOWUP.md` packet for unresolved items.

The follow-up packet is deliberately outside the native validation contract.
When it is used by an agent, the agent must first decide whether the unresolved
item belongs in book files or in validateBook native code. Deterministic
layout, typography, pagination, image, table and source-fidelity defects should
normally be fixed in the native skill rather than patched ad hoc in a book.

## Commands

Process all books under a repository's `docs/books` tree:

```sh
scripts/validatebook-batch --books-root /path/to/repo/docs/books --all
```

Process selected roots:

```sh
scripts/validatebook-batch --books-root /path/to/repo docs/books/title/bk-id
```

Process a text or JSON manifest:

```sh
scripts/validatebook-batch --books-root /path/to/repo --manifest tmp/books-to-check.txt
```

Useful options:

- `--dry-run` writes the discovered plan without running corrections.
- `--limit N` limits a broad run.
- `--skip N` resumes discovery after the first N sorted books.
- `--concurrency N` processes independent book roots concurrently; each book
  retains sequential correction rounds and isolated job/output directories.
- `--languages en,ro` narrows validator inventory.
- `--word-spacing natural` requests natural prose spacing.
- `--paginate` asks the native workflow to paginate English from source
  evidence.
- `--out DIR` chooses the batch report directory.

The wrapper passes through the standard `VALIDATEBOOK_CHROMIUM`,
`VALIDATEBOOK_PDFTOTEXT`, `VALIDATEBOOK_PDFFONTS`, `VALIDATEBOOK_PDFIMAGES` and
`VALIDATEBOOK_PDFTOHTML` environment variables. `VALIDATEBOOK_BIN` and
`VALIDATEBOOK_PDF2HTML` override launcher defaults.

## Outputs

Each run creates:

- `summary.json`, machine-readable aggregate status.
- `SUMMARY.md`, human-readable batch status.
- `AGENT-FOLLOWUP.md`, scoped instructions and book list for unresolved items.
- `books/<slug>/validatebook-result.json`, copied validator JSON output.
- `books/<slug>/RAPORT-CORECTII.md`, copied book-root correction report when
  available.

The canonical validator report remains at each book root as
`RAPORT-CORECTII.md`.
