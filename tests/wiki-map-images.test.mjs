import test from 'node:test';
import assert from 'node:assert/strict';
import Parser from 'wikiparser-node';
import {wikiMapImage} from '../src/core/wiki-map-images.mjs';
import {resolveDungeonImage} from '../src/core/dungeons.mjs';
const url='https://maps.runescape.wiki/osrs/versions/2026-08-12_a/tiles/rendered/-1/2/1_54_46.png';
const page={title:'Test dungeon',revision:123,text:'{{Infobox Location|image=[[File:Scenery.png]]|map={{Map|x=3508|y=2971}}}}'};
const frame=(tile=url)=>({text:{'*':`<a class="mw-kartographer-map" data-width="300" data-height="240" data-plane="1" style="background-image: url(${tile}), url(${tile.replace('54_46','55_46')}); background-position: -58px 2px, 198px 2px; background-repeat: no-repeat"></a>`}});
const source='https://oldschool.runescape.wiki/w/Test_dungeon';
test('wiki map thumbnails retain exact tiles, offsets, plane, layer, dimensions and revision',()=>{
 const image=wikiMapImage(frame(),{source,revision:123});assert.equal(image.kind,'wiki-map');assert.equal(image.width,300);assert.equal(image.height,240);assert.equal(image.map.tiles[0].url,url);assert.equal(image.map.tiles[0].x,-58);assert.equal(image.map.tiles[1].x,198);assert.match(image.filePage,/oldid=123/);
});
test('interactive map is used when no static dungeon map exists; scenic images are ignored',async()=>{
 const calls=[];const image=await resolveDungeonImage(Parser,'Old title',async p=>{calls.push(p);return {parse:frame()};},async()=>page);assert.equal(image.kind,'wiki-map');assert.equal(calls.length,1);assert.equal(calls[0].action,'parse');assert.equal(calls[0].oldid,'123');assert.equal(image.source,source);
});
test('static maps take precedence and do not request interactive map markup',async()=>{
 let calls=0;const image=await resolveDungeonImage(Parser,'Dungeon',async p=>{calls++;assert.equal(p.prop,'imageinfo');return {query:{pages:[{imageinfo:[{url:'https://example.test/map.png',descriptionurl:'https://example.test/File:Map.png',width:400,height:300}]}]}};},async()=>({...page,text:'{{Infobox Location|map=[[File:Map.png]]}}'}));assert.equal(calls,1);assert.equal(image.map,undefined);
});
test('missing static file uses the wiki widget, while absent or failed maps remain unavailable',async()=>{
 const read=async()=>({...page,text:'{{Infobox Location|map=[[File:Missing.png]]}}'});
 const image=await resolveDungeonImage(Parser,'Dungeon',async p=>p.action==='query'?{query:{pages:[{}]}}:{parse:frame()},read);assert.equal(image.kind,'wiki-map');
 assert.equal(await resolveDungeonImage(Parser,'Dungeon',async()=>({parse:{}}),async()=>page),null);
 await assert.rejects(resolveDungeonImage(Parser,'Dungeon',async()=>{throw Error('Offline');},async()=>page),/Offline/);
});
test('untrusted URLs, mismatched offsets, excessive dimensions and absent maps are rejected',()=>{
 assert.equal(wikiMapImage(frame('https://example.test/map.png'),{source}),null);
 const huge=frame();huge.text['*']=huge.text['*'].replace('data-width="300"','data-width="99999"');assert.equal(wikiMapImage(huge,{source}),null);
 const bad=frame();bad.text['*']=bad.text['*'].replace('-58px 2px, 198px 2px','center');assert.equal(wikiMapImage(bad,{source}),null);
 assert.equal(wikiMapImage({text:{'*':'No map'}},{source}),null);
});
import {trackMapTiles} from '../src/core/map-image-loading.mjs';
test('Brimstail-style sparse map keeps terrain when surrounding empty tiles fail first or last',()=>{
 for(const order of [['empty','terrain','edge'],['terrain','edge','empty']]){
  let hidden=0;const settle=trackMapTiles(order,()=>hidden++);
  for(const url of order)settle(url,url==='terrain');
  assert.equal(hidden,0);
 }
});
test('map falls back only after every unique tile fails, and only reports once',()=>{
 let hidden=0;const settle=trackMapTiles(['a','b','a'],()=>hidden++);
 settle('a',false);settle('a',false);settle('unrelated',false);assert.equal(hidden,0);
 settle('b',false);assert.equal(hidden,1);settle('b',false);assert.equal(hidden,1);
});
