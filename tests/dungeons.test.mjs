import test from 'node:test';
import assert from 'node:assert/strict';
import Parser from 'wikiparser-node';
import {extractDungeonCatalog,primaryDungeonMap,retainDungeonLocations} from '../src/core/dungeons.mjs';
import {resolveBossImage,createImageCache} from '../src/core/boss-images.mjs';
import {buildLibrary} from '../src/core/library.mjs';
import {suggestedArenaRegions} from '../src/core/encounter.mjs';
import {applyProposal,validateProposal,PLUGIN_REPO} from '../src/core/proposal.mjs';
import {parseJava,generateEntry} from '../src/core/java.mjs';
import {chunkId,regionOrigin} from '../src/core/coordinates.mjs';
import {cleanChanges,panelSize} from '../src/core/pr-evidence.mjs';
import {cleanPresentation} from '../src/core/pr-presentation.mjs';
import {prepare,submit} from '../worker/pr-service.mjs';
import {MemoryStore,FakeGitHub,env,png,input as bossInput} from './pr-fixtures.mjs';
const catalogPage={title:'List of dungeons',revision:42,text:'Intro [[Dungeon]].\n== Asgarnia ==\n* [[Taverley Dungeon|Taverley]] ([[Asgarnia]])\n* [[Dwarven_Mine]]\n== Other ==\n* [[Taverley Dungeon]]\n* [[Missing-map cave]]\n{{Navbox|list=[[Unrelated place]]}}'};
const dungeon={id:'DUNGEON_TEST_CAVE',name:'Test cave',regionType:'DUNGEONS',deathType:'UNSAFE',regions:[12682],baseRaw:null};
const source=(await import('./pr-fixtures.mjs')).snapshot.source;
const proposal=changes=>({version:1,repository:PLUGIN_REPO,baseCommit:'a'.repeat(40),changes});
const makeInput=changes=>({changes,contexts:Object.fromEntries(changes.map(c=>[c.id,{arena:{x:3179,y:8876,plane:0}}])),sources:Object.fromEntries(changes.map(c=>[c.id,['https://oldschool.runescape.wiki/w/Taverley_Dungeon']]))});
test('dungeon catalog uses actual article targets, geographic headings and unique list entries',()=>{
 const catalog=extractDungeonCatalog(Parser,catalogPage);assert.equal(catalog.revision,42);assert.deepEqual(catalog.dungeons.map(d=>d.name),['Dwarven Mine','Missing-map cave','Taverley Dungeon']);assert.equal(catalog.dungeons[2].area,'Asgarnia');assert.equal(catalog.dungeons[0].regionType,'DUNGEONS');assert.throws(()=>extractDungeonCatalog(Parser,{...catalogPage,text:'No list.'}));
});
test('dungeon images use infobox maps and first map variants, never scenic pictures or entrance icons',()=>{
 const text='[[File:Dungeon map link icon.png]] {{Infobox Location|image=[[File:Scenic.png]]|map2=[[File:Second.png]]|map1=[[File:First.png]]}}';
 assert.equal(primaryDungeonMap(Parser,text),'File:First.png');assert.equal(primaryDungeonMap(Parser,'{{Infobox Location|map=Example map.png}}'),'File:Example map.png');assert.equal(primaryDungeonMap(Parser,'[[File:Dungeon map link icon.png]] {{Infobox Location|image=[[File:Scenic.png]]}}'),null);
});
test('dungeon map resolution retains redirected article, real image dimensions and file attribution',async()=>{
 let requested;const image=await resolveBossImage(Parser,'Old title',async params=>{requested=params;return {query:{pages:[{imageinfo:[{url:'https://oldschool.runescape.wiki/images/map.png',width:1200,height:900,thumburl:'https://oldschool.runescape.wiki/images/thumb/map.png',thumbwidth:960,thumbheight:720,descriptionurl:'https://oldschool.runescape.wiki/w/File:Map.png'}]}]}};},async()=>({title:'Canonical dungeon',text:'{{Infobox Location|map=[[File:Map.png]]}}'}),false,primaryDungeonMap);
 assert.equal(requested.titles,'File:Map.png');assert.equal(requested.redirects,'1');assert.equal(image.width,960);assert.match(image.source,/Canonical_dungeon/);assert.match(image.filePage,/File:Map.png/);
});
test('dungeon maps have an isolated cache, with deduplication and stale-image fallback',async()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};let count=0,now=0;
 const cache=createImageCache({storage,storageKey:'maps',now:()=>now,resolve:async()=>{count++;return {url:'map',filePage:'file'};}});
 await Promise.all([cache.get('Cave'),cache.get('Cave')]);assert.equal(count,1);assert.ok(values.has('maps'));assert.equal(values.size,1);
 now=8*86400000;const stale=createImageCache({storage,storageKey:'maps',now:()=>now,resolve:async()=>{throw Error('Offline');}});assert.equal((await stale.get('Cave')).url,'map');
});
test('known dungeon aliases reconcile to existing entries without changing boss support',()=>{
 const candidate=extractDungeonCatalog(Parser,{...catalogPage,text:'== Asgarnia ==\n* [[Asgarnian Ice Dungeon]]'}).dungeons[0];
 const entry=parseJava(source).entries.find(e=>e.id==='DUNGEON_ASGARNIAN_ICE_CAVES');const rows=buildLibrary([candidate],[],[entry],{});assert.equal(rows.length,1);assert.equal(rows[0].id,entry.id);assert.equal(rows[0].wikiTitle,candidate.wikiTitle);assert.equal(rows[0].raw,entry.raw);
 const shared=buildLibrary([{...candidate,id:'DUNGEON_SHARED',name:'Shared',wikiTitle:'Shared'}],[],[{...entry,id:'BOSS_SHARED',name:'Shared',wikiTitle:'Shared',regionType:'BOSSES'}],{}).find(r=>r.id==='DUNGEON_SHARED');assert.equal(shared.raw,null);assert.equal(shared.supportedBy[0].id,'BOSS_SHARED');
});
test('new dungeons require explicit coverage, even when wiki coordinates look like a cave',()=>{
 assert.deepEqual(suggestedArenaRegions({...dungeon,raw:null,regions:[],maps:[{role:'location',title:'Test cave',region:12682}],optionalArgs:[]}),[]);
});
test('dungeon Java uses the region-only and list constructors, preserving unrelated source',()=>{
 const p=regionOrigin(12682),change={...dungeon,chunks:[chunkId(p.x,p.y)]};const after=applyProposal(source,proposal([change]));const parsed=parseJava(after);const added=parsed.entries.find(e=>e.id===change.id);assert.equal(added.regionType,'DUNGEONS');assert.deepEqual(added.optionalArgs,[`List.of(${change.chunks[0]})`]);assert.doesNotMatch(added.raw,/Entrance|null/);for(const e of parseJava(source).entries)assert.equal(parsed.entries.find(n=>n.id===e.id).raw,e.raw);
 const existing=parseJava(source).entries.find(e=>e.id==='DUNGEON_TAVERLEY');assert.ok(existing);const updated={...existing,baseRaw:existing.raw,regions:[...existing.regions,12682]};assert.match(applyProposal(source,proposal([updated])),/DUNGEON_TAVERLEY/);assert.equal(parseJava(applyProposal(source,proposal([updated]))).entries.find(e=>e.id===existing.id).deathType,existing.deathType);
});
test('dungeon proposals reject entrances, category mismatches and invalid chunk coverage',()=>{
 for(const patch of [{entrance:{}},{entranceOverlay:'DEPRIORITIZED_WITH_HIGHLIGHT'},{regionType:'BOSSES'},{id:'BOSS_TEST_CAVE'},{chunks:[1]}])assert.throws(()=>validateProposal(proposal([{...dungeon,...patch}])));
 assert.throws(()=>generateEntry({...dungeon,entrance:{}}));assert.throws(()=>cleanPresentation([dungeon],{[dungeon.id]:{images:['123']}}));assert.equal(cleanChanges([dungeon])[0].regionType,'DUNGEONS');
});
test('single dungeon PR has coverage screenshots, wiki links, correct title and no entrance settings',async()=>{
 const gh=new FakeGitHub(),store=new MemoryStore(),preview=await prepare(makeInput([dungeon]),'1',gh,store,env);
 assert.equal(preview.title,'feat(dungeon): add Test cave');assert.match(preview.introduction,/Test cave/);assert.equal(preview.evidence.panels.length,1);assert.equal(preview.evidence.panels[0].label,'Dungeon coverage');assert.doesNotMatch(preview.body,/Entrance:|Arena regions|model references/);assert.match(preview.body,/Dungeon regions/);assert.match(preview.body,/Taverley_Dungeon/);
 const submitted=await submit(preview.id,{title:preview.title,introduction:preview.introduction,images:preview.evidence.panels.map(p=>({id:p.id,png:png(panelSize(p).width,panelSize(p).height)}))},'1','contributor',gh,store);assert.equal(submitted.status,'complete');assert.match(gh.prs[0].body,/raw.githubusercontent.com/);assert.doesNotMatch(gh.prs[0].body,/Entrance:/);
});
test('mixed dungeon and boss PRs preserve each category',async()=>{
 const preview=await prepare(makeInput([dungeon,...bossInput.changes]),'1',new FakeGitHub(),new MemoryStore(),env);assert.match(preview.title,/feat\(encounter\)/);assert.match(preview.patch,/RegionType.DUNGEONS/);assert.match(preview.patch,/RegionType.BOSSES/);assert.equal(preview.evidence.panels.length,2);
});

test('refresh retains location enrichment while advancing dungeon catalog metadata',()=>{
 const prior={wikiTitle:'Cave',catalogRevision:1,maps:[{region:42}],locationsLoaded:true};const next=retainDungeonLocations([{wikiTitle:'Cave',catalogRevision:2,area:'New area'}],[prior])[0];assert.equal(next.catalogRevision,2);assert.equal(next.area,'New area');assert.deepEqual(next.maps,prior.maps);assert.equal(next.locationsLoaded,true);
 assert.equal(primaryDungeonMap(Parser,'<!-- [[File:Wrong map.png]] --> [[File:Actual_map.png]]'),'File:Actual map.png');
});
