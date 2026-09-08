# Translate HTML Design Summary

## Purpose

The skill translates semantic HTML with the active LLM without binding the repository to a host, provider, API key, or model name. Deterministic code owns extraction, placeholder protection, resource routing, structural validation, and atomic publication.

## Translation model boundary

Python never generates translated prose. `prepare` creates ordered JSON units; the active LLM translates them; `build` accepts only complete, structurally valid results. This boundary makes LLM choice a host concern while keeping the skill reusable.

## Context strategy

The first two prose-dominant pages form a bootstrap batch. They are translated together and reviewed once before a compact style profile and glossary are frozen. Later units remain paragraph-sized but travel in page-aligned batches of approximately 32,000 model-input characters. After bootstrap, all incomplete batches are independently ready and may be translated concurrently against the same frozen context. Each worker owns exactly one output file, eliminating shared-write races while reducing elapsed time.

Markup-aware translation memory annotates exact repeated units with a canonical unit ID.
Human-facing attributes whose text differs only by a trailing number are represented as a
canonical numeric-label template. These units are omitted from model work, excluded from
the batch character budget, and expanded deterministically before validation.

Cover, contents, copyright, table-dominant, bibliography-like, and image-only pages do not qualify as bootstrap prose when two normal narrative pages are available. The document outline and three distributed source samples help the bootstrap anticipate terminology appearing later.

## HTML preservation

Semantic leaf blocks are extracted as mixed-content units. Nested inline tags become paired immutable placeholders with stored tag names and attributes. URLs, DOI values, and email addresses use protected tokens. Reassembly reconstructs markup from the stored definitions rather than trusting translated HTML.

Scripts, styles, code regions, identifiers, classes, data attributes, and behavioral markup remain unchanged. Human-facing metadata and accessibility attributes are translated as separate units. Local references are recalculated from the target HTML back to the source directory, so assets remain single-copy.

## Validation and publication

Build requires every model-owned unit exactly once, resolves every memory-backed unit, and requires a reviewed bootstrap plus a nonempty document profile. It checks placeholder identity and nesting before creating a candidate. Validation compares element topology, protected attributes and program regions, semantic block counts, resource existence, unchanged substantial units, retained source five-word sequences, unexpected duplicate model translations, broad length ratios, and—only where useful—the target's Unicode script. Intentional copies expanded from translation memory are excluded from the duplicate metric. It uses no statistical language detector. Only a passing candidate is installed, and existing files require both explicit overwrite and an ownership marker.

Heuristics identify likely omissions or wrong-language output but cannot establish semantic equivalence. The focused bootstrap review is the only mandatory model-based semantic audit.
