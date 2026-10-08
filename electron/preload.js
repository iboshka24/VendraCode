const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vendraAPI', {
  // File system
  fs: {
    readFile: (path) => ipcRenderer.invoke('fs:readFile', path),
    writeFile: (path, content) => ipcRenderer.invoke('fs:writeFile', path, content),
    deleteFile: (path) => ipcRenderer.invoke('fs:deleteFile', path),
    readDir: (path) => ipcRenderer.invoke('fs:readDir', path),
    stat: (path) => ipcRenderer.invoke('fs:stat', path),
    search: (dir, query) => ipcRenderer.invoke('fs:search', dir, query),
  },

  // Terminal
  terminal: {
    start: (cwd) => ipcRenderer.send('terminal:start', cwd),
    sendInput: (data) => ipcRenderer.send('terminal:input', data),
    resize: (cols, rows) => ipcRenderer.send('terminal:resize', cols, rows),
    onData: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('terminal:data', handler);
      return () => ipcRenderer.removeListener('terminal:data', handler);
    },
    onExit: (callback) => {
      const handler = (_event, code) => callback(code);
      ipcRenderer.on('terminal:exit', handler);
      return () => ipcRenderer.removeListener('terminal:exit', handler);
    },
  },

  // Command execution (for AI agent tools)
  os: {
    exec: (command, cwd) => ipcRenderer.invoke('os:exec', command, cwd),
  },

  // Dialog
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  },

  // Git
  git: {
    status: (cwd) => ipcRenderer.invoke('git:status', cwd),
    log: (cwd, count) => ipcRenderer.invoke('git:log', cwd, count),
  },

  // Shell
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  },
});
