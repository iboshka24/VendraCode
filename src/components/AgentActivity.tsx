import React from 'react';
import { BrainCircuit, Loader2, AlertCircle, CheckCircle2, Wrench, ChevronDown } from 'lucide-react';
import type { ChatMessage } from '@/types';
export function AgentActivity({message,live=false}:{message:ChatMessage;live?:boolean}) {
 const a=message.activity;
 if(a?.kind==='run') {
  if(a.status==='completed')return null;
  const running=a.status==='running'&&live;
  return <div className={`vc-run-status ${a.status==='error'?'vc-event-error':''}`} role="status">{running?<Loader2 size={13} className="animate-spin"/>:a.status==='error'?<AlertCircle size={13}/>:null}<span>{running?'WORKING':a.status==='error'?'FAILED':a.status==='stopped'?'STOPPED':'INTERRUPTED'}</span>{message.content&&<span className="normal-case tracking-normal font-normal">{message.content}</span>}</div>;
 }
 if(a?.kind==='thinking')return <details className="vc-event vc-event-thinking" open={a.status==='running'&&live}><summary><BrainCircuit size={14}/><strong>Thinking</strong><span className="vc-event-state">{a.status==='running'&&live?'IN PROGRESS':'SUMMARY'}</span><ChevronDown size={12}/></summary><div className="vc-event-body whitespace-pre-wrap">{message.content||'The CLI has not provided a thinking summary.'}</div></details>;
 if(a?.kind==='diagnostic')return <details className="vc-event"><summary><AlertCircle size={13}/><strong>CLI diagnostic</strong><ChevronDown size={12}/></summary><pre className="vc-event-body">{message.content}</pre></details>;
 let data:any;try{data=JSON.parse(message.content);}catch{return null;}
 const status=String(data.status||''),done=['completed','success'].includes(status),failed=['error','failed'].includes(status);
 const display=(value:any)=>typeof value==='string'?value:JSON.stringify(value,null,2);
 return <details className={`vc-event ${failed?'vc-event-error':''}`}><summary>{failed?<AlertCircle size={14}/>:done?<CheckCircle2 size={14}/>:<Wrench size={14}/>}<strong className="truncate">{message.toolName||'Action'}</strong><span className="vc-event-state">{failed?'FAILED':done?'DONE':live?'WORKING':'FINISHED'}</span><ChevronDown size={12}/></summary>{data.input!==undefined&&<div className="vc-event-body"><div className="vc-event-label">INPUT</div><pre>{display(data.input)}</pre></div>}{data.output!==undefined&&<div className="vc-event-body"><div className="vc-event-label">OUTPUT</div><pre>{display(data.output)}</pre></div>}{data.input===undefined&&data.output===undefined&&<div className="vc-event-body">{status||'No additional details reported.'}</div>}</details>;
}
