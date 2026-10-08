const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');

let mainWindow;
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
  if (terminalProcess) {
    terminalProcess.kill();
  }

  const shellCmd = process.platform === 'win32' ? 'cmd.exe' : (process.env.SHELL || '/bin/bash');
  const shellArgs = process.platform === 'win32' ? [] : ['-l'];

  terminalProcess = spawn(shellCmd, shellArgs, {
    cwd: cwd || process.env.HOME,
    env: { ...process.env, TERM: 'xterm-256color' },
    shell: false,
  });

  terminalProcess.stdout.on('data', (data) => {
    if (mainWindow) mainWindow.webContents.send('terminal:data', data.toString());
  });

  terminalProcess.stderr.on('data', (data) => {
    if (mainWindow) mainWindow.webContents.send('terminal:data', data.toString());
  });

  terminalProcess.on('exit', (code) => {
    if (mainWindow) mainWindow.webContents.send('terminal:exit', code);
    terminalProcess = null;
  });
});

ipcMain.on('terminal:input', (_event, data) => {
  if (terminalProcess && terminalProcess.stdin.writable) {
    terminalProcess.stdin.write(data);
  }
});

ipcMain.on('terminal:resize', (_event, cols, rows) => {
  // No-op for child_process spawn; node-pty would support this
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

// ─── Shell / External links ────────────────────────────────────────

ipcMain.handle('shell:openExternal', async (_event, url) => {
  await shell.openExternal(url);
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
