import React, {useEffect,useState,useRef} from 'react';
import {RefreshCw,ChevronDown} from 'lucide-react';
import type {CliUsage} from '@/types';
const number=(v:number)=>new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(v);
export function AgentUsagePanel({engine,sessionId,streamUsage,busy,chatId}:{engine:string;sessionId?:string;streamUsage?:CliUsage;busy:boolean;chatId?:string}) {
 const refreshVersion=useRef(0);
 const [reported,setReported]=useState<CliUsage>({}),[loading,setLoading]=useState(false); const [version,setVersion]=useState(0);
 useEffect(()=>{
  let cancelled=false,inFlight=false;
  setReported({});
  if(engine!=='codex'||!window.vendraAPI?.cli?.usage)return;
  const fetch=async(refresh=false)=>{if(inFlight)return;inFlight=true;setLoading(true);try{const result=await window.vendraAPI.cli.usage({sessionId,refresh});if(!cancelled)setReported(result);}catch(e){if(!cancelled)setReported({limitsError:e instanceof Error?e.message:String(e)});}finally{inFlight=false;if(!cancelled)setLoading(false);}};
  const force=version!==refreshVersion.current;refreshVersion.current=version;
  void fetch(force);const timer=busy?setInterval(()=>void fetch(),10000):undefined;
  return ()=>{cancelled=true;if(timer)clearInterval(timer);};
 },[engine,sessionId,busy,chatId,version]);
 if(!['codex','claude','opencode'].includes(engine))return null;
 const data:CliUsage={...streamUsage,...reported},known=typeof data.contextUsed==='number'&&typeof data.contextWindow==='number'&&data.contextWindow>0;
 const pct=known?Math.max(0,Math.min(100,100*data.contextUsed!/data.contextWindow!)):undefined;
 const limits=data.limits||[];
 return <details className="vc-usage"><summary><span>Context <strong>{known?`${number(data.contextUsed!)} / ${number(data.contextWindow!)}`:typeof data.contextUsed==='number'?`${number(data.contextUsed)} tokens`:'—'}</strong></span><span className="ml-auto">{limits[0]?.remainingPercent!==undefined?`${Math.round(limits[0].remainingPercent)}% left`:'Usage & limits'}</span><ChevronDown size={11}/></summary>{known&&<div className="vc-meter" aria-label="Context used" role="progressbar" aria-valuenow={Math.round(pct!)} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${pct}%`}}/></div>}<div className="vc-usage-details">
  <div className="flex items-center justify-between"><span>Context window</span><strong>{known?`${Math.round(pct!)}% used · ${number(Math.max(0,data.contextWindow!-data.contextUsed!))} left`:'Not reported by CLI'}</strong></div>
  {data.contextUsed!==undefined&&<p className="text-text-muted">Latest reported request, including cached input. Updated when the CLI reports token usage.</p>}
  {limits.length?limits.map((limit,i)=><div key={limit.label+i} className="vc-limit"><div className="flex justify-between gap-2"><span>{limit.label}</span><strong>{limit.remainingPercent!==undefined?`${Math.round(limit.remainingPercent)}% remaining`:limit.status||'Percentage unavailable'}</strong></div>{limit.remainingPercent!==undefined&&<div className="vc-meter"><span style={{width:`${limit.remainingPercent}%`}}/></div>}{limit.resetsAt&&<small>Resets {new Date(limit.resetsAt*1000).toLocaleString()}</small>}</div>):<p className="text-text-muted">{loading?'Reading account limits…':data.limitsError||'This CLI has not reported quota percentages. No remaining percentage is assumed.'}</p>}
  {data.inputTokens!==undefined&&<p>Last turn: {number(data.inputTokens)} input · {number(data.outputTokens||0)} output tokens</p>}
  {data.costUsd!==undefined&&<p>Reported cost: ${data.costUsd.toFixed(4)}</p>}
  {data.checkedAt&&<p className="text-text-muted">Updated {new Date(data.checkedAt).toLocaleTimeString()}</p>}
  {engine==='codex'&&<button className="btn btn-ghost h-6 text-[10px]" disabled={loading} onClick={()=>setVersion(v=>v+1)}><RefreshCw size={10}/>Refresh limits</button>}
 </div></details>;
}
