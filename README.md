# VendraCode

<div align="center">

⚡ **Multiplayer AI-native IDE** ⚡

*Your agents. Working as one.*

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-29-blue.svg)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178c6.svg)](https://www.typescriptlang.org/)

</div>

---

## 🚀 What is VendraCode?

VendraCode is an open-source, multiplayer AI-native development environment (IDE) designed for software teams running local AI coding agents. Think of it as **VS Code meets AI agents meets multiplayer collaboration**.

### Key Features

- 🤖 **AI Agent Integration** — Built-in AI assistant that can create, edit, and delete files, run terminal commands, and search your codebase
- 🔌 **Multi-Provider LLM Support** — Works with OpenAI, Anthropic, NVIDIA NIM, and any OpenAI-compatible API
- 🎯 **Mission Control** — Dashboard showing all active AI agent sessions, their status, and progress
- ✅ **Approval System** — Review and approve/deny agent actions before they execute
- 👥 **Multiplayer Sessions** — Share coding sessions with teammates (coming soon)
- 🔄 **Live Sync** — Git snapshots and real-time file synchronization
- 📝 **Monaco Editor** — Full VS Code editing experience with syntax highlighting for 30+ languages
- 💻 **Integrated Terminal** — Built-in terminal with xterm.js
- 🎨 **Beautiful Dark UI** — Modern, polished interface with smooth animations

## 📸 Screenshots

*Coming soon*

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Electron 29 |
| UI Framework | React 18 + TypeScript |
| Code Editor | Monaco Editor |
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
│   ├── main.js         # Window creation, IPC handlers
│   └── preload.js      # Context bridge API
├── src/                # React application
│   ├── components/     # UI components
│   │   ├── AIChat.tsx          # AI chat panel with tool-calling
│   │   ├── CodeEditor.tsx      # Monaco editor with tabs
│   │   ├── FileExplorer.tsx    # File tree explorer
│   │   ├── MissionControl.tsx  # Agent dashboard
│   │   ├── Settings.tsx        # Settings panel
│   │   ├── StatusBar.tsx       # Bottom status bar
│   │   ├── Terminal.tsx        # xterm.js terminal
│   │   └── TitleBar.tsx        # Top navigation bar
│   ├── stores/
│   │   └── appStore.ts         # Zustand state management
│   ├── types/
│   │   └── index.ts            # TypeScript type definitions
│   ├── utils/
│   │   └── providers.ts        # LLM provider configs & tools
│   ├── App.tsx                 # Main app layout
│   ├── main.tsx                # React entry point
│   └── index.css               # Global styles
├── index.html          # Vite entry HTML
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
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
