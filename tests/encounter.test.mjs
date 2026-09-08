import test from 'node:test';
import assert from 'node:assert/strict';
import {encounterLocations,sameLocation,mergeEvidenceContext,refreshedLocation} from '../src/core/encounter.mjs';
import {regionId} from '../src/core/coordinates.mjs';
const loc=(x,y,role,title,plane=null,mapId=null)=>({x,y,region:regionId(x,y),role,title,plane,mapId,source:'wiki',caption:''});

test('refresh replaces an old polygon vertex with its outline without adopting unrelated polygons',()=>{
  const saved={...loc(3241,3299,'location','Lumbridge cow field',0),mtype:'polygon'};
  const outline={...loc(3253,3277,'location','Lumbridge cow field'),mtype:'polygon',outline:[[[3241,3299],[3266,3299],[3266,3255],[3241,3299]]]};
  assert.equal(refreshedLocation(saved,[outline]),outline);
  assert.equal(refreshedLocation({...saved,mtype:'pin'},[outline]).mtype,'pin');
  assert.equal(refreshedLocation(saved,[{...outline,source:'other'}]),saved);
  assert.equal(refreshedLocation(saved,[{...outline,plane:1}]),saved);
});
test('map evidence feedback settles after one update instead of producing new state forever',()=>{
  const entrance=loc(3028,4772,'entrance','Abyssal Sire',0);
  const initial={entranceImage:'27048'};
  const next=mergeEvidenceContext(initial,'entrance',entrance);
  assert.notEqual(next,initial);
  assert.equal(initial.entrance,undefined);
  assert.equal(next.entranceImage,'27048');
  for(let i=0;i<100;i++)assert.equal(mergeEvidenceContext(next,'entrance',{...next.entrance}),next);
});
test('real map location, plane and tile-source changes still update their own evidence pane',()=>{
  const entrance=loc(3028,4772,'entrance','Abyssal Sire',0),arena=loc(2980,4760,'arena','Abyssal Sire',0);
  const original={arena,entrance,entranceImage:'27048'};
  for(const change of [{x:3036},{plane:1},{tiles:{version:'2026-08-12_a',mapId:-1,plane:0}}]) {
    const location={...entrance,...change}, next=mergeEvidenceContext(original,'entrance',location);
    assert.notEqual(next,original);
    assert.equal(next.entrance,location);
    assert.equal(next.arena,arena);
    assert.equal(next.entranceImage,'27048');
    assert.equal(mergeEvidenceContext(next,'entrance',structuredClone(location)),next);
  }
});
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
