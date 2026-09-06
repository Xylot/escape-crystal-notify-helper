import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceTile} from '../src/core/evidence-tiles.mjs';
const context={x:3179,y:8876,plane:0,tiles:{version:'2026-08-12_a',mapId:-1}};
const response=()=>new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/png'}});
test('public map downloads use CORS without credentials and preserve the selected layer',async()=>{
  let called=false;
  const blob=await evidenceTile(12682,context,()=>{throw Error('Unexpected proxy');},async(url,options)=>{
    called=true;assert.match(url,/rendered\/-1\/2\/0_49_138\.png$/);
    assert.equal(options.mode,'cors');assert.equal(options.credentials,'omit');assert.equal(options.headers,undefined);
    return response();
  });assert.ok(called);assert.equal(blob.size,3);
});
test('CORS failures use the authenticated proxy without changing map context',async()=>{
  let count=0;await evidenceTile(12682,context,async(region,map)=>{count++;assert.equal(region,12682);assert.equal(map.tiles.mapId,-1);return response();},async()=>{throw new TypeError('CORS unavailable');});assert.equal(count,1);
});
test('invalid images and failures leave evidence incomplete with a retryable error',async()=>{
  await assert.rejects(evidenceTile(12682,context,async()=>new Response('',{status:403}),async()=>new Response('<html/>',{headers:{'Content-Type':'text/html'}})),/Browser: Invalid map image type.*Backend: HTTP 403/);
  await assert.rejects(evidenceTile(12682,{...context,tiles:{version:'../invalid',mapId:-1}},()=>response()),/Invalid map version/);
});
