import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {applyMetadata,metadataFor,withMetadata,THRESHOLDS_PATH,ENCOUNTERS_PATH} from '../src/core/encounter-metadata.mjs';
import {applyProposalFiles,proposalPatch,JAVA_PATH,PLUGIN_REPO,validateProposal} from '../src/core/proposal.mjs';
import {existingDraft,editableDraft,applySection,changedSections} from '../src/core/editing.mjs';
import {freshEditDraft,proposalDraft} from '../src/core/fresh-edit.mjs';
import {cleanChanges,panelSize} from '../src/core/pr-evidence.mjs';
import {proposalStates,stateDifferences} from '../src/core/pr-states.mjs';
import {buildLibrary} from '../src/core/library.mjs';
import {prepare,submit} from '../worker/pr-service.mjs';
import {FakeGitHub,MemoryStore,input,env,png} from './pr-fixtures.mjs';
const submission=p=>({title:p.title,introduction:p.introduction,images:p.evidence.panels.map(panel=>{const size=panelSize(panel);return {id:panel.id,png:png(size.width,size.height)};})});
const snapshot=JSON.parse(readFileSync(new URL('../public/data/snapshot.json',import.meta.url)));
const sources={[JAVA_PATH]:snapshot.source,...snapshot.metadataSources};
const draft=id=>withMetadata(existingDraft(snapshot.entries.find(e=>e.id===id)),snapshot.metadataSources);
const proposal=changes=>({version:3,repository:PLUGIN_REPO,baseCommit:snapshot.baseCommit,changes});
const json=v=>JSON.parse(JSON.stringify(v));

test('joining an inline case puts the shared return on a new line using existing indentation',()=>{
  for(const eol of ['\n','\r\n'])for(const tabs of [false,true])for(const id of ['BOSS_BRUTUS','BOSS_AARDVARK']){
    const local=Object.fromEntries(Object.entries(sources).map(([path,text])=>[path,text.replace(/\r?\n/g,'\n').replace(/^ +/gm,spaces=>tabs?'\t'.repeat(spaces.length/4):spaces).replace(/\n/g,eol)]));
    const change={...withMetadata({id,name:'Test',regions:[13107],deathType:'UNSAFE'},local),recommendedSeconds:5,petIcon:'ItemID.COWBOSSPET'};
    const result=applyMetadata(local,[change]),code=result[THRESHOLDS_PATH];
    const indent=tabs?'\t\t\t':'            ',ret=tabs?'\t\t\t\t':'                ';
    const cases=[id,'BOSS_BARROWS'].sort().map(name=>`${indent}case ${name}:`).join(eol);
    assert.ok(code.includes(`${cases}${eol}${ret}return 5;`));
    assert.equal(metadataFor(id,result).recommendedSeconds,5);
  }
});

test('numeric pets become inventory constants and thresholds insert in their ordered groups',()=>{
  for(const [seconds,item,constant] of [[2,'33124','COWBOSSPET'],[6,'27352','WARDENPET_TUMEKEN']]) {
    const change={...withMetadata({id:'BOSS_BRUTUS',name:'Brutus',regions:[13107],deathType:'UNSAFE'},snapshot.metadataSources),recommendedSeconds:seconds,petIcon:item};
    const result=applyMetadata(sources,[change]);
    assert.equal(metadataFor(change.id,result).petIcon,`ItemID.${constant}`);
    assert.equal(metadataFor(change.id,result).recommendedSeconds,seconds);
    const code=result[THRESHOLDS_PATH],at=code.indexOf('case BOSS_BRUTUS:');
    if(seconds===2){assert.ok(at>code.indexOf('case BOSS_ARTIO:'));assert.ok(at<code.indexOf('case BOSS_CALVARION:'));}
    else {assert.ok(at>code.indexOf('return 5;'));assert.ok(at<code.indexOf('case BOSS_WINTERTODT:'));}
  }
});

