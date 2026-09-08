import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeRenderedMaps,wikiRegionTileUrl} from '../src/core/rendered-maps.mjs';
import Parser from 'wikiparser-node';
import {extractWiki} from '../src/core/wiki.mjs';
import {cowFieldMap} from './fixtures/cow-field.mjs';
const base={x:3176,y:2477,region:12582,plane:null,mapId:null,role:'entrance',caption:'The entrance to the cave.',source:'https://oldschool.runescape.wiki/w/Shellbane_gryphon',title:'Shellbane gryphon',revision:1,verified:false};
const page={source:base.source,title:base.title,revision:1};
const rendered={text:{'*':'<a class="mw-kartographer-map" data-lon="3176" data-lat="2477" data-mapid="0" data-plane="0" data-zoom="1" style="background-image:url(https://maps.runescape.wiki/osrs/versions/2026-08-12_a/tiles/rendered/0/1/0_24_19.png)"></a>'},jsconfigvars:{wgKartographerLiveData:{pins:[{type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[3176.5,2477.5]},properties:{mapID:0,plane:0,icon:'redPin'}}]}]}}};
test('rendered marker retains exact half-tile anchor, icon, map version and source caption',()=>{
 const [map]=mergeRenderedMaps([base],rendered,page);assert.equal(map.x,3176);assert.equal(map.pinX,3176.5);assert.equal(map.pinY,2477.5);assert.equal(map.icon,'redPin');assert.equal(map.markerSource,'rendered');assert.equal(map.caption,base.caption);assert.equal(map.tiles.version,'2026-08-12_a');assert.equal(map.plane,0);
});
test('rendered tile URL uses wiki world coordinates without legacy offsets',()=>{
 assert.equal(wikiRegionTileUrl(12582,{version:'2026-08-12_a',mapId:0,plane:0}),'https://maps.runescape.wiki/osrs/versions/2026-08-12_a/tiles/rendered/0/2/0_49_38.png');
 assert.equal(wikiRegionTileUrl(12682,{version:'2026-08-12_a',mapId:-1,plane:0}),'https://maps.runescape.wiki/osrs/versions/2026-08-12_a/tiles/rendered/-1/2/0_49_138.png');
 assert.throws(()=>wikiRegionTileUrl(12582,{version:'../../bad',mapId:0,plane:0}));
});
test('a rendered point distinct from viewport center is retained independently',()=>{
 const other=structuredClone(rendered);other.jsconfigvars.wgKartographerLiveData.pins[0].features[0].geometry.coordinates=[3180.5,2480.5];
 const maps=mergeRenderedMaps([base],other,page);assert.equal(maps.length,2);assert.equal(maps[1].pinX,3180.5);assert.equal(maps[0].pinX,undefined);
});
test('missing metadata preserves template locations and ignores non-pin point features',()=>{
 assert.deepEqual(mergeRenderedMaps([base],{},page),[base]);const other=structuredClone(rendered);other.jsconfigvars.wgKartographerLiveData.pins[0].features[0].properties.icon='not-a-pin';assert.equal(mergeRenderedMaps([base],other,page)[0].pinX,undefined);
});

test('polygon rendering merges one outline with its map metadata without adding viewport locations',()=>{
 const template=extractWiki(Parser,{title:'Lumbridge cow field',revision:15156602,text:cowFieldMap}).maps[0];
 const data={text:{'*':'<a class="mw-kartographer-map" data-lon="3253.5" data-lat="3277.5" data-mapid="0" data-plane="0" data-zoom="1" style="background-image:url(https://maps.runescape.wiki/osrs/versions/2026-08-12_a/tiles/rendered/0/1/0_25_25.png)"></a>'},jsconfigvars:{wgKartographerLiveData:{areas:[{features:[{geometry:{type:'Polygon',coordinates:template.outline},properties:{mapID:0,plane:0}}]}]}}};
 const [map,...extra]=mergeRenderedMaps([template],data,page);
 assert.equal(extra.length,0);assert.equal(map.tiles.version,'2026-08-12_a');assert.equal(map.plane,0);assert.equal(map.mapId,'0');assert.deepEqual(map.outline,template.outline);
 const fallback=mergeRenderedMaps([],data,{source:template.source,title:template.title,revision:template.revision});
 assert.equal(fallback.length,1);assert.deepEqual(fallback[0].outline,template.outline);
 const withoutGeometry=structuredClone(data);delete withoutGeometry.jsconfigvars;
 assert.equal(mergeRenderedMaps([template],withoutGeometry,page).length,1);
});

test('pins sharing an outline center and polygons sharing bounds remain separate',()=>{
 const outline=[[[3175,2476],[3177,2476],[3177,2478],[3175,2478],[3175,2476]]];
 const template={...base,outline,mtype:'polygon',role:'location'};
 const maps=mergeRenderedMaps([template],rendered,page);
 assert.equal(maps.length,2);assert.equal(maps[0].mtype,'polygon');assert.equal(maps[1].mtype,'pin');
 const different=structuredClone(rendered);different.jsconfigvars.wgKartographerLiveData.pins[0].features=[{geometry:{type:'Polygon',coordinates:[[[3175,2476],[3177,2476],[3177,2478],[3175,2476]]]},properties:{mapID:0,plane:0}}];
 assert.equal(mergeRenderedMaps([template],different,page).filter(m=>m.outline).length,2);
});
