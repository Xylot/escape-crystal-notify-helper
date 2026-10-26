import test from 'node:test';
import assert from 'node:assert/strict';
import Parser from 'wikiparser-node';
import {readFile} from 'node:fs/promises';
import {extractBossCatalog,reconcileCatalog,supportFor} from '../src/core/catalog.mjs';
import {buildLibrary,createLibraryResolver,encounterExclusion} from '../src/core/library.mjs';
const page=text=>({text,title:'Boss',revision:123});

test('bundled snapshot exposes The Fractured Archive as a raid needing coverage',async()=>{
  const snapshot=JSON.parse(await readFile(new URL('../public/data/snapshot.json',import.meta.url),'utf8'));
  const raid=buildLibrary(snapshot.candidates,[],snapshot.entries,{}).find(b=>b.wikiTitle==='The Fractured Archive');
  assert.ok(raid);
  assert.equal(raid.regionType,'RAIDS');
  assert.ok(raid.categories.includes('Raids'));
  assert.equal(raid.raw,null);
  assert.deepEqual(raid.supportedBy,[]);
});

test('cached catalog matching preserves draft pairing behavior without rebuilding unchanged bosses',()=>{
  const candidates=[{id:'BOSS_TEST',name:'Test',wikiTitle:'Test',maps:[]},{id:'BOSS_NEW',name:'New',wikiTitle:'New',maps:[]}];
  const entries=[{id:'BOSS_TEST',name:'Test',regionType:'BOSSES',raw:'boss source',optionalArgs:[]},
    {id:'BOSS_TEST_ENTRANCE',name:'Test entrance',regionType:'BOSSES',raw:'entrance source',optionalArgs:['new EscapeCrystalNotifyRegionEntrance(...)']}];
  const resolve=createLibraryResolver(candidates,[],entries);
  const original=resolve({});
  const newBoss=original.find(b=>b.id==='BOSS_NEW');
  for(const drafts of [{BOSS_NEW:{id:'BOSS_NEW',name:'New',entranceDangerous:true}},
    {BOSS_NEW:{id:'BOSS_NEW',name:'New',entranceDangerous:false}},
    {BOSS_TEST_ENTRANCE:{id:'BOSS_TEST_ENTRANCE',name:'Test entrance'}},
    {BOSS_TEST:{id:'BOSS_TEST',name:'Test',baseRaw:'boss source'}},{}]){
    const actual=resolve(drafts);
    assert.deepEqual(actual,buildLibrary(candidates,[],entries,drafts));
    assert.equal(actual.find(b=>b.id==='BOSS_NEW'),newBoss);
  }
  assert.ok(original.find(b=>b.id==='BOSS_TEST').entranceEntry);
  assert.equal(entries[0].entranceEntry,undefined);
});
test('unneeded encounters stay excluded across catalog refreshes, imports, entries and saved drafts',()=>{
  const names=['Callisto','Chaos Elemental','Chaos Fanatic','Scorpia','Venenatis',"Vet'ion",'Revenant maledictus','Gemstone Crab','Tempoross',"Phosani's Nightmare"];
  const excluded=names.map((name,i)=>({id:`TEST_${i}`,name,wikiTitle:name,regionType:'BOSSES'}));
  const keep=['Artio','Spindel','Calvar’ion','The Nightmare','Maggot King'].map(name=>({id:name,name,wikiTitle:name}));
  const drafts=Object.fromEntries(excluded.map(b=>[b.id,{...b,baseRaw:null}]));
  const before=JSON.stringify(drafts);
  for(const rows of [buildLibrary([...excluded,...keep],[],[],{}),buildLibrary(keep,excluded,[],{}),buildLibrary(keep,[],excluded,{}),buildLibrary(keep,[],[],drafts)])assert.deepEqual(new Set(rows.map(b=>b.name)),new Set(keep.map(b=>b.name)));
  assert.equal(JSON.stringify(drafts),before);
  assert.ok(encounterExclusion({name:'PHOSANI’S_NIGHTMARE'}));
  assert.ok(encounterExclusion({name:'A renamed import',wikiTitle:'Revenant_maledictus'}));
  assert.ok(encounterExclusion({id:'BOSS_CHAOS_ELEMENTAL',name:'Old label'}));
});
test('Boss column with colspan, multiple bosses, raid sections and missing locations',()=>{
  const data=extractBossCatalog(Parser,page(`==List of bosses==
===World bosses===
{| class="wikitable"
!colspan=2|Boss
!Location
!Drops
|-
|[[Alpha|Alpha boss]] & [[Beta]]
|[[File:Alpha.png]]
|[[Cave]]
|[[Not a boss]]
|-
|[[Gamma]]
|[[File:Gamma.png]]
|Unknown
|[[Loot]]
|}
===Raids===
====Chambers of Xeric====
{|
!colspan=2|Boss
!Mechanics
|-
|[[Tekton]]
|[[File:Tekton.png]]
|[[Magic]]
|}`));
  assert.deepEqual(data.bosses.map(b=>b.name),['Alpha','Beta','Chambers of Xeric','Gamma','Tekton']);
  assert.deepEqual(data.bosses[0].locationTitles,['Cave']);
  assert.deepEqual(data.bosses[3].locationTitles,[]);
  assert.deepEqual(data.bosses[4].locationTitles,['Chambers of Xeric']);
});

