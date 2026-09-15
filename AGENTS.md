# Skill catalog guidance

Skills are portable folders under skills/. Follow each folder's AGENTS.md and SKILL.md. New executable skill code defaults to Node.js 22+ .mjs, node: built-ins and node:test. Document dependency exceptions locally. Preserve existing Python workflows unless conversion is authorized.

validateBookSkill audits existing books and existing translations only. Its local DS.md contains its acceptance matrix and docs/index.html links operational documentation. Never infer permission to regenerate missing translations or delete books from an audit request. Source books and assets remain immutable by default.
