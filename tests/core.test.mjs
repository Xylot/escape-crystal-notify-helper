import test from 'node:test';
import assert from 'node:assert/strict';
import { regionId,regionOrigin,chunkId,chunkOrigin,parseIds } from '../src/core/coordinates.mjs';
import { parseJava,generateEntry } from '../src/core/java.mjs';
import { applyProposal,validateProposal,overlapWarnings,PLUGIN_REPO } from '../src/core/proposal.mjs';
import { wikiTitle } from '../src/core/wiki.mjs';
import { entranceJava } from '../src/core/entrance.mjs';
const SOURCE=`package com.escapecrystalnotify;
public enum EscapeCrystalNotifyRegion {
    // BOSS_FAKE("ignore", OTHER, OTHER, 12),
    BOSS_TEST("Test, \\"boss\\"", EscapeCrystalNotifyRegionType.BOSSES, EscapeCrystalNotifyRegionDeathType.UNSAFE,
       new EscapeCrystalNotifyRegionEntrance(EscapeCrystalNotifyRegionEntranceOverlayType.PRIORITIZED_WITH_HIGHLIGHT, List.of(774740, 774742), EscapeCrystalNotifyRegionEntranceObjectType.GAME_OBJECT, ObjectID.NEXUS_EYE_YELLOW_MIDDLE), List.of(774740), 11851, 11850),
    QUEST_TEST("Quest", EscapeCrystalNotifyRegionType.QUESTS, EscapeCrystalNotifyRegionDeathType.UNSAFE_HCGIM, Quest.DRAGON_SLAYER_I, 1234);
    void ignored() { int x = 5; }
}`.replaceAll('\\\\"','\\"');
const proposal=(changes)=>({version:1,repository:PLUGIN_REPO,baseCommit:'a'.repeat(40),changes});
function change() {const e=parseJava(SOURCE).entries[0];return {id:e.id,name:e.name,deathType:e.deathType,regions:[12682],baseRaw:e.raw,reviewed:true};}
test('Shellbane outside and cave region IDs remain distinct',()=>{assert.equal(regionId(3176,2477),12582);assert.equal(regionId(3179,8876),12682);});
test('region and chunk round trips, including boundaries',()=>{
  for(const x of [0,7,8,63,64,3179,16383])for(const y of [0,8,64,8876,16383]) {
    const r=regionOrigin(regionId(x,y));assert.equal(r.x,Math.floor(x/64)*64);assert.equal(r.y,Math.floor(y/64)*64);
    const c=chunkOrigin(chunkId(x,y));assert.equal(c.x,Math.floor(x/8)*8);assert.equal(c.y,Math.floor(y/8)*8);
  }
  assert.throws(()=>regionId(-1,3));assert.throws(()=>regionId(16384,3));assert.throws(()=>regionId(3.5,3));
});
test('ID entry rejects partial numbers, negatives and overflow',()=>{assert.deepEqual(parseIds('12682, 12582 12682'),[12582,12682]);for(const s of ['12oops','-1','65536','1.2'])assert.throws(()=>parseIds(s));});
test('Java parser ignores comments and nested lists and retains optional args',()=>{
  const {entries}=parseJava(SOURCE);assert.equal(entries.length,2);assert.equal(entries[0].name,'Test, "boss"');assert.deepEqual(entries[0].regions,[11851,11850]);assert.equal(entries[0].optionalArgs.length,2);assert.equal(entries[1].optionalArgs[0],'Quest.DRAGON_SLAYER_I');
});
test('existing edits preserve entrances, chunks and unrelated entries',()=>{
  const result=applyProposal(SOURCE,proposal([change()]));const before=parseJava(SOURCE),after=parseJava(result);
  assert.deepEqual(after.entries[0].optionalArgs,before.entries[0].optionalArgs);assert.equal(after.entries[1].raw,before.entries[1].raw);assert.deepEqual(after.entries[0].regions,[12682]);
});
test('new entry insertion and first-entry replacement can be combined',()=>{
  const newEntry={...change(),id:'BOSS_NEW',name:'New',baseRaw:null};
  const result=applyProposal(SOURCE,proposal([change(),newEntry]));assert.deepEqual(parseJava(result).entries.map(e=>e.id),['BOSS_NEW','BOSS_TEST','QUEST_TEST']);
});
test('unrelated upstream edits revalidate but affected edits conflict',()=>{
  assert.doesNotThrow(()=>applyProposal(SOURCE.replace('1234','1235'),proposal([change()])));
  assert.throws(()=>applyProposal(SOURCE.replace('11851','11852'),proposal([change()])),/Conflict/);
});
test('unsafe proposal payloads are rejected',()=>{
  for(const patch of [{id:'BOSS_X); evil()'},{regions:[-1]},{baseRaw:undefined},{deathType:'UNSAFE);evil()'}])assert.throws(()=>validateProposal(proposal([{...change(),...patch}])));
  const evilName={...change(),name:'Boss "); throw new Error(); //'};const result=applyProposal(SOURCE,proposal([evilName]));assert.equal(parseJava(result).entries[0].name,evilName.name);
});
test('unsupported Java expressions fail closed',()=>{assert.throws(()=>parseJava(SOURCE.replace('11851, 11850','REGION_CONST')));assert.throws(()=>parseJava(SOURCE+'/*'));});
test('overlap checks include other content categories',()=>{const c={...change(),regions:[1234]};assert.match(overlapWarnings([c],parseJava(SOURCE).entries)[0],/Quest/);});
test('wiki URLs enforce source origin',()=>{assert.equal(wikiTitle('https://oldschool.runescape.wiki/w/Shellbane_gryphon'),'Shellbane gryphon');assert.throws(()=>wikiTitle('https://evil.example/w/Boss'));});
test('entrance generator validates namespace and avoids arbitrary code',()=>{
  const e={overlay:'DEPRIORITIZED_WITH_HIGHLIGHT',direction:'',plane:'',objectType:'GAME_OBJECT',ids:['ObjectID.EXAMPLE','12345'],chunks:[123456],reviewed:true};
  assert.match(entranceJava(e),/List.of\(123456\)/);assert.throws(()=>entranceJava({...e,ids:['ObjectID.X);evil()']}));assert.throws(()=>entranceJava({...e,objectType:'NPC'}));
});
test('CRLF source is retained and entry names escape correctly',()=>{const result=applyProposal(SOURCE.replaceAll('\n','\r\n'),proposal([{...change(),baseRaw:change().baseRaw.replaceAll('\n','\r\n')} ]));assert.ok(result.includes('\r\n'));});