test('new raids are discoverable and authorable without plugin support',()=>{
  const catalog=extractBossCatalog(Parser,page(`===Raids===
====The Fractured Archive====
{|
!Boss
|-
|[[Archive Guardian]]
|}
=====Final encounter=====
{|
!Boss
|-
|[[Final guardian]]
|}
===World bosses===
{|
!Boss
|-
|[[Unrelated boss]]
|}`));
  const library=buildLibrary(catalog.bosses,[],entries,{});
  const raid=library.find(b=>b.name==='The Fractured Archive');
  assert.equal(raid.id,'RAIDS_THE_FRACTURED_ARCHIVE');
  assert.equal(raid.regionType,'RAIDS');
  assert.deepEqual(raid.categories,['Raids']);
  assert.deepEqual(raid.supportedBy,[]);
  assert.equal(raid.raw,null);
  for(const name of ['Archive Guardian','Final guardian']){
    assert.equal(catalog.bosses.find(b=>b.name===name).raidTitle,'The Fractured Archive');
    assert.equal(library.find(b=>b.name===name),undefined);
  }
  assert.deepEqual(library.find(b=>b.name==='Unrelated boss').locationTitles,[]);
  const supported=buildLibrary(catalog.bosses,[],[...entries,{...raid,raw:'raid source',regions:[1234]}],{}).filter(b=>b.id===raid.id);
  assert.equal(supported.length,1);
  assert.equal(supported[0].raw,'raid source');
  assert.ok(supported[0].categories.includes('Raids'));
});

test('raid members stay hidden across cached catalogs, imports, source entries and drafts',()=>{
  const raid={id:'RAIDS_FUTURE',name:'Future raid',wikiTitle:'Future raid',regionType:'RAIDS',categories:['World bosses','Raids']};
  const member={id:'BOSS_RAID_GUARDIAN',name:'Raid guardian',wikiTitle:'Raid guardian',categories:['Future raid','Quest bosses']};
  const unrelated={id:'BOSS_OUTSIDE',name:'Outside boss',wikiTitle:'Outside boss',categories:['World bosses'],locationTitles:['Future raid']};
  const drafts={[member.id]:{...member,baseRaw:null}};
  const before=JSON.stringify(drafts);
  const library=buildLibrary([raid,member,unrelated],[{...member,categories:[]}],[{...member,regionType:'BOSSES',raw:'source'}],drafts);
  assert.deepEqual(library.map(b=>b.name),['Future raid','Outside boss']);
  assert.deepEqual(library.find(b=>b.id===raid.id).categories,['Raids']);
  assert.equal(JSON.stringify(drafts),before);
});

