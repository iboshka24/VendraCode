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

/**
 * Locates an agent CLI binary the same way `cli:detectAll` does: PATH first,
 * then the usual per-user install folders. Shared with the model scanner.
 */
function resolveCliBinary(binName) {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const userBins = ['.local/bin', '.opencode/bin', '.npm-global/bin', '.local/share/fnm/aliases/default/bin', '.bun/bin'];
  const candidates = [
    ...userBins.map((dir) => path.join(home, dir, binName)),
    path.join('/usr/local/bin', binName),
    path.join('/usr/bin', binName),
    path.join('/bin', binName),
  ];
  try {
    const which = require('child_process').execFileSync('which', [binName], { encoding: 'utf8', timeout: 4000 }).trim();
    if (which) return which;
  } catch { /* not on PATH — fall through to the home-relative candidates */ }
  for (const candidate of candidates) {
    try { if (fs.existsSync(candidate)) return candidate; } catch { /* unreadable entry */ }
  }
  return null;
}

/** Promise wrapper around the callback-style execFile. */
function runFile(bin, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, options, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr;
        return reject(err);
      }
      resolve(stdout);
    });
  });
}

ipcMain.handle('cli:detectAll', async () => {
  // Fallback locations are derived from the current user's home directory so
  // the detector works on any machine (no hardcoded usernames).
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const userBins = ['.local/bin', '.opencode/bin', '.npm-global/bin', '.local/share/fnm/aliases/default/bin', '.bun/bin'];
  const fallbacksFor = (bin) => [
    ...userBins.map((dir) => path.join(home, dir, bin)),
    path.join('/usr/local/bin', bin),
    path.join('/usr/bin', bin),
    path.join('/bin', bin),
  ];

  const clis = [
    { id: 'opencode', name: 'OpenCode CLI', bin: 'opencode', fallbackPaths: fallbacksFor('opencode') },
    { id: 'claude', name: 'Claude Code CLI', bin: 'claude', fallbackPaths: fallbacksFor('claude') },
    { id: 'agy', name: 'Antigravity CLI', bin: 'agy', fallbackPaths: fallbacksFor('agy') },
    { id: 'cline', name: 'Cline CLI', bin: 'cline', fallbackPaths: fallbacksFor('cline') },
  ];

  const results = await Promise.all(
    clis.map(async (cli) => {
      return new Promise((resolve) => {
        const resolveWith = (detectedPath) => {
          if (!detectedPath) {
            resolve({
              id: cli.id, name: cli.name, bin: cli.bin,
              isInstalled: false, path: null, version: '',
            });
            return;
          }

          // A binary that exists but cannot execute (e.g. a stale wrapper) is
          // reported as not installed instead of failing later at spawn time.
          execFile(detectedPath, ['--version'], { timeout: 15000 }, (verErr, stdout) => {
            resolve({
              id: cli.id,
              name: cli.name,
              bin: cli.bin,
              isInstalled: !verErr,
              path: !verErr ? detectedPath : null,
              version: !verErr ? (stdout || '').trim().split('\n')[0].slice(0, 60) : '',
            });
          });
        };

        execFile('which', [cli.bin], (err, stdout) => {
          let detectedPath = (!err && stdout.trim()) ? stdout.trim() : null;

          if (!detectedPath) {
            for (const fp of cli.fallbackPaths) {
              try {
                if (fs.existsSync(fp)) { detectedPath = fp; break; }
              } catch {}
            }
          }

          resolveWith(detectedPath);
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
      // stdin must be closed, not piped: OpenCode reads stdin so prompts can
      // be piped into it, and an open pipe that never yields EOF makes the CLI
      // block forever before printing anything.
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    runningCliProcesses.set(agentId, child);

    child.stdout.on('data', (data) => {
      const text = data.toString();
      broadcastToWindow('cli:agentOutput', { agentId, type: 'stdout', text });

      // Record the run in the brain history (what really happened — no
      // filenames are guessed from the agent's prose output).
      brainHistory.push({
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        agentId,
        agentName: cliBin,
        action: 'cli_output',
        summary: `${cliBin}: ${text.trim().slice(0, 120) || 'output'}`,
        timestamp: Date.now(),
      });
      if (brainHistory.length > 200) brainHistory.shift();
      broadcastToWindow('brain:actionRecorded', brainHistory[brainHistory.length - 1]);
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
// ─── OpenCode Credential Store (reuse the user's own logins) ────────

/**
 * OpenCode keeps its own provider credentials in a SQLite database. Reading
 * them lets the IDE reuse logins the user already made (OpenRouter, …) instead
 * of asking for keys a second time. Data never leaves this machine.
 * Returns [] when the database or the sqlite3 binary is unavailable.
 */
function readOpenCodeCredentials() {
  const dbPath = path.join(homeDir, '.local', 'share', 'opencode', 'opencode.db');
  if (!fs.existsSync(dbPath)) return [];

  return new Promise((resolve) => {
    execFile(
      'sqlite3',
      ['-readonly', '-json', dbPath, 'SELECT integration_id, value FROM credential'],
      { timeout: 8000 },
      (error, stdout) => {
        if (error || !stdout.trim()) { resolve([]); return; }
        try {
          const rows = JSON.parse(stdout);
          const credentials = [];
          for (const row of rows) {
            if (!row || typeof row.integration_id !== 'string' || typeof row.value !== 'string') continue;
            // Values are JSON envelopes: {"type":"key","key":"sk-…"} (or an OAuth
            // payload). Unwrap the usable secret; skip anything else.
            let secret = row.value;
            try {
              const envelope = JSON.parse(row.value);
              if (envelope && typeof envelope === 'object') {
                secret = envelope.key || envelope.access_token || envelope.value || '';
              }
            } catch {
              /* plain string credential */
            }
            if (secret) credentials.push({ integration_id: row.integration_id, value: secret });
          }
          resolve(credentials);
        } catch {
          resolve([]);
        }
      }
    );
  });
}

/** Credentials the scanner can hand to a discovered model (never exposed raw). */
async function resolveProviderCredential({ providerId = '', provider = '', envVar = '' } = {}) {
  const candidates = [`${providerId} ${provider}`.toLowerCase()];

  const fromEnv = envVar ? process.env[envVar] : null;
  if (fromEnv) return { value: fromEnv, source: envVar };

  try {
    const credentials = await readOpenCodeCredentials();
    for (const credential of credentials) {
      const id = credential.integration_id.toLowerCase();
      if (candidates.some((needle) => id.includes(needle) || needle.includes(id))) {
        return { value: credential.value, source: `opencode:${credential.integration_id}` };
      }
    }
  } catch {}

  return { value: '', source: null };
}

ipcMain.handle('credentials:list', async () => {
  try {
    const credentials = await readOpenCodeCredentials();
    return {
      available: credentials.length > 0,
      // Only metadata is exposed to the renderer, never the secret itself.
      providers: credentials.map((c) => ({
        integration: c.integration_id,
        keyPreview: `${c.value.slice(0, 6)}…${c.value.slice(-4)}`,
      })),
    };
  } catch {
    return { available: false, providers: [] };
  }
});

// ─── Model Scanner Helpers ─────────────────────────────────────────

/**
 * opencode.json stores credentials as `{env:VAR_NAME}` placeholders which the
 * CLI resolves at runtime. Resolve them here too: without this the IDE would
 * send the literal string "{env:NVIDIA_API_KEY}" as the bearer token and every
 * request would fail with 401.
 *
 * Returns `{ value, missing }` so the UI can flag models whose env var is unset.
 */
function resolveCredential(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return { value: '', missing: null };
  const match = raw.match(/^\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/);
  if (!match) return { value: raw, missing: null };
  const varName = match[1];
  const resolved = process.env[varName];
  return resolved ? { value: resolved, missing: null } : { value: '', missing: varName };
}

ipcMain.handle('scanner:scanModels', async (_event, { providerType, baseUrl, apiKey }) => {
  const models = [];
  const home = process.env.HOME || '';

  try {
    // 1. OpenCode & OpenRouter Free Models Catalog
    if (providerType === 'opencode' || providerType === 'openrouter' || !providerType) {
      // Parse the local opencode config once: provider models + optional
      // OpenRouter credentials both come from it.
      const configPath = path.join(home, '.config', 'opencode', 'opencode.json');
      let opencodeCfg = null;
      if (fs.existsSync(configPath)) {
        try {
          opencodeCfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch (e) {
          console.warn('OpenCode config parse warning:', e);
        }
      }

      // OpenRouter is a separate endpoint that needs its own API key. Sources:
      // env var → an `openrouter` provider in opencode.json → the credential
      // store the OpenCode CLI already logged into.
      const orProvider = (opencodeCfg?.provider?.openrouter) || (opencodeCfg?.provider?.['openrouter-free']) || null;
      const fromConfig = resolveCredential(orProvider?.options?.apiKey || '');
      const fromEnv = process.env.OPENROUTER_API_KEY || '';
      const stored = fromConfig.value || fromEnv ? { value: fromConfig.value || fromEnv, source: fromConfig.value ? 'opencode.json' : 'OPENROUTER_API_KEY' } : await resolveProviderCredential({ providerId: 'openrouter-free', provider: 'openrouter' });
      const OPENROUTER_ROUTE = {
        providerId: 'openrouter-free',
        providerName: 'OpenRouter (Free)',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: stored.value,
        keySource: stored.source,
        requiresKey: stored.value ? false : true,
        keyHint: stored.value
          ? (stored.source && stored.source.startsWith('opencode:') ? `key reused from your OpenCode login (${stored.source.slice('opencode:'.length)})` : undefined)
          : 'add an OpenRouter key in Settings (or set OPENROUTER_API_KEY)',
      };

      // User's configured opencode.json models
      if (opencodeCfg?.provider) {
        for (const [pName, pConfig] of Object.entries(opencodeCfg.provider)) {
          if (pConfig.models && typeof pConfig.models === 'object') {
            // Real OpenAI-compatible endpoint + credentials from opencode.json,
            // so a model picked in the IDE actually becomes callable.
            // Credentials may be `{env:VAR}` placeholders — resolve them.
            const endpoint = (pConfig.options?.baseURL || '').replace(/\/$/, '');
            const credential = resolveCredential(pConfig.options?.apiKey || '');
            const route = {
              providerId: `cli-${pName}`,
              baseUrl: endpoint,
              apiKey: credential.value,
              // Human-facing provider name from the config ("Token Harbor"),
              // falling back to the raw provider key.
              providerName: pConfig.name || pName,
              // Flag models whose credential env var is not set in this session.
              requiresKey: credential.missing ? true : false,
              keyHint: credential.missing ? `set ${credential.missing} in your shell (or paste a key in Settings)` : undefined,
            };
            for (const mId of Object.keys(pConfig.models)) {
              const configuredName = (pConfig.models[mId] && pConfig.models[mId].name) || mId;
              models.push({
                id: `${pName}/${mId}`,
                name: `${configuredName} · ${pName}`,
                provider: 'opencode',
                source: 'opencode.json (Local Config)',
                ...route,
              });
            }
          }
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
              source: 'OpenRouter · needs API key',
              ...OPENROUTER_ROUTE,
            });
          });
        }
      } catch (err) {
        console.warn('OpenRouter free models query fallback:', err.message);
      }

      // Static fallback list, used ONLY when the live catalog could not be
      // fetched (offline). OpenRouter's free tier changes often, so anything
      // from the live catalog always wins over these entries.
      const verifiedFree = { list: [
        { id: 'openrouter/auto', name: 'OpenRouter Auto (Free Router)', provider: 'opencode', source: 'OpenRouter · needs API key' },
        { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free)', provider: 'google', source: 'OpenRouter · needs API key' },
        { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B Instruct (Free)', provider: 'meta', source: 'OpenRouter · needs API key' },
        { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 Reasoning (Free)', provider: 'deepseek', source: 'OpenRouter · needs API key' },
        { id: 'deepseek/deepseek-chat:free', name: 'DeepSeek V3 Chat (Free)', provider: 'deepseek', source: 'OpenRouter · needs API key' },
        { id: 'qwen/qwen-2.5-coder-32b-instruct:free', name: 'Qwen 2.5 Coder 32B (Free)', provider: 'qwen', source: 'OpenRouter · needs API key' },
        { id: 'mistralai/mistral-small-24b-instruct-2501:free', name: 'Mistral Small 24B (Free)', provider: 'mistral', source: 'OpenRouter · needs API key' },
        { id: 'nvidia/nemotron-3.5-lightning:free', name: 'NVIDIA Nemotron 3.5 (Free)', provider: 'nvidia', source: 'OpenRouter · needs API key' },
        { id: 'liquid/lfm-2.5-2.6b:free', name: 'Liquid LFM 2.6B (Free)', provider: 'liquid', source: 'OpenRouter · needs API key' },
      ] };
      // If the live request failed, surface the fallback list (flagged).
      const liveFetched = models.some((m) => m.providerId === 'openrouter-free');
      if (!liveFetched) {
        verifiedFree.list.forEach((m) => models.push({
          ...m,
          ...OPENROUTER_ROUTE,
          source: 'OpenRouter · offline fallback (may be stale)',
        }));
      }
    }

    // 1b. The OpenCode CLI's own model registry (`opencode models`).
    //
    // Listed regardless of the active provider, because it answers "what can
    // this machine actually run?" — and the free Zen models
    // (opencode/mimo-v2.6-flash-free, opencode/exo-free,
    // opencode/nemotron-3.5-lightning-free, …) exist nowhere else. Every entry
    // here is one OpenCode is already logged into; none expose a raw
    // endpoint+key we could fetch, so they are surfaced as CLI-routable and the
    // chat answers through `opencode run --model <id>`.
    try {
      const bin = resolveCliBinary('opencode');
      if (bin) {
        const out = await runFile(bin, ['models'], { timeout: 12000, maxBuffer: 4 * 1024 * 1024 });
        const seen = new Set();
        for (const raw of String(out || '').split('\n')) {
          const id = raw.trim();
          // Lines look like `opencode/mimo-v2.6-flash-free` or `nvidia/google/gemma-3-4b-it`.
          if (!id || id.includes(' ') || !id.includes('/')) continue;
          if (seen.has(id)) continue;
          seen.add(id);
          const pName = id.slice(0, id.lastIndexOf('/'));
          models.push({
            id,
            name: `${id.slice(id.lastIndexOf('/') + 1)} · ${pName}`,
            provider: 'opencode',
            source: `opencode CLI (${pName})`,
            providerId: `zen-${pName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
            providerName: pName === 'opencode' ? 'OpenCode Zen (Free)' : `OpenCode · ${pName}`,
            baseUrl: '',
            apiKey: '',
            requiresKey: false,
            cliModel: true,
          });
        }
      }
    } catch (err) {
      console.warn('opencode models registry fallback:', err.message);
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
                source: 'local daemon',
                providerId: 'ollama',
                baseUrl: ollamaUrl + '/v1',
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
                source: 'live api',
                providerId: providerType || 'remote',
                baseUrl: cleanBase,
                apiKey,
              });
            }
          });
        }
      } catch (err) {
        console.warn('Live model scan failed for', baseUrl, err.message);
      }
    }

    if (providerType === 'nvidia' && (!apiKey || models.length === 0)) {
      const route = { providerId: 'nvidia', baseUrl: baseUrl || 'https://integrate.api.nvidia.com/v1', apiKey, source: 'NVIDIA Catalog' };
      models.push(
        { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct', provider: 'nvidia', ...route },
        { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Nemotron 70B Instruct', provider: 'nvidia', ...route },
        { id: 'deepseek-ai/deepseek-r1', name: 'DeepSeek R1', provider: 'nvidia', ...route },
        { id: 'meta/llama-3.1-405b-instruct', name: 'Llama 3.1 405B Instruct', provider: 'nvidia', ...route },
        { id: 'mistralai/mistral-large-2407', name: 'Mistral Large 2', provider: 'nvidia', ...route }
      );
    }

    if (providerType === 'openai' && (!apiKey || models.length === 0)) {
      const route = { providerId: 'openai', baseUrl: baseUrl || 'https://api.openai.com/v1', apiKey, source: 'OpenAI Catalog' };
      models.push(
        { id: 'gpt-4o', name: 'GPT-4o (Omni)', provider: 'openai', ...route },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast)', provider: 'openai', ...route },
        { id: 'o1', name: 'o1 (Reasoning)', provider: 'openai', ...route },
        { id: 'o3-mini', name: 'o3-mini (Reasoning Fast)', provider: 'openai', ...route }
      );
    }

    // 4. Anthropic
    if (providerType === 'anthropic' || (baseUrl && baseUrl.includes('anthropic'))) {
      const route = { providerId: 'anthropic', baseUrl: baseUrl || 'https://api.anthropic.com/v1', apiKey, source: 'Anthropic Catalog' };
      models.push(
        { id: 'claude-3-7-sonnet-latest', name: 'Claude 3.7 Sonnet (Hybrid Reasoning)', provider: 'anthropic', ...route },
        { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet v2', provider: 'anthropic', ...route },
        { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku (Fast)', provider: 'anthropic', ...route },
        { id: 'claude-3-opus-latest', name: 'Claude 3 Opus', provider: 'anthropic', ...route }
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
