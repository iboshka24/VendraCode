const {spawn,execFileSync}=require('node:child_process'),{WebSocket}=require('ws'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto');
const root=path.resolve('../swarm-e2e-'+Date.now());fs.mkdirSync(root,{recursive:true});const children=[],connections=[];
const app=process.env.VENDRA_TEST_APP||path.resolve('release-1.3.0/win-unpacked/VendraCode.exe');
const session='e2e-'+randomUUID(),token=randomBytes(32).toString('hex'),repo='https://github.com/iboshka24/VendraCode';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(port){
 let target;for(let i=0;i<100;i++){try{target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page');}catch{}if(target)break;await sleep(200)}assert(target,'No renderer');
 const ws=new WebSocket(target.webSocketDebuggerUrl);connections.push(ws);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});let id=0;const pending=new Map(),frames=[];
 ws.on('message',raw=>{const msg=JSON.parse(raw);if(msg.id&&pending.has(msg.id)){const {r,j,timer}=pending.get(msg.id);clearTimeout(timer);pending.delete(msg.id);msg.error?j(Error(msg.error.message)):r(msg.result);}if(msg.method==='Network.webSocketFrameReceived'){try{frames.push(JSON.parse(msg.params.response.payloadData))}catch{}}});
 const send=(method,params={})=>new Promise((r,j)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);j(Error('CDP timed out: '+method))},180000);pending.set(n,{r,j,timer});ws.send(JSON.stringify({id:n,method,params}))});
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
 await send('Network.enable');
 const until=async expression=>{for(let i=0;i<100;i++){try{const value=await evaluate(expression);if(value)return value;}catch{}await sleep(200)}throw Error('UI condition failed: '+expression)};
 await until('!!window.vendraAPI && !!document.body');return {send,evaluate,until,frames};
}
async function boot(name,port,workspace){
 const env={...process.env,NODE_ENV:'production',CODEX_HOME:path.join(root,'codex-home')};delete env.ELECTRON_RUN_AS_NODE;fs.mkdirSync(env.CODEX_HOME,{recursive:true});
 const proc=spawn(app,[`--user-data-dir=${path.join(root,name)}`,`--remote-debugging-port=${port}`,'--disable-gpu'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(proc);let logs='';proc.stdout.on('data',d=>logs+=d);proc.stderr.on('data',d=>logs+=d);proc.on('error',e=>console.error(e.message));
 const initial=name==='SwarmFriend'?{sessionId:'private-'+randomUUID(),token:randomBytes(32).toString('hex')}:{sessionId:session,token};
 const client=await connect(port);await client.evaluate(`localStorage.setItem('vendracode-session',${JSON.stringify(initial.sessionId)});localStorage.setItem('vendracode-swarm-token:'+${JSON.stringify(initial.sessionId)},${JSON.stringify(initial.token)});localStorage.setItem('vendracode-peer-name',${JSON.stringify(name)});localStorage.setItem('vendracode-workspace',${JSON.stringify(workspace)});true`);await client.send('Page.reload');await sleep(1500);await client.until('!!window.vendraAPI && document.body?.innerText.includes("Codex CLI")');client.logs=()=>logs;return client;
}
(async()=>{
 try{
  const workspace=path.join(root,'host-workspace');fs.mkdirSync(workspace);const original='# Swarm test\n\nShared file.\n';fs.writeFileSync(path.join(workspace,'README.md'),original);
  const a=await boot('SwarmHost',19471,workspace),b=await boot('SwarmFriend',19472,workspace);
  const credentials={sessionId:session,token,repoUrl:repo};
  assert((await a.evaluate(`window.vendraAPI.swarm.share(${JSON.stringify(credentials)})`)).success);
  const invitation='https://brain.vendra.uz/session/'+session+'?'+new URLSearchParams({repo,token});
  await b.evaluate('[...document.querySelectorAll("button")].find(el=>el.textContent.trim()==="Share").click();true');
  await b.until('[...document.querySelectorAll("button")].some(el=>el.textContent.includes("Join Friend"))');
  await b.evaluate('[...document.querySelectorAll("button")].find(el=>el.textContent.includes("Join Friend")).click();true');
  await b.until('!!document.querySelector("input[placeholder*=session-id]")');
  await b.evaluate(`(()=>{const input=document.querySelector('input[placeholder*="session-id"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(invitation)});input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await b.evaluate('[...document.querySelectorAll("button")].find(el=>el.textContent.includes("Clone Shared Repo & Join Swarm")).click();true');
  await b.until(`localStorage.getItem('vendracode-workspace') !== ${JSON.stringify(workspace)}`);
  const joined={path:await b.evaluate('localStorage.getItem("vendracode-workspace")')};
  const status=await b.evaluate(`window.vendraAPI.git.status(${JSON.stringify(joined.path)})`);
  assert.match(status.branch,/^swarm\//);assert(fs.existsSync(path.join(joined.path,'.git')));

  for(const c of [a,b]){
   await c.until('document.querySelector("footer")?.innerText.includes("Brain: live · 1")');
   await c.until('[...document.querySelectorAll("aside span")].some(el=>el.textContent.trim()==="README.md")');
   await c.evaluate('[...document.querySelectorAll("aside span")].find(el=>el.textContent.trim()==="README.md").click();true');
   await c.until('!!document.querySelector(".monaco-editor textarea")');
  }
  await b.send('Page.bringToFront');
  await b.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  const bounds=await b.evaluate('(()=>{const r=document.querySelector(".monaco-editor .view-lines").getBoundingClientRect();return {x:r.x+80,y:r.y+10}})()');
  await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...bounds,button:'left',clickCount:1});
  await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',...bounds,button:'left',clickCount:1});
  await sleep(300);
  await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Home',code:'Home',windowsVirtualKeyCode:36,modifiers:2});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Home',code:'Home',windowsVirtualKeyCode:36,modifiers:2});
  await b.send('Input.insertText',{text:'SWARM-E2E '});
  await sleep(1200);
  await a.until('[...document.querySelectorAll(".vc-remote-badge")].some(el=>el.textContent.includes("SwarmFriend"))');
  assert(a.frames.some(e=>e.type==='diff:stream'&&e.filePath==='README.md'),'Diff path is not portable');assert.equal(fs.readFileSync(path.join(workspace,'README.md'),'utf8'),original);
  console.log('Two Windows IDEs: native invite join created real worktree, peers discovered, relative diff and friend badge displayed, host file preserved.');
  const fixture=path.resolve('tests/mcp.test.cjs');const config={name:'e2e-tools',command:process.execPath,args:[fixture,'--server']};
  await a.evaluate(`window.vendraAPI.mcp.save(${JSON.stringify(config)})`);const catalog=await a.evaluate('window.vendraAPI.mcp.tools()');assert.equal(catalog.tools.length,1);const result=await a.evaluate(`window.vendraAPI.mcp.call(${JSON.stringify(catalog.tools[0].function.name)},{text:'packaged MCP works'})`);assert.equal(result.content[0].text,'packaged MCP works');
  assert(await a.evaluate(`window.vendraAPI.mcp.codexAdd(${JSON.stringify(config)})`));assert((await a.evaluate('window.vendraAPI.mcp.codexList()')).some(s=>s.name==='e2e-tools'));await a.evaluate('window.vendraAPI.mcp.codexRemove("e2e-tools")');
  await a.evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Settings").click();true');await a.until('[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="MCP Servers")');await a.evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="MCP Servers").click();true');await a.until('!!document.querySelector("textarea[aria-label]")');
  console.log('Packaged MCP: real stdio tool call, Codex add/list/remove in isolated config, and MCP Settings UI passed.');
  await a.evaluate('window.vendraAPI.mcp.remove("e2e-tools")');
 }finally{
  for(const ws of connections)ws.close();
  for(const child of children){try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})}catch{}}
 }
})().catch(error=>{console.error(error);process.exitCode=1});
