import test from 'node:test';
import assert from 'node:assert/strict';
import {existingDraft,editableDraft,applySection} from '../src/core/editing.mjs';
import {encounterLocations} from '../src/core/encounter.mjs';
import {proposalStates,stateDifferences,comparisonEvidence} from '../src/core/pr-states.mjs';
import {panelSize} from '../src/core/pr-evidence.mjs';
import {prepare,submit,publicRecord} from '../worker/pr-service.mjs';
import {snapshot,FakeGitHub,MemoryStore,env,png,change,input} from './pr-fixtures.mjs';

function edit(name,section,patch){
  const boss=snapshot.entries.find(e=>e.name===name),draft=existingDraft(boss),working=editableDraft(draft);
  const next=applySection(draft,{...working,...patch(working)},section),locations=encounterLocations({...boss,maps:[]});
  return {changes:[next],contexts:{[boss.id]:{arena:locations.arena[0],entrance:locations.entrance[0]}},sources:{[boss.id]:['https://oldschool.runescape.wiki/w/'+encodeURIComponent(name.replaceAll(' ','_'))]}};
}
const section=(body,state)=>body.split(`<summary>${state}</summary>`)[1].split('</details>')[0];

test('sparse metadata edits retain complete chunk coverage in both states, screenshots and submitted PR',async()=>{
  const data=edit('King Black Dragon Entrance','details',()=>({name:'Updated entrance',deathType:'UNSAFE_HCGIM'}));
  const id=data.changes[0].id,gh=new FakeGitHub(),store=new MemoryStore();
  data.presentation={[id]:{scope:'boss',beforeImages:['100'],images:['200']}};
  const p=await prepare(data,'1',gh,store,env);
  assert.equal(data.changes[0].chunks,undefined);
  for(const phase of ['before','after']){
    const state=p.states[id][phase];
    assert.deepEqual(state.chunks,[785665,785666]);
    const panels=p.evidence.panels.filter(p=>p.state===phase);
    assert.equal(panels.length,2);
    assert.deepEqual(panels.find(p=>p.kind==='arena').chunks,[785665,785666]);
    assert.deepEqual(panels.find(p=>p.kind==='entrance').chunks,[785665]);
    assert.ok(panels.every(p=>p.restrictChunks));
    const body=section(p.body,phase==='before'?'Before':'After');
    assert.match(body,/Arena chunks: 785665, 785666/);
    assert.match(body,/Entrance options:/);assert.match(body,/Wiki sources/);
    for(const panel of panels)assert.ok(body.includes(`evidence://${panel.id}`));
    assert.ok(body.includes(`${phase==='before'?'100':'200'}_orient0.png`));
    assert.ok(!body.includes(`${phase==='before'?'200':'100'}_orient0.png`));
  }
  assert.match(p.body,/### Additions[\s\S]*Display name: Updated entrance/);
  assert.match(p.body,/### Removals[\s\S]*Display name: King Black Dragon Entrance/);
  assert.match(section(p.body,'Before'),/Death classification: UNSAFE/);
  assert.match(section(p.body,'After'),/Death classification: UNSAFE\\_HCGIM/);
  data.presentation[id].beforeImages.push('300');
  const record=await store.get(p.id,'1');assert.deepEqual(record.presentation[id].beforeImages,['100']);
  const payload={title:p.title,introduction:p.introduction,images:p.evidence.panels.map(p=>({id:p.id,png:png(panelSize(p).width,panelSize(p).height)}))};
  await assert.rejects(submit(p.id,{...payload,images:payload.images.slice(1)},'1','contributor',gh,store),/every screenshot/);
  await submit(p.id,payload,'1','contributor',gh,store);
  assert.equal(gh.prs.length,1);assert.match(gh.prs[0].body,/<summary>Before<\/summary>/);
  assert.doesNotMatch(gh.prs[0].body,/evidence:\/\//);
  for(const panel of p.evidence.panels)assert.ok(gh.prs[0].body.includes(`/${panel.id}.png`));
  const manifest=gh.calls.find(c=>c[0]==='blob'&&c[2].startsWith('{'));
  assert.deepEqual(JSON.parse(manifest[2]).states,p.states);
  const legacy={...record};delete legacy.states;
  assert.doesNotMatch(publicRecord(legacy).body,/<summary>Before/);
});

test('entrance ID, chunk, priority and plane edits show independent before/after values',async()=>{
  const data=edit('Abyssal Sire','entrance',working=>({entrance:{...working.entrance,ids:['123'],chunks:working.entrance.chunks.slice(1),plane:'FIRST_FLOOR',overlay:'DEPRIORITIZED_WITH_HIGHLIGHT'}}));
  const p=await prepare(data,'1',new FakeGitHub(),new MemoryStore(),env),pair=p.states[data.changes[0].id];
  const diff=stateDifferences(pair.before,pair.after);
  assert.ok(diff.added.includes('Entrance IDs: 123'));
  assert.ok(diff.removed.includes('Entrance chunks: 774740'));
  assert.ok(diff.added.includes('Entrance plane: FIRST_FLOOR'));
  const before=p.evidence.panels.filter(p=>p.state==='before'&&p.kind==='entrance');
  const after=p.evidence.panels.filter(p=>p.state==='after'&&p.kind==='entrance');
  assert.ok(before.flatMap(p=>p.chunks).includes(774740));
  assert.ok(!after.flatMap(p=>p.chunks).includes(774740));assert.ok(after.every(p=>p.context.plane===1));
});

test('new encounters retain addition layout within a mixed batch',async()=>{
  const data=edit('King Black Dragon Entrance','details',()=>({name:'Edited'}));
  const p=await prepare({changes:[...data.changes,change],contexts:{...data.contexts,...input.contexts},sources:{...data.sources,...input.sources}},'1',new FakeGitHub(),new MemoryStore(),env);
  assert.equal((p.body.match(/<summary>Before<\/summary>/g)||[]).length,1);
  assert.equal(p.states[change.id].before,null);
  assert.equal(p.evidence.panels.filter(p=>p.bossId===change.id).length,1);
  assert.match(p.body,/## PR test[\s\S]*Map selections/);
});

test('dungeon state comparisons include coverage only and detect restriction removal',async()=>{
  const boss=snapshot.entries.find(e=>e.regionType==='DUNGEONS'),base=existingDraft(boss);
  const next=applySection(base,{...editableDraft(base),name:'Renamed dungeon'},'details');
  const locations=encounterLocations({...boss,maps:[]});
  const p=await prepare({changes:[next],contexts:{[boss.id]:{arena:locations.arena[0]}},sources:{[boss.id]:['https://oldschool.runescape.wiki/w/Dungeon']}},'1',new FakeGitHub(),new MemoryStore(),env);
  assert.match(section(p.body,'Before'),/Dungeon regions/);assert.doesNotMatch(p.body,/Entrance:|Arena regions/);
  assert.ok(p.evidence.panels.every(p=>p.kind==='arena'));
  const before={...p.states[boss.id].before,chunks:[1,2]},after={...before,chunks:[]};
  assert.deepEqual(stateDifferences(before,after),{added:['Coverage mode: Whole regions'],removed:['Coverage chunks: 1, 2','Coverage mode: Selected chunks']});
});

test('special source settings are preserved in both collapsible states and escaped as text',async()=>{
  const boss=snapshot.entries.find(e=>e.name==='The Leviathan Entrance');
  const data=edit(boss.name,'details',()=>({name:'Name <details> & example'}));
  const p=await prepare(data,'1',new FakeGitHub(),new MemoryStore(),env);
  assert.match(section(p.body,'Before'),/Entrance source settings/);
  assert.match(section(p.body,'After'),/false, true/);
  assert.equal((p.body.match(/<details>/g)||[]).length,2);
});

test('state comparisons count both sides toward the screenshot limit',()=>{
  const regions=Array.from({length:17},(_,i)=>(i*3<<8)|10);
  const raw=`BOSS_WIDE("Wide", EscapeCrystalNotifyRegionType.BOSSES, EscapeCrystalNotifyRegionDeathType.UNSAFE, ${regions.join(', ')})`;
  const c={...change,id:'BOSS_WIDE',baseRaw:raw,name:'Renamed',regions};
  assert.throws(()=>comparisonEvidence([c],proposalStates([c]),{[c.id]:{arena:{x:1,y:650,plane:0}}},{[c.id]:input.sources[change.id]}),/32 screenshots/);
});
