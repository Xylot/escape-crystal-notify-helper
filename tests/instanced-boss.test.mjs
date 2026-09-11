import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chunkId} from '../src/core/coordinates.mjs';
import {parseJava,isNotifyRegion} from '../src/core/java.mjs';
import {entranceJava} from '../src/core/entrance.mjs';
import {originalEntranceChunks} from '../src/core/encounter.mjs';
import {expandEncounter,sourceEntry,notificationChunks,detectionChunks} from '../src/core/encounter-export.mjs';
import {existingDraft,editableDraft,readEntrance,applySection,changedSections} from '../src/core/editing.mjs';
import {applyProposal,validateProposal,PLUGIN_REPO,JAVA_PATH,applyProposalFiles} from '../src/core/proposal.mjs';
import {withMetadata} from '../src/core/encounter-metadata.mjs';
import {cleanChanges} from '../src/core/pr-evidence.mjs';
import {proposalStates,stateDifferences} from '../src/core/pr-states.mjs';
import {prepare} from '../worker/pr-service.mjs';
import {FakeGitHub,MemoryStore,env} from './pr-fixtures.mjs';

const snapshot=JSON.parse(readFileSync(new URL('../public/data/snapshot.json',import.meta.url)));
const approach=chunkId(3264,3264),arena=chunkId(3280,3280),region=13107;
// Synthetic NPC ID: this tests the Brutus layout, not live encounter data.
const entrance={ids:['123'],objectType:'NPC',overlay:'DEPRIORITIZED_WITH_HIGHLIGHT',direction:'',plane:'',chunks:[approach]};
const boss={id:'BOSS_INSTANCE_TEST',name:'Instanced boss test',baseRaw:null,regionType:'BOSSES',deathType:'UNSAFE',regions:[region],chunks:[approach,arena],entranceRegion:region,entranceNotifyChunks:[approach],entranceDangerous:false,bossInstanced:true,entrance};
const proposal=(changes,version=4)=>({version,repository:PLUGIN_REPO,baseCommit:snapshot.baseCommit,changes});

test('safe approach and instanced arena in one region produce one notifying entry with independent chunks',()=>{
  const entries=expandEncounter(boss);assert.equal(entries.length,1);
  const entry=sourceEntry(entries[0].raw);
  assert.match(entry.raw,/\.withInstancedBoss\(\)/);assert.equal(isNotifyRegion(entry),true);
  assert.deepEqual(entry.regions,[region]);assert.deepEqual(notificationChunks(entry),[approach,arena]);assert.deepEqual(detectionChunks(entry),[approach]);
  assert.deepEqual(originalEntranceChunks(entry.optionalArgs),[approach]);
  assert.equal(readEntrance(entry.optionalArgs).value.bossInstanced,true);
  const whole=sourceEntry(expandEncounter({...boss,chunks:[],entranceNotifyChunks:[],entrance:{...entrance,chunks:[]}})[0].raw);
  assert.deepEqual(notificationChunks(whole),[]);assert.deepEqual(detectionChunks(whole),[]);
  assert.equal(isNotifyRegion(whole),true);
});

test('instanced constructors round trip, hydrate editing, and survive unrelated edits and priority changes',()=>{
  const entry=sourceEntry(expandEncounter(boss)[0].raw),draft=existingDraft(entry);
  assert.equal(draft.bossInstanced,true);assert.equal(draft.entranceDangerous,false);
  assert.equal(expandEncounter(draft)[0].raw,entry.raw);assert.deepEqual(changedSections(draft),[]);
  assert.equal(editableDraft(draft).entrance.bossInstanced,true);
  assert.match(expandEncounter({...draft,name:'Renamed'})[0].raw,/\.withInstancedBoss\(\)/);
  const updated=applySection(draft,{...editableDraft(draft),entrance:{...editableDraft(draft).entrance,ids:['124']}},'entrance');
  assert.deepEqual(changedSections(updated),['entrance']);assert.match(expandEncounter(updated)[0].raw,/\.withInstancedBoss\(\)/);
  assert.equal(readEntrance(sourceEntry(expandEncounter({...draft,entranceOverlay:'PRIORITIZED_WITH_HIGHLIGHT'})[0].raw).optionalArgs).value.overlay,'PRIORITIZED_WITH_HIGHLIGHT');
  const spaced=entry.optionalArgs.map(arg=>arg.replace('.withInstancedBoss()',' /* instance */ . withInstancedBoss ( )'));
  assert.equal(readEntrance(spaced).value.bossInstanced,true);assert.deepEqual(originalEntranceChunks(spaced),[approach]);
});

