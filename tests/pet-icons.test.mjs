import test from 'node:test';
import assert from 'node:assert/strict';
import Parser from 'wikiparser-node';
import {bossPetCatalog,petItemIds,createPetResolver,canApplyPetLookup} from '../src/core/pet-icons.mjs';

const catalog={title:'Pet',revision:1,text:`[[Unrelated pet]]
===Boss pets===
{| class="wikitable"
! colspan="2" |Pet
!Source
!Drop rate
|-
|{{plinkt|Aggy}}||[[Mad Angel]]{{efn|See [[Unrelated boss]].}}||1/2,000
|-
|{{plinkt|Olmlet}}||{{SCP|raid}} [[Chambers of Xeric]]||1/53
|-
|{{plinkt|One}}||[[Shared boss]] and [[Other boss]]||Rare
|-
|{{plinkt|Two}}||[[Shared boss]]||Rare
|}
===Skilling pets===
{| class="wikitable"
!Pet!!Source
|-
|{{plinkt|Wrong}}||[[Mad Angel]]
|}`};
const pet={title:'Aggy',revision:2,text:'{{Multi Infobox|item1={{Infobox NPC|name=Aggy|id=16333,16334}}|item2={{Infobox Item|name=Aggy|id=34042}}}}'};
test('pet catalog matches source-column links, not skilling tables or footnote links',()=>{
  const result=bossPetCatalog(Parser,catalog);
  assert.equal(result.length,4);
  assert.deepEqual(result[0],{name:'Aggy',sources:['Mad Angel']});
  assert.deepEqual(result[1],{name:'Olmlet',sources:['Chambers of Xeric']});
  assert.throws(()=>bossPetCatalog(Parser,{text:'===Boss pets===\n[[Aggy]]'}),/could not be read/);
});
test('pet lookup uses the inventory ID, never the follower NPC ID',()=>{
  assert.deepEqual(petItemIds(Parser,pet),['34042']);
  assert.deepEqual(petItemIds(Parser,{title:'Aggy',text:'{{Infobox NPC|name=Aggy|id=16333}}'}),[]);
  assert.deepEqual(petItemIds(Parser,{title:'Aggy',text:'{{Infobox Item|id={{unknown}}}}'}),[]);
  assert.deepEqual(petItemIds(Parser,{title:'Aggy',text:'{{Infobox Item|id=1|id=2}}'}),[]);
});
test('multi-variant pets resolve the named base form, with ambiguity left unresolved',()=>{
  const multi={title:'Olmlet',text:'{{Infobox Item|name1=Olmlet|name2=Puppadile|id1=20851|id2=22376}}'};
  assert.deepEqual(petItemIds(Parser,multi),['20851']);
  const ambiguous={title:'Pet',text:'{{Infobox Item|name=Pet|id1=12|id2=13}}'};
  assert.deepEqual(petItemIds(Parser,ambiguous),['12','13']);
  assert.deepEqual(petItemIds(Parser,{...ambiguous,text:ambiguous.text.replace('name=Pet','name=Pet|defver=2')}),['13']);
  assert.deepEqual(petItemIds(Parser,{...ambiguous,text:ambiguous.text.replace('13','bad')}),[]);
});
test('automatic lookup follows exactly one pet page, records provenance, and deduplicates requests',async()=>{
  const calls=[];
  const resolve=createPetResolver({read:async title=>{calls.push(title);return title==='Pet'?catalog:pet;}});
  const [a,b]=await Promise.all([resolve(Parser,'Mad Angel'),resolve(Parser,'Mad_Angel')]);
  assert.equal(a.itemId,'34042');assert.equal(a.name,'Aggy');assert.equal(a.revision,2);
  assert.equal(a.source,'https://oldschool.runescape.wiki/w/Aggy');assert.deepEqual(a,b);
  assert.deepEqual(calls,['Pet','Aggy']);
});
test('missing and multiple pets are not guessed and never trigger a pet-page crawl',async()=>{
  const calls=[];
  const resolve=createPetResolver({read:async title=>{calls.push(title);assert.equal(title,'Pet');return catalog;}});
  assert.equal((await resolve(Parser,'No pet')).status,'not-found');
  assert.equal((await resolve(Parser,'Unrelated boss')).status,'not-found');
  assert.deepEqual(await resolve(Parser,'Shared boss'),{status:'ambiguous',pets:['One','Two']});
  assert.deepEqual(calls,['Pet']);
});
test('failed requests can retry and expired wiki data is fetched again',async()=>{
  let failed=true,time=0,calls=0;
  const resolve=createPetResolver({now:()=>time,ttl:10,read:async title=>{calls++;if(failed){failed=false;throw Error('Offline');}return title==='Pet'?catalog:pet;}});
  await assert.rejects(resolve(Parser,'Mad Angel'),/Offline/);
  assert.equal((await resolve(Parser,'Mad Angel')).itemId,'34042');assert.equal(calls,3);
  time=11;await resolve(Parser,'Mad Angel');assert.equal(calls,5);
});
test('manual edits and existing selections win over a delayed automatic lookup',()=>{
  assert.equal(canApplyPetLookup(0,0,''),true);
  assert.equal(canApplyPetLookup(0,0,'ItemID.MADANGELPET'),false);
  assert.equal(canApplyPetLookup(0,1,''),false);
  assert.equal(canApplyPetLookup(0,0,'123',true),true);
  assert.equal(canApplyPetLookup(0,1,'123',true),false);
});
