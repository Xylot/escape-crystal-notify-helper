import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {exportCoverage, generateEntry, parseJava} from '../src/core/java.mjs';
import {applyProposal, validateProposal, fullPatch, overlapWarnings, PLUGIN_REPO, JAVA_PATH} from '../src/core/proposal.mjs';
import {cleanChanges} from '../src/core/pr-evidence.mjs';
import {chunkId} from '../src/core/coordinates.mjs';
import {prepare} from '../worker/pr-service.mjs';
import {FakeGitHub, MemoryStore, env} from './pr-fixtures.mjs';

const source = 'public enum EscapeCrystalNotifyRegion { BOSS_EXISTING("Existing", EscapeCrystalNotifyRegionType.BOSSES, EscapeCrystalNotifyRegionDeathType.UNSAFE, 1234); }';
const entrance = {ids:['58439'],objectType:'GAME_OBJECT',overlay:'DEPRIORITIZED_WITH_HIGHLIGHT',direction:'',plane:'',chunks:[]};
const shellbane = {id:'BOSS_SHELLBANE_GRYPHON',name:'Shellbane gryphon',regions:[12682],entranceRegion:12582,deathType:'UNSAFE',baseRaw:null,entrance};
const proposal = changes => ({version:1,repository:PLUGIN_REPO,baseCommit:'a'.repeat(40),changes});
const outsideChunk = chunkId(3176,2477), arenaChunk = chunkId(3179,8876);

test('Shellbane entrance coverage survives preview, JSON, patch and PR preparation', async () => {
  const original = structuredClone(shellbane);
  const preview = generateEntry(shellbane);
  assert.deepEqual(exportCoverage(shellbane).regions, [12582,12682]);
  const cleaned = cleanChanges([shellbane]);
  assert.equal(cleaned[0].entranceRegion,12582);
  const json = JSON.parse(JSON.stringify(proposal(cleaned)));
  validateProposal(json);
  const after = applyProposal(source,json);
  assert.equal(parseJava(after).entries[0].raw,preview);
  assert.ok(fullPatch(source,after).includes(preview));
  const gh = new FakeGitHub(), store = new MemoryStore(); gh.source=source;
  const prepared = await prepare({changes:cleaned,contexts:{[shellbane.id]:{
    arena:{x:3179,y:8876,plane:0},entrance:{x:3176,y:2477,region:12582,plane:0},
  }},sources:{[shellbane.id]:['https://oldschool.runescape.wiki/w/Shellbane_gryphon']}},'1',gh,store,env);
  assert.equal((await store.get(prepared.id,'1')).after,after);
  assert.deepEqual(prepared.evidence.panels.find(p=>p.kind==='arena').regions,[12682]);
  assert.deepEqual(prepared.evidence.panels.find(p=>p.kind==='entrance').regions,[12582]);
  assert.deepEqual(shellbane,original);
});

test('shared regions deduplicate and entrance chunks contribute all their regions', () => {
  assert.deepEqual(exportCoverage({...shellbane,entranceRegion:12682}).regions,[12682]);
  const multi = {...shellbane,entranceRegion:undefined,entrance:{...entrance,chunks:[outsideChunk,arenaChunk]}};
  assert.deepEqual(exportCoverage(multi).entranceRegions,[12582,12682]);
  assert.deepEqual(exportCoverage(multi).regions,[12582,12682]);
});

test('arena-only drafts do not export a remembered entrance selection', () => {
  assert.deepEqual(exportCoverage({...shellbane,entrance:undefined}).regions,[12682]);
});

test('missing and invalid entrance locations block all generation paths', () => {
  for (const entranceRegion of [undefined,null,-1,65536,1.5,'12582']) {
    const change={...shellbane,entranceRegion};
    assert.throws(()=>generateEntry(change),/entrance region/i);
    assert.throws(()=>validateProposal(proposal(cleanChanges([change]))),/entrance region/i);
    assert.throws(()=>applyProposal(source,proposal([change])),/entrance region/i);
  }
  assert.throws(()=>generateEntry({...shellbane,entranceRegion:12682,entrance:{...entrance,chunks:[outsideChunk]}}),/no entrance chunks/);
});

test('arena restrictions include entrance chunks without changing the arena selection', () => {
  const change={...shellbane,chunks:[arenaChunk],entrance:{...entrance,chunks:[outsideChunk]}};
  const coverage=exportCoverage(change);
  assert.deepEqual(coverage.chunks,[outsideChunk,arenaChunk]);
  const generated=generateEntry(change);
  assert.ok(generated.includes(`List.of(${outsideChunk}, ${arenaChunk}), 12582, 12682`));
  assert.deepEqual(change.chunks,[arenaChunk]);
  assert.throws(()=>generateEntry({...shellbane,chunks:[arenaChunk]}),/Select entrance chunks/);
  assert.throws(()=>generateEntry({...change,regions:[12682,12683]}),/chunks in every covered region/);
});

test('preserved entrances contribute coverage and retain their definition', () => {
  const raw=generateEntry({...shellbane,entrance:{...entrance,chunks:[outsideChunk]}});
  const existing=parseJava(`public enum EscapeCrystalNotifyRegion { ${raw}; }`).entries[0];
  const change={...shellbane,entrance:undefined,entranceRegion:undefined,baseRaw:raw};
  const result=generateEntry(change,existing);
  const entry=parseJava(`public enum EscapeCrystalNotifyRegion { ${result}; }`).entries[0];
  assert.deepEqual(entry.regions,[12582,12682]);
  assert.deepEqual(entry.optionalArgs,existing.optionalArgs);
  const restricted={...existing,optionalArgs:[...existing.optionalArgs,`List.of(${arenaChunk})`]};
  assert.deepEqual(exportCoverage(change,restricted).chunks,[outsideChunk,arenaChunk]);
  const chunkless=parseJava(`public enum EscapeCrystalNotifyRegion { ${generateEntry(shellbane)}; }`).entries[0];
  assert.deepEqual(exportCoverage({...change,regions:chunkless.regions},chunkless).regions,[12582,12682]);
});

test('overlap warnings include added entrance regions', () => {
  assert.match(overlapWarnings([shellbane],[{id:'BOSS_NEIGHBOR',name:'Neighbor',regions:[12582]}])[0],/Neighbor: 12582/);
});

test('installed maintainer workflow generates the same coverage and rejects missing locations', () => {
  const root=mkdtempSync(path.join(tmpdir(),'escape-coverage-'));
  try {
    const target=path.join(root,JAVA_PATH), input=path.join(root,'proposal.json');
    mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,source);
    execFileSync(process.execPath,['scripts/install-plugin-workflow.mjs',root]);
    writeFileSync(input,JSON.stringify(proposal(cleanChanges([shellbane]))));
    const script=path.join(root,'.github/content-editor/scripts/apply-proposal.mjs');
    execFileSync(process.execPath,[script,input,root]);
    assert.equal(readFileSync(target,'utf8'),applyProposal(source,proposal([shellbane])));
    writeFileSync(target,source);
    writeFileSync(input,JSON.stringify(proposal([{...shellbane,entranceRegion:undefined}])));
    assert.throws(()=>execFileSync(process.execPath,[script,input,root],{stdio:'pipe'}),/entrance region/);
    assert.equal(readFileSync(target,'utf8'),source);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
