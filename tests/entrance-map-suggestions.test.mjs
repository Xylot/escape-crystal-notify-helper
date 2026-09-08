import test from 'node:test';
import assert from 'node:assert/strict';
import {entranceMapSuggestions,uniqueEntranceMapChoices} from '../src/core/entrance-map-suggestions.mjs';
import {locationAreaChange} from '../src/core/location-defaults.mjs';
import {chunkId,regionId} from '../src/core/coordinates.mjs';
const region=regionId(3200,3200), chunk=chunkId(3200,3200);
const data={sha:'abc123',regions:{[region]:{locs:[
  {id:1,x:3200,y:3200,level:0}, {id:2,x:3201,y:3201,level:0},
  {id:3,x:3202,y:3202,level:0}, {id:4,x:3203,y:3203,level:0},
  {id:2,x:3209,y:3201,level:0}, {id:2,x:3201,y:3201,level:1},
  {id:2,x:3201,y:3201,level:0},
]}},types:{1:{name:'Gate'},2:{name:'Boss cave',forms:[{locId:22,name:'Brutus entrance',actions:['Enter']}]},3:{name:'Ladder'},4:{name:'Tree'}}};

test('current entrance and matching suggestion share one row regardless of title or object ordering',()=>{
  const location=entranceMapSuggestions(data,{name:'Brutus',regions:[region],chunks:[chunk]})[0];
  const suggestion={location,chunks:[chunk],regions:[region],label:location.title};
  const current={...suggestion,current:true,label:'Current entrance area',location:{...location,source:'older source',entranceObjects:[...location.entranceObjects].reverse()}};
  for(const choices of [[current,suggestion],[suggestion,current]]){
    const result=uniqueEntranceMapChoices(choices);
    assert.equal(result.length,1);
    assert.equal(result[0].current,true);
    assert.equal(result[0].label,location.title);
    assert.equal(result[0].location.source,'older source');
  }
  assert.equal(current.label,'Current entrance area');
  for(const different of [
    {...suggestion,chunks:[chunk,chunk+1]},
    {...suggestion,location:{...location,plane:1}},
    {...suggestion,location:{...location,entranceObjects:location.entranceObjects.slice(1)}},
  ])assert.equal(uniqueEntranceMapChoices([current,different]).length,2);
});

test('suggests entrance placements in the arena on its plane, ranked by encounter match',()=>{
  const maps=entranceMapSuggestions(data,{name:'Brutus',regions:[region],chunks:[chunk],plane:0});
  assert.equal(maps.length,1);
  assert.equal(maps[0].title,'Boss cave / Gate / Ladder · Objects 1, 2, 3');
  assert.deepEqual(maps[0].entranceObjects.map(object=>object.id),['2','1','3']);
  assert.deepEqual(maps[0].notificationChunks,[chunk]);
  assert.equal(maps[0].pinX,3201);
  assert.match(maps[0].source,/abc123\/data\/regions.json$/);
  assert.equal(maps[0].verified,false);
  assert.match(entranceMapSuggestions(data,{name:'Other',regions:[region],chunks:[chunk],selectedIds:['3']})[0].title,/^Ladder/);
});

test('keeps distinct placements and can match selected transformed IDs',()=>{
  const maps=entranceMapSuggestions(data,{name:'Other',regions:[region],selectedIds:['22']});
  assert.equal(maps.length,2);
  assert.equal(maps[1].title,'Boss cave · Object 2');
  assert.match(maps[0].title,/^Boss cave/);
  assert.deepEqual(entranceMapSuggestions(data,{name:'Brutus',regions:[12345]}),[]);
});

test('same-chunk objects consolidate without merging planes or losing distinct placements',()=>{
  const maps=entranceMapSuggestions(data,{name:'Brutus',regions:[region],plane:null});
  assert.equal(maps.length,3);
  const grouped=maps.find(map=>map.notificationChunks[0]===chunk&&map.plane===0);
  assert.equal(grouped.entranceObjects.length,3);
  assert.equal(maps.find(map=>map.plane===1).entranceObjects.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(grouped)).entranceObjects,grouped.entranceObjects);
});

test('choosing a suggested map presets notification coverage without replacing arena or object settings',()=>{
  const map=entranceMapSuggestions(data,{name:'Brutus',regions:[region],chunks:[chunk]})[0];
  const draft={regions:[region],entrance:{ids:['99'],chunks:[chunk]},entranceDangerous:true};
  const patch=locationAreaChange({},draft,JSON.parse(JSON.stringify(map)),true,null);
  assert.deepEqual(patch,{entranceRegion:region,entrancePlane:0,entranceNotifyChunks:[chunk]});
  assert.deepEqual({...draft,...patch}.entrance,draft.entrance);
  assert.deepEqual(draft.regions,[region]);
});
