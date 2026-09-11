import test from 'node:test';
import assert from 'node:assert/strict';
import {freshEditDraft,freshEditBoss,freshEditForm,proposalDraft} from '../src/core/fresh-edit.mjs';
import {encounterLocations} from '../src/core/encounter.mjs';
import {entranceOverlay,mergeDraft} from '../src/core/authoring.mjs';
import {generateEntry,parseJava} from '../src/core/java.mjs';
import {expandEncounter,sourceEntry} from '../src/core/encounter-export.mjs';
import {existingDraft} from '../src/core/editing.mjs';
import {applyProposal,PLUGIN_REPO} from '../src/core/proposal.mjs';
import {proposalStates} from '../src/core/pr-states.mjs';
import {cleanChanges} from '../src/core/pr-evidence.mjs';
import {buildLibrary} from '../src/core/library.mjs';
import {chunkId} from '../src/core/coordinates.mjs';
import {locationAreaChange} from '../src/core/location-defaults.mjs';

const entrance={overlay:'PRIORITIZED_WITH_HIGHLIGHT',direction:'WESTWARD',plane:'GROUND',objectType:'GAME_OBJECT',ids:['123'],chunks:[chunkId(3176,2477)]};
const original={id:'BOSS_EXAMPLE',name:'Example',regionType:'BOSSES',regions:[12682],deathType:'UNSAFE_HCGIM',baseRaw:null,entrance};
const boss={...sourceEntry(generateEntry(original)),maps:[],wikiTitle:'Example'};
const source=`enum EscapeCrystalNotifyRegion { ${boss.raw}, BOSS_OTHER("Other", EscapeCrystalNotifyRegionType.BOSSES, EscapeCrystalNotifyRegionDeathType.UNSAFE, 1); }`;
const proposal=change=>({version:2,repository:PLUGIN_REPO,baseCommit:'a'.repeat(40),changes:[change]});

test('fresh form has no plugin settings or fallback locations, retaining only encounter identity',()=>{
  const draft=freshEditDraft(boss,{...existingDraft(boss),name:'Old draft',regions:[1],entrance});
  assert.equal(draft.id,boss.id);assert.equal(draft.name,boss.name);assert.equal(draft.baseRaw,boss.raw);
  const form=freshEditForm(draft),emptyBoss=freshEditBoss(boss);
  assert.equal(form.baseRaw,null);assert.equal(form.entranceBaseRaw,undefined);
  assert.equal(form.deathType,'UNSAFE');assert.deepEqual(form.regions,[]);assert.deepEqual(form.chunks,[]);
  assert.equal(form.entrance,undefined);assert.equal(form.entranceRegion,undefined);assert.equal(form.entrancePlane,undefined);
  assert.equal(form.entranceDangerous,null);assert.equal(entranceOverlay(form),'DEPRIORITIZED_WITH_HIGHLIGHT');
  assert.deepEqual(encounterLocations(emptyBoss),{arena:[],entrance:[],shared:false});
  assert.equal(emptyBoss.entranceEntry,undefined);assert.deepEqual(emptyBoss.supportedBy,[]);
  assert.deepEqual(boss.regions,[12582,12682]);
});

test('fresh drafts survive reload and produce the same update proposal as existing editing',()=>{
  const saved=JSON.parse(JSON.stringify(mergeDraft(freshEditDraft(boss),{
    setupProgress:4,entranceSetupProgress:2,regions:[12682],entrance:{...entrance,ids:['456'],overlay:'DEPRIORITIZED_WITH_HIGHLIGHT'},
    entranceDangerous:true,entranceNotifyChunks:[],entranceRegion:12582,
  })));
  assert.equal(saved.editFlow,'fresh');assert.equal(saved.setupProgress,4);assert.equal(saved.entranceSetupProgress,2);
  const change=proposalDraft(saved),normal={...existingDraft(boss),regions:[12682],chunks:[],deathType:'UNSAFE',
    entrance:{...entrance,ids:['456'],overlay:'DEPRIORITIZED_WITH_HIGHLIGHT'},entranceOverlay:'DEPRIORITIZED_WITH_HIGHLIGHT',
    entranceDangerous:true,entranceNotifyChunks:[],entranceRegion:12582};
  assert.equal(change.editFlow,undefined);assert.equal(change.setupProgress,undefined);assert.equal(change.entranceSetupProgress,undefined);assert.equal(change.baseRaw,boss.raw);
  assert.deepEqual(cleanChanges([change]),cleanChanges([normal]));
  const result=applyProposal(source,proposal(change));
  assert.equal(parseJava(result).entries.filter(e=>e.id===boss.id).length,1);
  const states=proposalStates([change])[boss.id];
  assert.ok(states.before);assert.deepEqual(states.before.entrance.ids,['ObjectID.BALLOON_YELLOW_POP']);assert.deepEqual(states.after.entrance.ids,['ObjectID.FAI_VARROCK_WALLS_POOR_CRUMBLE_DOUBLE']);
  assert.throws(()=>applyProposal(source.replace('"Example"','"Upstream"'),proposal(change)),/Conflict/);
});