test('legacy snapshot raid bosses are hidden without needing a wiki refresh',async()=>{
  const snapshot=JSON.parse(await readFile(new URL('../public/data/snapshot.json',import.meta.url),'utf8'));
  const library=buildLibrary(snapshot.candidates,[],snapshot.entries,{});
  for(const name of ['Tekton','Akkha','Verzik Vitur'])assert.equal(library.find(b=>b.name===name),undefined);
  for(const name of ['Chambers of Xeric','Theatre of Blood','Tombs of Amascut','The Fractured Archive'])assert.ok(library.find(b=>b.name===name)?.categories.includes('Raids'));
});

test('imported raids and saved raid drafts remain in the Raids collection',()=>{
  const raid={id:'RAIDS_NEW',name:'New raid',wikiTitle:'New raid',regionType:'RAIDS',categories:[]};
  assert.deepEqual(buildLibrary([], [raid], [], {})[0].categories,['Raids']);
  assert.deepEqual(buildLibrary([], [], [], {[raid.id]:raid})[0].categories,['Raids']);
});
test('quest lists include boss subjects, nested variants, and multiple-boss quests',()=>{
  const data=extractBossCatalog(Parser,page(`==Quest bosses==
*The [[Alpha]] is fought during [[Quest One]].
**Its [[Alpha (ghost)|ghost]] appears in [[Quest Two]].
===Quests with multiple bosses===
*[[Quest Three]] has two bosses: [[Beta]] and [[Gamma]].
*The [[Recipe for Disaster]] quest ends at [[Recipe for Disaster#Final|a subquest]]. Six bosses must be defeated: [[Culinaromancer]] and [[Flambeed]].
==Boss slayer==
{|
!Boss
|-
|[[Barrows brothers]] (not [[Barrows chest|chests]])
|}`));
  assert.deepEqual(data.bosses.map(b=>b.name),['Alpha','Alpha (ghost)','Beta','Culinaromancer','Flambeed','Gamma']);
});
test('duplicates retain all categories and fail closed if page layout is unrecognized',()=>{
  const data=extractBossCatalog(Parser,page('==Quest bosses==\n*[[Alpha]] is a boss.\n*[[Alpha]] appears again.'));
  assert.equal(data.bosses.length,1);assert.throws(()=>extractBossCatalog(Parser,page('[[Alpha]] unrelated prose.')),/No boss/);
});
const entries=[{id:'BOSS_BARROWS',name:'Barrows',regionType:'BOSSES',raw:'source',regions:[14131],optionalArgs:[],deathType:'UNSAFE'},{id:'RAIDS_CHAMBERS_OF_XERIC',name:'Chambers of Xeric',regionType:'RAIDS',raw:'raid',regions:[12889],optionalArgs:[],deathType:'UNSAFE'}];
test('grouped boss support and raids use membership, not shared geography',()=>{
  assert.equal(supportFor({name:'Ahrim the Blighted'},entries)[0].id,'BOSS_BARROWS');
  assert.equal(supportFor({name:'Tekton'},entries)[0].id,'RAIDS_CHAMBERS_OF_XERIC');
  assert.equal(supportFor({name:'Unknown boss',locationTitles:['Barrows']},entries).length,0);
  assert.equal(supportFor({name:'Barrows'},[{...entries[0],id:'BOSS_BARROWS_ENTRANCE'}]).length,0);
});
test('support changes immediately when plugin source changes and missing maps stay listed',()=>{
  const bosses=extractBossCatalog(Parser,page('==Quest bosses==\n*[[Ahrim the Blighted]]\n*[[Unknown boss]]')).bosses;
  assert.equal(reconcileCatalog(bosses,entries).filter(b=>!b.supportedBy.length).length,1);
  assert.equal(reconcileCatalog(bosses,[]).filter(b=>!b.supportedBy.length).length,2);
  const library=buildLibrary(bosses,[],entries,{});assert.ok(library.some(b=>b.name==='Unknown boss'&&!b.maps.length));
  assert.equal(library.find(b=>b.name==='Ahrim the Blighted').raw,null);
});
