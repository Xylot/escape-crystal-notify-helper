import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {entranceOverlay, mergeDraft} from '../src/core/authoring.mjs';
import {applyProposal, PLUGIN_REPO} from '../src/core/proposal.mjs';
import {parseJava} from '../src/core/java.mjs';
import {cleanChanges, evidencePlan} from '../src/core/pr-evidence.mjs';
import {modelFamily} from '../src/core/moid-images.mjs';
import {cleanPresentation, defaultPRText, encounterScope} from '../src/core/pr-presentation.mjs';
import {prepare, submit} from '../worker/pr-service.mjs';
import {MemoryStore, FakeGitHub, input, change, env, png} from './pr-fixtures.mjs';
import {panelSize} from '../src/core/pr-evidence.mjs';

const snapshot=JSON.parse(readFileSync(new URL('../public/data/snapshot.json',import.meta.url)));
test('setup priority preserves existing entrance arguments and survives proposal cleaning',()=>{
  const existing=snapshot.entries.find(e=>e.regionType==='BOSSES'&&e.optionalArgs.some(a=>a.includes('PRIORITIZED_WITH_HIGHLIGHT'))&&!e.optionalArgs.some(a=>a.includes('Quest.')));
  const draft={id:existing.id,name:existing.name,regions:existing.regions,deathType:existing.deathType,baseRaw:existing.raw};
  const original=entranceOverlay(draft),overlay=original==='PRIORITIZED_WITH_HIGHLIGHT'?'DEPRIORITIZED_WITH_HIGHLIGHT':'PRIORITIZED_WITH_HIGHLIGHT';
  const changed=mergeDraft(draft,{entranceOverlay:overlay});
  assert.equal(changed.entrance,undefined);
  const proposal={version:1,repository:PLUGIN_REPO,baseCommit:snapshot.baseCommit,changes:cleanChanges([changed])};
  const after=parseJava(applyProposal(snapshot.source,proposal)).entries.find(e=>e.id===existing.id);
  assert.deepEqual(after.optionalArgs,existing.optionalArgs.map(a=>a.replace(`OverlayType.${original}`,`OverlayType.${overlay}`)));
  assert.throws(()=>applyProposal(snapshot.source,{...proposal,changes:[{...changed,entranceOverlay:'evil()'}]}),/priority/);
});
test('setup priority changes configured entrances, defaults new drafts, and keeps arena-only exports valid',()=>{
  assert.equal(entranceOverlay({}), 'DEPRIORITIZED_WITH_HIGHLIGHT');
  const entrance={overlay:'DEPRIORITIZED_WITH_HIGHLIGHT',ids:['58439'],chunks:[],direction:'',plane:'',objectType:'GAME_OBJECT'};
  assert.equal(mergeDraft({entrance},{entranceOverlay:'PRIORITIZED_WITH_HIGHLIGHT'}).entrance.overlay,'PRIORITIZED_WITH_HIGHLIGHT');
  assert.equal(entranceOverlay(mergeDraft({entranceOverlay:'PRIORITIZED_WITH_HIGHLIGHT'},{entrance})),entrance.overlay);
  assert.doesNotThrow(()=>applyProposal(snapshot.source,{version:1,repository:PLUGIN_REPO,baseCommit:snapshot.baseCommit,changes:[{...change,entranceOverlay:'PRIORITIZED_WITH_HIGHLIGHT'}]}));
});
test('changing a preserved entrance priority requires entrance evidence',()=>{
  const current={...change,baseRaw:'BOSS_PR_TEST("Test", EscapeCrystalNotifyRegionType.BOSSES, EscapeCrystalNotifyRegionDeathType.UNSAFE, new EscapeCrystalNotifyRegionEntrance(EscapeCrystalNotifyRegionEntranceOverlayType.PRIORITIZED_WITH_HIGHLIGHT, null, EscapeCrystalNotifyRegionEntranceObjectType.GAME_OBJECT, 58439), 12682)',entranceOverlay:'DEPRIORITIZED_WITH_HIGHLIGHT'};
  assert.throws(()=>evidencePlan([current],input.contexts,input.sources),/map location/);
  const contexts={[change.id]:{...input.contexts[change.id],entrance:{x:3176,y:2477,plane:0}}};
  assert.equal(evidencePlan([current],contexts,input.sources).panels.filter(p=>p.kind==='entrance').length,1);
});
test('parent and child selections expand to every related model, deduplicate, and leave IDs untouched',()=>{
  const types={'58439':{forms:[{locId:58440},{locId:58441},{locId:58442},{locId:-1},{locId:58440}]},'10':{forms:[{locId:11}]}},ids=['58439'];
  assert.deepEqual(modelFamily(types,ids),['58439','58440','58441','58442']);
  assert.deepEqual(new Set(modelFamily(types,['58441'])),new Set(['58439','58440','58441','58442']));
  assert.deepEqual(modelFamily(types,['999']),['999']);assert.deepEqual(ids,['58439']);
});
test('conventional PR titles and introductions name bosses, raids and mixed batches',()=>{
  assert.equal(encounterScope({name:'Great Olm',categories:['Chambers of Xeric']}),'raid');
  for(const [name,categories,scope] of [['Shellbane gryphon',['Solo bosses'],'boss'],['Tombs of Amascut',['Raids'],'raid'],['Example',['Minigames'],'minigame'],['Example',['Quest bosses'],'quest']]){
    assert.equal(encounterScope({name,categories}),scope);
    const changes=[{...change,name}],p=cleanPresentation(changes,{[change.id]:{scope}}),text=defaultPRText(changes,p);
    assert.equal(text.title,`feat(${scope}): add ${name}`);assert.ok(text.introduction.includes(name));
  }
  const changes=[{...change,name:'First'}, {...change,id:'BOSS_SECOND',name:'Second',baseRaw:'existing'}];
  const text=defaultPRText(changes,cleanPresentation(changes,{BOSS_SECOND:{scope:'raid'}}));
  assert.equal(text.title,'feat(encounter): add and update First, Second');assert.match(text.introduction,/First, Second/);
});
test('PR models are frozen, embedded in the submitted body, and excluded from the Java diff',async()=>{
  const gh=new FakeGitHub(),store=new MemoryStore(),presentation={[change.id]:{scope:'raid',images:['58440','58441','58442']}};
  const preview=await prepare({...input,presentation},'1',gh,store,env);
  assert.equal(preview.title,`feat(raid): add ${change.name}`);
  for(const id of presentation[change.id].images)assert.ok(preview.body.includes(`${id}_orient0.png`));
  const images=preview.evidence.panels.map(p=>({id:p.id,png:png(panelSize(p).width,panelSize(p).height)}));
  await submit(preview.id,{title:preview.title,introduction:preview.introduction,images},'1','contributor',gh,store);
  assert.ok(gh.prs[0].body.includes('58442_orient0.png'));
  assert.ok(!preview.patch.includes('58442'));assert.ok(!preview.patch.includes('chisel.weirdgloop'));
  await assert.rejects(prepare({...input,presentation:{[change.id]:{images:['https://evil.test/image']}}},'1',gh,store,env),/references/);
});