test('disabling instance restriction is explicit and incompatible layouts still fail closed',()=>{
  const draft=existingDraft(sourceEntry(expandEncounter({...boss,chunks:[],entranceNotifyChunks:[]})[0].raw));
  assert.doesNotMatch(expandEncounter({...draft,bossInstanced:false,entranceDangerous:true})[0].raw,/withInstancedBoss/);
  assert.throws(()=>expandEncounter({...boss,bossInstanced:false}),/share a region/);
  assert.throws(()=>expandEncounter({...boss,entrance:undefined}),/requires entrance detection/);
  assert.throws(()=>expandEncounter({...boss,entranceDangerous:true}),/non-dangerous/);
  assert.throws(()=>expandEncounter({...boss,regions:[region+1],chunks:[]}),/must also be selected arena/);
  assert.throws(()=>expandEncounter({...boss,chunks:[arena]}),/shares region chunk restrictions/);
  assert.throws(()=>expandEncounter({...boss,entranceNotifyChunks:[],entrance:{...entrance,chunks:[]}}),/shares region chunk restrictions/);
  assert.throws(()=>expandEncounter({...boss,bossInstanced:'yes'}),/instanced/);
  assert.throws(()=>entranceJava({...entrance,bossInstanced:'yes'}),/instanced/);
  assert.throws(()=>validateProposal(proposal([{...boss,id:'DUNGEON_TEST',regionType:'DUNGEONS'}])),/Dungeons/);
});

test('version 4 cleaning, metadata generation and upstream capability checks retain instance semantics',()=>{
  for(const version of [1,2,3])assert.throws(()=>validateProposal(proposal([boss],version)),/version 4/);
  const change={...withMetadata(boss,snapshot.metadataSources),recommendedSeconds:3,petIcon:'33124'};
  const cleaned=JSON.parse(JSON.stringify(cleanChanges([change])));
  assert.equal(cleaned[0].bossInstanced,true);
  const sources={[JAVA_PATH]:snapshot.source,...snapshot.metadataSources},after=applyProposalFiles(sources,proposal(cleaned));
  assert.equal(Object.keys(after).length,3);
  assert.match(after[JAVA_PATH],/withInstancedBoss/);
  assert.equal(parseJava(after[JAVA_PATH]).entries.filter(e=>e.id.startsWith(boss.id)).length,1);
  assert.throws(()=>applyProposal(snapshot.source.replaceAll('getInstancedOnlyRegionIdsFromTypes','oldMethod'),proposal([boss])),/Sync plugin source/);
  const states=proposalStates(cleaned)[boss.id];assert.equal(states.after.bossInstanced,true);assert.equal(states.after.entranceDangerous,false);
  const existing=existingDraft(sourceEntry(expandEncounter(boss)[0].raw));
  const pair=proposalStates([{...existing,bossInstanced:false,entranceDangerous:true,chunks:[],entranceNotifyChunks:[]}])[boss.id];
  assert.ok(stateDifferences(pair.before,pair.after).removed.includes('Boss fight instanced: true'));
});

test('PR preparation emits one instanced region entry and explains ordinary approach versus arena',async()=>{
  const gh=new FakeGitHub(),store=new MemoryStore();
  const result=await prepare({changes:[boss],contexts:{[boss.id]:{arena:{x:3280,y:3280,plane:0},entrance:{x:3264,y:3264,region,plane:0}}},sources:{[boss.id]:['https://oldschool.runescape.wiki/w/Brutus']}},'1',gh,store,env);
  const saved=await store.get(result.id,'1');
  assert.equal(saved.after,applyProposal(snapshot.source,proposal(cleanChanges([boss]))));
  assert.match(result.body,/region notifications activate only inside the instance/);
  assert.match(result.evidence.panels.find(p=>p.kind==='arena').label,/inside instance only/);
  assert.match(result.evidence.panels.find(p=>p.kind==='notification').label,/outside instance/);
  assert.deepEqual(result.evidence.panels.find(p=>p.kind==='notification').detectionChunks,[approach]);
  assert.equal(result.evidence.panels.filter(p=>p.kind==='notification').length,1);
  assert.equal(result.evidence.panels.filter(p=>p.kind==='entrance').length,0);
});
