const fs=require('node:fs/promises'),path=require('node:path');
function normalizeLimits(result) {
 const buckets=result?.rateLimitsByLimitId || (result?.rateLimits?{[result.rateLimits.limitId||'codex']:result.rateLimits}:{});
 const windows=[];
 for(const [id,bucket] of Object.entries(buckets))for(const key of ['primary','secondary']){
  const w=bucket[key];if(!w||typeof w.usedPercent!=='number')continue;
  const mins=w.windowDurationMins;
  const duration=mins>=1440?`${Math.round(mins/1440)}d`:mins>=60?`${Math.round(mins/60)}h`:mins?`${mins}m`:key;
  windows.push({label:`${bucket.limitName||id} · ${duration}`,remainingPercent:Math.max(0,Math.min(100,100-w.usedPercent)),resetsAt:w.resetsAt});
 }return windows;
}
function readCodexLimits({binary,spawnCli,killProcessTree,timeoutMs=15000}){
 return new Promise((resolve,reject)=>{
  const child=spawnCli(binary,['app-server'],{stdio:['pipe','pipe','pipe']});let pending='',settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);child.stdin.end();killProcessTree(child);error?reject(error):resolve(normalizeLimits(value));};
  const timer=setTimeout(()=>finish(new Error('Codex usage request timed out')),timeoutMs);
  const send=m=>child.stdin.write(JSON.stringify(m)+'\n');
  child.stdout.on('data',chunk=>{pending+=chunk.toString();const lines=pending.split('\n');pending=lines.pop();for(const line of lines){let m;try{m=JSON.parse(line);}catch{continue;}if(m.id!==1&&m.id!==2)continue;if(m.error){finish(new Error(m.error.message||'Codex limits unavailable'));return;}if(m.id===1){send({method:'initialized',params:{}});send({id:2,method:'account/rateLimits/read',params:{}});}else finish(null,m.result);}});
  child.stdin.on('error',e=>finish(e));child.stderr.on('data',()=>{});child.on('error',e=>finish(e));child.on('close',()=>{if(!settled)finish(new Error('Codex closed before returning account limits'));});
  send({id:1,method:'initialize',params:{clientInfo:{name:'vendracode-usage',version:'1.5.0'}}});
 });
}
function parseCodexContext(text){
 let result={};for(const line of text.split('\n')){try{const e=JSON.parse(line);if(e.type!=='event_msg'||e.payload?.type!=='token_count')continue;const p=e.payload;
 if(p.info?.last_token_usage)result={...result,contextUsed:p.info.last_token_usage.total_tokens,contextWindow:p.info.model_context_window};
 }catch{}}return result;
}
const sessionFiles=new Map();
async function codexContext(home,sessionId){
 if(!sessionId)return {};
 if(!/^[0-9a-f-]{36}$/i.test(sessionId))throw new Error('Invalid Codex session ID');
 const root=path.join(home,'sessions'),key=root+'|'+sessionId;let file=sessionFiles.get(key);
 async function find(dir,depth){if(depth<0)return;let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch{return;}for(const e of entries){if(e.isFile()&&e.name.endsWith(sessionId+'.jsonl'))return path.join(dir,e.name);}for(const e of entries.reverse())if(e.isDirectory()){const found=await find(path.join(dir,e.name),depth-1);if(found)return found;}}
 if(!file){file=await find(root,3);if(file)sessionFiles.set(key,file);}if(!file)return {};
 const handle=await fs.open(file,'r');try{const stat=await handle.stat(),size=Math.min(stat.size,512*1024),start=stat.size-size;const buffer=Buffer.alloc(size);await handle.read(buffer,0,size,start);return parseCodexContext(buffer.toString('utf8'));}finally{await handle.close();}
}
module.exports={normalizeLimits,readCodexLimits,parseCodexContext,codexContext};
