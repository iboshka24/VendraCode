const assert=require('node:assert/strict');
const {prepareAgentRun}=require('../electron/agent-context');
const source={PATH:'keep',CODEX_HOME:'custom-home',CODEX_THREAD_ID:'parent-thread',CODEX_SESSION_ID:'parent-session',CODEX_INTERNAL_ORIGINATOR_OVERRIDE:'desktop',OPENAI_API_KEY:'test-key'};
const input={args:['exec','resume','own-thread','--json'],prompt:'Привет',cwd:'C:/project',userData:'C:/settings',codexHome:'C:/codex',appPath:'C:/app',env:source,agentId:'codex-1'};
const result=prepareAgentRun(input);
assert.equal(result.args.at(-1),'Привет');assert(result.args.includes('own-thread'));
assert.deepEqual(result.args,[...input.args,'Привет']);
assert(!result.args.some(arg=>arg.includes('developer_instructions')));
const fresh=prepareAgentRun({...input,args:['exec','--json','-c','model_reasoning_effort="low"']});
assert.deepEqual(fresh.args,['exec','--json','-c','model_reasoning_effort="low"','Привет']);
assert.equal(result.env.CODEX_HOME,'custom-home');assert.equal(result.env.OPENAI_API_KEY,'test-key');
assert.equal(result.env.CODEX_THREAD_ID,undefined);assert.equal(result.env.CODEX_SESSION_ID,undefined);assert.equal(source.CODEX_THREAD_ID,'parent-thread');
assert.deepEqual(input.args,['exec','resume','own-thread','--json']);
for (const args of [['run','--format','json'],['-p'],['run','--auto'],['exec','resume','own-thread']]) {
 const prompt='к тебе подключен roblox mcp?\nОтветь на сам вопрос: "да" или "нет".';
 const run=prepareAgentRun({...input,args,prompt});
 assert.deepEqual(run.args,[...args,prompt]);
 assert(!run.args.some(arg=>arg.includes('developer_instructions')||arg.includes('User request:')));
}
console.log('Codex prompt passthrough, reasoning flags, resume ownership and parent-thread isolation passed.');

const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {nativeCodexBinary}=require('../electron/agent-context');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'vendra native codex '));
const shim=path.join(root,'codex.cmd');
const native=path.join(root,'node_modules','@openai','codex','node_modules','@openai','codex-win32-x64','vendor','x86_64-pc-windows-msvc','bin','codex.exe');
assert.equal(nativeCodexBinary(shim,'win32','x64'),shim);
fs.mkdirSync(path.dirname(native),{recursive:true});fs.writeFileSync(native,'fixture');
assert.equal(nativeCodexBinary(shim,'win32','x64'),native);
assert.equal(nativeCodexBinary(path.join(root,'other.cmd'),'win32','x64'),path.join(root,'other.cmd'));
assert.equal(nativeCodexBinary(shim,'linux','x64'),shim);
console.log('Windows Codex npm shim resolves the installed native executable; other CLIs retain their launcher.');

const {nativeAgentBinary}=require('../electron/agent-context');
const openShim=path.join(root,'opencode.cmd');
const openExe=path.join(root,'node_modules','@opencode','cli','bin','opencode.exe');
fs.mkdirSync(path.dirname(openExe),{recursive:true});fs.writeFileSync(openExe,'fixture');
assert.equal(nativeAgentBinary(openShim,'win32','x64'),openExe);
assert.equal(nativeAgentBinary(shim,'win32','x64'),native);
console.log('All external CLI prompts pass through unchanged; Windows OpenCode uses its installed executable.');
