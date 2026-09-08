import test from 'node:test';
import assert from 'node:assert/strict';
import {regionObjectCandidates,objectGamevalNames,entranceObjectRegions,entranceObjectCandidates,objectsInEntranceChunks} from '../src/core/region-objects.mjs';
import {chunkId,regionId} from '../src/core/coordinates.mjs';
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

test('entrance chunk filtering uses each placement, includes boundary tiles, and keeps its variants',()=>{
 const chunks=[chunkId(3200,3200)];
 const rows=[{id:1,x:3200,y:3200,forms:[{locId:99}]},{id:1,x:3207,y:3207},{id:1,x:3208,y:3207},{id:2,x:3199,y:3200}];
 assert.deepEqual(objectsInEntranceChunks(rows,chunks),rows.slice(0,2));
 assert.deepEqual(objectsInEntranceChunks(rows,chunks)[0].forms,[{locId:99}]);
 assert.equal(objectsInEntranceChunks(rows,chunks,true),rows);
 assert.equal(objectsInEntranceChunks(rows,[]),rows);
});

test('multi-region entrance searches include every chunk region and retain plane filtering',()=>{
 const first=regionId(3200,3200),second=regionId(3264,3200);
 const chunks=[chunkId(3200,3200),chunkId(3264,3200),chunkId(3200,3200)];
 const regions=entranceObjectRegions(first,chunks);
 assert.deepEqual(regions,[first,second]);
 assert.deepEqual(entranceObjectRegions(undefined,chunks),regions);
 const snapshot={regions:{[first]:{locs:[{id:1,x:3200,y:3200,level:0},{id:2,x:3216,y:3200,level:0}]},[second]:{locs:[{id:3,x:3264,y:3200,level:0},{id:4,x:3264,y:3200,level:1},{id:5,x:3280,y:3200,level:0}]}},types:{1:{name:'Gate'},2:{name:'Door'},3:{name:'Entrance'},4:{name:'Ladder'},5:{name:'Door'}}};
 const rows=entranceObjectCandidates(snapshot,[...regions,first],[],0);
 assert.deepEqual(objectsInEntranceChunks(rows,chunks).map(o=>o.id),[1,3]);
 assert.deepEqual(objectsInEntranceChunks(rows,chunks,true).map(o=>o.id),[1,2,3,5]);
 assert.equal(objectsInEntranceChunks(rows,[chunks[1]]).length,1);
 assert.equal(entranceObjectCandidates(snapshot,regions,[],null).length,5);
});

test('region-only searches and invalid entrance areas are handled explicitly',()=>{
 assert.deepEqual(entranceObjectRegions(12582,[]),[12582]);
 assert.deepEqual(entranceObjectRegions(undefined,[]),[]);
 assert.throws(()=>entranceObjectRegions(-1,[]));
 assert.throws(()=>entranceObjectRegions(12582,[-1]));
});
