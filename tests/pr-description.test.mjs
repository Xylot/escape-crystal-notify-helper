import test from 'node:test';
import assert from 'node:assert/strict';
import {stateBody} from '../worker/pr-description.mjs';
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
});
