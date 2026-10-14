# Provenance — `evidence/amoeba/`

## Target

- File: `Amoeba-0.1.48-linux-x64.AppImage` (1 044 244 984 bytes)
- SHA-256: `faf8d1be00aff865c65ac934d32eb49a81d2317f7d02f926c77b15d939ab2bc7`
- Extracted with the AppImage's own `--appimage-extract` (squashfs payload,
  3.4 GB). Original file unchanged (read-only source).

## Tool

- `rea-agents@6.4.0` (source build, commit `583008852`), command
  `analyze-javascript-application` on the extracted `resources/app` directory.
- Scoped to 118 first-party files (`amoeba-runtime/daemon/dist/**`,
  `amoeba-runtime/mcp/dist/server.js`; vendored 34 MB `amoeba-omp-entry.js`
  bundle, generated `omp-assets`, and the VS Code `out/` base were inventoried
  but excluded from deep parsing), with `--max-semantic-nodes 8000`
  `--max-semantic-nodes-per-file 500`.
- Two earlier attempts are recorded as explicit non-results: the full-tree run
  (23 186 files, unbounded) and the 123-file run (seal exceeded transfer
  budgets, `unreadable_output`). The sealed run exited 0.

## Sealed result (kept out of git — 360 MB)

- `evidence_id`: `ev_c2f60e0c5ae32164d2fb9f03e0c60f5ca1988eaabed0be2b9e9a9fa0b126760d`
- confidence `derived`, authority `shipped-artifact`
- root artifact sha256 `d32d80c93fbcdd5c3c4f6a070aa46e92645cf7d32e29e6b8446f5a03ebe3fc20`
- inventory manifest `agm_345a333ed5edb269183b22db…`, graph
  `jag_9d8157de75b80b8fcd5b3562f8ee493f0a9814b3857b8e3cf1cb1368fef4db30`
- statistics: 23 186 files inventoried · 1 nested asar · 118 JS files parsed ·
  169 927 AST nodes · 2 308 findings · 0 parse failures ·
  integrity contradictions: none
- graph: 46 468 nodes / 53 027 edges, coverage `partial` (23 068 inventoried
  files caller-excluded by scope; relationships through them unknown)
- node kinds: 16 565 javascript-asset · 4 339 asar-entry · 1 185 artifact ·
  1 126 javascript-module · 109 source-map · 47 endpoint · 28 native-addon ·
  1 worker · 23 068 unknown (out of scope)

## Committed projection

- `APP-EVIDENCE.trimmed.json` (31 KB): envelope ids/digests, summary,
  statistics, limitations, the 47-node static route table, and the 118 parsed
  module paths. No per-node AST detail, no target source text.
- Nothing in this directory contains Amoeba code or binaries — only REA's
  Evidence metadata and digests. See `docs/amoeba-reverse-engineering.md` §4–5.