test('skipping entrance preserves the existing proposal behavior without hydrating the form',()=>{
  const draft={...freshEditDraft(boss),regions:[12682]};
  const change=proposalDraft(draft);
  assert.equal(change.entranceDangerous,undefined);
  assert.ok(applyProposal(source,proposal(change)).includes('ObjectID.BALLOON_YELLOW_POP'));
  assert.equal(freshEditForm(draft).entrance,undefined);
});

test('paired encounter baselines stay attached for updates, skips, and conflict checks',()=>{
  const entries=expandEncounter({...original,entranceDangerous:false,entranceNotifyChunks:entrance.chunks}).map(e=>sourceEntry(e.raw));
  const row=buildLibrary([],[],entries,{}).find(e=>e.id===boss.id);
  const initial=`enum EscapeCrystalNotifyRegion { ${entries.map(e=>e.raw).join(', ')}, BOSS_OTHER("Other", EscapeCrystalNotifyRegionType.BOSSES, EscapeCrystalNotifyRegionDeathType.UNSAFE, 1); }`;
  const draft={...freshEditDraft(row),regions:[12682]};
  assert.equal(draft.entranceBaseRaw,entries[1].raw);
  assert.equal(freshEditForm(draft).entranceBaseRaw,undefined);
  assert.equal(freshEditBoss(row).entranceEntry,undefined);
  const change=proposalDraft(draft),after=parseJava(applyProposal(initial,proposal(change))).entries;
  assert.equal(after.length,3);assert.ok(proposalStates([change])[boss.id].before.entranceEntry);
  assert.throws(()=>applyProposal(initial.replace('"Example Entrance"','"Changed entrance"'),proposal(change)),/Conflict/);
  const previous={...existingDraft(row),entranceBaseRaw:null};
  assert.equal(freshEditDraft({...boss,entranceEntry:undefined},previous).entranceBaseRaw,null);
});

test('fresh dungeon flow uses new defaults without boss-only fields',()=>{
  const dungeon=sourceEntry(generateEntry({id:'DUNGEON_EXAMPLE',name:'Example dungeon',regionType:'DUNGEONS',regions:[1],deathType:'UNSAFE_HCGIM',baseRaw:null}));
  const draft=freshEditDraft(dungeon);
  assert.equal(draft.regionType,'DUNGEONS');assert.equal(draft.deathType,'UNSAFE');
  assert.equal(draft.entranceOverlay,undefined);assert.equal(draft.entranceDangerous,undefined);
  assert.deepEqual(draft.regions,[]);assert.equal(proposalDraft(draft).baseRaw,dungeon.raw);
});

test('reselecting saved Bryophyta entrance chunks repairs a stale arena region and exports',()=>{
  const old=sourceEntry(generateEntry({...original,id:'BOSS_BRYOPHYTA',name:'Bryophyta',regions:[12955],entrance:{...entrance,ids:['32534'],chunks:[812245]}}));
  const chunks=[812245,812246,814293,814294];
  const draft={...freshEditDraft(old),regions:[12955],entranceRegion:12955,entranceDangerous:true,
    entranceNotifyChunks:chunks,entrance:{...entrance,ids:['32534'],chunks:[812245]}};
  const location={region:12955,plane:0,notificationChunks:chunks};
  const selection=locationAreaChange({},draft,location,true,{regions:[12698],chunks});
  const change=proposalDraft(mergeDraft(draft,selection));
  assert.equal(change.entranceRegion,12698);assert.deepEqual(change.entranceNotifyChunks,chunks);
  assert.deepEqual(change.entrance,draft.entrance);assert.deepEqual(change.regions,[12955]);
  const initial=source.replace(boss.raw,old.raw);
  const entries=parseJava(applyProposal(initial,proposal(change))).entries;
  assert.deepEqual(entries.find(e=>e.id==='BOSS_BRYOPHYTA').regions,[12955]);
  assert.deepEqual(entries.find(e=>e.id==='BOSS_BRYOPHYTA_ENTRANCE').regions,[12698]);
});
