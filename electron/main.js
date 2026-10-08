const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, execFile, spawn } = require('child_process');

// Ensure PATH includes user bin folders where opencode, agy, etc. are located
const homeDir = process.env.HOME || '';
const extraPaths = [
  path.join(homeDir, '.opencode', 'bin'),
  path.join(homeDir, '.local', 'bin'),
  path.join(homeDir, '.gemini', 'antigravity-cli', 'bin'),
  path.join(homeDir, '.tokenharbor', 'bin'),
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
];
process.env.PATH = Array.from(new Set([...extraPaths, ...(process.env.PATH ? process.env.PATH.split(':') : [])])).join(':');

let nodePty = null;
try {
  nodePty = require('node-pty');
  console.log('[VendraCode] node-pty loaded successfully');
} catch (e) {
  try {
    const unpackedPath = path.join(process.resourcesPath || '', 'app.asar.unpacked', 'node_modules', 'node-pty');
    if (fs.existsSync(unpackedPath)) {
      nodePty = require(unpackedPath);
      console.log('[VendraCode] node-pty loaded from app.asar.unpacked');
    }
  } catch (e2) {
    console.warn('[VendraCode] node-pty load warning:', e.message);
  }
}

let mainWindow;
let ptyProcess = null;
let terminalProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0d1117',
    show: false,
  });

  // Dev vs Production URL
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (terminalProcess) {
      terminalProcess.kill();
      terminalProcess = null;
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ─── File System IPC ───────────────────────────────────────────────

ipcMain.handle('fs:readFile', async (_event, filePath) => {
  try {
    return await fs.promises.readFile(filePath, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read file: ${err.message}`);
  }
});

ipcMain.handle('fs:writeFile', async (_event, filePath, content) => {
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (err) {
    throw new Error(`Failed to write file: ${err.message}`);
  }
});

ipcMain.handle('fs:deleteFile', async (_event, filePath) => {
  try {
    await fs.promises.unlink(filePath);
    return true;
  } catch (err) {
    throw new Error(`Failed to delete file: ${err.message}`);
  }
});

ipcMain.handle('fs:readDir', async (_event, dirPath) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
      .map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        path: path.join(dirPath, e.name),
      }))
      .sort((a, b) => {
        if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
        return a.isDirectory ? -1 : 1;
      });
  } catch {
    return [];
  }
});

ipcMain.handle('fs:stat', async (_event, filePath) => {
  try {
    const stat = await fs.promises.stat(filePath);
    return { size: stat.size, isDirectory: stat.isDirectory(), mtime: stat.mtime.toISOString() };
  } catch {
    return null;
  }
});

// ─── Search IPC ────────────────────────────────────────────────────

ipcMain.handle('fs:search', async (_event, dirPath, query) => {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const cmd = isWin
      ? `findstr /s /i /n "${query}" "${dirPath}\\*.*"`
      : `grep -rnI --include='*' "${query}" "${dirPath}" 2>/dev/null | head -100`;

    exec(cmd, { maxBuffer: 1024 * 1024, timeout: 10000 }, (error, stdout) => {
      if (error && !stdout) {
        resolve([]);
        return;
      }
      const results = stdout
        .split('\n')
        .filter(Boolean)
        .slice(0, 100)
        .map((line) => {
          const match = line.match(/^(.+?):(\d+):(.*)$/);
          if (match) return { file: match[1], line: parseInt(match[2]), text: match[3].trim() };
          return { file: '', line: 0, text: line };
        });
      resolve(results);
    });
  });
});

// ─── Terminal IPC ──────────────────────────────────────────────────

ipcMain.on('terminal:start', (event, cwd) => {
  if (ptyProcess) {
    try {
      if (typeof ptyProcess.kill === 'function') ptyProcess.kill();
    } catch {}
    ptyProcess = null;
  }
  if (terminalProcess) {
    try { terminalProcess.kill(); } catch {}
    terminalProcess = null;
  }

  const shellCmd = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');
  const targetCwd = (cwd && fs.existsSync(cwd)) ? cwd : (process.env.HOME || process.cwd());

  if (nodePty) {
    try {
      ptyProcess = nodePty.spawn(shellCmd, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: targetCwd,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        },
      });

      ptyProcess.onData((data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal:data', data);
        }
      });

      ptyProcess.onExit(({ exitCode }) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal:exit', exitCode);
        }
        ptyProcess = null;
      });
      return;
    } catch (err) {
      console.error('[VendraCode] node-pty spawn failed, falling back:', err);
    }
  }

  // Fallback using child_process spawn
  const shellArgs = process.platform === 'win32' ? [] : ['-i'];
  terminalProcess = spawn(shellCmd, shellArgs, {
    cwd: targetCwd,
    env: { ...process.env, TERM: 'xterm-256color' },
    shell: false,
  });

  terminalProcess.stdout.on('data', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('terminal:data', data.toString());
  });

  terminalProcess.stderr.on('data', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('terminal:data', data.toString());
  });

  terminalProcess.on('exit', (code) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('terminal:exit', code);
    terminalProcess = null;
  });
});

ipcMain.on('terminal:input', (_event, data) => {
  if (ptyProcess && typeof ptyProcess.write === 'function') {
    ptyProcess.write(data);
  } else if (terminalProcess && terminalProcess.stdin && terminalProcess.stdin.writable) {
    terminalProcess.stdin.write(data);
  }
});

ipcMain.on('terminal:resize', (_event, cols, rows) => {
  if (ptyProcess && typeof ptyProcess.resize === 'function') {
    try {
      ptyProcess.resize(Math.max(cols || 80, 10), Math.max(rows || 24, 5));
    } catch (err) {}
  }
});

// ─── Command Execution (for AI agent) ──────────────────────────────

ipcMain.handle('os:exec', async (_event, command, cwd) => {
  return new Promise((resolve) => {
    exec(command, { cwd, maxBuffer: 5 * 1024 * 1024, timeout: 30000 }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        error: error ? error.message : null,
        code: error ? error.code : 0,
      });
    });
  });
});

// ─── Dialog IPC ────────────────────────────────────────────────────

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

// ─── Git IPC ───────────────────────────────────────────────────────

ipcMain.handle('git:status', async (_event, cwd) => {
  return new Promise((resolve) => {
    exec('git status --porcelain -b', { cwd }, (error, stdout) => {
      if (error) { resolve({ branch: 'none', files: [] }); return; }
      const lines = stdout.split('\n').filter(Boolean);
      const branchLine = lines.find((l) => l.startsWith('##'));
      const branch = branchLine ? branchLine.replace('## ', '').split('...')[0] : 'unknown';
      const files = lines
        .filter((l) => !l.startsWith('##'))
        .map((l) => ({ status: l.substring(0, 2).trim(), file: l.substring(3) }));
      resolve({ branch, files });
    });
  });
});

ipcMain.handle('git:log', async (_event, cwd, count = 20) => {
  return new Promise((resolve) => {
    exec(
      `git log --oneline -${count} --format="%H|%s|%an|%ar"`,
      { cwd },
      (error, stdout) => {
        if (error) { resolve([]); return; }
        resolve(
          stdout.split('\n').filter(Boolean).map((line) => {
            const [hash, message, author, date] = line.split('|');
            return { hash, message, author, date };
          })
        );
      }
    );
  });
});

// ─── Git Worktrees (multiplayer isolation) ─────────────────────────

// Parse `git worktree list --porcelain` output into structured worktrees
function parseWorktreeList(stdout) {
  const worktrees = [];
  let current = null;

  const push = () => {
    if (current) worktrees.push(current);
    current = null;
  };

  for (const raw of stdout.split('\n')) {
    const line = raw.trim();
    if (!line) { push(); continue; }
    if (line.startsWith('worktree ')) {
      push();
      current = { path: line.slice('worktree '.length).trim(), head: '', branch: null, isMain: false, isBare: false, isDetached: false };
    } else if (current && line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length).trim();
    } else if (current && line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '') || null;
    } else if (current) {
      if (line === 'bare') current.isBare = true;
      if (line === 'detached') current.isDetached = true;
    }
  }
  push();

  // First entry is always the main working tree
  if (worktrees.length > 0 && !worktrees[0].isBare) worktrees[0].isMain = true;
  return worktrees;
}

ipcMain.handle('git:worktrees', async (_event, cwd) => {
  if (!cwd) return [];
  return new Promise((resolve) => {
    execFile('git', ['worktree', 'list', '--porcelain'], { cwd }, (error, stdout) => {
      if (error) { resolve([]); return; }
      try {
        resolve(parseWorktreeList(stdout));
      } catch {
        resolve([]);
      }
    });
  });
});

ipcMain.handle('git:worktree:add', async (_event, { cwd, path: worktreePath, branch, create = true } = {}) => {
  if (!cwd || !worktreePath || !branch) {
    return { success: false, error: 'Missing cwd, worktree path or branch' };
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._\/-]*$/.test(branch)) {
    return { success: false, error: `Invalid branch name: ${branch}` };
  }

  const args = create ? ['worktree', 'add', worktreePath, '-b', branch] : ['worktree', 'add', worktreePath, branch];
  return new Promise((resolve) => {
    execFile('git', args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: (stderr || error.message || '').trim().split('\n').slice(0, 3).join(' ') });
        return;
      }
      resolve({ success: true, path: worktreePath, branch });
    });
  });
});

ipcMain.handle('git:worktree:remove', async (_event, { cwd, path: worktreePath } = {}) => {
  if (!cwd || !worktreePath) return { success: false, error: 'Missing cwd or worktree path' };
  return new Promise((resolve) => {
    execFile('git', ['worktree', 'remove', '--force', worktreePath], { cwd }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: (stderr || error.message || '').trim().split('\n').slice(0, 3).join(' ') });
        return;
      }
      resolve({ success: true });
    });
  });
});

const { webSearch, fetchUrl, takeScreenshot, getSystemInfo } = require('./tools');

// ─── Shell / External links ────────────────────────────────────────

// ─── OS Utilities ───────────────────────────────────────────────────

ipcMain.handle('os:userInfo', async () => {
  const os = require('os');
  const info = os.userInfo();
  return {
    username: info.username || process.env.USER || process.env.LOGNAME || 'You',
  };
});

ipcMain.handle('shell:openExternal', async (_event, url) => {
  await shell.openExternal(url);
});

// ─── Hermes Agent Skills (Web Search, Browser, Computer-Use) ───────
ipcMain.handle('hermes:webSearch', async (_event, query, limit = 8) => {
  return await webSearch(query, limit);
});

ipcMain.handle('hermes:fetchUrl', async (_event, url, maxLength = 8000) => {
  return await fetchUrl(url, maxLength);
});

ipcMain.handle('hermes:takeScreenshot', async (_event, workspacePath) => {
  return await takeScreenshot(workspacePath);
});

ipcMain.handle('hermes:getSystemInfo', async () => {
  return getSystemInfo();
});

// ─── Brain & Multi-Agent Coordination Layer ────────────────────────
const activeLocks = new Map(); // filePath -> { agentId, agentName, timestamp }
const brainHistory = []; // list of recent actions
const runningCliProcesses = new Map(); // agentId -> childProcess
let workspaceWatcher = null;

function broadcastToWindow(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

// Watch workspace for live changes made by ANY CLI or process
ipcMain.handle('workspace:watch', async (_event, workspacePath) => {
  if (workspaceWatcher) {
    try { workspaceWatcher.close(); } catch {}
    workspaceWatcher = null;
  }

  if (!workspacePath || !fs.existsSync(workspacePath)) {
    return { success: false };
  }

  try {
    // Create .vendracode coordination directory if it doesn't exist
    const vendraDir = path.join(workspacePath, '.vendracode');
    if (!fs.existsSync(vendraDir)) {
      await fs.promises.mkdir(vendraDir, { recursive: true });
    }

    // Write initial coordination brain file for external CLIs to read
    const brainFilePath = path.join(vendraDir, 'brain.json');
    await fs.promises.writeFile(
      brainFilePath,
      JSON.stringify({ activeLocks: Object.fromEntries(activeLocks), recentActions: brainHistory.slice(-20) }, null, 2),
      'utf-8'
    );

    let debounceTimer = null;
    workspaceWatcher = fs.watch(workspacePath, { recursive: true }, (eventType, filename) => {
      if (!filename || filename.includes('node_modules') || filename.includes('.git')) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        broadcastToWindow('workspace:fileChanged', { eventType, filename });
      }, 150);
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('brain:acquireLock', async (_event, { filePath, agentId, agentName }) => {
  const existing = activeLocks.get(filePath);
  if (existing && existing.agentId !== agentId) {
    return {
      success: false,
      conflict: true,
      lockedBy: existing,
      warning: `Conflict detected! File ${path.basename(filePath)} is already locked by ${existing.agentName}`,
    };
  }

  const lockInfo = { agentId, agentName, timestamp: Date.now() };
  activeLocks.set(filePath, lockInfo);
  broadcastToWindow('brain:locksUpdated', Object.fromEntries(activeLocks));
  return { success: true, lock: lockInfo };
});

ipcMain.handle('brain:releaseLock', async (_event, { filePath, agentId }) => {
  const existing = activeLocks.get(filePath);
  if (existing && existing.agentId === agentId) {
    activeLocks.delete(filePath);
    broadcastToWindow('brain:locksUpdated', Object.fromEntries(activeLocks));
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('brain:reportAction', async (_event, action) => {
  const entry = {
    id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    ...action,
    timestamp: Date.now(),
  };
  brainHistory.push(entry);
  if (brainHistory.length > 200) brainHistory.shift();

  broadcastToWindow('brain:actionRecorded', entry);
  return entry;
});

// ─── Local Agent CLI Detection & Execution ─────────────────────────
ipcMain.handle('cli:detectAll', async () => {
  const clis = [
    { id: 'agy', name: 'Antigravity CLI', bin: 'agy', fallbackPaths: ['/home/ibrohim/.local/bin/agy', '/usr/local/bin/agy'] },
    { id: 'cline', name: 'Cline CLI', bin: 'cline', fallbackPaths: ['/usr/bin/cline', '/usr/local/bin/cline'] },
    { id: 'opencode', name: 'OpenCode CLI', bin: 'opencode', fallbackPaths: ['/home/ibrohim/.opencode/bin/opencode', '/usr/local/bin/opencode'] },
    { id: 'claude', name: 'Claude Code CLI', bin: 'claude', fallbackPaths: ['/usr/bin/claude', '/usr/local/bin/claude'] },
  ];

  const results = await Promise.all(
    clis.map(async (cli) => {
      return new Promise((resolve) => {
        exec(`which ${cli.bin}`, (err, stdout) => {
          let detectedPath = (!err && stdout.trim()) ? stdout.trim() : null;

          if (!detectedPath) {
            for (const fp of cli.fallbackPaths) {
              if (fs.existsSync(fp)) {
                detectedPath = fp;
                break;
              }
            }
          }

          resolve({
            id: cli.id,
            name: cli.name,
            bin: cli.bin,
            isInstalled: !!detectedPath,
            path: detectedPath,
            version: 'Installed',
          });
        });
      });
    })
  );

  return results;
});

ipcMain.handle('cli:spawnAgent', async (_event, { agentId, cliBin, args = [], cwd, prompt }) => {
  if (runningCliProcesses.has(agentId)) {
    return { success: false, error: 'Agent already running' };
  }

  try {
    const procArgs = [...args];
    if (prompt) {
      procArgs.push(prompt);
    }

    const child = spawn(cliBin, procArgs, {
      cwd: cwd || process.env.HOME,
      env: {
        ...process.env,
        VENDRA_COORDINATION: '1',
        VENDRA_AGENT_ID: agentId,
      },
    });

    runningCliProcesses.set(agentId, child);

    child.stdout.on('data', (data) => {
      const text = data.toString();
      broadcastToWindow('cli:agentOutput', { agentId, type: 'stdout', text });

      // Brain coordination: parse tool usage or file edits from CLI outputs
      const fileMatch = text.match(/(?:editing|wrote|created|patching|touching|reading)\s+([a-zA-Z0-9_\-\./\\]+)/i);
      if (fileMatch) {
        const touchedFile = fileMatch[1];
        activeLocks.set(touchedFile, { agentId, agentName: cliBin, timestamp: Date.now() });
        broadcastToWindow('brain:locksUpdated', Object.fromEntries(activeLocks));
      }
    });

    child.stderr.on('data', (data) => {
      broadcastToWindow('cli:agentOutput', { agentId, type: 'stderr', text: data.toString() });
    });

    child.on('close', (code) => {
      runningCliProcesses.delete(agentId);
      broadcastToWindow('cli:agentExit', { agentId, code });

      // Clean up locks for this agent
      for (const [file, lock] of activeLocks.entries()) {
        if (lock.agentId === agentId) activeLocks.delete(file);
      }
      broadcastToWindow('brain:locksUpdated', Object.fromEntries(activeLocks));
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('cli:stopAgent', async (_event, agentId) => {
  const child = runningCliProcesses.get(agentId);
  if (child) {
    try {
      child.kill('SIGTERM');
      runningCliProcesses.delete(agentId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  return { success: false, error: 'Agent not found' };
});

// ─── Live Dynamic Model Scanner IPC ────────────────────────────────
ipcMain.handle('scanner:scanModels', async (_event, { providerType, baseUrl, apiKey }) => {
  const models = [];
  const home = process.env.HOME || '';

  try {
    // 1. OpenCode & OpenRouter Free Models Catalog
    if (providerType === 'opencode' || providerType === 'openrouter' || !providerType) {
      // User's configured opencode.json models
      const configPath = path.join(home, '.config', 'opencode', 'opencode.json');
      if (fs.existsSync(configPath)) {
        try {
          const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          if (cfg.provider) {
            for (const [pName, pConfig] of Object.entries(cfg.provider)) {
              if (pConfig.models && typeof pConfig.models === 'object') {
                for (const mId of Object.keys(pConfig.models)) {
                  models.push({
                    id: `${pName}/${mId}`,
                    name: `${mId} · ${pName}`,
                    provider: 'opencode',
                    source: 'opencode.json (Local Config)'
                  });
                }
              }
            }
          }
        } catch (e) {
          console.warn('OpenCode config parse warning:', e);
        }
      }

      // Live OpenRouter Free Models (:free filter)
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const orRes = await fetch('https://openrouter.ai/api/v1/models', { signal: controller.signal });
        clearTimeout(timeout);
        if (orRes.ok) {
          const orData = await orRes.json();
          const freeList = (orData.data || []).filter((m) => m.id.endsWith(':free') || (m.pricing && m.pricing.prompt == 0));
          freeList.forEach((m) => {
            models.push({
              id: m.id,
              name: `${m.name || m.id} (Free)`,
              provider: 'openrouter-free',
              source: 'OpenCode Free Tier'
            });
          });
        }
      } catch (err) {
        console.warn('OpenRouter free models query fallback:', err.message);
      }

      // Default verified OpenCode free models
      const verifiedFree = [
        { id: 'openrouter/auto', name: 'OpenRouter Auto (Free Router)', provider: 'opencode', source: 'OpenCode Free' },
        { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free)', provider: 'google', source: 'OpenCode Free' },
        { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B Instruct (Free)', provider: 'meta', source: 'OpenCode Free' },
        { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 Reasoning (Free)', provider: 'deepseek', source: 'OpenCode Free' },
        { id: 'deepseek/deepseek-chat:free', name: 'DeepSeek V3 Chat (Free)', provider: 'deepseek', source: 'OpenCode Free' },
        { id: 'qwen/qwen-2.5-coder-32b-instruct:free', name: 'Qwen 2.5 Coder 32B (Free)', provider: 'qwen', source: 'OpenCode Free' },
        { id: 'mistralai/mistral-small-24b-instruct-2501:free', name: 'Mistral Small 24B (Free)', provider: 'mistral', source: 'OpenCode Free' },
        { id: 'nvidia/nemotron-3.5-lightning:free', name: 'NVIDIA Nemotron 3.5 (Free)', provider: 'nvidia', source: 'OpenCode Free' },
        { id: 'liquid/lfm-2.5-2.6b:free', name: 'Liquid LFM 2.6B (Free)', provider: 'liquid', source: 'OpenCode Free' },
      ];
      verifiedFree.forEach((m) => models.push(m));
    }

    // 2. Ollama local models
    if (providerType === 'ollama' || (!providerType && baseUrl && baseUrl.includes('11434'))) {
      const ollamaUrl = (baseUrl || 'http://127.0.0.1:11434').replace(/\/v1\/?$/, '');
      try {
        const res = await fetch(`${ollamaUrl}/api/tags`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.models)) {
            data.models.forEach((m) => {
              models.push({
                id: m.name,
                name: `${m.name}${m.size ? ` (${(m.size / (1024 * 1024 * 1024)).toFixed(1)}GB)` : ''}`,
                provider: 'ollama',
                source: 'local daemon'
              });
            });
          }
        }
      } catch (err) {}
    }

    // 3. OpenAI / NVIDIA NIM / OpenRouter / DeepSeek / Custom V1 APIs
    if (baseUrl && apiKey && (providerType === 'openai' || providerType === 'nvidia' || providerType === 'openrouter' || providerType === 'custom')) {
      const cleanBase = baseUrl.replace(/\/$/, '');
      const modelsEndpoint = cleanBase.endsWith('/v1') ? `${cleanBase}/models` : `${cleanBase}/v1/models`;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(modelsEndpoint, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'User-Agent': 'VendraCode/1.0.0'
          },
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
          list.forEach((item) => {
            const id = typeof item === 'string' ? item : item.id;
            if (id) {
              models.push({
                id,
                name: (typeof item === 'object' && item.name) ? item.name : id,
                provider: providerType || 'remote',
                source: 'live api'
              });
            }
          });
        }
      } catch (err) {
        console.warn('Live model scan failed for', baseUrl, err.message);
      }
    }

    if (providerType === 'nvidia' && (!apiKey || models.length === 0)) {
      models.push(
        { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct', provider: 'nvidia', source: 'NVIDIA Catalog' },
        { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Nemotron 70B Instruct', provider: 'nvidia', source: 'NVIDIA Catalog' },
        { id: 'deepseek-ai/deepseek-r1', name: 'DeepSeek R1', provider: 'nvidia', source: 'NVIDIA Catalog' },
        { id: 'meta/llama-3.1-405b-instruct', name: 'Llama 3.1 405B Instruct', provider: 'nvidia', source: 'NVIDIA Catalog' },
        { id: 'mistralai/mistral-large-2407', name: 'Mistral Large 2', provider: 'nvidia', source: 'NVIDIA Catalog' }
      );
    }

    if (providerType === 'openai' && (!apiKey || models.length === 0)) {
      models.push(
        { id: 'gpt-4o', name: 'GPT-4o (Omni)', provider: 'openai', source: 'OpenAI Catalog' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast)', provider: 'openai', source: 'OpenAI Catalog' },
        { id: 'o1', name: 'o1 (Reasoning)', provider: 'openai', source: 'OpenAI Catalog' },
        { id: 'o3-mini', name: 'o3-mini (Reasoning Fast)', provider: 'openai', source: 'OpenAI Catalog' }
      );
    }

    // 4. Anthropic
    if (providerType === 'anthropic' || (baseUrl && baseUrl.includes('anthropic'))) {
      models.push(
        { id: 'claude-3-7-sonnet-latest', name: 'Claude 3.7 Sonnet (Hybrid Reasoning)', provider: 'anthropic', source: 'Anthropic Catalog' },
        { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet v2', provider: 'anthropic', source: 'Anthropic Catalog' },
        { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku (Fast)', provider: 'anthropic', source: 'Anthropic Catalog' },
        { id: 'claude-3-opus-latest', name: 'Claude 3 Opus', provider: 'anthropic', source: 'Anthropic Catalog' }
      );
    }
  } catch (err) {
    console.error('Model scan failed:', err);
  }

  // Deduplicate
  const seen = new Set();
  const deduped = [];
  for (const m of models) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      deduped.push(m);
    }
  }
  return deduped;
});

// ─── Brain Agent Typing Broadcast ──────────────────────────────────
ipcMain.handle('brain:broadcastTyping', async (_event, payload) => {
  broadcastToWindow('brain:agentTyping', payload);
  return { success: true };
});
