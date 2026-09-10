# Unslop Design Summary

## Introduction

`unslop` edits prose to remove formulaic AI writing patterns while preserving meaning and matching the intended tone.

## Core Content

The descriptor directs the agent to scan, rewrite, add an appropriate human voice, and review the result. It covers inflated claims, vague attribution, repetitive vocabulary, punctuation habits, chatbot phrases, filler, jargon, dense sentences, and passive constructions. Its frontmatter retains `disable-model-invocation: true`; the consuming environment determines how that flag affects invocation.

The skill has no executable helper, bundled third-party code, or declared skill dependency. The descriptor, this design summary, and catalog metadata remain together when copied.

## Decisions & Questions

### Question #1: What must an edit preserve?

Response: The source meaning and intended tone govern the rewrite. Style changes must not invent evidence or alter the underlying claims.
