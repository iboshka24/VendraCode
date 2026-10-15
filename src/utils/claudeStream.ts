import type { ParsedCliChunk } from './opencodeStream';
export function claudeRunArgs(sessionId?:string) {
  return ['-p','--output-format','stream-json','--verbose','--include-partial-messages','--dangerously-skip-permissions',...(sessionId?['--resume',sessionId]:[])];
}
export function createClaudeParser() {
  let pending='',model='',contextUsed:number|undefined; const streamed=new Set<string>(); const blocks=new Map<number,{id:string;type:string;name?:string;input:string}>(); let messageId='';
  return (chunk:string):ParsedCliChunk[] => {
    pending+=chunk;const lines=pending.split('\n');pending=lines.pop()||'';const out:ParsedCliChunk[]=[];
    for(const line of lines){let e:any;try{e=JSON.parse(line);}catch{continue;}
      if(e.session_id)out.push({sessionId:e.session_id});
      if(e.type==='system'&&e.subtype==='init')model=e.model||'';
      if(e.type==='stream_event'){
        const v=e.event||{};
        if(v.type==='message_start'){messageId=v.message?.id||'';blocks.clear();}
        if(v.type==='content_block_start'){
          const b=v.content_block||{},id=b.id||`${messageId}-${v.index}`;blocks.set(v.index,{id,type:b.type,name:b.name,input:''});streamed.add(id);
          if(b.type==='thinking')out.push({reasoning:{id,text:b.thinking||'',status:'running'}});
          if(b.type==='tool_use')out.push({tool:{id,name:b.name,status:'running',input:b.input}});
          if(b.type==='text'&&b.text)out.push({text:b.text});
        }
        if(v.type==='content_block_delta'){
          const b=blocks.get(v.index),d=v.delta||{};
          if(d.type==='text_delta')out.push({text:d.text||''});
          if(d.type==='thinking_delta')out.push({reasoning:{id:b?.id||`${messageId}-${v.index}`,text:d.thinking||'',append:true,status:'running'}});
          if(d.type==='input_json_delta'&&b)b.input+=d.partial_json||'';
        }
        if(v.type==='content_block_stop'){
          const b=blocks.get(v.index);
          if(b?.type==='thinking')out.push({reasoning:{id:b.id,text:'',append:true,status:'completed'}});
          if(b?.type==='tool_use'&&b.input){try{out.push({tool:{id:b.id,name:b.name||'tool',status:'running',input:JSON.parse(b.input)}});}catch{}}
        }
      }
      if(e.type==='assistant'){
        const msg=e.message||{},u=msg.usage;
        if(u){contextUsed=(u.input_tokens||0)+(u.cache_read_input_tokens||0)+(u.cache_creation_input_tokens||0)+(u.output_tokens||0);out.push({usage:{contextUsed,inputTokens:(u.input_tokens||0)+(u.cache_read_input_tokens||0)+(u.cache_creation_input_tokens||0),outputTokens:u.output_tokens}});}
        for(let i=0;i<(msg.content||[]).length;i++){
          const b=msg.content[i],id=b.id||`${msg.id}-${i}`;if(streamed.has(id))continue;
          if(b.type==='text')out.push({text:b.text});
          if(b.type==='thinking')out.push({reasoning:{id,text:b.thinking||'',status:'completed'}});
          if(b.type==='tool_use')out.push({tool:{id,name:b.name,status:'running',input:b.input}});
        }
      }
      if(e.type==='user')for(const b of e.message?.content||[])if(b.type==='tool_result')out.push({tool:{id:b.tool_use_id,name:'Tool result',status:b.is_error?'error':'completed',output:typeof b.content==='string'?b.content:JSON.stringify(b.content)}});
      if(e.type==='rate_limit_event'){
        const r=e.rate_limit_info||e.rateLimitInfo||{};
        const window=(label:string,w:any)=>({label,status:w.status||r.status,resetsAt:w.resetsAt||w.resets_at,...(typeof w.utilization==='number'&&Number.isFinite(w.utilization)?{remainingPercent:Math.max(0,Math.min(100,100-w.utilization*100))}:typeof w.used_percentage==='number'?{remainingPercent:Math.max(0,Math.min(100,100-w.used_percentage))}:{})});
        const windows=r.unifiedWindows&&typeof r.unifiedWindows==='object'?Object.entries(r.unifiedWindows).filter(([,w])=>w&&typeof w==='object').map(([label,w])=>window(label,w)):[];
        out.push({usage:{limits:windows.length?windows:[window(r.rateLimitType||r.rate_limit_type||'Claude',r)]}});
      }
      if(e.type==='result'){
        const entries=Object.entries(e.modelUsage||{});const m:any=entries.find(([key])=>key===model)?.[1] || (entries.length===1?entries[0][1]:undefined);
        out.push({usage:{contextWindow:m?.contextWindow,contextUsed,costUsd:e.total_cost_usd}});
        if(e.is_error)out.push({error:(e.errors||[e.result||'Claude run failed']).join('\n')});
      }
    }return out;
  };
}
