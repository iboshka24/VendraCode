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
- 🤖 **Local Agent CLIs Support** — Real child processes for **OpenCode**, **Claude Code**, **Cline**, **Antigravity CLI**: version-verified detection, streamed stdout/stderr into chat, real exit codes, Stop button, no hardcoded paths
- ⚠️ **Overlap Warnings & Advisory Locks** — Surfaces potential work duplication or file conflicts between running agents before conflicts occur
- ⚡ **Built-in AI Coding Agent** — OpenCode-style tool-calling loop that creates, edits, and deletes files, executes terminal commands, and searches code
- 🔌 **Multi-Provider LLM Support** — Works with OpenAI, Anthropic, NVIDIA NIM, and any OpenAI-compatible API
- 🎯 **Mission Control** — Dashboard showing all active AI agent sessions in individual lanes with live status and action streams
- ✅ **Approval System** — Independent security gates to review and approve/deny agent file changes and shell commands
- 🔄 **Live Sync & Workspace Watcher** — Real-time recursive file system sync between all CLI agents and the IDE
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

- **Node.js** 18+
- **npm** 9+ or **yarn** 1.22+
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

## ⚙️ Configuration

### LLM Providers

Go to **Settings → Providers & Models** to configure your AI providers:

| Provider | Base URL | Model Examples |
|----------|----------|----------------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o`, `gpt-4-turbo` |
| Anthropic | `https://api.anthropic.com/v1` | `claude-sonnet-4-20250514` |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | `meta/llama-3.1-405b-instruct` |
| Custom | Any OpenAI-compatible URL | Any model name |

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
- Built with [VS Code](https://github.com/microsoft/vscode)'s Monaco Editor
- AI agent architecture inspired by [OpenCode](https://github.com/nichochar/opencode)

---

<div align="center">
  <strong>Built with ⚡ by the VendraCode community</strong>
</div>
