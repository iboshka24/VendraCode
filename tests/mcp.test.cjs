const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {createMcpManager,validateServer}=require('../electron/mcp');
const result=(msg)=>{
 if(msg.method==='initialize')return {protocolVersion:msg.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1.0'}};
 if(msg.method==='tools/list')return {tools:[{name:'echo',description:'Echo supplied text',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text']}}]};
 if(msg.method==='tools/call')return {content:[{type:'text',text:msg.params.arguments.text}]};
};
if(process.argv.includes('--server')){
 let pending='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{pending+=chunk;const lines=pending.split('\n');pending=lines.pop();for(const line of lines){const msg=JSON.parse(line);if(msg.id!==undefined)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,result:result(msg)})+'\n');}});
}else(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'vendra-mcp-test-'));const manager=createMcpManager(path.join(root,'servers.json'));
 const server=http.createServer((req,res)=>{let body='';req.on('data',d=>body+=d);req.on('end',()=>{if(req.method==='GET'){res.writeHead(405).end();return;}if(req.method==='DELETE'){res.writeHead(200).end();return;}assert.equal(req.headers.authorization,'Bearer fixture-secret');const msg=JSON.parse(body);if(msg.id===undefined){res.writeHead(202).end();return;}res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({jsonrpc:'2.0',id:msg.id,result:result(msg)}));});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));process.env.VENDRA_MCP_FIXTURE_TOKEN='fixture-secret';
 try{
  await manager.save({name:'local',command:process.execPath,args:[__filename,'--server']});
  assert.equal((await manager.test('local'))[0].name,'echo');
  await manager.save({name:'remote',url:`http://127.0.0.1:${server.address().port}/mcp`,bearerTokenEnvVar:'VENDRA_MCP_FIXTURE_TOKEN'});
  const catalog=await manager.tools();assert.equal(catalog.tools.length,2);assert.notEqual(catalog.tools[0].function.name,catalog.tools[1].function.name);
  for(const tool of catalog.tools){const response=await manager.call(tool.function.name,{text:'MCP works'});assert.equal(response.content[0].text,'MCP works');}
  await manager.save({name:'local',enabled:false,command:process.execPath,args:[__filename,'--server']});await assert.rejects(manager.call(catalog.tools[0].function.name,{text:'blocked'}),/disabled/);
  assert.equal((await manager.tools()).tools.length,1);
  await manager.save({name:'broken',command:'vendracode-missing-command-test'});const partial=await manager.tools();assert.equal(partial.tools.length,1);assert.equal(partial.errors[0].server,'broken');
  assert.throws(()=>validateServer({name:'bad name',command:'node'}));assert.throws(()=>validateServer({name:'bad',url:'http://example.com/mcp'}));
  await manager.remove('broken');await manager.remove('local');assert.equal((await manager.list()).length,1);
  await manager.close();const restarted=createMcpManager(path.join(root,'servers.json'));assert.equal((await restarted.list())[0].name,'remote');await restarted.close();
  console.log('MCP: real stdio and HTTP handshake, discovery, calls, auth env, namespaces, disable, persistence and partial failure passed.');
 }finally{await manager.close();server.closeAllConnections();await new Promise(r=>server.close(r));delete process.env.VENDRA_MCP_FIXTURE_TOKEN;}
})().catch(e=>{console.error(e);process.exitCode=1});
