import test from 'node:test';
import assert from 'node:assert/strict';
import {regionTileUrl, wikiRegionTileUrl, chunkOrigin, regionId} from '../src/core/coordinates.mjs';
import {evidenceTile} from '../src/core/evidence-tiles.mjs';

test('Explv tile origin matches the upstream viewer projection on every plane',()=>{
  // Independent projection from Explv's Position.js at maximum zoom 11,
  // converted to the zoom-8 TMS grid used by the image helper.
  for(const plane of [0,1,2,3])for(const id of [11851,11850,12106,12363,12362,12582,12682,12850]) {
    const worldX=(id>>8)*64+32, worldY=(id&255)*64+32;
    const pixelX=((worldX-(1024-64))*32)+8;
    const pixelY=364544-((worldY-6208)*32);
    const tileX=Math.floor(pixelX/8/256), tileY=255-Math.floor(pixelY/8/256);
    assert.equal(regionTileUrl(id,plane),`https://raw.githubusercontent.com/Explv/osrs_map_tiles/master/${plane}/8/${tileX}/${tileY}.png`);
  }
});

test('Abyssal Sire imagery uses each actual region instead of its western neighbour',()=>{
  const expected=new Map([[11851,'31/56'],[11850,'31/55'],[12106,'32/55'],[12363,'33/56'],[12362,'33/55']]);
  for(const [region,path] of expected)assert.ok(regionTileUrl(region).endsWith(`/0/8/${path}.png`));
  // The four entrance chunks already identify the central Nexus region.
  for(const chunk of [774740,774742,780884,780886]) {
    const point=chunkOrigin(chunk);
    assert.equal(regionId(point.x,point.y),12106);
    assert.ok(regionTileUrl(regionId(point.x,point.y)).endsWith('/0/8/32/55.png'));
  }
});

test('export evidence uses the corrected shared legacy URL',async()=>{
  const fetched=[];
  await evidenceTile(12106,{x:3040,y:4768,plane:0},()=>assert.fail('Proxy should not be needed'),async url=>{
    fetched.push(url);
    return new Response(new Uint8Array([1]),{headers:{'content-type':'image/png'}});
  });
  assert.deepEqual(fetched,['https://raw.githubusercontent.com/Explv/osrs_map_tiles/master/0/8/32/55.png']);
});

test('wiki tiles keep world-region coordinates and legacy inputs remain validated',()=>{
  assert.equal(wikiRegionTileUrl(12106,{version:'2026-08-12_a',mapId:-1,plane:0}), 'https://maps.runescape.wiki/osrs/versions/2026-08-12_a/tiles/rendered/-1/2/0_47_74.png');
  assert.throws(()=>regionTileUrl(-1),/Region ID/);
  assert.throws(()=>regionTileUrl(12106,4),/Plane/);
});
