# VendraCode

<div align="center">

⚡ **Multiplayer AI-native IDE** ⚡

*Your agents. Working as one.*

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-29-blue.svg)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178c6.svg)](https://www.typescriptlang.org/)
[![Build](https://github.com/ibrohim/VendraCode/actions/workflows/build.yml/badge.svg)](https://github.com/ibrohim/VendraCode/actions/workflows/build.yml)

</div>

---

## 🚀 What is VendraCode?

VendraCode is an open-source, multiplayer AI-native development environment (IDE) designed for software teams running local AI coding agents. Think of it as **VS Code meets AI agents meets multiplayer collaboration**.

### Key Features

- 🧠 **The Shared Brain (Cloudflare Edge)** — Real-time WebSocket coordination at `brain.vendra.uz/ws`: live Monaco diff broadcast, file locks, peer presence and the shared GitHub repo link
- 🤝 **Multiplayer Live Co-editing** — Teammates' `onDidChangeModelContent` edits (and agent file writes) stream into the editor as colored line highlights, gutter markers and `⌁ <name> · live edit` badges, with auto-reconnect backoff
- 🌳 **Git Worktree Switcher** — Switch or create isolated session worktrees from the status bar; every agent works its own branch without conflicts
- 🤖 **Local Agent CLIs Support** — Real child processes for **OpenCode**, **Claude Code**, **Cline**, **Antigravity CLI**: version-verified detection, streamed stdout/stderr into chat, real exit codes, Stop button, no hardcoded paths. Every tool call the agent makes gets its **own message** (name + live status); free OpenCode Zen models work out of the box
- ↔️ **Resizable Agent Panel** — Drag the panel's left edge (double-click resets) or hit the expand button to widen the chat; the width persists across restarts
- 👀 **Watch the Agent Write** — When an agent creates or edits a file, the file opens in the editor and the code streams in live, with the changed lines highlighted and a `⌁ <agent> · live edit` badge — you see the code being written, not just a "done" message
- 🤝 **Teammates See Your Agents** — Agent tool calls, file locks and live edits are broadcast to the brain attributed to the agent ("OpenCode CLI → src/app.ts"), so everyone knows which agent is touching what, right in their own editor and Mission Control
- 📨 **Messenger Bots (Hermes-style gateway)** — Bind a Telegram bot to any agent: messages sent to the bot run that agent in the IDE (you watch it live) and the answer is posted back to Telegram; first chat wins the pairing
- 💬 **Markdown Chat + Slash Commands** — Agent answers render as real markdown (lists, code blocks, tables); `/help`, `/yolo` (skip approval prompts), `/models`, `/new`, `/clear`, `/stop` work with every agent
- 🧠 **Thinking / Reasoning Effort** — Pick the reasoning effort per run: CLI agents get the model variant (`--model …#high`), the native agent sends `reasoning` / `reasoning_effort` where the provider supports it
- ⚠️ **Overlap Warnings & Advisory Locks** — Surfaces potential work duplication or file conflicts between running agents before conflicts occur
- ⚡ **Built-in AI Coding Agent** — OpenCode-style tool-calling loop that creates, edits, and deletes files, executes terminal commands, and searches code
- 🔌 **Multi-Provider LLM Support** — Works with OpenAI, Anthropic, NVIDIA NIM, and any OpenAI-compatible API
- 🎯 **Mission Control** — Dashboard showing all active AI agent sessions in individual lanes with live status and action streams
- ✅ **Approval System** — Independent security gates to review and approve/deny agent file changes and shell commands
- 🔄 **Live Sync & Workspace Watcher** — Real-time recursive file system sync between all CLI agents and the IDE
- ⏳ **Self-Healing File Locks** — Advisory locks expire (default 5 min, tunable) and stale ones are reclaimed live, so a crashed agent never wedges a shared session
- 🔑 **Loopback Daemon Token** — File-backed bearer auth for local automation (`~/.vendra/daemon-token`, owner-only, constant-time check)
- 📌 **Pinned Toolchain** — Node/Electron/install pins in `runtime/pins.json`, verified by `scripts/verify-toolchain.mjs` and unit-tested against CI
- 📝 **Monaco Editor** — Full VS Code editing experience with syntax highlighting for 30+ languages
- 💻 **Integrated Terminal** — Built-in terminal with xterm.js connected via IPC
- 🛰️ **One-click Swarm Sharing** — Paste a `brain.vendra.uz` invite link to clone the shared repo, join the session and attach your agents
- 🎨 **Beautiful Dark UI** — Modern, polished interface with smooth Framer Motion animations

## 📸 Screenshots

*Coming soon*

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Electron 29 |
| UI Framework | React 18 + TypeScript |
| Code Editor | Monaco Editor (bundled locally, no runtime CDN) |
| Terminal | xterm.js |
| Styling | Tailwind CSS |
| Animations | Framer Motion |
| State Management | Zustand |
| Build Tool | Vite |
| Git | simple-git |

## 📦 Installation

### Prerequisites

- **Node.js** 22+ (pinned in `runtime/pins.json`, same as CI)
- **npm** 10+ or **yarn** 1.22+
- **Git**

### Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/VendraCode.git
cd VendraCode

# Install dependencies
npm install

# Start in development mode
npm run dev:electron

# Or just the web UI (without Electron)
npm run dev
```

### Building for Production

```bash
# Build for your current platform
npm run build:linux    # Linux (AppImage, deb)
npm run build:win      # Windows (NSIS installer, portable)
npm run build:mac      # macOS (DMG, zip)

# Build for all platforms
npm run build:all
```

### App verification (real UI, real brain)

Six suites, all self-contained (each boots its own Electron instances):

```bash
npm run test:unit              # 16 checks: Windows-aware CLI locator (mocked platform)
npm run test:app               # 33 checks: explorer, editor, search, worktrees,
                               # terminal, model scan, multi-chat, Mission Control,
                               # Settings, hotkeys, markdown/slash/thinking, fake-content guard
npm run test:multiplayer       # 12 checks: two IDE instances sharing one brain session
npm run test:multiplayer-agent # 9 checks: teammate sees a local agent's lock, live-edit
                               # badge and tool calls (agent-attributed broadcasts)
npm run test:zen               # 8 checks: pick a free OpenCode Zen model, chat routes through
                               # `opencode run --model …`, real answer lands in a persisted chat
npm run test:agent             # 11 checks: Telegram bot bound to an agent (local Bot API stub),
                               # live file write measured frame by frame, reply back to the bot
npm test                       # all six
```

They exercise the built `dist/`, so run `npm run build` first. `test:zen`/`test:agent`
use the real CLI unless `VENDRA_CLI_PATH` points at `tests/fixtures` (the agent
suites do this automatically with a deterministic fake `opencode`).

### Windows one-command build

Double-click **`build-windows.bat`**, or run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
```

The script checks Node / npm / Python / Visual Studio C++ Build Tools (printing
the exact `winget install` command when something is missing), installs
dependencies including the `node-pty` native build, type-checks, builds the
renderer, runs electron-builder and lists the resulting `.exe` files.

```bash
build-windows.bat                 # NSIS installer + portable .exe
build-windows.bat portable        # portable .exe only
build-windows.bat installer       # NSIS installer only
build-windows.bat dir             # unpacked build (fastest)

npm run build:win:full            # the same, via npm
npm run build:win:fast            # unpacked build, via npm
```

No local Windows machine? Push a tag (`git tag v1.0.0 && git push --tags`) and the
GitHub Actions workflow builds `.exe`, `.dmg`, AppImage and `.deb` for you.

## ⚙️ Configuration

### LLM Providers

Go to **Settings → Providers & Models** to configure your AI providers:

| Provider | Base URL | Model Examples |
|----------|----------|----------------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o`, `gpt-4-turbo` |
| Anthropic | `https://api.anthropic.com/v1` | `claude-sonnet-4-20250514` |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | `meta/llama-3.1-405b-instruct` |
| Custom | Any OpenAI-compatible URL | Any model name |

### Free models (no API key needed)

If the OpenCode CLI is installed and signed in, **Scan live models** in the chat
header lists everything it can run — including the free OpenCode Zen models
(`opencode/nemotron-3.5-lightning-free`, `opencode/ling-3.1-flash-free`, …).
Those rows are marked **· via CLI**: their credentials live inside the CLI, so
picking one switches the chat to the OpenCode CLI and prompts run through
`opencode run --model <id>` in the workspace. No key is pasted into the app.

### Permissions

Control what AI agents can do in **Settings → Permissions**:

- ✅ Create files
- ✅ Edit files
- ✅ Delete files
- ✅ Run terminal commands
- ⬜ Git push (disabled by default)
- ✅ Require approval before actions

## 🏗️ Project Structure

```
VendraCode/
├── electron/           # Electron main process
│   ├── main.js         # Window creation, IPC handlers, git worktrees, PTY
│   └── preload.js      # Context bridge API
├── src/                # React application
│   ├── components/     # UI components
│   │   ├── AIChat.tsx          # AI chat panel with tool-calling
│   │   ├── CodeEditor.tsx      # Monaco editor + live multiplayer diff broadcast
│   │   ├── LiveAgentStream.tsx # Amoeba live co-typing simulation
│   │   ├── LivePeersBadge.tsx  # brain.vendra.uz presence badge
│   │   ├── WorktreeSwitcher.tsx# Git worktree switcher (status bar)
│   │   ├── FileExplorer.tsx    # File tree explorer
│   │   ├── MissionControl.tsx  # Agent dashboard
│   │   ├── Settings.tsx        # Settings panel
│   │   ├── ShareSessionModal.tsx# Share / join a swarm session
│   │   ├── StatusBar.tsx       # Bottom status bar
│   │   ├── Terminal.tsx        # xterm.js terminal
│   │   └── TitleBar.tsx        # Top navigation bar
│   ├── services/
│   │   └── brainClient.ts      # WebSocket client for brain.vendra.uz
│   ├── hooks/
│   │   └── useBrainSync.ts     # Brain ⇄ store synchronization
│   ├── stores/
│   │   └── appStore.ts         # Zustand state management
│   ├── types/
│   │   └── index.ts            # TypeScript type definitions
│   ├── utils/
│   │   ├── providers.ts        # LLM provider configs & tools
│   │   └── remoteStyles.ts     # Remote-edit decoration styles
│   ├── App.tsx                 # Main app layout
│   ├── main.tsx                # React entry point
│   └── index.css               # Global styles
├── cloudflare/         # Edge coordination worker (brain.vendra.uz)
│   └── worker.js
├── .github/workflows/  # CI: Linux / Windows / macOS builds + releases
│   └── build.yml
├── index.html          # Vite entry HTML
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

## 🔌 Multiplayer Coordination (`brain.vendra.uz`)

The app talks to a Cloudflare Worker over a single WebSocket (`wss://brain.vendra.uz/ws`):

| Message | Direction | Purpose |
|---------|-----------|---------|
| `diff:broadcast` → `diff:stream` | peer → peers | Live Monaco `onDidChangeModelContent` edits |
| `typing:broadcast` → `typing:stream` | peer → peers | Amoeba word-level typing stream |
| `lock:acquire` / `lock:release` → `locks:updated` | peer → peers | Advisory file locks |
| `repo:set` → `repo:updated` | peer → peers | Shared GitHub repository link |
| `presence:set` → `peers:list` | peer → peers | Display name for cursors & badges |
| `session:init` / `peer:joined` / `peer:left` / `peers:list` | worker → peer | Session state and presence |

Live diffs are broadcast as **workspace-relative** paths (`src/utils/workspacePath.ts`), so teammates whose checkouts live at different local paths still resolve the same file. Your display name defaults to your OS username and can be overridden with `localStorage.setItem('vendracode-peer-name', 'Alice')`.

All peers of a session are routed to the same **Durable Object** (`SessionCoordinator`, one per session id), because Cloudflare Workers isolates do not share in-memory state — a plain `Map` silently drops messages between peers that land on different isolates. The hub uses the **WebSocket Hibernation API**, so idle sockets cost no CPU/duration, and `repoUrl` + file locks are persisted in the object's storage.

To point the IDE at a self-hosted brain (e.g. `server/brain-server.js`), set:

```js
localStorage.setItem('vendracode-brain-url', 'ws://localhost:4000');
```

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by [Amoeba](https://useamoeba.com/) — the multiplayer AI-native IDE
- Amoeba 0.1.48 reverse-engineering notes: [docs/amoeba-reverse-engineering.md](docs/amoeba-reverse-engineering.md) (static REA analysis; clean-room findings only, no third-party code reused)
- Built with [VS Code](https://github.com/microsoft/vscode)'s Monaco Editor
- AI agent architecture inspired by [OpenCode](https://github.com/nichochar/opencode)

---

<div align="center">
  <strong>Built with ⚡ by the VendraCode community</strong>
</div>

## Codex CLI

Install the official CLI in PowerShell:

```powershell
npm.cmd install -g @openai/codex@latest
codex.cmd --version
codex.cmd login
```

Restart VendraCode, open a workspace, and select **Codex CLI** in the agent selector.
VendraCode detects the npm installation, runs `codex exec --json --sandbox workspace-write`,
renders assistant messages and tool status, and saves the thread ID separately for each chat.
Following prompts use `codex exec resume`. Codex uses its own login, model and configuration;
select a model in the Codex model picker to override the CLI default. The picker reads the catalog through Codex app-server model/list using your local login. The thinking selector is
passed as `model_reasoning_effort`; supported values depend on your Codex model.
File changes are reflected by the existing workspace watcher. Stop uses the existing process-tree shutdown.

Run the Codex integration unit tests with `node tests/codex-stream.test.mjs`.

## Swarm and MCP (1.3.0)

Share → Copy Link registers a private, authenticated room. Share the complete invitation
with your friend; both participants must use VendraCode 1.3 or newer. Old unauthenticated
rooms migrate to a new private room, so create a new invitation after upgrading.

Join Friend's Swarm validates the token and repository before running Git. It maintains a
bare repository cache and creates a fresh branch and worktree under
`Documents/VendraCode/Swarm`. Rejoining never pulls into or resets an existing checkout.
The remote default branch is discovered instead of assuming `main`. Private repositories
require working Git credentials on the joining computer.

Swarm shares live edit highlights, agent activity, repository identity, and advisory locks.
It does not automatically overwrite your files with a teammate's edits: use Git commits,
push/pull and merges to transfer code. Locks are owned by the server-side connection and
agent, expire after five minutes, and renew while held by a connected client. They are
coordination notices, not a filesystem access restriction.

Settings → MCP Servers manages local stdio and Streamable HTTP servers for **Vendra AI**
and **Codex CLI** separately. Vendra AI discovers server tools and includes them in its
agent loop; external calls use the existing approval gate unless YOLO is enabled. Test
connection displays discovered tool names. HTTP bearer authentication uses a named local
environment variable. OAuth-only servers can be configured and authenticated through
Codex (`codex mcp login <name>`); native Vendra AI does not implement an OAuth browser flow.
MCP configuration is local to the machine and is never shared through swarm invitations.
Codex MCP entries are managed using its CLI and remain in the user's Codex configuration.

Validation:

```powershell
npm.cmd run test:unit
npm.cmd run test:swarm:live
# Build Windows first, then set the packaged executable path if necessary:
$env:VENDRA_TEST_APP = 'C:\path\to\win-unpacked\VendraCode.exe'
npm.cmd run test:swarm:win
```

The Windows integration test uses temporary IDE/Codex profiles, joins an isolated test
swarm, creates a real worktree of this repository, and checks peer discovery, live edit
badges, a real MCP tool call, and Codex MCP add/list/remove.

### 1.3.1: project-folder selection for CLI agents

Sending a message to a CLI agent without an open, valid workspace now opens the folder
picker before the agent starts. Cancelling leaves the prompt available to send again.
Codex is launched with `--skip-git-repo-check` in the explicitly selected folder, so
folders without a Git repository are supported with the workspace sandbox still enabled.
