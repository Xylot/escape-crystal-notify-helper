import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGameval,searchGameval} from '../src/core/gameval.mjs';
test('gameval lookup retains class and source, ranks entrance variants, and accepts numeric IDs',()=>{
 const rows=parseGameval('public static final int CONCH_GRYPHON_NEST = 57910;\npublic static final int CONCH_GRYPHON_LAIR_ENTRANCE = 57908;\npublic static final int CONCH_GRYPHON_TASK_LAIR_ENTRANCE = 57915;','ObjectID1','abc123');
 const found=searchGameval(rows,'Shellbane gryphon');
 assert.equal(found[0].id,'57908');assert.equal(found[1].id,'57915');
 assert.equal(found[0].file,'ObjectID1');assert.ok(found[0].source.endsWith('/ObjectID1.java#L2'));
 assert.equal(searchGameval(rows,'57908')[0].id,'57908');assert.equal(searchGameval(rows,'unrelated').length,0);
});
