import { WebSocket } from 'ws';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
const endpoint=process.env.BRAIN_HTTP || 'https://brain.vendra.uz';
const session='verify-'+randomUUID(),token=randomBytes(32).toString('hex'),clients=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(name,room=session,secret=token){
 const socket=new WebSocket(endpoint.replace(/^http/,'ws')+'/ws?'+new URLSearchParams({session:room,token:secret,name,peer:name}));clients.push(socket);const events=[];socket.on('message',raw=>events.push(JSON.parse(raw)));socket.on('error',()=>{});
 await new Promise((r,j)=>{socket.once('open',r);socket.once('error',j)});
 const wait=async check=>{for(let n=0;n<100;n++){const e=events.find(check);if(e)return e;await sleep(50)}throw Error('Event timeout for '+name)};
 await wait(e=>e.type==='session:init');return {socket,events,wait,send:body=>socket.send(JSON.stringify(body))};
}
try{
 const health=await(await fetch(endpoint+'/health')).json();assert.equal(health.version,'1.3.0');
 assert.equal((await fetch(endpoint+'/api/session/'+session)).status,401);
 assert.equal((await fetch(endpoint+'/session/'+session)).status,200);
 const a=await connect('A'),b=await connect('B'),c=await connect('C',session+'-other');await a.wait(e=>e.type==='peer:joined'&&e.peerName==='B');
 assert.equal((await fetch(endpoint+'/api/session/'+session,{headers:{'X-Vendra-Token':'f'.repeat(64)}})).status,403);
 const shared=await fetch(endpoint+'/api/session/'+session,{method:'POST',headers:{'X-Vendra-Token':token,'Content-Type':'application/json'},body:JSON.stringify({repoUrl:'https://github.com/iboshka24/VendraCode'})});assert(shared.ok);
 await b.wait(e=>e.type==='repo:updated');
 a.send({type:'diff:broadcast',filePath:'src/shared.ts',changes:[{range:{startLineNumber:1,startColumn:1,endLineNumber:1,endColumn:1},text:'hello',rangeLength:0}]});assert.equal((await b.wait(e=>e.type==='diff:stream')).filePath,'src/shared.ts');
 a.send({type:'action:broadcast',action:{tool:'read',status:'completed',file:'src/shared.ts'}});await b.wait(e=>e.type==='action:stream');
 a.send({type:'lock:acquire',filePath:'src/shared.ts',agentId:'same-agent'});await b.wait(e=>e.type==='locks:updated'&&e.locks?.['src/shared.ts']);
 b.send({type:'lock:acquire',filePath:'src/shared.ts',agentId:'same-agent'});await b.wait(e=>e.type==='lock:conflict');
 b.send({type:'lock:release',filePath:'src/shared.ts',agentId:'same-agent'});await sleep(150);
 const info=await(await fetch(endpoint+'/api/session/'+session,{headers:{'X-Vendra-Token':token}})).json();assert(info.locks['src/shared.ts']);assert.equal(info.peerCount,2);
 assert(!c.events.some(e=>['diff:stream','action:stream','repo:updated'].includes(e.type)));
 a.socket.close();await b.wait(e=>e.type==='peer:left');await b.wait(e=>e.type==='locks:updated'&&!e.locks['src/shared.ts']);
 console.log('Live swarm passed: auth, private rooms, repo, diffs, actions, conflicting-owner rejection, release protection and disconnect cleanup.');
}finally{for(const socket of clients)socket.close();}
