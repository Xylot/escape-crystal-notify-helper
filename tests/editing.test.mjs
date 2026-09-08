import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applySection, changedSections, editableDraft, editingBaseline, existingDraft, readEntrance, sectionUnchanged} from '../src/core/editing.mjs';
import {applyProposal, PLUGIN_REPO} from '../src/core/proposal.mjs';
import {generateEntry, parseJava} from '../src/core/java.mjs';
import {mergeDraft} from '../src/core/authoring.mjs';

const snapshot=JSON.parse(readFileSync(new URL('../public/data/snapshot.json',import.meta.url)));
const entry=id=>snapshot.entries.find(e=>e.id===id);
const proposal=draft=>({version:1,repository:PLUGIN_REPO,baseCommit:snapshot.baseCommit,changes:[draft]});
const exportEntry=draft=>parseJava(applyProposal(snapshot.source,proposal(draft))).entries.find(e=>e.id===draft.id);

test('opening every existing entry hydrates without changing its draft',()=>{
  for(const e of snapshot.entries.filter(e=>['BOSSES','DUNGEONS'].includes(e.regionType))) {
    const draft=existingDraft(e), before=JSON.stringify(draft), working=editableDraft(draft);
    assert.deepEqual(changedSections(draft),[],e.id);
    for(const section of ['details','coverage',...(e.regionType==='DUNGEONS'?[]:['entrance'])]) {
      assert.equal(sectionUnchanged(draft,working,section),true,`${e.id}: ${section}`);
      assert.deepEqual(changedSections(applySection(draft,working,section)),[],e.id);
    }
    assert.equal(JSON.stringify(draft),before);
  }
});

test('all representable entrances hydrate IDs, constraints and chunks exactly',()=>{
  for(const e of snapshot.entries.filter(e=>e.regionType==='BOSSES')) {
    const parsed=readEntrance(e.optionalArgs);
    if(!parsed.value)continue;
    const draft=existingDraft(e), working=editableDraft(draft);
    assert.deepEqual(working.entrance,parsed.value);
    const next=applySection(draft,{...working,name:`${draft.name} edited`},'details');
    assert.equal(next.entrance,undefined);
    assert.equal(next.chunks,undefined);
    assert.deepEqual(exportEntry(next).optionalArgs,e.optionalArgs,e.id);
  }
});

test('SAFE, HCGIM and display-name changes compare to the original source',()=>{
  const draft=existingDraft(entry('BOSS_SHELLBANE_GRYPHON'));
  for(const deathType of ['SAFE','UNSAFE_HCGIM']) {
    const next=applySection(draft,{...editableDraft(draft),deathType,name:'Updated name'},'details');
    assert.deepEqual(changedSections(next),['details']);
    assert.match(generateEntry(next,entry('BOSS_SHELLBANE_GRYPHON')),new RegExp(`DeathType\\.${deathType}`));
    if(deathType==='UNSAFE_HCGIM')assert.equal(exportEntry(next).deathType,deathType);
    const restored=applySection(next,{...editableDraft(next),name:draft.name,deathType:draft.deathType},'details');
    assert.deepEqual(changedSections(restored),[]);
  }
});

test('priority-only edits preserve exact constructors, including special booleans',()=>{
  for(const id of ['BOSS_COMMANDER_ZILYANA','BOSS_THE_LEVIATHAN_ENTRANCE','BOSS_TZHAAR_FIGHT_CAVES_ENTRANCE']) {
    const e=entry(id), draft=existingDraft(e), working=editableDraft(draft);
    const next=applySection(draft,mergeDraft(working,{entranceOverlay:'PRIORITIZED_WITH_HIGHLIGHT'}),'entrance');
    assert.equal(next.entrance,undefined);
    assert.deepEqual(exportEntry(next).optionalArgs,e.optionalArgs.map(arg=>arg.replace('DEPRIORITIZED_WITH_HIGHLIGHT','PRIORITIZED_WITH_HIGHLIGHT')));
  }
});

