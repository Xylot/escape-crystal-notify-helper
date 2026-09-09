import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {chunkId} from '../src/core/coordinates.mjs';
import {parseJava,isNotifyRegion} from '../src/core/java.mjs';
import {expandEncounter,generateEncounter,notificationChunks,detectionChunks,sourceEntry} from '../src/core/encounter-export.mjs';
import {applyProposal,validateProposal,fullPatch,PLUGIN_REPO,JAVA_PATH} from '../src/core/proposal.mjs';
import {existingDraft,editableDraft,applySection,changedSections} from '../src/core/editing.mjs';
import {mergeDraft} from '../src/core/authoring.mjs';
import {buildLibrary} from '../src/core/library.mjs';
import {cleanChanges} from '../src/core/pr-evidence.mjs';
import {proposalStates,comparisonEvidence,stateDifferences} from '../src/core/pr-states.mjs';
import {prepare} from '../worker/pr-service.mjs';
import {FakeGitHub,MemoryStore,env} from './pr-fixtures.mjs';

const source='public enum EscapeCrystalNotifyRegion { BOSS_EXISTING("Existing", EscapeCrystalNotifyRegionType.BOSSES, EscapeCrystalNotifyRegionDeathType.UNSAFE, 1234); }';
const entranceChunk=chunkId(3176,2477),nearbyChunk=chunkId(3184,2477),arenaChunk=chunkId(3179,8876);
const entrance={ids:['58439'],objectType:'GAME_OBJECT',overlay:'DEPRIORITIZED_WITH_HIGHLIGHT',direction:'',plane:'',chunks:[entranceChunk]};
const boss={id:'BOSS_SHELLBANE_GRYPHON',name:'Shellbane gryphon',regions:[12682],entranceRegion:12582,deathType:'UNSAFE',baseRaw:null,entrance};
const safe={...boss,entranceDangerous:false,entranceNotifyChunks:[entranceChunk,nearbyChunk]};
const proposal=(changes,version=2)=>({version,repository:PLUGIN_REPO,baseCommit:'a'.repeat(40),changes});
const generated=change=>expandEncounter(change).map(e=>sourceEntry(e.raw));

test('non-dangerous entrance produces independently restricted entries with the boss death type',()=>{
  const [arena,entry]=generated({...safe,chunks:[arenaChunk]});
  assert.deepEqual(arena.regions,[12682]);assert.deepEqual(entry.regions,[12582]);
  assert.deepEqual(notificationChunks(arena),[arenaChunk]);
  assert.deepEqual(notificationChunks(entry),[entranceChunk,nearbyChunk]);
  assert.deepEqual(detectionChunks(entry),[entranceChunk]);
  assert.equal(isNotifyRegion(entry),false);assert.equal(isNotifyRegion(arena),true);
  assert.match(entry.raw,/\), false, List\.of\(/);
  assert.equal(entry.deathType,'UNSAFE');assert.equal(arena.optionalArgs.some(a=>a.includes('new EscapeCrystalNotifyRegionEntrance(')),false);
  assert.deepEqual(generated({...safe,deathType:'UNSAFE_HCGIM'}).map(e=>e.deathType),['UNSAFE_HCGIM','UNSAFE_HCGIM']);
});

test('No supports an unrestricted entrance and does not force notification chunks into the draft',()=>{
  const draft=mergeDraft({...boss,entrance:{...entrance,chunks:[]}},{entranceDangerous:false});
  assert.equal(draft.entranceNotifyChunks,undefined);
  const [arena,entry]=generated(draft);
  assert.equal(isNotifyRegion(arena),true);assert.equal(isNotifyRegion(entry),false);
  assert.deepEqual(notificationChunks(entry),[]);assert.deepEqual(detectionChunks(entry),[]);
  assert.match(entry.raw,/\), false, 12582\)$/);
  assert.doesNotThrow(()=>validateProposal(proposal([draft])));
  assert.equal(isNotifyRegion(generated({...draft,entranceNotifyChunks:[]})[1]),false);
});

