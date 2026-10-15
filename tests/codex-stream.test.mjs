import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source = readFileSync(new URL('../src/utils/codexStream.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { createCodexParser, codexRunArgs } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const events = [
  {type:'thread.started',thread_id:'thread-123'},
  {type:'item.started',item:{id:'cmd-1',type:'command_execution',command:'node --version'}},
  {type:'item.completed',item:{id:'cmd-1',type:'command_execution',command:'node --version',status:'completed'}},
  {type:'item.completed',item:{id:'msg-1',type:'agent_message',text:'Готово'}},
  {type:'turn.failed',error:{message:'Test failure'}}
];
const wire=events.map(e=>JSON.stringify(e)+'\n').join('');
const expected=createCodexParser()(wire);
for(let split=0; split<=wire.length; split++) {
  const parse=createCodexParser();
  assert.deepEqual([...parse(wire.slice(0,split)),...parse(wire.slice(split))],expected);
}
assert.equal(expected[0].sessionId,'thread-123');
assert.equal(expected[1].tool.id,expected[2].tool.id);
assert.equal(expected[3].text,'Готово\n');
assert.equal(expected[4].error,'Test failure');
assert.deepEqual(codexRunArgs(),['exec','--json','--skip-git-repo-check','--sandbox','workspace-write']);
assert.deepEqual(codexRunArgs({sessionId:'thread-123',effort:'high'}),['exec','resume','thread-123','--json','--skip-git-repo-check','-c','model_reasoning_effort="high"']);
assert.deepEqual(codexRunArgs({model:'chosen-model'}),['exec','--json','--skip-git-repo-check','--model','chosen-model','--sandbox','workspace-write']);
assert.deepEqual(codexRunArgs({sessionId:'thread-123',model:'chosen-model'}),['exec','resume','thread-123','--json','--skip-git-repo-check','--model','chosen-model']);
console.log('Codex event fragmentation, tool lifecycle, errors and resume arguments passed.');

for (const effort of ['none','minimal','low','medium','high','xhigh']) {
 for (const sessionId of [undefined,'thread-existing']) {
  const args=codexRunArgs({sessionId,effort});
  assert.equal(args[args.indexOf('-c')+1],`model_reasoning_effort=${JSON.stringify(effort)}`);
  assert(!args.some(arg=>arg.includes('developer_instructions')));
 }
}
console.log('Selected Codex reasoning effort is explicit for both new and resumed runs.');
