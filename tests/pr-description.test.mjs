import test from 'node:test';
import assert from 'node:assert/strict';
import {stateBody} from '../worker/pr-description.mjs';
import {cleanPresentation} from '../src/core/pr-presentation.mjs';
import {itemIconName} from '../src/core/item-icon.mjs';
test('description orders readable settings and images before collapsed IDs',()=>{
  const c={id:'BOSS_BRUTUS',name:'Brutus',regions:[13107],chunks:[1],deathType:'UNSAFE_HCGIM',recommendedSeconds:5,petIcon:'ItemID.COWBOSSPET',bossInstanced:true,entranceDangerous:false,entrance:{ids:['123'],chunks:[1],objectType:'NPC',overlay:'DEPRIORITIZED_WITH_HIGHLIGHT'}};
  const record={presentation:{[c.id]:{images:['100']}},evidence:{panels:[{id:'map',bossId:c.id,kind:'arena'}],sources:{[c.id]:['https://oldschool.runescape.wiki/w/Brutus']}}};
  const body=stateBody(record,c,{map:'https://example.com/map.png'});
  const ordered=['Encounter name:','Dangerous for: HCGIM only','Recommended inactivity time: 5','Entrance priority: Deprioritized','Entrance dangerous: No','Boss instanced: Yes','### Pet','### Entrance Model','### Region & Chunk screenshots','<summary>IDs and technical details</summary>'];
  let previous=-1;for(const text of ordered){const at=body.indexOf(text);assert.ok(at>previous,text);previous=at;}
  assert.match(body,/https:\/\/static.runelite.net\/cache\/item\/icon\/33124.png/);
  assert.ok(body.indexOf('Entrance IDs:')>body.indexOf('<summary>IDs'));
  assert.match(body,/ID 33124/);
  assert.match(body,/### Pet: Beef/);
  const numeric=stateBody(record,{...c,petIcon:'27352'},{});
  assert.match(numeric,/icon\/27352.png/);
  const orion=stateBody(record,{...c,petIcon:'34646'},{});
  assert.match(orion,/### Pet: Orion/);
  assert.match(orion,/icon\/34646.png/);
  assert.doesNotMatch(orion,/Pet: Unknown/);
});

test('future wiki pet names and provenance are frozen in reviews and PR descriptions',()=>{
  const c={id:'RAIDS_FUTURE',name:'Future raid',regionType:'RAIDS',regions:[1234],deathType:'UNSAFE',petIcon:'2000000001'};
  const pet={itemId:'2000000001',name:'Future pet',source:'https://oldschool.runescape.wiki/w/Future_pet',revision:81};
  const presentation=JSON.parse(JSON.stringify(cleanPresentation([c],{[c.id]:{pet}})));
  const record={presentation,evidence:{panels:[],sources:{[c.id]:[]}}};
  assert.equal(itemIconName(c.petIcon,presentation[c.id].pet),'Future pet');
  const body=stateBody(record,c,{});
  assert.match(body,/### Pet: Future pet/);
  assert.match(body,/Future_pet\?oldid=81/);
  const changed=stateBody(record,{...c,petIcon:'2000000002'},{});
  assert.doesNotMatch(changed,/Pet: Future pet|Future_pet\?oldid/);
  for(const invalid of [{...pet,source:'https://example.com'}, {...pet,revision:0}, {...pet,name:'Bad\nname'}])assert.throws(()=>cleanPresentation([c],{[c.id]:{pet:invalid}}),/wiki pet reference/);
  assert.equal(cleanPresentation([c],{})[c.id].pet,undefined);
});
