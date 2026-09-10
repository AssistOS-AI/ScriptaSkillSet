# Detect Main Behaviors Design Summary

## Introduction

The `detect-main-behaviors` skill identifies the small set of behaviors that define how a project achieves its primary purpose. It supplies an evidence-backed analysis to `gamp-specs` and does not modify the inspected repository.

## Core Content

Detection begins with the project's intended outcome and traces the implemented paths that produce it. It explicitly evaluates business behaviors that enable or materially affect the user's goal, hidden mechanisms that materially determine the correctness, availability, security, continuity, routing, persistence, recovery, or result of essential functionality, and special rules or execution patterns that distinguish the project. A behavior also qualifies when it represents a primary purpose path, covers a substantial part of the project, exposes an essential API or command, preserves the active consequence of a direction-changing decision, or forms the architectural skeleton used by major workflows. Complexity or code size alone does not qualify a candidate.

The analysis excludes ordinary helpers, leaf features, optional interfaces, speculative plans, and implementation details that have no major functional consequence. It retains commands, routes, environment variables, paths, lifecycle actions, profiles, and public files when users or integrations depend on them. It names the real actor and interface, uses plain language and direct verbs, and omits abstract substitutes and private code mechanics. It reports accepted and rejected candidates with repository-relative evidence, confidence, boundaries, and conflicts. Its handoff also supplies ordered DS003 component chapter names and explanations and, when multiple components exist, the rows for a summary table containing only `Name` and `Explanation`. The accepted set is passed to `gamp-specs`, which owns DS numbering, specification prose, matrix generation, and documentation updates.

## Conclusion

The skill provides a narrow, auditable boundary between repository analysis and specification generation so the Main Behavior DS records only the project's defining behaviors.
