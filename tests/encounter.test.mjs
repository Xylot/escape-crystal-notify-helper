import test from 'node:test';
import assert from 'node:assert/strict';
import {encounterLocations,sameLocation} from '../src/core/encounter.mjs';
import {regionId} from '../src/core/coordinates.mjs';
const loc=(x,y,role,title,plane=null,mapId=null)=>({x,y,region:regionId(x,y),role,title,plane,mapId,source:'wiki',caption:''});
test('Shellbane chooses its cave before the broader island and splits entrance/arena',()=>{
  const model=encounterLocations({name:'Shellbane gryphon',regions:[],optionalArgs:[],maps:[loc(3176,2477,'entrance','Shellbane gryphon'),loc(3200,2435,'location','The Great Conch'),loc(3179,8876,'location','Shellbane Gryphon Cave',null,'-1')]});
  assert.equal(model.arena[0].region,12682);assert.equal(model.entrance[0].region,12582);assert.equal(model.shared,false);
});
test('same map region can be combined; different planes/layers stay separate',()=>{
  const a=loc(3176,2477,'entrance','Test',0),b=loc(3179,2479,'location','Test',0);
  assert.equal(sameLocation(a,b),true);assert.equal(sameLocation(a,{...b,plane:1}),false);assert.equal(sameLocation({...a,mapId:'1'},{...b,mapId:'2'}),false);
});
test('missing entrances never borrow arena pins; duplicate entrance pins collapse',()=>{
  assert.equal(encounterLocations({name:'Test',regions:[],optionalArgs:[],maps:[loc(3179,8876,'location','Cave')]}).entrance.length,0);
  const entrance=loc(3176,2477,'entrance','Cave');assert.equal(encounterLocations({name:'Test',regions:[],optionalArgs:[],maps:[entrance,{...entrance,source:'other'}]}).entrance.length,1);
});
