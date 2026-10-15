const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const {prepareWorktree,joinSwarm,githubRepo}=require('../electron/swarm');const run=promisify(execFile);
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'vendra-swarm-test-'));const source=path.join(root,'source');await fs.mkdir(source);await run('git',['init','-b','trunk',source]);await run('git',['-C',source,'config','user.name','Swarm Test']);await run('git',['-C',source,'config','user.email','test@example.invalid']);await fs.writeFile(path.join(source,'README.md'),'original\n');await run('git',['-C',source,'add','.']);await run('git',['-C',source,'commit','-m','fixture']);
 const remote='https://github.com/test/fixture';
 const runGit=async args=>(await run('git',args.map(x=>x===remote?source:x))).stdout.trim();
 const a=await prepareWorktree({repoUrl:remote,sessionId:'swarm-test-session',baseDir:path.join(root,'client'),runGit});
 await fs.writeFile(path.join(a.path,'README.md'),'local unsaved work\n');
 const b=await prepareWorktree({repoUrl:remote,sessionId:'swarm-test-session',baseDir:path.join(root,'client'),runGit});
 assert.notEqual(a.path,b.path);assert.notEqual(a.branch,b.branch);assert.equal(await fs.readFile(path.join(a.path,'README.md'),'utf8'),'local unsaved work\n');assert.equal((await fs.readFile(path.join(b.path,'README.md'),'utf8')).replace(/\r\n/g,'\n'),'original\n');
 assert.throws(()=>githubRepo('https://github.com.evil.invalid/a/b'));assert.throws(()=>githubRepo('https://user:secret@github.com/a/b'));
 let called=false;await assert.rejects(joinSwarm({sessionId:'swarm-test-session',token:'a'.repeat(64),repoUrl:remote,baseDir:root,fetchImpl:async()=>({ok:false,status:403}),runGit:async()=>called=true}),/invalid/);assert(!called);
 await assert.rejects(joinSwarm({sessionId:'swarm-test-session',token:'a'.repeat(64),repoUrl:remote,baseDir:root,fetchImpl:async()=>({ok:true,json:async()=>({repoUrl:'https://github.com/another/repo'})}),runGit:async()=>called=true}),/does not match/);assert(!called);
 console.log('Native swarm join: real Git worktrees, non-main branch, repeat join preserves changes, invalid invites stop before Git.');
})().catch(e=>{console.error(e);process.exitCode=1});
