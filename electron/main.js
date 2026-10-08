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
