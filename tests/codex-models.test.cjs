const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { listCodexModels } = require('../electron/codex-models');
function fixture(handler) {
 const child = new EventEmitter();
 child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
 let initialized=false,buffer='',killed=false;
 child.stdin.on('data',data=>{buffer+=data;const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines){const msg=JSON.parse(line);queueMicrotask(()=>{
  const reply=result=>{const wire=JSON.stringify({id:msg.id,result})+'\n';for(let n=0;n<wire.length;n+=7)child.stdout.write(wire.slice(n,n+7));};
  if(msg.method==='initialize') reply({});
  else if(msg.method==='initialized') initialized=true;
  else {assert(initialized);handler(msg,reply,child);}
 });}});
 return { spawnCli:()=>child, killProcessTree:()=>{killed=true;}, get killed(){return killed;} };
}
(async()=>{
 const f=fixture((msg,reply)=>{assert.equal(msg.method,'model/list');assert.equal(msg.params.includeHidden,false);if(!msg.params.cursor)reply({data:[{model:'first',displayName:'First',isDefault:true,supportedReasoningEfforts:[{reasoningEffort:'high'}]},{model:'secret',hidden:true}],nextCursor:'next'});else reply({data:[{model:'second'},{model:'first'}],nextCursor:null});});
 const models=await listCodexModels({binary:'codex',...f});assert.deepEqual(models.map(m=>m.id),['first','second']);assert.deepEqual(models[0].supportedReasoningEfforts,['high']);assert(f.killed);
 const bad=fixture((msg,reply,child)=>child.stdout.write(JSON.stringify({id:msg.id,error:{message:'Sign in first'}})+'\n'));
 await assert.rejects(listCodexModels({binary:'codex',...bad}),/Sign in first/);assert(bad.killed);
 const early=fixture((msg,reply,child)=>child.emit('close',1));await assert.rejects(listCodexModels({binary:'codex',...early}),/exited/);assert(early.killed);
 const hung=fixture(()=>{});await assert.rejects(listCodexModels({binary:'codex',...hung,timeoutMs:10}),/timed out/);assert(hung.killed);
 console.log('Codex model catalog: handshake, fragmented responses, pagination, errors, EOF and timeout passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
