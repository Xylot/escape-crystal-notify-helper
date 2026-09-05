import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestedArenaRegions} from '../src/core/encounter.mjs';
import {paintGrid} from '../src/core/map-grid.mjs';
const boss={name:'Shellbane gryphon',raw:null,regions:[],optionalArgs:[],maps:[{title:'Shellbane Gryphon Cave',region:12682,role:'location'},{title:'Great Conch',region:12838,role:'location'},{title:'Shellbane gryphon',region:12582,role:'entrance'}]};
test('arena defaults require one boss-specific region and preserve plugin coverage',()=>{
 assert.deepEqual(suggestedArenaRegions(boss),[12682]);
 assert.deepEqual(suggestedArenaRegions({...boss,maps:[boss.maps[1],boss.maps[2]]}),[]);
 assert.deepEqual(suggestedArenaRegions({...boss,maps:[...boss.maps,{x:100,y:100,title:'Shellbane Gryphon Lair',region:12345,role:'location'}]}),[]);
 assert.deepEqual(suggestedArenaRegions({...boss,raw:'existing',regions:[123,124]}),[123,124]);
 assert.deepEqual(suggestedArenaRegions({...boss,supportedBy:[{id:'GROUP'}]}),[]);
});
test('canvas chunk coordinates use north-up world tiles',()=>{
 const fills=[];const context={clearRect(){},strokeRect(){},fillText(){},fillRect(...args){fills.push(args);}};
 const chunk=((49*8)<<11)|(38*8);
 paintGrid(context,{region:12582,selected:[],existing:[],chunks:[chunk],chunkMode:true,fine:false});
 assert.equal(fills.some(args=>JSON.stringify(args)===JSON.stringify([0,224,32,32])),false);
 assert.equal(fills.filter(args=>args[2]===32).length,0);
});