test('Shellbane entrance-only source loads No and toggles its flag without changing entrance settings',()=>{
  const raw='BOSS_SHELLBANE_GRYPHON_ENTRANCE("Shellbane Gryphon Entrance", EscapeCrystalNotifyRegionType.BOSSES, EscapeCrystalNotifyRegionDeathType.UNSAFE, new EscapeCrystalNotifyRegionEntrance(EscapeCrystalNotifyRegionEntranceOverlayType.DEPRIORITIZED_WITH_HIGHLIGHT, null, EscapeCrystalNotifyRegionEntranceObjectType.GAME_OBJECT, 58439), false, 12582)';
  const arena=generated({...boss,entrance:undefined})[0];
  const row={...arena,entranceEntry:sourceEntry(raw)},draft=existingDraft(row);
  assert.equal(draft.entranceDangerous,false);assert.deepEqual(changedSections(draft),[]);
  assert.equal(generated(draft)[1].raw,raw);
  const yes=applySection(draft,{...editableDraft(draft),entranceDangerous:true},'entrance');
  assert.equal(generated(yes)[1].raw,raw.replace('), false, 12582', '), true, 12582'));
  assert.equal(isNotifyRegion(generated({...yes,entranceDangerous:false})[1]),false);
  const states=proposalStates([yes])[boss.id];
  assert.equal(states.before.entranceDangerous,false);assert.equal(states.after.entranceDangerous,true);
  assert.ok(stateDifferences(states.before,states.after).added.includes('Entrance area dangerous: true'));
  assert.equal(isNotifyRegion(generated({...draft,entranceDangerous:undefined})[1]),false);
});

test('chunk restrictions and nested entrance booleans do not determine region danger',()=>{
  const [arena,entry]=generated(safe);
  const legacy=sourceEntry(entry.raw.replace('), false, List.of(', '), List.of('));
  assert.equal(existingDraft({...arena,entranceEntry:legacy}).entranceDangerous,true);
  assert.equal(isNotifyRegion(sourceEntry(legacy.raw.replace('EscapeCrystalNotifyRegionEntranceObjectType.GAME_OBJECT','false, EscapeCrystalNotifyRegionEntranceObjectType.GAME_OBJECT'))),true);
  const explicit=sourceEntry(legacy.raw.replace('), List.of(', '), true, List.of('));
  const draft=existingDraft({...arena,entranceEntry:explicit});
  const result=generated({...draft,entranceDangerous:false})[1];
  assert.equal(result.optionalArgs.filter(arg=>arg==='false').length,1);
  assert.equal(result.optionalArgs.includes('true'),false);
  assert.deepEqual(notificationChunks(result),notificationChunks(entry));
});

test('dangerous entrances combine compatible coverage and split mixed restrictions',()=>{
  const [combined]=generated({...boss,entranceDangerous:true});
  assert.deepEqual(combined.regions,[12582,12682]);assert.deepEqual(notificationChunks(combined),[]);
  assert.equal(generated({...boss,entranceDangerous:true,chunks:[arenaChunk]}).length,2);
  const restricted=generated({...safe,entranceDangerous:true,chunks:[arenaChunk]});
  assert.equal(restricted.length,1);assert.deepEqual(notificationChunks(restricted[0]),[entranceChunk,nearbyChunk,arenaChunk].sort((a,b)=>a-b));
  const dangerous={...boss,entranceDangerous:true},states=proposalStates([dangerous]);
  const evidence=comparisonEvidence([dangerous],states,{[boss.id]:{arena:{x:3179,y:8876},entrance:{x:3176,y:2477}}},{[boss.id]:['https://oldschool.runescape.wiki/w/Shellbane_gryphon']});
  assert.deepEqual(evidence.panels.find(p=>p.kind==='arena').regions,[12682]);
  assert.deepEqual(evidence.panels.find(p=>p.kind==='notification').regions,[12582]);
});

test('new entrance authoring requires an answer while arena-only and v1 drafts retain their behavior',()=>{
  assert.throws(()=>validateProposal(proposal([{...boss,entranceDangerous:null}])),/Answer/);
  assert.doesNotThrow(()=>validateProposal(proposal([{...boss,entrance:undefined,entranceDangerous:null}])));
  assert.equal(expandEncounter(boss).length,1);
  assert.equal(applyProposal(source,proposal([boss],1)),applyProposal(source,proposal([boss],2)));
  assert.throws(()=>validateProposal(proposal([safe],1)),/version 2/);
  assert.equal(mergeDraft({...boss,entrance:undefined},{entrance}).entranceDangerous,null);
  assert.equal(mergeDraft(boss,{entrance:{...entrance,ids:['1']}}).entranceDangerous,undefined);
});

test('invalid, uncovered and shared-region notification selections fail closed',()=>{
  for(const entranceNotifyChunks of [[-1],['42'],[nearbyChunk]])assert.throws(()=>validateProposal(proposal([{...safe,entranceNotifyChunks}])));
  assert.throws(()=>validateProposal(proposal([{...safe,entrance:{...entrance,chunks:[]}}])),/explicit object-detection chunks/);
  assert.throws(()=>validateProposal(proposal([{...safe,regions:[12582,12682]}])),/share a region/);
  assert.throws(()=>validateProposal(proposal([{...safe,entranceRegion:12583}])),/every entrance region/);
  assert.throws(()=>validateProposal(proposal([{...safe,entranceDangerous:'no'}])),/dangerous/);
});

