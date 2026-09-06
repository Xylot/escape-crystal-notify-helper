import test from 'node:test';
import assert from 'node:assert/strict';
import Parser from 'wikiparser-node';
import {matchedEntranceImage} from '../src/core/entrance-images.mjs';
import {panelSize} from '../src/core/pr-evidence.mjs';
test('entrance images match selected ID, namespace, and form',()=>{
  const text='[[File:Unrelated.png]]{{Infobox Scenery|id1=123|image1=[[File:Closed.png]]|id2=124|image2=[[File:Open.png]]}}';
  assert.equal(matchedEntranceImage(Parser,text,['124'],'GAME_OBJECT'),'File:Open.png');
  assert.equal(matchedEntranceImage(Parser,text,['123'],'NPC'),null);
  assert.equal(matchedEntranceImage(Parser,text,['12'],'GAME_OBJECT'),null);
  assert.equal(matchedEntranceImage(Parser,'{{Infobox Object|id=123}}',['123'],'GAME_OBJECT'),null);
});
test('new evidence exports double resolution while frozen older previews keep their dimensions',()=>{
  const p={columns:1,rows:1,chunks:[]};
  assert.deepEqual(panelSize(p),{width:640,height:400});
  assert.deepEqual(panelSize({...p,renderScale:2}),{width:1280,height:800});
});
