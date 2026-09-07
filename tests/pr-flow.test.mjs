import test from 'node:test';
import assert from 'node:assert/strict';
import {prepare,submit,target,submissionStatus} from '../worker/pr-service.mjs';
import {evidencePlan,regionGroups,panelSize,mapContext} from '../src/core/pr-evidence.mjs';
import {validatePNG,encrypt,decrypt,readJSON} from '../worker/security.mjs';
import {GitHub} from '../worker/github.mjs';
import worker from '../worker/index.mjs';
import {MemoryStore,FakeGitHub,input,change,env,png} from './pr-fixtures.mjs';
const submission=p=>({title:'Update test coverage',introduction:'Test introduction',images:p.evidence.panels.map(p=>({id:p.id,png:png(panelSize(p).width,panelSize(p).height)}))});

test('preparation is read-only, freezes exact code changes and wiki evidence, and deduplicates previews',async()=>{
  const gh=new FakeGitHub(),store=new MemoryStore(),p=await prepare(input,'1',gh,store,env);
  assert.equal(gh.calls.length,0);assert.match(p.patch,/BOSS_PR_TEST/);assert.equal(p.repo,'test/plugin');assert.equal(p.evidence.panels[0].context.plane,0);assert.ok(p.evidence.sources[change.id].some(s=>s.includes('oldid=123')));
  assert.equal((await prepare(input,'1',gh,store,env)).id,p.id);
});
test('single PR creates only Java changes, separate evidence branch, embedded images and wiki links',async()=>{
  const gh=new FakeGitHub(),store=new MemoryStore(),p=await prepare(input,'1',gh,store,env),r=await submit(p.id,submission(p),'1','contributor',gh,store);
  assert.equal(r.status,'complete');assert.equal(gh.prs.length,1);assert.equal(gh.prs[0].draft,false);
  assert.match(gh.prs[0].body,/raw.githubusercontent.com\/contributor\/plugin\/commit-/);assert.match(gh.prs[0].body,/oldschool.runescape.wiki/);assert.match(gh.prs[0].body,/not in-game verification/);
  const codeTree=gh.calls.find(c=>c[0]==='tree'&&c[2]==='tree-base');assert.equal(codeTree[1].length,1);assert.match(codeTree[1][0].path,/EscapeCrystalNotifyRegion.java$/);
  assert.ok([...gh.refs.keys()].some(k=>k.startsWith('codex/evidence-')));assert.ok(!gh.refs.has('master'));
  await submit(p.id,submission(p),'1','contributor',gh,store);assert.equal(gh.prs.length,1);
  gh.sha='a'.repeat(40);assert.equal((await prepare(input,'1',gh,store,env)).pr.number,1);
});
test('closed unmerged PRs allow one fresh submission while preserving history and retry safety',async()=>{
  const gh=new FakeGitHub(),store=new MemoryStore(),first=await prepare(input,'1',gh,store,env);
  await submit(first.id,submission(first),'1','contributor',gh,store);
  // Older stored records do not have state fields; fetch their status from GitHub.
  const legacy=await store.get(first.id,'1');delete legacy.pr.state;delete legacy.pr.merged;await store.save(legacy);
  gh.prs[0].state='closed';
  const status=await submissionStatus(first.id,'1',gh,store);
  assert.equal(status.status,'closed');assert.equal(status.pr.merged,false);
  const mutations=gh.calls.length;
  const [next,duplicate]=await Promise.all([prepare(input,'1',gh,store,env),prepare(input,'1',gh,store,env)]);
  assert.notEqual(next.id,first.id);assert.equal(next.id,duplicate.id);assert.equal(next.pr,null);assert.equal(gh.calls.length,mutations);
  assert.equal((await store.get(first.id,'1')).pr.number,1);
  const result=await submit(next.id,submission(next),'1','contributor',gh,store);
  assert.equal(result.pr.number,2);assert.notEqual(gh.prs[0].head,gh.prs[1].head);
  await submit(next.id,submission(next),'1','contributor',gh,store);assert.equal(gh.prs.length,2);
  assert.equal((await prepare(input,'1',gh,store,env)).id,next.id);
  gh.prs[1].state='closed';
  const third=await prepare(input,'1',gh,store,env);assert.notEqual(third.id,next.id);assert.notEqual(third.id,first.id);
});
test('a PR reopened after preparation blocks the replacement before remote writes',async()=>{
  const gh=new FakeGitHub(),store=new MemoryStore(),first=await prepare(input,'1',gh,store,env);
  await submit(first.id,submission(first),'1','contributor',gh,store);gh.prs[0].state='closed';
  const next=await prepare(input,'1',gh,store,env);gh.prs[0].state='open';const mutations=gh.calls.length;
  await assert.rejects(submit(next.id,submission(next),'1','contributor',gh,store),/Pull request #1 is open/);
  assert.equal(gh.calls.length,mutations);assert.equal((await prepare(input,'1',gh,store,env)).id,first.id);
});
test('merged PRs keep duplicate protection and status checks enforce ownership',async()=>{
  const gh=new FakeGitHub(),store=new MemoryStore(),first=await prepare(input,'1',gh,store,env);
  await submit(first.id,submission(first),'1','contributor',gh,store);
  gh.prs[0].state='closed';gh.prs[0].merged_at='2026-09-06T00:00:00Z';
  const result=await prepare(input,'1',gh,store,env);assert.equal(result.id,first.id);assert.equal(result.status,'merged');assert.equal(result.pr.merged,true);
  await assert.rejects(submissionStatus(first.id,'2',gh,store),/not found/);
});
test('unavailable GitHub status never permits an unverified replacement',async()=>{
  const gh=new FakeGitHub(),store=new MemoryStore(),first=await prepare(input,'1',gh,store,env);
  await submit(first.id,submission(first),'1','contributor',gh,store);const mutations=gh.calls.length;
  gh.pullRequest=async()=>{throw Error('GitHub unavailable');};
  await assert.rejects(prepare(input,'1',gh,store,env),/GitHub unavailable/);
  await assert.rejects(submissionStatus(first.id,'1',gh,store),/GitHub unavailable/);
  assert.equal(store.rows.size,1);assert.equal(gh.calls.length,mutations);
});
test('batch preview includes every boss, arena group, changed entrance and selected chunks',async()=>{
  const second={...change,id:'BOSS_PR_SECOND',name:'Second boss',regions:[12938],entranceRegion:12582,entrance:{overlay:'DEPRIORITIZED_WITH_HIGHLIGHT',direction:'',plane:'',objectType:'GAME_OBJECT',ids:['58439'],chunks:[]}};
  const data={changes:[change,second],contexts:{...input.contexts,[second.id]:{arena:{x:3200,y:8876,plane:1},entrance:{x:3176,y:2477,plane:2,region:12582}}},sources:{...input.sources,[second.id]:input.sources[change.id]}};
  const p=await prepare(data,'1',new FakeGitHub(),new MemoryStore(),env);assert.equal(p.changes.length,2);assert.equal(p.evidence.panels.length,3);assert.equal(p.evidence.panels.find(p=>p.kind==='entrance').context.plane,2);
});
test('upstream changes require a new preview before any mutation',async()=>{
  const gh=new FakeGitHub(),store=new MemoryStore(),p=await prepare(input,'1',gh,store,env);gh.sha='a'.repeat(40);
  await assert.rejects(submit(p.id,submission(p),'1','contributor',gh,store),/Upstream changed/);assert.equal(gh.calls.length,0);
  assert.notEqual((await prepare(input,'1',gh,store,env)).id,p.id);
});
test('changed edited entry and unchanged source are rejected during preparation',async()=>{
  await assert.rejects(prepare({...input,changes:[{...change,baseRaw:'stale'}]},'1',new FakeGitHub(),new MemoryStore(),env),/Conflict/);
  const gh=new FakeGitHub(),store=new MemoryStore(),p=await prepare(input,'1',gh,store,env),r=await store.get(p.id,'1');gh.source=r.after;
  const raw=gh.source.match(/BOSS_PR_TEST\([\s\S]*?\),/)[0].slice(0,-1);
  await assert.rejects(prepare({...input,changes:[{...change,baseRaw:raw}]},'1',gh,new MemoryStore(),env),/no changes|Conflict/);
});
test('delayed forks and failed uploads resume; uncertain PR responses recover one PR',async()=>{
  const gh=new FakeGitHub(),store=new MemoryStore(),p=await prepare(input,'1',gh,store,env),payload=submission(p);gh.ready=false;
  await assert.rejects(submit(p.id,payload,'1','contributor',gh,store),/preparing your fork/);gh.ready=true;gh.failUpload=true;
  await assert.rejects(submit(p.id,payload,'1','contributor',gh,store),/Upload interrupted/);gh.losePRResponse=true;
  const done=await submit(p.id,payload,'1','contributor',gh,store);assert.equal(done.status,'complete');assert.equal(gh.prs.length,1);assert.equal(gh.calls.filter(c=>c==='fork').length,1);
});
test('submission ownership, duplicate images and incomplete screenshot sets fail closed',async()=>{
  const gh=new FakeGitHub(),store=new MemoryStore(),p=await prepare(input,'1',gh,store,env);
  await assert.rejects(submit(p.id,submission(p),'2','other',gh,store),/not found/);
  await assert.rejects(submit(p.id,{...submission(p),images:[]},'1','contributor',gh,store),/every screenshot/);
  await assert.rejects(submit(p.id,{...submission(p),images:[{id:'wrong',png:'abcd'}]},'1','contributor',gh,store),/Unexpected/);assert.equal(gh.calls.length,0);
});
test('connected regions split into readable panels and remote selections stay separate',()=>{
  assert.deepEqual(regionGroups([0,1,256,65535]),[[0,1,256],[65535]]);
  const ids=Array.from({length:25},(_,i)=>((i%5)<<8)+Math.floor(i/5));const groups=regionGroups(ids);assert.equal(groups.flat().length,25);assert.ok(groups.every(g=>g.length<=16));
  assert.throws(()=>mapContext({x:0,y:0,plane:4}),/plane/);
  assert.throws(()=>evidencePlan([change],input.contexts,{[change.id]:['https://evil.example/w/Boss']}),/OSRS Wiki/);
});
test('PNG validation rejects malformed data, incorrect dimensions, corrupted CRC and trailing content',()=>{
  const image=png(640,400);assert.ok(validatePNG(image,{width:640,height:400}));
  assert.throws(()=>validatePNG(image,{width:800,height:400}),/dimensions/);
  const corrupt=Buffer.from(image,'base64');corrupt[40]^=1;assert.throws(()=>validatePNG(corrupt.toString('base64'),{width:640,height:400}),/checksum|Truncated/);
  assert.throws(()=>validatePNG('abcd',{width:1,height:1}),/PNG/);
});
test('tokens are encrypted and authenticated, and request bodies are bounded',async()=>{
  const secret='test-only-secret-'.repeat(4),encrypted=await encrypt({token:'test-token'},secret);assert.ok(!encrypted.includes('test-token'));assert.equal((await decrypt(encrypted,secret)).token,'test-token');await assert.rejects(decrypt(encrypted,'wrong-secret-'.repeat(4)));
  await assert.rejects(readJSON(new Request('https://test',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"too":"large"}'}),4),/too large/);
});
test('production target cannot be replaced by test settings',()=>{assert.equal(target({...env,DEPLOYMENT_MODE:'production'}).repo,'Xylot/escape-crystal-notify');});
test('worker rejects unapproved origins and unauthenticated API requests',async()=>{
  const config={...env,PR_ENABLED:'true',ALLOWED_ORIGINS:'https://editor.test',DB:{}};
  assert.equal((await worker.fetch(new Request('https://api.test/prepare',{headers:{Origin:'https://evil.test'}}),config)).status,403);
  assert.equal((await worker.fetch(new Request('https://api.test/prepare',{headers:{Origin:'https://editor.test'}}),config)).status,401);
});
test('GitHub client handles expired authorization and denied permissions without leaking tokens',async()=>{
  for(const status of [401,403]){const gh=new GitHub('never-log-this',async()=>new Response('{}',{status}));await assert.rejects(gh.request('/user'),e=>e.status===status&&!e.message.includes('never-log-this'));}
});

test('evidence accepts the wiki underground layer and rejects invalid map IDs',()=>{
  const context={x:3179,y:8876,plane:0,tiles:{version:'2026-08-12_a',mapId:-1}};
  assert.equal(mapContext(context).tiles.mapId,-1);
  assert.throws(()=>mapContext({...context,tiles:{...context.tiles,mapId:-2}}),/Map ID/);
});
