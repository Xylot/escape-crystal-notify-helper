import test from 'node:test';
import assert from 'node:assert/strict';
import {sparseMapBounds} from '../src/core/map-framing.mjs';
const center=[2911,8036],home=11645;
function tiles(){const result=new Map();for(let x=44;x<=46;x++)for(let y=124;y<=126;y++)result.set((x<<8)|y,false);result.set(home,true);return result;}
test('isolated cave fits its full region with north-up bounds',()=>{
  assert.deepEqual(sparseMapBounds(center,tiles(),[home]),[[8000,2880],[8064,2944]]);
});
test('adjacent terrain and selected empty regions remain in the fitted view',()=>{
  const map=tiles();map.set(home+256,true);
  assert.deepEqual(sparseMapBounds(center,map,[home,home+1]),[[8000,2880],[8128,3008]]);
});
test('pending tiles, missing central imagery and ordinary overworld terrain do not zoom',()=>{
  const pending=tiles();pending.delete(home+1);assert.equal(sparseMapBounds(center,pending),null);
  const failed=tiles();failed.set(home,false);assert.equal(sparseMapBounds(center,failed),null);
  const full=new Map([...tiles()].map(([id])=>[id,true]));assert.equal(sparseMapBounds(center,full),null);
});
test('distant selected regions prevent auto-zoom from hiding coverage',()=>{
  assert.equal(sparseMapBounds(center,tiles(),[home,12682]),null);
});
