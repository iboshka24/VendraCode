import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import ts from 'typescript';
async function load(file){const source=readFileSync(new URL('../src/utils/'+file,import.meta.url),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}
const {createClaudeParser,claudeRunArgs}=await load('claudeStream.ts');
const {createCodexParser}=await load('codexStream.ts');const {createOpenCodeParser}=await load('opencodeStream.ts');
const events=[
 {type:'system',subtype:'init',session_id:'session',model:'claude'},
 {type:'stream_event',event:{type:'message_start',message:{id:'msg'}}},
 {type:'stream_event',event:{type:'content_block_start',index:0,content_block:{type:'thinking'}}},
 {type:'stream_event',event:{type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'Reported summary'}}},
 {type:'stream_event',event:{type:'content_block_stop',index:0}},
 {type:'stream_event',event:{type:'content_block_start',index:1,content_block:{type:'text'}}},
 {type:'stream_event',event:{type:'content_block_delta',index:1,delta:{type:'text_delta',text:'Answer'}}},
 {type:'assistant',message:{id:'msg',content:[{type:'thinking',thinking:'Reported summary'},{type:'text',text:'Answer'}],usage:{input_tokens:100,cache_read_input_tokens:200,output_tokens:50}}},
 {type:'assistant',message:{id:'toolmsg',content:[{type:'tool_use',id:'tool',name:'Read',input:{file_path:'file'}}]}},
 {type:'user',message:{content:[{type:'tool_result',tool_use_id:'tool',content:'content'}]}},
 {type:'rate_limit_event',rate_limit_info:{rateLimitType:'five_hour',status:'allowed',resetsAt:123}},
 {type:'result',modelUsage:{claude:{contextWindow:200000}},total_cost_usd:0.01}
];
const wire=events.map(e=>JSON.stringify(e)+'\n').join('');const expected=createClaudeParser()(wire);
for(let split=0;split<=wire.length;split++){const p=createClaudeParser();assert.deepEqual([...p(wire.slice(0,split)),...p(wire.slice(split))],expected);}
assert.equal(expected.filter(e=>e.text).map(e=>e.text).join(''),'Answer');assert.equal(expected.filter(e=>e.reasoning?.text).length,1);
assert(expected.some(e=>e.tool?.status==='completed'));assert.equal(expected.at(-1).usage.contextUsed,350);assert.equal(expected.at(-1).usage.contextWindow,200000);
assert.equal(expected.find(e=>e.usage?.limits)?.usage.limits[0].remainingPercent,undefined);
assert(claudeRunArgs('resume-me').includes('--resume'));assert(claudeRunArgs().includes('--include-partial-messages'));
const codex=createCodexParser()([ {type:'item.completed',item:{type:'reasoning',id:'r',text:'Summary'}},{type:'item.completed',item:{type:'command_execution',id:'c',command:'git status',aggregated_output:'clean',status:'completed'}},{type:'turn.completed',usage:{input_tokens:100,output_tokens:20}}].map(e=>JSON.stringify(e)+'\n').join(''));
assert.equal(codex[0].reasoning.text,'Summary');assert.equal(codex[1].tool.output,'clean');assert.equal(codex[2].usage.outputTokens,20);
const op=createOpenCodeParser();const record=JSON.stringify({type:'reasoning',part:{type:'reasoning',id:'reason',text:'Summary'}})+'\n';assert.deepEqual(op(record.slice(0,8)),[]);assert.equal(op(record.slice(8))[0].reasoning.text,'Summary');
console.log('CLI events: thinking summaries, separate actions/results, token/context metrics, unknown quota percentages, resume flags, no duplicate text and every JSONL split passed.');

const quotas=createClaudeParser()(JSON.stringify({type:'rate_limit_event',rate_limit_info:{status:'allowed',unifiedWindows:{five_hour:{utilization:0.14,resetsAt:123},seven_day:{utilization:0.79,resetsAt:456}}}})+'\n')[0].usage.limits;
assert.equal(Math.round(quotas[0].remainingPercent),86);assert.equal(Math.round(quotas[1].remainingPercent),21);
const warning=createClaudeParser()(JSON.stringify({type:'rate_limit_event',rate_limit_info:{status:'allowed_warning',utilization:0.85,rateLimitType:'five_hour'}})+'\n')[0];assert.equal(Math.round(warning.usage.limits[0].remainingPercent),15);
console.log('Claude utilization fractions and optional multi-window quota snapshots are shown only when explicitly reported.');
