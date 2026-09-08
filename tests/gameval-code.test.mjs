import test from 'node:test';
import assert from 'node:assert/strict';
import {gamevalCodeId} from '../src/core/gameval-code.mjs';
import {entranceJava} from '../src/core/entrance.mjs';
import {generateEncounter,expandEncounter} from '../src/core/encounter-export.mjs';
import {applyProposal,PLUGIN_REPO} from '../src/core/proposal.mjs';
import {freshEditDraft,proposalDraft} from '../src/core/fresh-edit.mjs';
import {prepare} from '../worker/pr-service.mjs';
import {FakeGitHub,MemoryStore,env,snapshot} from './pr-fixtures.mjs';

const entrance={overlay:'DEPRIORITIZED_WITH_HIGHLIGHT',direction:'',plane:'',objectType:'GAME_OBJECT',ids:['32534'],chunks:[812245]};

test('gameval export uses the public ObjectID namespace for inherited constants',()=>{
  assert.equal(gamevalCodeId('32534','GAME_OBJECT'),'ObjectID.GB_MOSS_DOOR_IN');
  assert.equal(gamevalCodeId('ObjectID1.GB_MOSS_DOOR_IN','GAME_OBJECT'),'ObjectID.GB_MOSS_DOOR_IN');
  assert.equal(gamevalCodeId('ObjectID.GB_MOSS_DOOR_IN','GAME_OBJECT'),'ObjectID.GB_MOSS_DOOR_IN');
  assert.match(entranceJava(entrance),/ObjectID\.GB_MOSS_DOOR_IN\)$/);
  assert.equal(entranceJava({...entrance,ids:['32534','ObjectID.GB_MOSS_DOOR_IN']}).match(/GB_MOSS_DOOR_IN/g).length,1);
  assert.deepEqual(entrance.ids,['32534']);
});

test('object and NPC numeric IDs resolve independently; unknown IDs remain numeric',()=>{
  assert.match(gamevalCodeId('1','GAME_OBJECT'),/^ObjectID\./);
  assert.match(gamevalCodeId('1','NPC'),/^NpcID\./);
  assert.equal(gamevalCodeId('999999999','GAME_OBJECT'),'999999999');
  assert.equal(gamevalCodeId('999999999','NPC'),'999999999');
  assert.throws(()=>entranceJava({...entrance,objectType:'NPC',ids:['ObjectID1.GB_MOSS_DOOR_IN']}),/namespace/);
});

test('Bryophyta numeric draft produces the same gameval code in preview, downloaded proposals and PRs',async()=>{
  const boss=snapshot.entries.find(e=>e.id==='BOSS_BRYOPHYTA');
  const draft={...freshEditDraft(boss),regions:[12955],entranceRegion:12698,entranceDangerous:true,
    entranceNotifyChunks:[812245,812246,814293,814294],entrance};
  const change=proposalDraft(draft),preview=generateEncounter(change);
  assert.match(preview,/ObjectID\.GB_MOSS_DOOR_IN/);
  assert.doesNotMatch(preview,/, 32534\)/);
  const proposal=JSON.parse(JSON.stringify({version:2,repository:PLUGIN_REPO,baseCommit:snapshot.baseCommit,changes:[change]}));
  const after=applyProposal(snapshot.source,proposal);
  for(const entry of expandEncounter(change))assert.ok(after.includes(entry.raw));
  const store=new MemoryStore();
  const result=await prepare({changes:[change],contexts:{[boss.id]:{arena:{x:3250,y:9952,plane:0},entrance:{x:3176,y:9904,plane:0}}},sources:{[boss.id]:['https://oldschool.runescape.wiki/w/Bryophyta']}},'1',new FakeGitHub(),store,env);
  assert.equal((await store.get(result.id,'1')).after,after);
  assert.deepEqual(result.states[boss.id].after.entrance.ids,['ObjectID.GB_MOSS_DOOR_IN']);
  assert.deepEqual(draft.entrance.ids,['32534']);
});
