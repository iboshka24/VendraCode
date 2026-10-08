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
    userInfo: () => ipcRenderer.invoke('os:userInfo'),
  },

  // Dialog
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  },

  // Git
  git: {
    status: (cwd) => ipcRenderer.invoke('git:status', cwd),
    log: (cwd, count) => ipcRenderer.invoke('git:log', cwd, count),
    worktrees: (cwd) => ipcRenderer.invoke('git:worktrees', cwd),
    worktreeAdd: (opts) => ipcRenderer.invoke('git:worktree:add', opts),
    worktreeRemove: (opts) => ipcRenderer.invoke('git:worktree:remove', opts),
  },

  // Shell
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  },

  // Hermes Agent Skills (Web Search, Browser, Computer-Use)
  hermes: {
    webSearch: (query, limit) => ipcRenderer.invoke('hermes:webSearch', query, limit),
    fetchUrl: (url, maxLength) => ipcRenderer.invoke('hermes:fetchUrl', url, maxLength),
    takeScreenshot: (workspacePath) => ipcRenderer.invoke('hermes:takeScreenshot', workspacePath),
    getSystemInfo: () => ipcRenderer.invoke('hermes:getSystemInfo'),
  },

  // Local CLI Agent Integration (agy, cline, opencode, claude)
  cli: {
    detectAll: () => ipcRenderer.invoke('cli:detectAll'),
    spawnAgent: (opts) => ipcRenderer.invoke('cli:spawnAgent', opts),
    stopAgent: (agentId) => ipcRenderer.invoke('cli:stopAgent', agentId),
    onAgentOutput: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('cli:agentOutput', handler);
      return () => ipcRenderer.removeListener('cli:agentOutput', handler);
    },
    onAgentExit: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('cli:agentExit', handler);
      return () => ipcRenderer.removeListener('cli:agentExit', handler);
    },
  },

  // The Brain (Coordination & Overlap Detection)
  brain: {
    acquireLock: (opts) => ipcRenderer.invoke('brain:acquireLock', opts),
    releaseLock: (opts) => ipcRenderer.invoke('brain:releaseLock', opts),
    reportAction: (action) => ipcRenderer.invoke('brain:reportAction', action),
    broadcastTyping: (payload) => ipcRenderer.invoke('brain:broadcastTyping', payload),
    onLocksUpdated: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('brain:locksUpdated', handler);
      return () => ipcRenderer.removeListener('brain:locksUpdated', handler);
    },
    onActionRecorded: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('brain:actionRecorded', handler);
      return () => ipcRenderer.removeListener('brain:actionRecorded', handler);
    },
    onAgentTyping: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('brain:agentTyping', handler);
      return () => ipcRenderer.removeListener('brain:agentTyping', handler);
    },
  },

  // Dynamic Model Scanner
  scanner: {
    scanModels: (opts) => ipcRenderer.invoke('scanner:scanModels', opts),
  },

  // Workspace Watcher
  workspace: {
    watch: (path) => ipcRenderer.invoke('workspace:watch', path),
    onFileChanged: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('workspace:fileChanged', handler);
      return () => ipcRenderer.removeListener('workspace:fileChanged', handler);
    },
  },
});
