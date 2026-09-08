import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGameval,searchGameval,indexGameval,gamevalMatches} from '../src/core/gameval.mjs';
test('gameval lookup retains class and source, ranks entrance variants, and accepts numeric IDs',()=>{
 const rows=parseGameval('public static final int CONCH_GRYPHON_NEST = 57910;\npublic static final int CONCH_GRYPHON_LAIR_ENTRANCE = 57908;\npublic static final int CONCH_GRYPHON_TASK_LAIR_ENTRANCE = 57915;','ObjectID1','abc123');
 const found=searchGameval(rows,'Shellbane gryphon');
 assert.equal(found[0].id,'57908');assert.equal(found[1].id,'57915');
 assert.equal(found[0].file,'ObjectID1');assert.ok(found[0].source.endsWith('/ObjectID1.java#L2'));
 assert.equal(searchGameval(rows,'57908')[0].id,'57908');assert.equal(searchGameval(rows,'unrelated').length,0);
});

test('display lookup matches exact IDs across object files without confusing NPC IDs',()=>{
 const rows=[...parseGameval('public static final int DOOR = 12;\npublic static final int DOOR_ALIAS = 12;','ObjectID','abc'),...parseGameval('public static final int NEW_GATE = 123;','ObjectID1','abc'),...parseGameval('public static final int GUARD = 12;','NpcID','abc')];
 const index=indexGameval(rows);
 assert.deepEqual(gamevalMatches(index,['12'],'GAME_OBJECT').map(e=>e.name),['DOOR','DOOR_ALIAS']);
 assert.deepEqual(gamevalMatches(index,['12'],'NPC').map(e=>e.name),['GUARD']);
 assert.equal(gamevalMatches(index,['12'],'ANY').length,3);
 assert.equal(gamevalMatches(index,['123'],'GAME_OBJECT')[0].file,'ObjectID1');
 assert.equal(gamevalMatches(index,['ObjectID1.NEW_GATE'],'GAME_OBJECT')[0].id,'123');
 assert.equal(gamevalMatches(index,['NpcID.GUARD'],'GAME_OBJECT').length,0);
 assert.deepEqual(gamevalMatches(index,['999999'],'GAME_OBJECT'),[]);
 assert.equal(gamevalMatches(index,['12','12','ObjectID.DOOR'],'GAME_OBJECT').length,2);
});
