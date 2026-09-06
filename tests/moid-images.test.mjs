import test from 'node:test';
import assert from 'node:assert/strict';
import {moidImage,parseMoidSelection} from '../src/core/moid-images.mjs';
import {cleanChanges} from '../src/core/pr-evidence.mjs';
test('MOID always uses the first orientation and preserves exact ID source links',()=>{
  assert.deepEqual(moidImage('58440'),{id:'58440',url:'https://chisel.weirdgloop.org/static/img/osrs-object/58440_orient0.png',source:'https://chisel.weirdgloop.org/moid/object_id.html#58440'});
  assert.throws(()=>moidImage('../58440'),/numeric/);
});
test('independent picture selection accepts bounded IDs, ranges, and the supplied MOID URL',()=>{
  assert.deepEqual(parseMoidSelection('https://chisel.weirdgloop.org/moid/object_id.html#58439-58442'),['58439','58440','58441','58442']);
  assert.deepEqual(parseMoidSelection('58440, 58440 58441'),['58440','58441']);
  for(const value of ['1-9999','5-1','https://example.com/#58440','58440x',''])assert.throws(()=>parseMoidSelection(value));
});
test('reference pictures remain outside the exported entrance configuration',()=>{
  const change={id:'BOSS_TEST',name:'Test',regions:[12682],deathType:'UNSAFE',baseRaw:null,entranceImage:'58440',entrance:{ids:['58439'],objectType:'GAME_OBJECT',chunks:[],overlay:'DEPRIORITIZED_WITH_HIGHLIGHT',direction:'',plane:''}};
  const exported=cleanChanges([change])[0];assert.deepEqual(exported.entrance.ids,['58439']);assert.equal(exported.entranceImage,undefined);
});