test('special and quest-gated settings expose preservation reasons',()=>{
  const special=editingBaseline(entry('BOSS_THE_LEVIATHAN_ENTRANCE').raw);
  assert.match(special.entranceReason,/special/);
  assert.equal(special.entrance.value,undefined);
  const raw='BOSS_QUEST_TEST("Quest test", EscapeCrystalNotifyRegionType.BOSSES, EscapeCrystalNotifyRegionDeathType.UNSAFE, Quest.DRAGON_SLAYER_I, 12345)';
  const source=`enum EscapeCrystalNotifyRegion { ${raw}; }`;
  const quest=parseJava(source).entries[0];
  const baseline=editingBaseline(quest.raw);
  assert.match(baseline.coverageReason,/Quest/);
  assert.match(baseline.entranceReason,/quest/);
  const draft=existingDraft(quest), next=applySection(draft,{...editableDraft(draft),name:'Quest encounter edit'},'details');
  assert.deepEqual(parseJava(applyProposal(source,proposal(next))).entries[0].optionalArgs,quest.optionalArgs);
});

test('entrance ID edits keep approach, plane, priority and all chunk regions',()=>{
  const e=entry('BOSS_COMMANDER_ZILYANA'), draft=existingDraft(e), working=editableDraft(draft);
  const next=applySection(draft,{...working,entrance:{...working.entrance,ids:['12345']}},'entrance');
  assert.equal(next.entrance.direction,working.entrance.direction);
  assert.deepEqual(next.entrance.chunks,working.entrance.chunks);
  assert.deepEqual(readEntrance(exportEntry(next).optionalArgs).value,next.entrance);
  assert.deepEqual(changedSections(next),['entrance']);
  const restored=applySection(next,editableDraft(draft),'entrance');
  assert.equal(restored.entrance,undefined);
  assert.deepEqual(changedSections(restored),[]);
});

test('coverage restrictions hydrate for bosses and remove only on explicit edit',()=>{
  const e=entry('BOSS_WINTERTODT_ENTRANCE'), draft=existingDraft(e), working=editableDraft(draft);
  assert.ok(working.chunks.length);
  const metadata=applySection(draft,{...working,name:'Wintertodt entrance renamed'},'details');
  assert.deepEqual(exportEntry(metadata).optionalArgs,e.optionalArgs);
  const next=applySection(draft,{...working,chunks:[]},'coverage');
  assert.deepEqual(next.chunks,[]);
  assert.ok(!exportEntry(next).optionalArgs.some(a=>a.trim().startsWith('List.')));
  assert.deepEqual(changedSections(applySection(next,working,'coverage')),[]);
});

test('staged sections do not overwrite other edits and drafts survive JSON reload',()=>{
  const draft=existingDraft(entry('BOSS_SHELLBANE_GRYPHON'));
  const renamed=applySection(draft,{...editableDraft(draft),name:'Saved name'},'details');
  const working=editableDraft(renamed);
  const next=applySection(renamed,{...working,name:'Must not leak from coverage',regions:[...working.regions,1]},'coverage');
  assert.equal(next.name,'Saved name');
  assert.deepEqual(changedSections(JSON.parse(JSON.stringify(next))),['details','coverage']);
  assert.equal(next.baseRaw,draft.baseRaw);
});

test('dungeons retain their category and expose only details and coverage',()=>{
  const e=snapshot.entries.find(e=>e.regionType==='DUNGEONS'), draft=existingDraft(e);
  const next=applySection(draft,{...editableDraft(draft),name:'Updated dungeon'},'details');
  assert.equal(next.regionType,'DUNGEONS');
  assert.deepEqual(changedSections(next),['details']);
  assert.equal(exportEntry(next).regionType,'DUNGEONS');
});

test('existing draft comparisons keep their baseline after upstream changes',()=>{
  const e=entry('BOSS_SHELLBANE_GRYPHON'), draft=existingDraft(e);
  const next=applySection(draft,{...editableDraft(draft),name:'Draft name'},'details');
  const upstream=snapshot.source.replace(e.raw,e.raw.replace('Shellbane gryphon','Upstream name'));
  assert.throws(()=>applyProposal(upstream,proposal(next)),/Conflict/);
  assert.deepEqual(changedSections(next),['details']);
  assert.equal(editingBaseline(next.baseRaw).draft.name,e.name);
});

test('unknown entrance expressions are never partially hydrated',()=>{
  const raw='new EscapeCrystalNotifyRegionEntrance(EscapeCrystalNotifyRegionEntranceOverlayType.DEPRIORITIZED_WITH_HIGHLIGHT, computeChunks(), EscapeCrystalNotifyRegionEntranceObjectType.GAME_OBJECT, 1)';
  assert.equal(readEntrance([raw]).value,undefined);
  assert.match(readEntrance([raw]).reason,/special/);
});
