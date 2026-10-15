const path = require('node:path');
const fs = require('node:fs');
function nativeCodexBinary(binary, platform = process.platform, arch = process.arch) {
  if (platform !== 'win32' || !/codex\.cmd$/i.test(path.basename(binary))) return binary;
  const triple = arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
  const packageRoot = path.join(path.dirname(binary), 'node_modules', '@openai', 'codex');
  const candidates = [
    path.join(packageRoot, 'node_modules', '@openai', `codex-win32-${arch}`, 'vendor', triple, 'bin', 'codex.exe'),
    path.join(packageRoot, 'vendor', triple, 'codex', 'codex.exe'),
  ];
  return candidates.find(file => fs.existsSync(file)) || binary;
}

function agentEnvironment(source, agentId) {
  const env = { ...source, VENDRA_COORDINATION: '1', VENDRA_AGENT_ID: agentId };
  // A child CLI owns its own thread. Desktop session IDs must never leak into it.
  for (const key of ['CODEX_THREAD_ID', 'CODEX_SESSION_ID', 'CODEX_INTERNAL_ORIGINATOR_OVERRIDE', 'CODEX_TASK_WORKSPACE_VERIFYING_IDENTITY', 'ELECTRON_RUN_AS_NODE']) delete env[key];
  return env;
}
function prepareAgentRun({ args, prompt, env, agentId }) {
  const nextArgs = [...args];
  // Every external CLI receives exactly the user's message, without host instructions.
  if (prompt) nextArgs.push(prompt);
  return { args: nextArgs, env: agentEnvironment(env, agentId) };
}
function nativeAgentBinary(binary, platform = process.platform, arch = process.arch) {
  if (platform === 'win32' && /^opencode\.cmd$/i.test(path.basename(binary))) {
    const native = path.join(path.dirname(binary), 'node_modules', '@opencode', 'cli', 'bin', 'opencode.exe');
    if (fs.existsSync(native)) return native;
  }
  return nativeCodexBinary(binary, platform, arch);
}
module.exports = { agentEnvironment, prepareAgentRun, nativeCodexBinary, nativeAgentBinary };
