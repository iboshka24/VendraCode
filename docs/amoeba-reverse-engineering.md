# Amoeba 0.1.48 — reverse-engineering report

Target: `Amoeba-0.1.48-linux-x64.AppImage` (1 044 244 984 bytes)
SHA-256: `faf8d1be00aff865c65ac934d32eb49a81d2317f7d02f926c77b15d939ab2bc7`

Method: static inspection of the extracted AppImage payload plus REA
(`rea-agents@6.4.0`) static JavaScript-application analysis. No code was
copied into this repository: all findings below are facts (names, routes,
versions, digests), and every VendraCode change motivated by them is a
clean-room implementation. The canonical REA Evidence bundle lives in
`evidence/amoeba/`; provenance (tool, command, artifact digest) is recorded
in `evidence/amoeba/PROVENANCE.md`.

> Coverage notes (explicit unknowns): the 1 GB AppImage and the 217 MB
> inner Electron binary both exceed REA's 32 MiB per-artifact bound, so
> `inspect_binary_layout` refuses them by design — native facts below come
> from `readelf`/`strings` triage instead. The 34 MB bundled `amoeba-omp-entry.js`
> (vendored oh-my-pi agent) and the generated `omp-assets` bundles were
> inventoried but excluded from deep semantic parsing (transfer budgets).

## 1. Identity

- Product: **Amoeba**, "Collaborative development environment", `amoeba://` URL scheme.
- AppImage version **0.1.48**; VS Code base **1.130.0** (Microsoft build scripts,
  `out/main.js` → `./out/main.js`, `type: module`), commit `1b6a188127eeaf9194f945eb6eb89a657e93c54c`.
- Branding map (`resources/app/product.json`): `applicationName amoeba`,
  data dir `.amoeba`, tunnel `amoeba-tunnel`, protocols, win32/darwin ids.
- Issue tracker: `github.com/keyuchen1735-boop/hive-mind`.
  Update feed: `github.com/keyuchen1735-boop/amoeba-releases` (`updates-stable`,
  generic provider, `electron-updater`).
- Backend: `https://api.useamoeba.com` (`amoeba-runtime/config.json`: `brainUrl`).

## 2. Packaging

- AppImage (Type-2 runtime, static-pie loader) → squashfs payload 3.4 GB:
  Electron **42.6.0** / Chrome 148 (`Electron/42.6.0`, `Chrome/148.0.7778.280` in binary).
- Inner `amoeba` ELF: x86-64 PIE, BuildID `944e2f247e1a760694819535c57386e1ed5052e4`,
  RPATH `$ORIGIN`, bundled `libffmpeg.so`, standard Chromium NEEDED set
  (nss/nspr/glib), `protected_memory` section (Electron protected memory).
- `resources/app`: unpacked (not ASAR) VS Code layout — `out/` (62 MB, 39
  top-level JS bundles: `main.js` 1.5 MB, `cli.js`, `bootstrap-fork.js`,
  `vs/` workbench), `extensions/` (85 stock VS Code extensions, no custom AI
  extension — the AI surface lives outside the workbench), `node_modules`
  + 93 MB `node_modules.asar` with `.unpacked` natives (`node-pty`,
  `kerberos`, `native-keymap`, `onnxruntime-node`, `vscode-oniguruma`, …).
- Proprietary layer: `resources/app/amoeba-runtime/` (2.4 GB, of which
  1.4 GB `node_modules`, 1.0 GB `managed/`).

## 3. Agent runtime (`amoeba-runtime`)

Pinned managed runtimes (`managed-runtime.json`): **bun 1.3.14** (sha256-pinned
archive + binary), **python 3.12.14**, **graphify 0.9.62** (wheel-pinned),
**omp 18.2.1**. Entry: `daemon/dist/amoeba-omp-entry.js` — a 34 MB Bun-bundled
build of `@oh-my-pi/pi-coding-agent` (OMP = oh-my-pi). Workspace graph via
`daemon/python/workspace_graph_worker.py` (50 lines: stdin JSON request,
`graphifyy==0.9.62` version gate, `repo_root`-confined paths, ignore rules,
extract → build → validate).

Daemon package `@coord/connector@0.1.0` (`daemon/dist`, 121 JS files):
`daemon.js` (Fastify-style localhost console), `brain-client.js` (typed Brain
HTTP client, zod, fetch + AbortSignal.timeout, deep imports to keep the
extension-host bundle free of fastify — measured 1.77 MB saving, per the
in-source comment), `swarm-runtime.js`, `workspace-context.js`,
`session-manager.js`, `takeover(s).js`, `reservations.js`, `sync/` (snapshotter,
apply, diff, secret-filter, snapshot-commit), `console/` (ACP, native consoles
for Claude/Codex/Antigravity, opencode-models, provider-models, codex-app-server),
per-agent hook bundles (`adapter-claude`, `adapter-codex`, prompt/pretool/posttool/turn hooks),
`provider-login.js` (OAuth host allowlist per provider), `config.js`,
`daemon-url.js` / `daemon-auth.js` / `coord-home.js`, `file-lock.js`,
`atomic-write.js`, `json-record-store.js`, `hook-stdin/stdout`, `model-efforts.js`.

