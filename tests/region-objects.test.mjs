import test from 'node:test';
import assert from 'node:assert/strict';
import {regionObjectCandidates,objectGamevalNames} from '../src/core/region-objects.mjs';
const data={regions:{12582:{locs:[{id:1,x:3176,y:2477,level:1},{id:58439,x:3176,y:2477,level:0},{id:2,x:3180,y:2477,level:0}]}},types:{58439:{name:'null',displayName:'Cave entrance',actions:[],transformVarbit:18321,forms:[{locId:58441,name:'Cave entrance',actions:['Enter'],isFallback:true}]},1:{name:'Door'},2:{name:'Tree'}}};
test('region lookup joins unnamed morph bases, filters plane, and preserves placed and form IDs',()=>{
 const result=regionObjectCandidates(data,12582,{x:3176,y:2477},0);
 assert.equal(result[0].id,58439);assert.equal(result[0].distance,0);assert.equal(result[0].forms[0].locId,58441);assert.deepEqual(result[0].actions,['Enter']);assert.equal(result.length,2);
 assert.deepEqual(regionObjectCandidates(data,12345,null),[]);
 assert.throws(()=>regionObjectCandidates(data,-1,null));
});
test('gameval cross reference matches exact object IDs rather than same-number NPC IDs',()=>{
 assert.equal(objectGamevalNames([{id:'58439',objectType:'NPC'},{id:'58439',objectType:'GAME_OBJECT'}],[58439]).length,1);
});
