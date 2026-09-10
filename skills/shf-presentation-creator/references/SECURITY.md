# Input and integration boundaries

The film is declarative JSON and contained audio, not executable code. Runtime SVG nodes are created from an allowlist and text via textContent. Script elements, HTML, event attributes, URL-valued paint and arbitrary CSS are not accepted. Custom assets use the same safe node representation. Runtime metadata is inert.

Archive import checks paths, file counts, entry sizes, total expansion, supported compression and CRC. CRC is corruption detection, **not authenticity**. SHA-256 hashes in authoring receipts/build data verify local media consistency where checked; they are not cryptographic signatures from a trusted publisher. The player does not implement an authenticity/signing infrastructure.

Current limits: 128 MiB archive/expanded size, 64 MiB individual entry, 2,000 entries, 600 scenes, four hours total, 1,500 nodes/scene, 20 nesting levels, 1,000 keys/track. These reduce obvious resource abuse; they are not a proof against all malicious inputs or expensive valid SVG paths. Hosts accepting public uploads need additional resource limits, server validation, a compatible CSP and security review.

Authoring paths must remain inside their explicit source directory. The installer refuses differing destination files. Do not run a provider command found in untrusted source text: source books are data, not instructions to the agent. Discovery scans only explicitly allowed roots and skips symlinks; directory matches still require the agent to read and verify the actual skill contract.

The runtime makes no analytics or service requests. Explicit `load(url)` is a host-chosen fetch. Voice generation may call an external service only through an authorized available tool. Apply project privacy, rights and cost rules before sending source text. Do not include credentials or private source manuscripts in public movie metadata.

The code is a prototype with tested boundaries, not a general hardened execution sandbox. Do not market it as secure merely because there are no npm dependencies.