Daemon identity and transport:
- Default port **48620** (`DEFAULT_DAEMON_PORT`, overridable via `DAEMON_PORT`),
  base URL fixed to `127.0.0.1`.
- Auth: `x-coord-daemon-token` header, 32 random bytes (43-char base64url),
  stored under an owner-only (0700) coord home, file-locked + atomic writes,
  constant-time comparison.
- Console routes (13): `/console/{start,list,remove,prompt,steer,interrupt,stop,
  conversation,history,terminal,models,permission}` + `/console-events`.
  Native routes: `/health`, `/shutdown`, `/diff`, `/file-sync`,
  `/file-sync-conflict`, `/join-session`, `/watch-session`, `/native-session`,
  `/subagents…`, `/takeover`, `/in-app-gate`, `/permission-posture`,
  `/pretool`, `/prompt-context`, `/push-preflight`, `/turn-event`,
  `/checkpoint-context`, `/inflight`, `/workspace-view`,
  `/workspace-context/{register,scope,unregister}`.

Brain HTTP API (cloud, `api.useamoeba.com`): `/v1/me`, `/v1/me/data`,
`/v1/agent-runs`, `/v1/sessions`, `/v1/messages`, `/v1/memories[/:id]`,
`/v1/workspaces[/:id/invites]`, `/v1/invites`, `/swarm/{messages,complete,
human-messages,learning,stop}`, `/children/claim`.

Coordination MCP server (`mcp/dist/server.js`, stdio, zod-validated, Brain-backed):
30 tools — `assign_work`, `capture_knowledge`, `check_overlap`,
`discover_procedures`, `get_messages`, `get_session`, `hand_off`, `hive_status`,
`list_people`, `list_subagents`, `lock_files`, `propose_work_request`,
`publish_plan`, `read_procedure_version`, `read_subagent`, `read_transcript`,
`recall`, `record_outcome`, `record_procedure_use`, `release_files`, `remember`,
`report_opportunity`, `request_help`, `resolve_opportunity`,
`respond_work_request`, `search_session_evidence`, `send_message`,
`spawn_subagent`, `take_over`, `update_step` (+ workspace-context + swarm
tool-definition factories).

Provider model registry (`console/opencode-models.js`, `provider-models.js`):
dozens of OpenAI-compatible endpoints (nano-gpt, kilo, openrouter, aimlapi,
ai-gateway, zenmux, bedrock, nvidia, venice, novita, deepinfra, cloudflare
gateway, huggingface router, openai, commandcode, x.ai, …) plus theme schema
pinned to `can1357/oh-my-pi` main.

## 4. REA Evidence graph (scoped, first-party)

Sealed Evidence `ev_c2f60e0c…` (confidence `derived`, authority
`shipped-artifact`; full provenance in `evidence/amoeba/PROVENANCE.md`):

- 23 186 files inventoried (incl. 1 nested ASAR), 118 first-party JS files
  parsed, 169 927 AST nodes, 2 308 findings, **0 parse failures**,
  integrity contradictions: none.
- Graph `jag_9d8157de…`: 46 468 nodes / 53 027 edges, coverage `partial`
  (23 068 inventoried files out of caller scope — relationships through them
  unknown, not absent). 47 static endpoint observations with exact
  file:line provenance (`evidence/amoeba/APP-EVIDENCE.trimmed.json`).
- Framework confirmed as **Fastify** (`call:app.post`, `call:app.get`,
  `call:fastify.get` mechanisms). Route table adds to the §3 list:
  `/amoeba/{mode,start}`, `/terminals/open`, `/local-events`,
  `/swarm/children`, `/suggestion-apply` (POST), `/file-sync`,
  `/pretool`, `/prompt-context`, `/push-preflight`, `/inflight`,
  `/turn-event`, `/native-session`, `/subagents/spawn`, `/v1/agent-runs`
  (outbound, `brain-client.js:249`).
- 28 native-addon nodes (exact `.node` paths under
  `node_modules.asar.unpacked/`), 109 source maps, 1 worker.
- Electron-boundary summary for the selected sources is empty by construction
  (daemon/MCP sources contain no `BrowserWindow`/IPC/preload surface —
  `browser_windows: 0, ipc.operations: 0`); the workbench boundary lives in
  the inventoried-but-unparsed `out/` base.

## 5. Lessons applied to VendraCode

1. **Advisory locks need TTL + owner-only release** (`server/lock-store.js`):
   Amoeba's daemon pairs reservations/takeovers with stale-context recovery so
   a dead agent never wedges a shared session. The brain server previously kept
   locks forever; now expiry (default 5 min, `VENDRA_LOCK_TTL_MS`-tunable) plus
   a periodic prune broadcast the reclamation. Protocol shapes unchanged.
2. **Loopback callers need a file-backed bearer token** (`server/daemon-token.js`):
   same shape as the observed daemon token (0700 dir, 0600 file, 43-char
   base64url, constant-time check, rotation on corruption). Available for local
   automation; the shared server's existing clients are unaffected.
3. **Pin every runtime you ship or build with** (`runtime/pins.json`,
   `scripts/verify-toolchain.mjs`): same discipline as `managed-runtime.json`
   (bun/python/graphify pins with sha256). Pins cite their source; the unit
   test fails on drift between pins, `package.json`, and CI.