test('paired entries load as one encounter; legacy independent drafts and unmatched entrances stay reachable',()=>{
  const entries=parseJava(applyProposal(source,proposal([safe]))).entries;
  const rows=buildLibrary([],[],entries,{});
  const row=rows.find(e=>e.id===boss.id);
  assert.equal(rows.some(e=>e.id===`${boss.id}_ENTRANCE`),false);
  assert.equal(row.entranceEntry.id,`${boss.id}_ENTRANCE`);
  const orphan=entries.find(e=>e.id===`${boss.id}_ENTRANCE`);
  assert.ok(buildLibrary([],[],[orphan],{}).some(e=>e.id===orphan.id));
  assert.ok(buildLibrary([],[],entries,{[orphan.id]:existingDraft(orphan)}).some(e=>e.id===orphan.id));
});

test('paired edits preserve baselines, priority, notifications, and independent staged sections',()=>{
  const entries=parseJava(applyProposal(source,proposal([safe]))).entries;
  const row=buildLibrary([],[],entries,{}).find(e=>e.id===boss.id),draft=existingDraft(row);
  assert.deepEqual(changedSections(draft),[]);
  const working=editableDraft(draft);assert.equal(working.entrance.ids[0],'ObjectID.TT_LAIR_ENTRANCE');
  const next=applySection(draft,{...working,entranceDangerous:true},'entrance');
  assert.deepEqual(next.entranceNotifyChunks,[entranceChunk,nearbyChunk]);
  assert.equal(generated(next).length,2);assert.deepEqual(notificationChunks(generated(next)[1]),next.entranceNotifyChunks);
  const whole=applySection(next,{...editableDraft(next),entranceNotifyChunks:[]},'entrance');
  assert.deepEqual(notificationChunks(generated(whole)[1]),[]);
  const renamed=applySection(whole,{...editableDraft(whole),name:'Renamed'},'details');
  assert.deepEqual(changedSections(renamed),['details','entrance']);
  assert.equal(JSON.parse(JSON.stringify(renamed)).entranceBaseRaw,draft.entranceBaseRaw);
  assert.deepEqual(changedSections(applySection(renamed,editableDraft(draft),'entrance')),['details']);
});

test('applying a new entrance to an existing boss retains its explicit danger answer',()=>{
  const arena=generated({...boss,entrance:undefined})[0],draft=existingDraft(arena);
  const working={...editableDraft(draft),entrance,entranceRegion:12582,entranceDangerous:false,entranceNotifyChunks:[entranceChunk]};
  const applied=applySection(draft,working,'entrance');
  assert.equal(applied.entranceDangerous,false);assert.equal(generated(applied).length,2);
  assert.deepEqual(changedSections(applied),['entrance']);
});

test('all snapshot pairs hydrate unchanged, including special entrance constructors',()=>{
  const snapshot=JSON.parse(readFileSync('public/data/snapshot.json'));
  for(const row of buildLibrary([],[],snapshot.entries,{}).filter(e=>e.entranceEntry)) {
    const draft=existingDraft(row);assert.deepEqual(changedSections(draft),[],row.id);
    const changed={...draft,entranceOverlay:'PRIORITIZED_WITH_HIGHLIGHT'};
    const after=generated(changed)[1];
    const beforeArg=row.entranceEntry.optionalArgs.find(a=>a.includes('new EscapeCrystalNotifyRegionEntrance('));
    const afterArg=after.optionalArgs.find(a=>a.includes('new EscapeCrystalNotifyRegionEntrance('));
    assert.equal(afterArg,beforeArg.replace('DEPRIORITIZED_WITH_HIGHLIGHT','PRIORITIZED_WITH_HIGHLIGHT'));
  }
});

test('combined-to-split conversion transfers source entrance settings without arena restrictions',()=>{
  const original=generated(boss)[0];
  const result=generated({...safe,baseRaw:original.raw,entrance:undefined});
  assert.deepEqual(result[0].regions,[12682]);assert.deepEqual(result[1].regions,[12582]);
  assert.deepEqual(detectionChunks(result[1]),[entranceChunk]);
  assert.equal(result[1].optionalArgs[0],original.optionalArgs[0]);
  const restricted=generated({...safe,chunks:[arenaChunk]})[0];
  assert.throws(()=>generated({...safe,baseRaw:restricted.raw,regions:[12683]}),/Arena restriction chunks/);
});

