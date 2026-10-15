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
function agentContext({ cwd, userData, codexHome, appPath }) {
  return [
    'You are the coding agent embedded inside VendraCode, a standalone Electron IDE. The user is speaking to you through its agent chat.',
    'VendraCode is the host editor, not the OpenAI Codex desktop app. Do not ask the user which application VendraCode means.',
    `Project workspace: ${cwd}`,
    `VendraCode installation: ${appPath}`,
    `VendraCode settings directory: ${userData}`,
    `Native Vendra AI MCP config: ${path.join(userData, 'mcp-servers.json')} (JSON array).`,
    `Codex CLI MCP config: ${path.join(codexHome, 'config.toml')}. Codex uses its own MCP configuration; native Vendra AI servers are separate.`,
    'MCP management UI: Settings > MCP Servers. Roblox Studio can be connected to both agents there. For Codex configuration use codex mcp list/add/remove; do not edit unrelated settings or expose credentials.',
    'For MCP availability, inspect your actual tools. A configured entry alone does not prove a live connection. Use read-only discovery before modifying any external application.',
    'For Roblox, call list_roblox_studios first, then use its studio_id in later calls. If no Studio is returned, explain that Studio must be open with Assistant > Manage MCP Servers > Enable Studio as MCP server enabled.',
    'Do not claim that MCP is disconnected just because no project source folder is selected: Roblox MCP connects to Studio independently of filesystem project code.'
  ].join('\n');
}
function prepareAgentRun({ args, prompt, cwd, userData, codexHome, appPath, env, agentId }) {
  const context = agentContext({ cwd, userData, codexHome, appPath });
  const nextArgs = [...args];
  if (args[0] === 'exec') nextArgs.push('-c', 'developer_instructions=' + JSON.stringify(context));
  else prompt = context + '\n\nUser request:\n' + prompt;
  if (prompt) nextArgs.push(prompt);
  return { args: nextArgs, env: agentEnvironment(env, agentId) };
}
module.exports = { agentEnvironment, agentContext, prepareAgentRun, nativeCodexBinary };