test('all boss and raid metadata hydrate and round trip without changing the two classes',()=>{
  const entries=snapshot.entries.filter(e=>['BOSSES','RAIDS'].includes(e.regionType));
  for(const entry of entries){const d=draft(entry.id);assert.ok(d.recommendedSeconds>=2);assert.match(d.petIcon,/^(ItemID\.|\d)/);assert.deepEqual(changedSections(d),[]);assert.deepEqual(applyMetadata(sources,[d]),snapshot.metadataSources);}
});
test('recommended time and pet icon survive details editing, reload, cleaning, review, and restoring',()=>{
  const original=draft('BOSS_MAD_ANGEL');
  const changed=applySection(original,{...editableDraft(original),recommendedSeconds:9,petIcon:'12345'},'details');
  const [saved]=cleanChanges(json([proposalDraft(changed)]));
  assert.deepEqual(changedSections(saved),['details']);
  const after=applyProposalFiles(sources,proposal([saved]));
  assert.deepEqual(metadataFor(saved.id,after),{canonicalId:saved.id,recommendedSeconds:9,petIcon:'ItemID.TRAIL_ELEGANT_PANTS_FEMALE_GOLD'});
  assert.equal(after[JAVA_PATH],sources[JAVA_PATH]);
  const patch=proposalPatch(sources,after);assert.match(patch,/ThresholdDefaults.java/);assert.match(patch,/Encounters.java/);assert.doesNotMatch(patch,/--- a\/.*EscapeCrystalNotifyRegion.java/);
  const states=proposalStates([saved])[saved.id],diff=stateDifferences(states.before,states.after);
  assert.ok(diff.added.includes('Recommended inactivity time (seconds): 9'));assert.ok(diff.added.includes('Pet icon: 12345'));
  const restored=applySection(saved,editableDraft(original),'details');assert.deepEqual(changedSections(restored),[]);assert.deepEqual(applyMetadata(sources,[restored]),snapshot.metadataSources);
});
test('new boss proposal updates all three files and rejects unanswered setup',()=>{
  const d=withMetadata({id:'BOSS_TEST_METADATA',name:'Metadata test',regions:[10018],deathType:'UNSAFE',baseRaw:null},snapshot.metadataSources);
  assert.equal(d.recommendedSeconds,2);
  assert.throws(()=>validateProposal(proposal([d])),/pet icon/);
  Object.assign(d,{recommendedSeconds:2,petIcon:'ItemID.MADANGELPET'});
  const after=applyProposalFiles(sources,proposal([d]));
  for(const path of [JAVA_PATH,THRESHOLDS_PATH,ENCOUNTERS_PATH])assert.notEqual(after[path],sources[path]);
  assert.deepEqual(metadataFor(d.id,after),{canonicalId:d.id,recommendedSeconds:2,petIcon:'ItemID.MADANGELPET'});
});
test('raid editing is reachable and uses shared canonical settings',()=>{
  const library=buildLibrary(snapshot.candidates,[],snapshot.entries,{});
  assert.ok(library.find(e=>e.id==='RAIDS_TOMBS_OF_AMASCUT'));
  const d={...draft('RAIDS_OSMUMTENS_BURIAL_CHAMBER'),recommendedSeconds:6,petIcon:'ItemID.OLMPET'};
  const after=applyProposalFiles(sources,proposal([d]));
  assert.deepEqual(metadataFor('RAIDS_TOMBS_OF_AMASCUT',after),{canonicalId:'RAIDS_TOMBS_OF_AMASCUT',recommendedSeconds:6,petIcon:'ItemID.OLMPET'});
  assert.equal(after[JAVA_PATH],sources[JAVA_PATH]);
  assert.throws(()=>applyMetadata(sources,[d,{...draft('RAIDS_TOMBS_OF_AMASCUT'),recommendedSeconds:7}]),/Conflicting/);
  const paired=withMetadata(existingDraft(library.find(e=>e.id==='RAIDS_CHAMBERS_OF_XERIC')),snapshot.metadataSources);
  assert.ok(paired.entranceBaseRaw);
  const pairedResult=applyProposalFiles(sources,proposal([{...paired,recommendedSeconds:5}]));
  assert.equal(pairedResult[JAVA_PATH],sources[JAVA_PATH]);
});
test('shared return groups, entrance aliases, comments and CRLF preserve unrelated entries',()=>{
  const d={...draft('BOSS_WINTERTODT'),recommendedSeconds:7,petIcon:'ItemID.FEDORA'};
  const crlf=Object.fromEntries(Object.entries(sources).map(([path,text])=>[path,text.replace(/\r?\n/g,'\r\n')]));
  const after=applyProposalFiles(crlf,proposal([d]));
  assert.match(after[THRESHOLDS_PATH],/case BOSS_WINTERTODT:\r\n\s*case BOSS_WINTERTODT_ENTRANCE:|case BOSS_WINTERTODT_ENTRANCE:\r\n\s*case BOSS_WINTERTODT:/);
  assert.equal(metadataFor('BOSS_WINTERTODT_ENTRANCE',after).recommendedSeconds,7);
  assert.deepEqual(metadataFor('BOSS_CRAZY_ARCHAEOLOGIST',after),metadataFor('BOSS_CRAZY_ARCHAEOLOGIST',sources));
  assert.ok(!/(?<!\r)\n/.test(after[THRESHOLDS_PATH]));
});
test('metadata conflicts fail before generation, unrelated upstream metadata remains intact',()=>{
  const d={...draft('BOSS_MAD_ANGEL'),recommendedSeconds:7};
  const updated={...sources,...applyMetadata(sources,[{...d,recommendedSeconds:6}])};
  assert.throws(()=>applyProposalFiles(updated,proposal([d])),/Conflict/);
  const unrelated={...draft('BOSS_GIANT_MOLE'),petIcon:'ItemID.COWBOSSPET'};
  const upstream={...sources,...applyMetadata(sources,[unrelated])};
  const after=applyProposalFiles(upstream,proposal([d]));assert.equal(metadataFor(unrelated.id,after).petIcon,'ItemID.COWBOSSPET');
  assert.throws(()=>applyProposalFiles({[JAVA_PATH]:sources[JAVA_PATH]},proposal([d])),/Sync plugin/);
});
test('metadata validates bounds, Java injection, category, baseline and proposal version',()=>{
  const d=draft('BOSS_MAD_ANGEL');
  for(const recommendedSeconds of [null,1,2.5,-2,Infinity,2147483648,'4'])assert.throws(()=>validateProposal(proposal([{...d,recommendedSeconds}])));
  for(const petIcon of ['', 'ItemID.FOO; evil()', 'ItemID.foo','-1','2147483648'])assert.throws(()=>validateProposal(proposal([{...d,petIcon}])));
  assert.throws(()=>validateProposal({...proposal([d]),version:2}),/version 3/);
  assert.throws(()=>validateProposal(proposal([{...d,id:'DUNGEON_TEST',regionType:'DUNGEONS'}])),/only to bosses and raids/);
  assert.throws(()=>validateProposal(proposal([{...d,metadataBase:null}])),/Sync plugin/);
  assert.throws(()=>metadataFor(d.id,{...sources,[THRESHOLDS_PATH]:sources[THRESHOLDS_PATH].replace('case BOSS_ABYSSAL_SIRE:','case BOSS_ABYSSAL_SIRE: doSomething();')}),/Unsupported/);
  assert.throws(()=>metadataFor(d.id,{...sources,[ENCOUNTERS_PATH]:sources[ENCOUNTERS_PATH].replace('endsWith("_ENTRANCE")','endsWith("_LOBBY")')}),/canonicalization/);
});
test('fresh setup retains metadata baseline but requires a new recommendation and pet icon',()=>{
  const original=draft('BOSS_MAD_ANGEL');
  const fresh=freshEditDraft({...snapshot.entries.find(e=>e.id===original.id),...original},original);
  assert.deepEqual(fresh.metadataBase,original.metadataBase);assert.equal(fresh.recommendedSeconds,2);assert.equal(fresh.petIcon,'');
});
test('PR preparation and submission include metadata-only changes in a single code commit',async()=>{
  const gh=new FakeGitHub(),store=new MemoryStore(),d={...draft('BOSS_MAD_ANGEL'),recommendedSeconds:7,petIcon:'ItemID.OLMPET'};
  gh.upstream=async()=>({sha:gh.sha,tree:'tree-base',source:gh.source,sources});
  const data={...input,changes:[d],contexts:{[d.id]:Object.values(input.contexts)[0]},sources:{[d.id]:Object.values(input.sources)[0]}};
  const p=await prepare(data,'1',gh,store,env);assert.match(p.body,/Recommended inactivity time/);assert.match(p.patch,/ThresholdDefaults/);
  const r=await submit(p.id,submission(p),'1','contributor',gh,store);assert.equal(r.status,'complete');
  const tree=gh.calls.find(c=>c[0]==='tree'&&c[2]==='tree-base');assert.deepEqual(tree[1].map(e=>e.path).sort(),[THRESHOLDS_PATH,ENCOUNTERS_PATH].sort());
});
test('installed maintainer workflow applies all files and leaves them untouched on metadata conflict',()=>{
  const root=mkdtempSync(path.join(tmpdir(),'escape-metadata-'));
  try {
    for(const [file,text] of Object.entries(sources)){mkdirSync(path.dirname(path.join(root,file)),{recursive:true});writeFileSync(path.join(root,file),text);}
    execFileSync(process.execPath,['scripts/install-plugin-workflow.mjs',root]);
    const d={...withMetadata({id:'BOSS_METADATA_WORKFLOW',name:'Metadata workflow',regions:[10018],deathType:'UNSAFE',baseRaw:null},snapshot.metadataSources),recommendedSeconds:6,petIcon:'ItemID.MADANGELPET'};
    const proposalFile=path.join(root,'proposal.json'),apply=path.join(root,'.github/content-editor/scripts/apply-proposal.mjs');
    writeFileSync(proposalFile,JSON.stringify(proposal([d])));
    execFileSync(process.execPath,[apply,proposalFile,root]);
    const expected=applyProposalFiles(sources,proposal([d]));
    for(const [file,text] of Object.entries(expected))assert.equal(readFileSync(path.join(root,file),'utf8'),text);
    // A new region plus stale metadata must not partially write the region class.
    const conflict={...d,id:'BOSS_METADATA_CONFLICT',name:'Metadata conflict',metadataBase:{...d.metadataBase,canonicalId:'BOSS_METADATA_CONFLICT',petIcon:'ItemID.WRONG'}};
    writeFileSync(proposalFile,JSON.stringify(proposal([conflict])));
    assert.throws(()=>execFileSync(process.execPath,[apply,proposalFile,root],{stdio:'pipe'}),/Conflict/);
    for(const [file,text] of Object.entries(expected))assert.equal(readFileSync(path.join(root,file),'utf8'),text);
    const workflow=readFileSync(path.join(root,'.github/workflows/content-proposal.yml'),'utf8');
    assert.ok(workflow.includes(`git add ${JAVA_PATH} ${THRESHOLDS_PATH} ${ENCOUNTERS_PATH}`));
  } finally {if(path.dirname(root)!==path.resolve(tmpdir()))throw new Error('Unexpected temporary path');rmSync(root,{recursive:true,force:true});}
});