test('conflicts in either paired entry and generated identifier collisions reject the entire proposal',()=>{
  const initial=applyProposal(source,proposal([safe])),entries=parseJava(initial).entries;
  const draft=existingDraft(buildLibrary([],[],entries,{}).find(e=>e.id===boss.id));
  for(const oldName of ['"Shellbane gryphon"','"Shellbane gryphon Entrance"'])assert.throws(()=>applyProposal(initial.replace(oldName,'"Upstream change"'),proposal([{...draft,name:'Updated'}])),/Conflict/);
  const entranceEntry=entries.find(e=>e.id.endsWith('_ENTRANCE'));
  assert.throws(()=>applyProposal(source.replace(';',`, ${entranceEntry.raw};`),proposal([safe])),/already exists/);
  assert.throws(()=>applyProposal(initial,proposal([draft,existingDraft(entranceEntry)])),/Duplicate generated/);
  assert.throws(()=>applyProposal(initial,proposal([{...draft,entranceBaseRaw:draft.baseRaw}])),/does not match/);
});

test('preview, cleaning, JSON, patch and PR generation produce identical split entries and evidence',async()=>{
  const changes=cleanChanges([safe]);assert.deepEqual(changes[0].entranceNotifyChunks,safe.entranceNotifyChunks);
  const json=JSON.parse(JSON.stringify(proposal(changes))),after=applyProposal(source,json);
  for(const entry of expandEncounter(safe))assert.ok(fullPatch(source,after).includes(entry.raw));
  assert.equal(generateEncounter(safe),expandEncounter(safe).map(e=>e.raw).join(',\n'));
  const gh=new FakeGitHub(),store=new MemoryStore();gh.source=source;
  const contexts={[boss.id]:{arena:{x:3179,y:8876,plane:0},entrance:{x:3176,y:2477,region:12582,plane:0}}};
  const sources={[boss.id]:['https://oldschool.runescape.wiki/w/Shellbane_gryphon']};
  const result=await prepare({changes,contexts,sources},'1',gh,store,env);
  assert.equal((await store.get(result.id,'1')).after,after);assert.equal(result.changes.length,1);
  assert.deepEqual(result.evidence.panels.find(p=>p.kind==='arena').regions,[12682]);
  assert.deepEqual(result.evidence.panels.find(p=>p.kind==='notification').chunks,[entranceChunk,nearbyChunk]);
  assert.deepEqual(result.evidence.panels.find(p=>p.kind==='entrance').chunks,[entranceChunk]);
  assert.match(result.body,/Not dangerous; region notifications disabled/);
  assert.match(result.evidence.panels.find(p=>p.kind==='notification').label,/region notifications disabled/);
  const draft=existingDraft(buildLibrary([],[],parseJava(after).entries,{}).find(e=>e.id===boss.id));
  const edited={...draft,entranceDangerous:true,entranceNotifyChunks:[]};
  const states=proposalStates([edited]),pair=states[boss.id];
  assert.deepEqual(pair.before.entranceRegions,[12582]);assert.deepEqual(pair.after.entranceNotifyChunks,[]);
  assert.ok(stateDifferences(pair.before,pair.after).removed.some(s=>s.includes('Entrance notification chunks')));
  const evidence=comparisonEvidence([edited],states,contexts,sources);
  assert.equal(evidence.panels.find(p=>p.kind==='notification'&&p.state==='before').restrictChunks,true);
  assert.equal(evidence.panels.find(p=>p.kind==='notification'&&p.state==='after').restrictChunks,false);
});

test('installed maintainer validator applies version 2 and preserves version 1 support',()=>{
  const root=mkdtempSync(path.join(tmpdir(),'escape-danger-'));
  try {
    const target=path.join(root,JAVA_PATH),input=path.join(root,'proposal.json');
    mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,source);
    execFileSync(process.execPath,['scripts/install-plugin-workflow.mjs',root],{stdio:'pipe'});
    for(const [change,version] of [[safe,2],[boss,1]]) {
      writeFileSync(target,source);writeFileSync(input,JSON.stringify(proposal([change],version)));
      execFileSync(process.execPath,[path.join(root,'.github/content-editor/scripts/apply-proposal.mjs'),input,root],{stdio:'pipe'});
      assert.equal(readFileSync(target,'utf8'),applyProposal(source,proposal([change],version)));
    }
  } finally {
    if(path.dirname(root)!==path.resolve(tmpdir())||!path.basename(root).startsWith('escape-danger-'))throw new Error('Unsafe cleanup path.');
    rmSync(root,{recursive:true,force:true});
  }
});
