import test from 'node:test';
import assert from 'node:assert/strict';
import Parser from 'wikiparser-node';
import {entranceArenaFallback,entranceNotificationDefault,hasAreaSelection,locationAreaChange} from '../src/core/location-defaults.mjs';
import {extractWiki} from '../src/core/wiki.mjs';
import {outlineCoverage} from '../src/core/map-outline.mjs';
import {exportCoverage} from '../src/core/java.mjs';
import {cowFieldMap} from './fixtures/cow-field.mjs';

const location=extractWiki(Parser,{title:'Lumbridge cow field',revision:15156602,text:cowFieldMap}).maps[0];
const boss={name:'Brutus',maps:[location],regions:[],optionalArgs:[]};
const blank={regions:[],deathType:'UNSAFE',entranceOverlay:'PRIORITIZED_WITH_HIGHLIGHT'};

test('unfinished entrances inherit notification chunks despite a saved entrance region',()=>{
  const draft={...blank,...outlineCoverage(location.outline),entranceRegion:location.region,entrance:{ids:[],chunks:[]}};
  const fallback=entranceArenaFallback(boss,draft,location);
  const change=entranceNotificationDefault(boss,draft,fallback);
  assert.deepEqual(change.entranceNotifyChunks,draft.chunks);
  assert.equal(change.entrance,undefined);
  for(const entranceNotifyChunks of [[],[draft.chunks[0]]])assert.equal(entranceNotificationDefault(boss,{...draft,entranceNotifyChunks},fallback),null);
  assert.equal(entranceNotificationDefault(boss,{...draft,entrance:{ids:['123'],chunks:[]}},fallback),null);
  assert.equal(entranceNotificationDefault(boss,{...draft,entranceRegion:12582},fallback),null);
  assert.equal(entranceNotificationDefault({...boss,entranceEntry:{optionalArgs:['new EscapeCrystalNotifyRegionEntrance(...)']}},draft,fallback),null);
});

test('outline selection produces full arena coverage without configuring an entrance',()=>{
  const coverage=outlineCoverage(location.outline);
  const change=locationAreaChange(boss,blank,location,false,coverage);
  assert.equal(change.chunks.length,25);assert.equal(change.regions.length,4);assert.equal(change.entrance,undefined);
  assert.equal(hasAreaSelection(boss,blank,false),false);
  assert.equal(hasAreaSelection(boss,{...blank,...change},false),true);
  assert.equal(locationAreaChange(boss,blank,{...location,outline:undefined},false,null),null);
});

test('missing entrance defaults to the selected arena chunks, including manual edits',()=>{
  const coverage=outlineCoverage(location.outline),draft={...blank,...coverage,chunks:coverage.chunks.slice(1)};
  const fallback=entranceArenaFallback(boss,draft,location);
  assert.deepEqual(fallback.coverage.chunks,draft.chunks);
  assert.equal(fallback.location.source,location.source);
  const change=locationAreaChange(boss,draft,fallback.location,true,fallback.coverage);
  assert.deepEqual(change.entranceNotifyChunks,draft.chunks);assert.equal(change.entrance,undefined);
  assert.equal(change.entrancePlane,0);assert.equal(change.regions,undefined);
  assert.deepEqual(fallback.coverage.regions,draft.regions);
});

test('region-only arena defaults work without wiki coordinates, including multiple regions',()=>{
  const fallback=entranceArenaFallback(boss,{...blank,regions:[12850]},undefined);
  assert.equal(fallback.location.region,12850);assert.deepEqual(fallback.coverage.chunks,[]);
  const change=locationAreaChange(boss,blank,fallback.location,true,fallback.coverage);
  assert.equal(change.entranceRegion,12850);assert.equal(change.entrance,undefined);
  const multiple=entranceArenaFallback(boss,{...blank,regions:[12850,12851]},undefined);
  assert.equal(multiple.coverage.chunks.length,128);
  assert.deepEqual(multiple.coverage.regions,[12850,12851]);
});

test('known entrances take precedence and saved or custom areas suppress initialization',()=>{
  const draft={...blank,...outlineCoverage(location.outline)};
  assert.equal(entranceArenaFallback({...boss,maps:[{...location,role:'entrance'}]},draft,location),null);
  assert.equal(entranceArenaFallback(boss,blank,location),null);
  assert.equal(hasAreaSelection(boss,{...draft,entranceRegion:12850},true),true);
  assert.equal(hasAreaSelection(boss,{...draft,entrance:{chunks:[],ids:['1']}},true),true);
  const existing={...boss,optionalArgs:['new EscapeCrystalNotifyRegionEntrance(...)']};
  assert.equal(hasAreaSelection(existing,draft,true),true);
  assert.equal(locationAreaChange(existing,draft,location,true,outlineCoverage(location.outline)).entrance,undefined);
});

test('choosing a new entrance outline preserves IDs and interaction settings',()=>{
  const draft={...blank,entrance:{ids:['123'],objectType:'NPC',overlay:'PRIORITIZED_WITH_HIGHLIGHT',direction:'NORTH',plane:'FIRST',chunks:[]}};
  const change=locationAreaChange(boss,draft,location,true,outlineCoverage(location.outline));
  assert.equal(change.entranceNotifyChunks.length,25); assert.equal(change.entrance,undefined);
  assert.deepEqual({...draft,...change}.entrance,draft.entrance);
});
