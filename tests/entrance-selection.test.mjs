import test from 'node:test';
import assert from 'node:assert/strict';
import {selectEntranceIds,suggestedEntranceChange} from '../src/core/entrance-selection.mjs';
import {expandEncounter} from '../src/core/encounter-export.mjs';
import {mergeDraft} from '../src/core/authoring.mjs';
import {regionId} from '../src/core/coordinates.mjs';
import {chunkId} from '../src/core/coordinates.mjs';
import {entranceJava} from '../src/core/entrance.mjs';
const a={x:3200,y:3200}, b={x:3216,y:3200};
const ca=chunkId(a.x,a.y), cb=chunkId(b.x,b.y);
const fresh={ids:[],chunks:[],objectType:'GAME_OBJECT',overlay:'DEPRIORITIZED_WITH_HIGHLIGHT',direction:'',plane:''};

test('quick review selects every suggested object and replaces stale detection locations',()=>{
  const location={region:regionId(a.x,a.y),plane:0,notificationChunks:[ca],entranceObjects:[{id:'123',...a},{id:'456',x:a.x+1,y:a.y}]};
  const draft={id:'BOSS_QUICK',name:'Quick',baseRaw:null,deathType:'UNSAFE',regions:[location.region],chunks:[ca,cb],entranceDangerous:true};
  const previous={...fresh,ids:['123','999'],chunks:[cb],objectChunks:{'123':[cb]},direction:'NORTHWARD'};
  const change=suggestedEntranceChange(draft,location,previous);
  assert.deepEqual(change.entrance.ids,['123','456']);
  assert.deepEqual(change.entrance.chunks,[ca]);
  assert.deepEqual(change.entrance.objectChunks,{'123':[ca],'456':[ca]});
  assert.equal(change.entrance.direction,'NORTHWARD');
  const next=mergeDraft(draft,change);
  assert.deepEqual(next.regions,draft.regions);
  const entries=expandEncounter(JSON.parse(JSON.stringify(next)));
  assert.equal(entries.length,1);
  assert.match(entries[0].raw,/123, 456/);
  const split=expandEncounter({...next,entranceDangerous:false,regions:[12851],chunks:undefined});
  assert.equal(split.length,2);
  assert.match(split[1].raw,/BOSS_QUICK_ENTRANCE/);
});

test('quick review requires a danger answer and actual suggested placements',()=>{
  const location={region:regionId(a.x,a.y),plane:0,notificationChunks:[ca],entranceObjects:[{id:'123',...a}]};
  for(const entranceDangerous of [null,undefined])assert.throws(()=>suggestedEntranceChange({entranceDangerous},location,fresh),/dangerous/);
  assert.throws(()=>suggestedEntranceChange({entranceDangerous:true},{...location,entranceObjects:[]},fresh),/entrance objects/);
  assert.throws(()=>suggestedEntranceChange({entranceDangerous:true},{...location,region:12582},fresh),/selected entrance region/);
});

test('selected objects derive detection chunks and extend narrow notifications',()=>{
  const draft={entranceDangerous:false,entranceNotifyChunks:[ca]};
  const selected=selectEntranceIds(draft,fresh,['123'],'GAME_OBJECT',{'123':[b]});
  assert.deepEqual(selected.entrance.chunks,[cb]);
  assert.deepEqual(selected.entranceNotifyChunks,[ca,cb]);
  assert.match(entranceJava(selected.entrance),new RegExp(`List.of\\(${cb}\\)`));
  assert.deepEqual(draft.entranceNotifyChunks,[ca]);
});

test('multiple placements, variants, removal and draft restoration keep matching chunks',()=>{
  const first=selectEntranceIds({},fresh,['123'],'GAME_OBJECT',{'123':[a,b]});
  const restored=JSON.parse(JSON.stringify(first));
  const next=selectEntranceIds({},restored.entrance,['123','456'],'GAME_OBJECT',{'456':[a]});
  assert.deepEqual(next.entrance.chunks,[ca,cb]);
  const removed=selectEntranceIds({},next.entrance,['456'],'GAME_OBJECT');
  assert.deepEqual(removed.entrance.chunks,[ca]);
  assert.deepEqual(selectEntranceIds({},removed.entrance,[],'GAME_OBJECT').entrance.chunks,[]);
});

test('whole-area notifications stay unrestricted and existing unknown placements are preserved',()=>{
  const draft={entranceDangerous:true,entranceNotifyChunks:[]};
  const selected=selectEntranceIds(draft,fresh,['123'],'GAME_OBJECT',{'123':[a]});
  assert.equal(selected.entranceNotifyChunks,undefined);
  const existing={...fresh,ids:['999'],chunks:[cb]};
  assert.deepEqual(selectEntranceIds(draft,existing,['999','123'],'GAME_OBJECT',{'123':[a]}).entrance.chunks,[ca,cb]);
});

test('IDs without coordinates use notification coverage and switching type drops object provenance',()=>{
  const draft={entranceDangerous:false,entranceNotifyChunks:[ca,cb]};
  const manual=selectEntranceIds(draft,fresh,['123'],'GAME_OBJECT');
  assert.deepEqual(manual.entrance.chunks,[ca,cb]);
  const selected=selectEntranceIds(draft,fresh,['123'],'GAME_OBJECT',{'123':[a]});
  const npc=selectEntranceIds(draft,selected.entrance,['123'],'NPC');
  assert.deepEqual(npc.entrance.objectChunks,{});
  assert.deepEqual(npc.entrance.chunks,[ca,cb]);
});
